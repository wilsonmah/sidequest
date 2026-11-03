"""SideQuest web app.

Local mode (default) serves one workspace on this computer: python app.py
Hosted mode (SIDEQUEST_MODE=hosted) adds accounts, plan limits and Stripe billing; see DEPLOY.md.
"""
import os
import secrets
import smtplib
import sqlite3
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path

from flask import Flask, g, jsonify, redirect, request, send_from_directory, session
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from accounts import Accounts
from billing import Billing, BillingError, period_end
from sidequest import RuleError, UpgradeRequired, Workspace

ROOT = Path(__file__).resolve().parent
ASSETS = ("style.css", "app.js", "site.css", "auth.js", "robots.txt")
HOSTED_PAGES = {"login": "auth.html", "signup": "auth.html", "reset": "auth.html", "privacy": "privacy.html", "terms": "terms.html"}
# Sign-in, sign-up and resets run before a session exists; Stripe signs its own webhook.
PUBLIC_POSTS = ("/api/auth/signup", "/api/auth/login", "/api/auth/reset-request", "/api/auth/reset", "/api/billing/webhook")
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
       "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


def smtp_mailer(env, logger):
    def send(to, subject, body):
        if not env.get("SMTP_HOST"):
            logger.warning("SMTP_HOST is not set; email to %s was not sent: %s", to, subject)
            return
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = env.get("MAIL_FROM", "SideQuest <hello@localhost>"), to, subject
        message.set_content(body)
        with smtplib.SMTP(env["SMTP_HOST"], int(env.get("SMTP_PORT", 587)), timeout=15) as smtp:
            smtp.starttls()
            if env.get("SMTP_USER"):
                smtp.login(env["SMTP_USER"], env.get("SMTP_PASSWORD", ""))
            smtp.send_message(message)
    return send


def create_app(database=None, clock=None, config=None, mailer=None, opener=None):
    env = {**os.environ, **(config or {})}
    hosted = env.get("SIDEQUEST_MODE", "local") == "hosted"
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=5_000_000)
    path = Path(database or env.get("SIDEQUEST_DB", ROOT / "instance" / "sidequest.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    timing = {"clock": clock} if clock else {}
    store = Workspace(path, **timing)
    app.extensions["workspace"] = store
    token = secrets.token_urlsafe(32)

    if hosted:
        if len(env.get("SECRET_KEY", "")) < 32:
            raise RuntimeError("Hosted mode needs SECRET_KEY set to a random value of at least 32 characters.")
        base_setting = env.get("BASE_URL", "").rstrip("/")
        app.config.update(SECRET_KEY=env["SECRET_KEY"], SESSION_COOKIE_NAME="sidequest_session", SESSION_COOKIE_SAMESITE="Lax",
                          SESSION_COOKIE_SECURE=base_setting.startswith("https://"), PERMANENT_SESSION_LIFETIME=timedelta(days=30))
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=int(env.get("TRUSTED_PROXIES", 1)), x_proto=1, x_host=1)
        accounts = Accounts(path, **timing)
        billing = Billing(env.get("STRIPE_SECRET_KEY", ""), env.get("STRIPE_WEBHOOK_SECRET", ""),
                          {"month": env.get("STRIPE_PRICE_MONTHLY"), "year": env.get("STRIPE_PRICE_YEARLY")},
                          **({"opener": opener} if opener else {}))
        app.extensions.update(accounts=accounts, billing=billing)
        send_mail = mailer or smtp_mailer(env, app.logger)
        free_limit = int(env.get("FREE_ACTIVE_QUESTS", 3))

    def base_url():
        return (base_setting if hosted and base_setting else request.host_url.rstrip("/")) + "/"

    def user_id():
        return g.user["id"] if hosted else "local"

    def plan_options():
        # The local edition is self-hosted and unlimited; hosted free accounts get a quest cap.
        if not hosted or g.user["plan"] == "pro":
            return {"quest_limit": None, "report": True}
        return {"quest_limit": free_limit, "report": False}

    def account():
        if not hosted:
            return {"mode": "local"}
        user = g.user
        return {"mode": "hosted", "email": user["email"], "plan": user["plan"], "status": user["status"],
                "periodEnd": user["period_end"], "billing": billing.enabled, "canManage": bool(user["customer"]), "freeLimit": free_limit}

    def sign_in(user):
        session.clear()
        session.permanent = True
        session.update(user=user["id"], key=user["session_key"], csrf=secrets.token_urlsafe(32))

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise RuleError("Expected a JSON object.")
        return data

    @app.before_request
    def guard():
        if not hosted:
            if request.host.split(":")[0] not in ("localhost", "127.0.0.1"):
                return jsonify(error="This version is available on this computer only."), 403
            if request.headers.get("Origin") and request.headers["Origin"] != request.host_url.rstrip("/"):
                return jsonify(error="Cross-origin requests are not allowed."), 403
            if request.method == "POST" and not secrets.compare_digest(request.headers.get("X-Sidequest-Token", ""), token):
                return jsonify(error="Reload SideQuest before saving."), 403
            return None
        g.user = None
        if session.get("user"):
            user = accounts.get(session["user"])
            if user and secrets.compare_digest(session.get("key", ""), user["session_key"]):
                g.user = user
            else:
                session.clear()
        if request.path == "/api/billing/webhook":
            return None
        if request.headers.get("Origin") and request.headers["Origin"] != base_url().rstrip("/"):
            return jsonify(error="Cross-origin requests are not allowed."), 403
        if request.path in PUBLIC_POSTS:
            # JSON bodies cannot be sent cross-site by a plain HTML form.
            return None if request.is_json else (jsonify(error="Expected a JSON request."), 415)
        if request.path.startswith("/api/") and request.path != "/api/health" and not g.user:
            return jsonify(error="Please log in again.", login=True), 401
        if request.method == "POST" and not secrets.compare_digest(request.headers.get("X-Sidequest-Token", ""), session.get("csrf", "")):
            return jsonify(error="Your session changed. Reload SideQuest before saving."), 403
        return None

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = CSP
        if hosted and request.is_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.get("/")
    def index():
        if hosted:
            return redirect("/app") if g.user else send_from_directory(ROOT / "dist", "landing.html")
        return send_from_directory(ROOT / "dist", "index.html")

    @app.get("/app")
    def application():
        if not hosted:
            return redirect("/")
        return send_from_directory(ROOT / "dist", "index.html") if g.user else redirect("/login")

    @app.get("/<name>")
    def asset(name):
        if name in ASSETS:
            return send_from_directory(ROOT / "dist", name)
        if hosted and name in HOSTED_PAGES:
            if g.user and name in ("login", "signup"):
                return redirect("/app")
            return send_from_directory(ROOT / "dist", HOSTED_PAGES[name])
        return jsonify(error="Not found."), 404

    @app.get("/api/workspace")
    def workspace():
        return jsonify(**store.snapshot(user_id(), plan_options()["report"]), token=session["csrf"] if hosted else token, account=account())

    @app.get("/api/health")
    def health():
        return jsonify(app="sidequest", status="ready")

    @app.get("/api/focus/<identifier>")
    def focus(identifier):
        return jsonify(result=store.focus_status(identifier, user_id()))

    @app.get("/api/backup")
    def backup():
        response = jsonify(version=1, **store.snapshot(user_id())["state"])
        response.headers["Content-Disposition"] = 'attachment; filename="sidequest-backup.json"'
        return response

    @app.post("/api/<action>")
    def action(action):
        return jsonify(store.act(action, request.get_json(silent=True), user_id(), **plan_options()))

    if hosted:
        @app.post("/api/auth/signup")
        def signup():
            data = body()
            if data.get("terms") is not True:
                raise RuleError("Please accept the terms and privacy policy to create an account.")
            sign_in(accounts.create(data.get("email"), data.get("password"), request.remote_addr or ""))
            return jsonify(ok=True)

        @app.post("/api/auth/login")
        def login():
            data = body()
            sign_in(accounts.authenticate(data.get("email"), data.get("password"), request.remote_addr or ""))
            return jsonify(ok=True)

        @app.post("/api/auth/logout")
        def logout():
            session.clear()
            return jsonify(ok=True)

        @app.post("/api/auth/reset-request")
        def reset_request():
            email, reset = accounts.start_reset(body().get("email"), request.remote_addr or "")
            if reset:
                send_mail(email, "Reset your SideQuest password",
                          f"Someone asked to reset the password for your SideQuest account.\n\n"
                          f"Choose a new password within one hour:\n{base_url()}reset#token={reset}\n\n"
                          "If this wasn't you, you can ignore this email; your password stays the same.")
            # The same answer whether or not the address has an account.
            return jsonify(ok=True)

        @app.post("/api/auth/reset")
        def reset():
            data = body()
            sign_in(accounts.finish_reset(data.get("token"), data.get("password")))
            return jsonify(ok=True)

        @app.post("/api/account/delete")
        def delete_account():
            user = accounts.delete(g.user["id"], body().get("password"))
            billing.cancel(user["subscription"] if user["status"] in ("active", "trialing", "past_due") else None)
            store.delete_user(user["id"])
            session.clear()
            return jsonify(ok=True)

        @app.post("/api/billing/checkout")
        def checkout():
            if g.user["plan"] == "pro":
                raise RuleError("You already have Pro. Use Manage billing to change your plan.")
            return jsonify(url=billing.checkout(g.user, body().get("interval"), base_url()))

        @app.post("/api/billing/portal")
        def portal():
            return jsonify(url=billing.portal(g.user, base_url()))

        @app.post("/api/billing/webhook")
        def webhook():
            event = billing.verify(request.get_data(), request.headers.get("Stripe-Signature"), now=clock() if clock else None)
            item = event.get("data", {}).get("object", {})
            kind = event.get("type", "")
            if kind == "checkout.session.completed" and item.get("subscription"):
                user = accounts.get(item.get("client_reference_id"))
                if user:
                    accounts.set_subscription(user["id"], item.get("customer"), item["subscription"], "active", user["period_end"])
            elif kind.startswith("customer.subscription."):
                # Events can arrive out of order, so apply Stripe's current state rather than the event's copy.
                current = billing.call("subscriptions/" + item["id"], method="GET")
                user = accounts.by_customer(current.get("customer")) or accounts.get(current.get("metadata", {}).get("user_id"))
                if user:
                    accounts.set_subscription(user["id"], current.get("customer"), current["id"], current.get("status"), period_end(current))
            return jsonify(received=True)

    @app.errorhandler(UpgradeRequired)
    def upgrade_required(error):
        return jsonify(error=str(error), upgrade=True), 402

    @app.errorhandler(RuleError)
    def rule_error(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(BillingError)
    def billing_error(error):
        app.logger.error("%s", error)
        return jsonify(error="Billing is temporarily unavailable. Please try again in a few minutes."), 502

    @app.errorhandler(sqlite3.Error)
    def storage_error(error):
        app.logger.error("SQLite operation failed: %s", error)
        return jsonify(error="Could not save your changes. Please try again; nothing was partially saved."), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=int(os.environ.get("PORT", 4173)), debug=False)
