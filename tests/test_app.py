import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app import create_app
from sidequest import RuleError, Workspace, presentation, validate


class AppTests(unittest.TestCase):
    def setUp(self):
        temp_root = Path(__file__).resolve().parent.parent / "tmp"
        temp_root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=temp_root)
        self.path = Path(self.temp.name) / "workspace.sqlite3"
        self.now = 1792500000.0
        self.app = create_app(self.path, lambda: self.now)
        self.client = self.app.test_client()
        self.store = self.app.extensions["workspace"]
        self.headers = {"X-Sidequest-Token": self.client.get("/api/workspace").json["token"]}

    def tearDown(self):
        self.temp.cleanup()

    def post(self, action, **data):
        return self.client.post("/api/" + action, json=data, headers=self.headers)

    def state(self):
        return self.store.snapshot()["state"]

    def focus(self, identifier="sample-2"):
        return self.post("focus", id=identifier).json["result"]["id"]

    def finish(self):
        identifier = self.focus()
        self.post("start", sessionId=identifier)
        self.now += 900
        return identifier

    def test_page_assets_and_no_database_exposure(self):
        for path in ("/", "/app.js", "/style.css"):
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200)
        for path in ("/app.py", "/sidequest.sqlite3", "/../app.py", "/instance/sidequest.sqlite3"):
            self.assertEqual(self.client.get(path).status_code, 404)

    def test_write_requires_token_and_same_origin_host(self):
        self.assertEqual(self.client.post("/api/capture", json={"name": "No"}).status_code, 403)
        self.assertEqual(self.client.get("/api/workspace", headers={"Host": "evil.example"}).status_code, 403)
        self.assertEqual(self.client.post("/api/capture", json={"name": "No"}, headers={**self.headers, "Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(len(self.state()["ideas"]), 0)

    def test_create_edit_and_restart_persist(self):
        project = self.state()["projects"][0]
        project.update(name="我的项目", next="写一个小功能", income=20)
        response = self.post("save", project=project)
        identifier = response.json["result"]["id"]
        self.assertEqual(response.status_code, 200)
        fresh = Workspace(self.path).snapshot()["state"]
        self.assertEqual(next(p for p in fresh["projects"] if p["id"] == identifier)["name"], "我的项目")
        self.assertEqual(response.json["summary"]["income"], 20)

    def test_idea_promotion_validates_before_deleting(self):
        self.post("capture", name="A thought")
        idea = self.state()["ideas"][0]
        project = self.state()["projects"][0]
        project["next"] = ""
        self.assertEqual(self.post("save", project=project, ideaId=idea["id"]).status_code, 400)
        self.assertEqual(len(self.state()["ideas"]), 1)
        project["next"] = "Take a small step"
        self.assertEqual(self.post("save", project=project, ideaId=idea["id"]).status_code, 200)
        self.assertEqual(len(self.state()["ideas"]), 0)
        self.assertEqual(self.post("save", project=project, ideaId=idea["id"]).status_code, 400)

    def test_timer_idle_pause_exact_boundary_and_single_claim(self):
        identifier = self.focus()
        self.now += 5000
        self.assertEqual(self.post("complete", sessionId=identifier, next="Next").status_code, 400)
        self.post("start", sessionId=identifier)
        self.now += 300.5
        self.post("pause", sessionId=identifier)
        self.now += 5000
        self.assertEqual(self.client.get("/api/focus/" + identifier).json["result"]["remaining"], 600)
        self.post("start", sessionId=identifier)
        self.now += 599.4
        self.assertEqual(self.post("complete", sessionId=identifier, next="Next").status_code, 400)
        self.now += .2
        response = self.post("complete", sessionId=identifier, next="Next")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["summary"]["xp"], 25)
        self.assertEqual(self.post("complete", sessionId=identifier, next="Next").status_code, 400)

    def test_client_cannot_supply_elapsed_time_or_xp(self):
        identifier = self.focus()
        response = self.post("complete", sessionId=identifier, next="", remaining=0, finished=True, xp=500)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(self.state()["wins"]), 0)

    def test_reset_cancel_and_switch_invalidate(self):
        identifier = self.finish()
        self.post("reset", sessionId=identifier)
        self.assertEqual(self.post("complete", sessionId=identifier, next="").status_code, 400)
        identifier = self.finish()
        self.post("cancel", sessionId=identifier)
        self.assertEqual(self.post("complete", sessionId=identifier, next="").status_code, 400)
        identifier = self.finish()
        self.focus("sample-1")
        self.assertEqual(self.post("complete", sessionId=identifier, next="").status_code, 400)

    def test_edit_and_delete_invalidate_session(self):
        identifier = self.finish()
        project = self.state()["projects"][1]
        self.post("save", id="sample-2", project=project)
        self.assertEqual(self.post("complete", sessionId=identifier, next="").status_code, 400)
        identifier = self.finish()
        self.post("delete", kind="quest", id="sample-2")
        self.assertEqual(self.post("complete", sessionId=identifier, next="").status_code, 400)

    def test_completion_edit_reopen_and_delete_keep_wins(self):
        identifier = self.finish()
        self.post("complete", sessionId=identifier, next="")
        project = self.state()["projects"][1]
        self.assertTrue(project["done"])
        self.post("save", id=project["id"], project=project)
        self.assertTrue(self.state()["projects"][1]["done"])
        self.assertEqual(self.post("save", id=project["id"], project=project, reopen=True).status_code, 400)
        project["next"] = "New chapter"
        self.post("save", id=project["id"], project=project, reopen=True)
        self.assertFalse(self.state()["projects"][1]["done"])
        self.post("delete", kind="quest", id=project["id"])
        self.assertEqual(len(self.state()["wins"]), 1)

    def test_delete_idea_persists(self):
        self.post("capture", name="An idea")
        self.post("delete", kind="idea", id=self.state()["ideas"][0]["id"])
        self.assertEqual(Workspace(self.path).snapshot()["state"]["ideas"], [])

    def test_backup_merge_legacy_and_export_roundtrip(self):
        self.post("capture", name="Local idea")
        self.post("save", id="sample-1", project=self.state()["projects"][0])
        incoming = self.state()
        incoming["projects"][0]["name"] = "Older name"
        incoming["projects"].append({**incoming["projects"][0], "id": "imported"})
        incoming["wins"] = [{"action": "Old step", "project": "Old quest", "at": 1000}]
        del incoming["ideas"]
        for _ in range(2):
            self.assertEqual(self.post("import", workspace=incoming).status_code, 200)
        incoming["wins"][0]["at"] = 1000.0
        self.post("import", workspace=incoming)
        self.assertEqual(len(self.state()["projects"]), 4)
        self.assertEqual(len(self.state()["wins"]), 1)
        self.assertEqual(len(self.state()["ideas"]), 1)
        self.assertNotEqual(self.state()["projects"][0]["name"], "Older name")
        self.assertEqual(validate(self.client.get("/api/backup").json), self.state())

    def test_old_backup_replaces_untouched_demo_but_not_local_edits(self):
        incoming = self.state()
        incoming["projects"][0].update(name="My old project", sample=False)
        self.post("import", workspace=incoming)
        self.assertEqual(self.state()["projects"][0]["name"], "My old project")
        incoming["projects"][0]["name"] = "Outdated copy"
        self.post("import", workspace=incoming)
        self.assertEqual(self.state()["projects"][0]["name"], "My old project")

    def test_running_session_survives_server_restart(self):
        identifier = self.focus()
        self.post("start", sessionId=identifier)
        self.now += 900
        restarted = Workspace(self.path, lambda: self.now)
        self.assertTrue(restarted.focus_status(identifier)["finished"])
        restarted.act("complete", {"sessionId": identifier, "next": "Next"})
        self.assertEqual(len(self.state()["wins"]), 1)

    def test_restore_replacing_focused_starter_invalidates_old_timer(self):
        identifier = self.finish()
        incoming = self.state()
        incoming["projects"][1].update(name="Restored different task", next="An hour of work", minutes=60, sample=False)
        self.assertEqual(self.post("import", workspace=incoming).status_code, 200)
        self.assertEqual(self.post("complete", sessionId=identifier, next="").status_code, 400)
        self.assertEqual(len(self.state()["wins"]), 0)

    def test_full_create_complete_export_delete_restore_cycle(self):
        project = self.state()["projects"][1]
        project.update(name="完整流程", next="完成第一个步骤")
        identifier = self.post("save", project=project).json["result"]["id"]
        session = self.focus(identifier)
        self.assertEqual(self.post("complete", sessionId=session, next="").status_code, 400)
        self.post("start", sessionId=session)
        self.now += 900
        self.assertEqual(self.post("complete", sessionId=session, next="").status_code, 200)
        backup = self.client.get("/api/backup").json
        self.post("delete", kind="quest", id=identifier)
        self.assertFalse(any(p["id"] == identifier for p in self.state()["projects"]))
        self.assertEqual(self.store.snapshot()["summary"]["xp"], 25)

        for _ in range(2):
            self.assertEqual(self.post("import", workspace=backup).status_code, 200)
        self.assertEqual(sum(p["id"] == identifier for p in self.state()["projects"]), 1)
        self.assertEqual(self.store.snapshot()["summary"]["xp"], 25)

    def test_identical_restore_keeps_focus_session(self):
        identifier = self.finish()
        self.post("import", workspace=self.state())
        self.assertEqual(self.post("complete", sessionId=identifier, next="Continue").status_code, 200)

    def test_progress_excludes_future_and_old_wins(self):
        workspace = self.state()
        workspace["wins"] = [{"action": "Step", "project": "Quest", "at": at * 1000} for at in (self.now, self.now + 3600, self.now - 9 * 86400)]
        summary = presentation(workspace, self.now)
        self.assertEqual(summary["progress"]["steps"], 1)
        self.assertEqual(len(summary["progress"]["days"]), 7)
        self.assertEqual(summary["xp"], 75)

    def test_no_recommendation_for_short_budget(self):
        workspace = self.state()
        for p in workspace["projects"]:
            p["minutes"] = 60
        self.assertIsNone(presentation(workspace, self.now)["recommendations"]["15"])

    def test_malformed_and_oversized_import_are_atomic(self):
        before = self.state()
        for bad in ({}, {"projects": [None], "wins": []}, {"projects": [], "wins": [], "ideas": None}):
            self.assertEqual(self.post("import", workspace=bad).status_code, 400)
            self.assertEqual(self.state(), before)
        incoming = {"projects": [{**before["projects"][0], "id": str(i)} for i in range(1000)], "wins": []}
        self.assertEqual(self.post("import", workspace=incoming).status_code, 400)
        self.assertEqual(self.state(), before)
        response = self.client.post("/api/import", data="x" * 5_000_001, content_type="application/json", headers=self.headers)
        self.assertEqual(response.status_code, 413)

    def test_validation_rejects_negative_boolean_and_nonfinite_money(self):
        for value in (-1, True, float("nan"), float("inf")):
            workspace = self.state()
            workspace["projects"][0]["income"] = value
            with self.assertRaises(RuleError):
                validate(workspace)

    def test_recommendations_and_progress(self):
        project = self.state()["projects"][0]
        project["minutes"] = 15
        self.post("save", id="sample-1", project=project)
        self.assertEqual(self.store.snapshot()["summary"]["recommendations"]["15"], "sample-1")
        for _ in range(5):
            self.post("complete", sessionId=self.finish(), next="Another step")
        summary = self.store.snapshot()["summary"]
        self.assertEqual(summary["xp"], 125)
        self.assertEqual(summary["level"], 2)
        self.assertEqual(summary["progress"]["steps"], 5)
        self.assertEqual(summary["progress"]["next"]["at"], 20)

    def test_simultaneous_claims_award_once(self):
        identifier = self.finish()
        def claim(_):
            try:
                self.store.act("complete", {"sessionId": identifier, "next": "Next"})
                return True
            except RuleError:
                return False
        with ThreadPoolExecutor(max_workers=2) as workers:
            self.assertEqual(sum(workers.map(claim, range(2))), 1)
        self.assertEqual(len(self.state()["wins"]), 1)

    def test_storage_failure_rolls_back_idea_promotion(self):
        self.post("capture", name="Keep this")
        before = self.state()
        with self.store.connection() as db:
            db.execute("CREATE TRIGGER fail_update BEFORE UPDATE ON workspace BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        response = self.post("save", project=before["projects"][0], ideaId=before["ideas"][0]["id"])
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.state(), before)


if __name__ == "__main__":
    unittest.main()
