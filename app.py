"""Local, single-user SideQuest. Run with: python app.py"""
import os
import secrets
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from sidequest import RuleError, Workspace

ROOT = Path(__file__).resolve().parent


def create_app(database=None, clock=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=5_000_000)
    path = Path(database or os.environ.get("SIDEQUEST_DB", ROOT / "instance" / "sidequest.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    store = Workspace(path, **({"clock": clock} if clock else {}))
    app.extensions["workspace"] = store
    token = secrets.token_urlsafe(32)

    @app.before_request
    def local_only():
        if request.host.split(":")[0] not in ("localhost", "127.0.0.1"):
            return jsonify(error="This version is available on this computer only."), 403
        if request.headers.get("Origin") and request.headers["Origin"] != request.host_url.rstrip("/"):
            return jsonify(error="Cross-origin requests are not allowed."), 403
        if request.method == "POST" and not secrets.compare_digest(request.headers.get("X-Sidequest-Token", ""), token):
            return jsonify(error="Reload SideQuest before saving."), 403

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.get("/")
    def index():
        return send_from_directory(ROOT / "dist", "index.html")

    @app.get("/<name>")
    def asset(name):
        if name not in ("style.css", "app.js"):
            return jsonify(error="Not found."), 404
        return send_from_directory(ROOT / "dist", name)

    @app.get("/api/workspace")
    def workspace():
        return jsonify(**store.snapshot(), token=token)

    @app.get("/api/health")
    def health():
        return jsonify(app="sidequest", status="ready")

    @app.get("/api/focus/<identifier>")
    def focus(identifier):
        return jsonify(result=store.focus_status(identifier))

    @app.get("/api/backup")
    def backup():
        response = jsonify(version=1, **store.snapshot()["state"])
        response.headers["Content-Disposition"] = 'attachment; filename="sidequest-backup.json"'
        return response

    @app.post("/api/<action>")
    def action(action):
        return jsonify(store.act(action, request.get_json()))

    @app.errorhandler(RuleError)
    def rule_error(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(sqlite3.Error)
    def storage_error(error):
        app.logger.error("SQLite operation failed: %s", error)
        return jsonify(error="Could not save your changes. Please try again; nothing was partially saved."), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=4173, debug=False)
