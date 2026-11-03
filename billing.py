"""Stripe Checkout, Customer Portal and webhook verification over Stripe's HTTPS API (no SDK)."""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sidequest import RuleError

API = "https://api.stripe.com/v1/"


class BillingError(RuntimeError):
    pass


class Billing:
    def __init__(self, secret_key="", webhook_secret="", prices=None, opener=urlopen):
        self.secret_key, self.webhook_secret = secret_key, webhook_secret
        self.prices = {k: v for k, v in (prices or {}).items() if v}
        self.opener = opener

    @property
    def enabled(self):
        return bool(self.secret_key and self.webhook_secret and self.prices)

    def call(self, path, fields=None, method="POST"):
        request = Request(API + path, None if method == "GET" else urlencode(fields or {}).encode(), method=method,
                          headers={"Authorization": "Bearer " + self.secret_key,
                                   "Content-Type": "application/x-www-form-urlencoded"})
        try:
            with self.opener(request, timeout=15) as response:
                return json.load(response)
        except OSError as error:
            raise BillingError(f"Stripe request to {path} failed: {error}") from error

    def checkout(self, user, interval, base_url):
        if not self.enabled:
            raise RuleError("Upgrades are not open yet. Please check back soon.")
        if interval not in self.prices:
            raise RuleError("Choose monthly or yearly billing.")
        fields = {"mode": "subscription", "line_items[0][price]": self.prices[interval], "line_items[0][quantity]": 1,
                  "success_url": base_url + "app?upgraded=1", "cancel_url": base_url + "app",
                  "client_reference_id": user["id"], "subscription_data[metadata][user_id]": user["id"],
                  "allow_promotion_codes": "true"}
        if user["customer"]:
            fields["customer"] = user["customer"]
        else:
            fields["customer_email"] = user["email"]
        return self.call("checkout/sessions", fields)["url"]

    def portal(self, user, base_url):
        if not self.enabled or not user["customer"]:
            raise RuleError("There is no subscription to manage yet.")
        return self.call("billing_portal/sessions", {"customer": user["customer"], "return_url": base_url + "app"})["url"]

    def cancel(self, subscription):
        if self.enabled and subscription:
            self.call("subscriptions/" + subscription, method="DELETE")

    def verify(self, payload, header, tolerance=300, now=None):
        """Check the Stripe-Signature header; return the event or raise RuleError."""
        parts = [item.split("=", 1) for item in (header or "").split(",") if "=" in item]
        timestamp = next((v for k, v in parts if k == "t"), "")
        signatures = [v for k, v in parts if k == "v1"]
        if not self.webhook_secret or not timestamp.isdigit() or not signatures:
            raise RuleError("Invalid webhook signature.")
        expected = hmac.new(self.webhook_secret.encode(), timestamp.encode() + b"." + payload, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, s) for s in signatures):
            raise RuleError("Invalid webhook signature.")
        if abs((now or time.time()) - int(timestamp)) > tolerance:
            raise RuleError("Webhook timestamp is too old.")
        return json.loads(payload)


def period_end(subscription):
    # Newer Stripe API versions report the billing period on each subscription item.
    items = subscription.get("items", {}).get("data") or [{}]
    return subscription.get("current_period_end") or items[0].get("current_period_end")
