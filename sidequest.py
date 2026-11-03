"""SideQuest rules and SQLite persistence. No browser state is trusted for XP."""
import json
import math
import random
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta


class RuleError(ValueError):
    pass


class UpgradeRequired(RuleError):
    """A free-plan limit was reached; the client offers Pro instead of a plain error."""


MILESTONES = [
    {"at": 1, "name": "First spark", "description": "Finish your first step"},
    {"at": 5, "name": "Finding a rhythm", "description": "Finish 5 steps"},
    {"at": 20, "name": "Making it happen", "description": "Finish 20 steps"},
    {"at": 50, "name": "Built by you", "description": "Finish 50 steps"},
]


def text(value, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise RuleError(f"Please enter valid text of up to {limit} characters.")
    return value


def number(value, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= maximum:
        raise RuleError("A number is outside the supported range.")
    return value


def validate(value):
    if not isinstance(value, dict) or not isinstance(value.get("projects"), list) or not isinstance(value.get("wins"), list):
        raise RuleError("This is not a Sidequest backup.")
    ideas = value.get("ideas", [])
    if not isinstance(ideas, list) or len(ideas) > 1000 or len(value["projects"]) > 1000 or len(value["wins"]) > 10000:
        raise RuleError("Workspace limits: 1,000 quests, 1,000 ideas and 10,000 wins.")
    result = {"projects": [], "wins": [], "ideas": []}
    for p in value["projects"]:
        if not isinstance(p, dict) or type(p.get("done")) is not bool or p.get("category") not in ("money", "personal") or p.get("minutes") not in (15, 30, 60):
            raise RuleError("The backup contains an invalid quest.")
        result["projects"].append(dict(
            id=text(p.get("id"), 100, True), name=text(p.get("name"), 70, True),
            category=p["category"], minutes=p["minutes"], done=p["done"], sample=bool(p.get("sample", False)),
            context=text(p.get("context"), 500), next=text(p.get("next"), 140),
            blocker=text(p.get("blocker"), 150), goal=number(p.get("goal"), 100000000),
            income=number(p.get("income"), 100000000), updatedAt=number(p.get("updatedAt", 0), 8640000000000000)))
    for w in value["wins"]:
        if not isinstance(w, dict):
            raise RuleError("The backup contains an invalid win.")
        result["wins"].append(dict(action=text(w.get("action"), 140), project=text(w.get("project"), 70), at=number(w.get("at"), 8640000000000000)))
    for i in ideas:
        if not isinstance(i, dict):
            raise RuleError("The backup contains an invalid idea.")
        result["ideas"].append(dict(id=text(i.get("id"), 100, True), name=text(i.get("name"), 70, True), at=number(i.get("at"), 8640000000000000)))
    for key in ("projects", "ideas"):
        if len({item["id"] for item in result[key]}) != len(result[key]):
            raise RuleError("The backup contains duplicate IDs.")
    return result


def initial_workspace():
    names = [("Launch a tiny template shop", "Sketch the layout for your first template", "money", 30),
             ("Make room for a creative habit", "Fill one page with things on your desk", "personal", 15),
             ("Build your freelance launchpad", "Write a one-paragraph service offer", "money", 30)]
    return {"projects": [dict(id=f"sample-{i+1}", name=n, next=a, category=c, minutes=m,
                             context="A small place to start. Make this quest yours.", blocker="", goal=0,
                             income=0, sample=True, done=False, updatedAt=0) for i, (n, a, c, m) in enumerate(names)], "wins": [], "ideas": []}


def recommend(projects, budget):
    eligible = [p for p in projects if not p["done"] and p["next"].strip() and p["minutes"] <= budget]
    return min(eligible, key=lambda p: (bool(p["blocker"]), p["sample"], -p["updatedAt"], p["minutes"]), default=None)


def active_quests(workspace):
    return sum(not p["done"] and not p["sample"] for p in workspace["projects"])


def insights(workspace, now):
    """Pro report: twelve weeks of finished steps and income by project."""
    today = datetime.fromtimestamp(now).date()
    start = today - timedelta(days=today.weekday() + 7 * 11)
    weeks = [{"start": (start + timedelta(weeks=i)).isoformat(), "count": 0} for i in range(12)]
    for win in workspace["wins"]:
        if win["at"] > now * 1000:
            continue
        index = (datetime.fromtimestamp(win["at"] / 1000).date() - start).days // 7
        if 0 <= index < 12:
            weeks[index]["count"] += 1
    earners = sorted((p for p in workspace["projects"] if p["income"] > 0), key=lambda p: -p["income"])[:5]
    return {"weeks": weeks, "income": [{"name": p["name"], "income": p["income"], "goal": p["goal"]} for p in earners]}


def presentation(workspace, now, report=False):
    today = datetime.fromtimestamp(now).date()
    days = [{"date": (today - timedelta(days=6-i)).isoformat(), "count": 0} for i in range(7)]
    for win in workspace["wins"]:
        if win["at"] > now * 1000 or win["at"] < (now - 8 * 86400) * 1000:
            continue
        key = datetime.fromtimestamp(win["at"] / 1000).date().isoformat()
        for day in days:
            if day["date"] == key:
                day["count"] += 1
    total = len(workspace["wins"])
    return {"xp": total * 25, "level": total // 4 + 1, "levelXP": total * 25 % 100,
            "activeCount": sum(not p["done"] for p in workspace["projects"]),
            "income": sum(p["income"] for p in workspace["projects"]),
            "recommendations": {str(b): (p["id"] if (p := recommend(workspace["projects"], b)) else None) for b in (15, 30, 60)},
            "progress": {"days": days, "steps": sum(d["count"] for d in days), "activeDays": sum(d["count"] > 0 for d in days),
                         "milestones": MILESTONES, "next": next((m for m in MILESTONES if m["at"] > total), None)},
            "insights": insights(workspace, now) if report else None}


class Workspace:
    """One JSON workspace and at most one focus session per user, stored in SQLite."""

    def __init__(self, path, clock=time.time):
        self.path, self.clock = str(path), clock
        with self.connection() as db:
            db.execute("CREATE TABLE IF NOT EXISTS workspaces (user_id TEXT PRIMARY KEY, data TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS focus_sessions (user_id TEXT PRIMARY KEY, data TEXT NOT NULL)")
            # Databases from the single-user edition keep their data as the local user.
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "workspace" in tables:
                db.execute("INSERT OR IGNORE INTO workspaces SELECT 'local', data FROM workspace WHERE id=1")
                db.execute("DROP TABLE workspace")
            if "focus" in tables:
                db.execute("INSERT OR IGNORE INTO focus_sessions SELECT 'local', data FROM focus WHERE id=1")
                db.execute("DROP TABLE focus")
        db = sqlite3.connect(self.path)
        db.execute("PRAGMA journal_mode=WAL")
        db.close()

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def read(self, db, user):
        row = db.execute("SELECT data FROM workspaces WHERE user_id=?", (user,)).fetchone()
        if row:
            return json.loads(row[0])
        state = initial_workspace()
        db.execute("INSERT INTO workspaces VALUES (?, ?)", (user, json.dumps(state)))
        return state

    def snapshot(self, user="local", report=False):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            state = self.read(db, user)
            focus = self.current_focus(db, user)
        return {"state": state, "summary": presentation(state, self.clock(), report), "focus": focus}

    def stored_session(self, db, user):
        row = db.execute("SELECT data FROM focus_sessions WHERE user_id=?", (user,)).fetchone()
        return json.loads(row[0]) if row else None

    def save_session(self, db, user, session):
        db.execute("INSERT OR REPLACE INTO focus_sessions VALUES (?, ?)", (user, json.dumps(session)))

    def end_session(self, db, user):
        db.execute("DELETE FROM focus_sessions WHERE user_id=?", (user,))

    def current_focus(self, db, user):
        session = self.stored_session(db, user)
        return self.session_view(session) if session else None

    def session(self, db, user, identifier):
        session = self.stored_session(db, user)
        if not session or session["id"] != identifier:
            raise RuleError("This focus session has ended. Open the quest again.")
        return session

    def session_view(self, session):
        remaining = max(0, session["remaining"] - (max(0, self.clock() - session["startedAt"]) if session["startedAt"] is not None else 0))
        return {"id": session["id"], "projectId": session["projectId"], "remaining": math.ceil(remaining),
                "running": session["startedAt"] is not None and remaining > 0, "finished": remaining <= 0}

    def focus_status(self, identifier, user="local"):
        with self.connection() as db:
            return self.session_view(self.session(db, user, identifier))

    def delete_user(self, user):
        with self.connection() as db:
            db.execute("DELETE FROM workspaces WHERE user_id=?", (user,))
            self.end_session(db, user)

    def act(self, action, data, user="local", quest_limit=None, report=False):
        if not isinstance(data, dict):
            raise RuleError("Expected a JSON object.")
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            state = self.read(db, user)
            active_before = active_quests(state)
            result = {}
            now = self.clock()
            if action == "save":
                identifier = data.get("id")
                old = next((p for p in state["projects"] if p["id"] == identifier), None)
                if identifier and not old:
                    raise RuleError("This quest was deleted. Reload your workspace.")
                p = data.get("project")
                if not isinstance(p, dict):
                    raise RuleError("Invalid quest.")
                text(p.get("next"), 140, not old or bool(data.get("reopen")))
                p = {**p, "id": identifier or str(uuid.uuid4()), "done": bool(old and old["done"] and not data.get("reopen")), "sample": False, "updatedAt": now * 1000}
                state["projects"] = [p if q["id"] == identifier else q for q in state["projects"]] if old else state["projects"] + [p]
                idea_id = data.get("ideaId")
                if idea_id and not any(i["id"] == idea_id for i in state["ideas"]):
                    raise RuleError("This idea has already been moved or deleted. Reload your workspace.")
                state["ideas"] = [i for i in state["ideas"] if i["id"] != idea_id]
                if old:
                    self.invalidate(db, user, identifier)
                result = {"id": p["id"], "savedOnDevice": True}
            elif action == "finish-project":
                quest = next((p for p in state["projects"] if p["id"] == data.get("id") and not p["done"]), None)
                if not quest:
                    raise RuleError("Choose an active project.")
                quest.update(done=True, sample=False, updatedAt=now * 1000)
                self.invalidate(db, user, quest["id"])
                result = {"savedOnDevice": True}
            elif action == "capture":
                name = text(data.get("name"), 70, True).strip()
                state["ideas"].append({"id": str(uuid.uuid4()), "name": name, "at": now * 1000})
            elif action == "delete":
                if data.get("kind") not in ("quest", "idea"):
                    raise RuleError("Choose a quest or idea.")
                key = "projects" if data["kind"] == "quest" else "ideas"
                state[key] = [p for p in state[key] if p["id"] != data.get("id")]
                if key == "projects":
                    self.invalidate(db, user, data.get("id"))
            elif action == "import":
                incoming = validate(data.get("workspace"))
                for key in ("projects", "ideas"):
                    # Fresh demo quests must not hide a user's edited starter in an old backup.
                    imported = {p["id"]: p for p in incoming[key]}
                    if key == "projects":
                        for p in state[key]:
                            if p["sample"] and p["id"] in imported and imported[p["id"]] != p:
                                self.invalidate(db, user, p["id"])
                        state[key] = [imported.get(p["id"], p) if p["sample"] else p for p in state[key]]
                    identifiers = {p["id"] for p in state[key]}
                    state[key].extend(p for p in incoming[key] if p["id"] not in identifiers)
                wins = {(w["action"], w["project"], w["at"]): w for w in state["wins"] + incoming["wins"]}
                state["wins"] = sorted(wins.values(), key=lambda w: w["at"])
            elif action in ("focus", "pick"):
                if action == "pick":
                    budget = data.get("budget")
                    if budget not in (15, 30, 60):
                        raise RuleError("Choose 15, 30 or 60 minutes.")
                    pool = [p for p in state["projects"] if not p["done"] and p["next"].strip() and p["minutes"] <= budget]
                    if not pool:
                        raise RuleError("No quest fits yet. Try more time or add a shorter step.")
                    quest = random.choice([p for p in pool if not p["blocker"]] or pool)
                else:
                    quest = next((p for p in state["projects"] if p["id"] == data.get("id") and not p["done"]), None)
                if not quest:
                    raise RuleError("Choose an active quest.")
                if not quest["next"].strip():
                    raise RuleError("Add a next step before starting this project.")
                current = self.current_focus(db, user)
                if current and current["projectId"] == quest["id"]:
                    result = current
                else:
                    if current and data.get("replaceSessionId") != current["id"]:
                        raise RuleError("Another step is open. Resume it or confirm switching to a new step.")
                    session = {"id": str(uuid.uuid4()), "projectId": quest["id"], "remaining": quest["minutes"] * 60, "duration": quest["minutes"] * 60, "startedAt": None}
                    self.save_session(db, user, session)
                    result = self.session_view(session)
            elif action in ("start", "pause", "reset", "cancel", "complete"):
                session = self.session(db, user, data.get("sessionId"))
                status = self.session_view(session)
                if action == "cancel":
                    self.end_session(db, user)
                elif action == "complete":
                    quest = next((p for p in state["projects"] if p["id"] == session["projectId"] and not p["done"]), None)
                    if not quest:
                        raise RuleError("This quest is no longer active.")
                    next_step = text(data.get("next"), 140).strip()
                    state["wins"].append({"action": quest["next"], "project": quest["name"], "at": now * 1000})
                    quest.update(context="Finished: " + quest["next"], next=next_step, done=False, blocker="", sample=False, updatedAt=now * 1000)
                    self.end_session(db, user)
                    result = {"xpAwarded": 25, "savedOnDevice": True}
                else:
                    if action == "reset":
                        session.update(remaining=session["duration"], startedAt=None)
                    elif action == "start" and session["startedAt"] is None and not status["finished"]:
                        session["startedAt"] = now
                    elif action == "pause":
                        # Keep fractional seconds so repeated pauses cannot round time away.
                        if session["startedAt"] is not None:
                            session["remaining"] = max(0, session["remaining"] - max(0, now - session["startedAt"]))
                        session["startedAt"] = None
                    self.save_session(db, user, session)
                    result = self.session_view(session)
            else:
                raise RuleError("Unknown operation.")
            state = validate(state)
            # Limits only block growth, so a downgraded account keeps every existing quest.
            active = active_quests(state)
            if quest_limit is not None and active > quest_limit and active > active_before:
                raise UpgradeRequired(f"The free plan includes {quest_limit} active quests. Finish one first, or upgrade to Pro for unlimited quests.")
            db.execute("UPDATE workspaces SET data=? WHERE user_id=?", (json.dumps(state), user))
            return {"state": state, "summary": presentation(state, now, report), "focus": self.current_focus(db, user), "result": result}

    def invalidate(self, db, user, project_id):
        session = self.stored_session(db, user)
        if session and session["projectId"] == project_id:
            self.end_session(db, user)
