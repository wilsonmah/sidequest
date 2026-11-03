import hashlib
import hmac
import io
import json
import tempfile
import unittest
from pathlib import Path

from app import create_app

SECRET = "whsec_test"
CONFIG = {"SIDEQUEST_MODE": "hosted", "SECRET_KEY": "k" * 40, "BASE_URL": "https://sidequest.test",
          "STRIPE_SECRET_KEY": "sk_test_x", "STRIPE_WEBHOOK_SECRET": SECRET,
          "STRIPE_PRICE_MONTHLY": "price_month", "STRIPE_PRICE_YEARLY": "price_year"}
ORIGIN = {"Origin": "https://sidequest.test"}


class FakeStripe:
    def __init__(self):
        self.requests, self.subscriptions = [], {}

    def __call__(self, request, timeout):
        self.requests.append((request.get_method(), request.full_url, (request.data or b"").decode()))
        path = request.full_url.rsplit("/v1/", 1)[1]
        if path.startswith("subscriptions/") and request.get_method() == "GET":
            payload = self.subscriptions[path.split("/")[1]]
        else:
            payload = {"url": "https://checkout.stripe.test/" + path}
        return io.BytesIO(json.dumps(payload).encode())


class HostedTests(unittest.TestCase):
    def setUp(self):
        temp_root = Path(__file__).resolve().parent.parent / "tmp"
        temp_root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=temp_root)
        self.now = 1792500000.0
        self.mail, self.stripe = [], FakeStripe()
        self.app = create_app(Path(self.temp.name) / "hosted.sqlite3", lambda: self.now, CONFIG,
                              mailer=lambda *message: self.mail.append(message), opener=self.stripe)
        self.accounts = self.app.extensions["accounts"]

    def tearDown(self):
        self.temp.cleanup()

    def client(self, email="maker@example.com", password="correct horse battery"):
        client = self.app.test_client()
        response = client.post("/api/auth/signup", json={"email": email, "password": password, "terms": True}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200, response.json)
        client.token = client.get("/api/workspace").json["token"]
        return client

    def post(self, client, path, **data):
        return client.post(path, json=data, headers={**ORIGIN, "X-Sidequest-Token": client.token})

    def new_quest(self, client, name):
        project = {"name": name, "category": "personal", "minutes": 15, "context": "", "next": "Start", "blocker": "", "goal": 0, "income": 0}
        return self.post(client, "/api/save", project=project)

    def webhook(self, event):
        payload = json.dumps(event).encode()
        stamp = str(int(self.now))
        signature = hmac.new(SECRET.encode(), stamp.encode() + b"." + payload, hashlib.sha256).hexdigest()
        return self.app.test_client().post("/api/billing/webhook", data=payload, content_type="application/json",
                                           headers={"Stripe-Signature": f"t={stamp},v1={signature}"})

    def test_landing_and_app_require_sign_in(self):
        anonymous = self.app.test_client()
        self.assertIn(b"Start free", anonymous.get("/").data)
        self.assertEqual(anonymous.get("/app").headers["Location"], "/login")
        self.assertEqual(anonymous.get("/api/workspace").status_code, 401)
        self.assertEqual(anonymous.post("/api/capture", json={"name": "x"}).status_code, 401)
        self.assertIn("frame-ancestors 'none'", anonymous.get("/").headers["Content-Security-Policy"])
        signed_in = self.client()
        self.assertEqual(signed_in.get("/").headers["Location"], "/app")
        self.assertEqual(signed_in.get("/app").status_code, 200)

    def test_signup_validation_and_duplicate_email(self):
        anonymous = self.app.test_client()
        for data in ({"email": "bad", "password": "long enough pw", "terms": True},
                     {"email": "a@b.co", "password": "short", "terms": True},
                     {"email": "a@b.co", "password": "long enough pw"}):
            self.assertEqual(anonymous.post("/api/auth/signup", json=data, headers=ORIGIN).status_code, 400)
        self.client("Maker@Example.com")
        duplicate = anonymous.post("/api/auth/signup", json={"email": "maker@example.com", "password": "another password", "terms": True})
        self.assertEqual(duplicate.status_code, 400)

    def test_auth_requires_json_and_same_origin(self):
        anonymous = self.app.test_client()
        form = anonymous.post("/api/auth/login", data={"email": "a@b.co", "password": "x"})
        self.assertEqual(form.status_code, 415)
        cross = anonymous.post("/api/auth/login", json={"email": "a@b.co", "password": "x"}, headers={"Origin": "https://evil.test"})
        self.assertEqual(cross.status_code, 403)

    def test_workspaces_are_isolated_and_writes_need_csrf_token(self):
        alice, bob = self.client("alice@example.com"), self.client("bob@example.com")
        self.assertEqual(self.post(alice, "/api/capture", name="Alice's idea").status_code, 200)
        self.assertEqual(alice.post("/api/capture", json={"name": "No token"}).status_code, 403)
        self.assertEqual(bob.post("/api/capture", json={"name": "Wrong token"}, headers={"X-Sidequest-Token": alice.token}).status_code, 403)
        self.assertEqual(len(alice.get("/api/workspace").json["state"]["ideas"]), 1)
        self.assertEqual(bob.get("/api/workspace").json["state"]["ideas"], [])
        self.assertEqual(json.loads(bob.get("/api/backup").data)["ideas"], [])

    def test_login_logout_and_throttling(self):
        self.client()
        anonymous = self.app.test_client()
        wrong = {"email": "maker@example.com", "password": "not the password"}
        for _ in range(8):
            self.assertEqual(anonymous.post("/api/auth/login", json=wrong).status_code, 400)
        right = {"email": "maker@example.com", "password": "correct horse battery"}
        self.assertIn("Too many", anonymous.post("/api/auth/login", json=right).json["error"])
        self.now += 15 * 60 + 1
        self.assertEqual(anonymous.post("/api/auth/login", json=right).status_code, 200)
        anonymous.token = anonymous.get("/api/workspace").json["token"]
        self.assertEqual(self.post(anonymous, "/api/auth/logout").status_code, 200)
        self.assertEqual(anonymous.get("/api/workspace").status_code, 401)

    def test_free_plan_caps_active_quests_without_hiding_existing_ones(self):
        client = self.client()
        for i in range(3):
            self.assertEqual(self.new_quest(client, f"Quest {i}").status_code, 200)
        blocked = self.new_quest(client, "One too many")
        self.assertEqual(blocked.status_code, 402)
        self.assertTrue(blocked.json["upgrade"])
        workspace = client.get("/api/workspace").json
        self.assertEqual(workspace["account"]["plan"], "free")
        self.assertIsNone(workspace["summary"]["insights"])
        quest = next(p for p in workspace["state"]["projects"] if p["name"] == "Quest 0")
        self.assertEqual(self.post(client, "/api/finish-project", id=quest["id"]).status_code, 200)
        self.assertEqual(self.new_quest(client, "Room again").status_code, 200)

    def test_checkout_webhook_upgrade_and_cancellation(self):
        client = self.client()
        user = self.accounts.authenticate("maker@example.com", "correct horse battery", "test")
        checkout = self.post(client, "/api/billing/checkout", interval="year")
        self.assertTrue(checkout.json["url"].startswith("https://checkout.stripe.test/"))
        method, url, sent = self.stripe.requests[-1]
        self.assertIn("price_year", sent)
        self.assertIn("client_reference_id=" + user["id"], sent)
        self.assertEqual(self.post(client, "/api/billing/checkout", interval="weekly").status_code, 400)

        self.assertEqual(self.webhook({"type": "checkout.session.completed", "data": {"object": {
            "client_reference_id": user["id"], "customer": "cus_1", "subscription": "sub_1"}}}).status_code, 200)
        workspace = client.get("/api/workspace").json
        self.assertEqual(workspace["account"]["plan"], "pro")
        self.assertEqual(len(workspace["summary"]["insights"]["weeks"]), 12)
        for i in range(5):
            self.assertEqual(self.new_quest(client, f"Pro quest {i}").status_code, 200)
        self.assertTrue(self.post(client, "/api/billing/portal").json["url"].endswith("billing_portal/sessions"))

        # A stale "active" event cannot override Stripe's current canceled state.
        self.stripe.subscriptions["sub_1"] = {"id": "sub_1", "customer": "cus_1", "status": "canceled", "items": {"data": [{"current_period_end": 1}]}}
        self.webhook({"type": "customer.subscription.updated", "data": {"object": {"id": "sub_1", "status": "active"}}})
        self.assertEqual(client.get("/api/workspace").json["account"]["plan"], "free")
        self.assertEqual(self.new_quest(client, "Over the free cap").status_code, 402)
        self.assertEqual(len([p for p in client.get("/api/workspace").json["state"]["projects"] if not p.get("sample")]), 5)

    def test_webhook_rejects_bad_or_stale_signatures(self):
        payload = json.dumps({"type": "checkout.session.completed", "data": {"object": {}}}).encode()
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.post("/api/billing/webhook", data=payload, content_type="application/json",
                                        headers={"Stripe-Signature": f"t={int(self.now)},v1=deadbeef"}).status_code, 400)
        stamp = str(int(self.now) - 3600)
        signature = hmac.new(SECRET.encode(), stamp.encode() + b"." + payload, hashlib.sha256).hexdigest()
        self.assertEqual(anonymous.post("/api/billing/webhook", data=payload, content_type="application/json",
                                        headers={"Stripe-Signature": f"t={stamp},v1={signature}"}).status_code, 400)

    def test_password_reset_signs_out_other_sessions(self):
        old_session = self.client()
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.post("/api/auth/reset-request", json={"email": "nobody@example.com"}).status_code, 200)
        self.assertEqual(self.mail, [])
        anonymous.post("/api/auth/reset-request", json={"email": "maker@example.com"})
        to, subject, text = self.mail[0]
        reset_token = text.split("#token=")[1].split()[0]
        self.assertEqual(to, "maker@example.com")
        self.assertEqual(anonymous.post("/api/auth/reset", json={"token": "wrong", "password": "brand new password"}).status_code, 400)
        self.assertEqual(anonymous.post("/api/auth/reset", json={"token": reset_token, "password": "brand new password"}).status_code, 200)
        self.assertEqual(anonymous.post("/api/auth/reset", json={"token": reset_token, "password": "again new password"}).status_code, 400)
        self.assertEqual(old_session.get("/api/workspace").status_code, 401)
        self.assertEqual(anonymous.get("/api/workspace").status_code, 200)

    def test_account_deletion_removes_data_and_cancels_subscription(self):
        client = self.client()
        user = self.accounts.authenticate("maker@example.com", "correct horse battery", "test")
        self.accounts.set_subscription(user["id"], "cus_1", "sub_1", "active")
        self.post(client, "/api/capture", name="Private idea")
        self.assertEqual(self.post(client, "/api/account/delete", password="wrong password!").status_code, 400)
        self.assertEqual(self.post(client, "/api/account/delete", password="correct horse battery").status_code, 200)
        self.assertEqual(self.stripe.requests[-1][:2], ("DELETE", "https://api.stripe.com/v1/subscriptions/sub_1"))
        self.assertIsNone(self.accounts.get(user["id"]))
        self.assertEqual(client.get("/api/workspace").status_code, 401)
        again = self.client()
        self.assertEqual(again.get("/api/workspace").json["state"]["ideas"], [])

    def test_hosted_mode_refuses_weak_secret(self):
        with self.assertRaises(RuntimeError):
            create_app(Path(self.temp.name) / "x.sqlite3", config={**CONFIG, "SECRET_KEY": "short"})


class MigrationTests(unittest.TestCase):
    def test_single_user_database_becomes_local_workspace(self):
        import sqlite3
        from sidequest import Workspace, initial_workspace
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "old.sqlite3"
            db = sqlite3.connect(path)
            state = initial_workspace()
            state["ideas"].append({"id": "i1", "name": "Kept", "at": 1})
            db.execute("CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)")
            db.execute("INSERT INTO workspace VALUES (1, ?)", (json.dumps(state),))
            db.commit()
            db.close()
            self.assertEqual(Workspace(path).snapshot()["state"]["ideas"][0]["name"], "Kept")


if __name__ == "__main__":
    unittest.main()
