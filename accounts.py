"""Hosted-edition accounts: sign-up, sign-in throttling, password resets and plan state."""
import hashlib
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager

from werkzeug.security import check_password_hash, generate_password_hash

from sidequest import RuleError

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# past_due keeps Pro during Stripe's retry window; canceled or unpaid falls back to free.
PRO_STATUSES = ("active", "trialing", "past_due")
ATTEMPT_WINDOW = 15 * 60
RESET_LIFETIME = 60 * 60


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Accounts:
    def __init__(self, path, clock=time.time):
        self.path, self.clock = str(path), clock
        with self.connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created REAL NOT NULL,
                customer TEXT UNIQUE, subscription TEXT, status TEXT, period_end REAL)""")
            db.execute("CREATE TABLE IF NOT EXISTS attempts (key TEXT NOT NULL, at REAL NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS attempts_key ON attempts (key, at)")
            db.execute("CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL)")

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def view(self, row):
        if not row:
            return None
        user = dict(row)
        user["plan"] = "pro" if user["status"] in PRO_STATUSES else "free"
        # Changing the password changes this value, which signs out every other session.
        user["session_key"] = digest(user["password"])[:16]
        return user

    def throttle(self, db, key, limit):
        now = self.clock()
        db.execute("DELETE FROM attempts WHERE at < ?", (now - ATTEMPT_WINDOW,))
        if db.execute("SELECT COUNT(*) FROM attempts WHERE key=?", (key,)).fetchone()[0] >= limit:
            raise RuleError("Too many attempts. Please wait 15 minutes and try again.")

    def record(self, key):
        with self.connection() as db:
            db.execute("INSERT INTO attempts VALUES (?, ?)", (key, self.clock()))

    @staticmethod
    def clean_email(email):
        if not isinstance(email, str) or len(email) > 254 or not EMAIL.match(email.strip()):
            raise RuleError("Please enter a valid email address.")
        return email.strip().lower()

    @staticmethod
    def check_password(password):
        if not isinstance(password, str) or not 10 <= len(password) <= 200:
            raise RuleError("Use a password of at least 10 characters.")
        return generate_password_hash(password)

    def create(self, email, password, ip):
        email, hashed = self.clean_email(email), self.check_password(password)
        with self.connection() as db:
            self.throttle(db, "signup:" + ip, 5)
            db.execute("INSERT INTO attempts VALUES (?, ?)", ("signup:" + ip, self.clock()))
            try:
                identifier = str(uuid.uuid4())
                db.execute("INSERT INTO users (id, email, password, created) VALUES (?, ?, ?, ?)", (identifier, email, hashed, self.clock()))
            except sqlite3.IntegrityError:
                raise RuleError("An account with this email already exists. Log in instead.") from None
        return self.get(identifier)

    def authenticate(self, email, password, ip):
        email = email.strip().lower() if isinstance(email, str) else ""
        with self.connection() as db:
            self.throttle(db, "login:" + email, 8)
            self.throttle(db, "login-ip:" + ip, 30)
            row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row or not isinstance(password, str) or not check_password_hash(row["password"], password):
            self.record("login:" + email)
            self.record("login-ip:" + ip)
            raise RuleError("That email and password don't match.")
        return self.view(row)

    def get(self, identifier):
        with self.connection() as db:
            return self.view(db.execute("SELECT * FROM users WHERE id=?", (identifier,)).fetchone())

    def by_customer(self, customer):
        with self.connection() as db:
            return self.view(db.execute("SELECT * FROM users WHERE customer=?", (customer,)).fetchone())

    def set_subscription(self, identifier, customer, subscription, status, period_end=None):
        with self.connection() as db:
            db.execute("UPDATE users SET customer=?, subscription=?, status=?, period_end=? WHERE id=?",
                       (customer, subscription, status, period_end, identifier))

    def delete(self, identifier, password):
        user = self.get(identifier)
        if not user or not isinstance(password, str) or not check_password_hash(user["password"], password):
            raise RuleError("Enter your current password to delete your account.")
        with self.connection() as db:
            db.execute("DELETE FROM resets WHERE user_id=?", (identifier,))
            db.execute("DELETE FROM users WHERE id=?", (identifier,))
        return user

    def start_reset(self, email, ip):
        try:
            email = self.clean_email(email)
        except RuleError:
            return None, None
        with self.connection() as db:
            self.throttle(db, "reset:" + ip, 5)
            db.execute("INSERT INTO attempts VALUES (?, ?)", ("reset:" + ip, self.clock()))
            row = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if not row:
                return None, None
            token = secrets.token_urlsafe(32)
            db.execute("DELETE FROM resets WHERE user_id=? OR expires < ?", (row["id"], self.clock()))
            db.execute("INSERT INTO resets VALUES (?, ?, ?)", (digest(token), row["id"], self.clock() + RESET_LIFETIME))
        return email, token

    def finish_reset(self, token, password):
        hashed = self.check_password(password)
        if not isinstance(token, str):
            raise RuleError("This reset link is invalid or has expired.")
        with self.connection() as db:
            row = db.execute("SELECT user_id FROM resets WHERE token=? AND expires >= ?", (digest(token), self.clock())).fetchone()
            if not row:
                raise RuleError("This reset link is invalid or has expired.")
            db.execute("DELETE FROM resets WHERE user_id=?", (row["user_id"],))
            db.execute("UPDATE users SET password=? WHERE id=?", (hashed, row["user_id"]))
        return self.get(row["user_id"])
