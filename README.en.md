# SideQuest

English | [中文](README.md)

SideQuest is a local app for making steady progress on personal projects. Capture an idea, define a small next step, and pick up where you left off. The interface is in English and data stays in a local SQLite database.

## Features

- Capture ideas and turn them into projects with context, a next action, blockers, and optional income goals.
- Find a step that fits your available time and see a seven-day progress trail, milestones, and XP.
- Earn 25 XP for completing a step. The timer is optional; you can finish before it runs out or without starting it.
- Step completion and project completion are separate. Leave the next step blank to keep the project active; use **Finish project** and confirm to move it to completed projects. Completed projects can be reopened.
- A focus session is saved locally. Close the dialog or refresh, then use **Return to step** to resume. A running timer continues and a paused timer stays paused. Unsubmitted next-step text is not guaranteed to survive a refresh.
- Export or import a JSON backup, copy a progress message, or share an editable step link.

## Setup and run

Requires Python 3.12 (the version used to validate the project) and Flask. SQLite and the test framework are included with Python. Node.js and a front-end build are not needed to run the app.

For first-time setup on Windows, from the project directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Double-click `start.cmd` to open <http://127.0.0.1:4173/> once the service is ready. The launcher reuses an existing service. Keep the original window open; press Ctrl+C to stop it. Alternatively:

```powershell
.\.venv\Scripts\python.exe app.py
```

## Data, backups, and privacy

This is a single-user local application listening only on `127.0.0.1`. There are no accounts, cross-device sync, or remote access. Browsers connected to the same local service share the SQLite workspace at `instance/sidequest.sqlite3`, which is not committed to the repository.

Use the download button at the top of the page to export a backup and **Restore backup** in the footer to import one. Import merges projects and ideas by ID, deduplicates history, and preserves edited local projects; an unedited sample project may be replaced by an imported project with the same ID. Older backups are supported. Backups contain projects, ideas, and progress, but not the active focus session. Stop the app before copying the SQLite file directly.

A shared step link contains only the project name, step, duration, and category; the recipient can read and edit them before saving a separate copy. It does not grant remote access, and the local address is only usable on this computer. The Pro screen is a concept; there is no subscription or checkout.

## Sessions and consistency

Only one focus session can be active at a time. Switching steps requires confirmation and ends the previous session; editing or deleting the current project also invalidates its session. The server calculates the timer using elapsed time and excludes pauses; a finished timer does not automatically complete a step. Each session can award XP only once, including under duplicate or concurrent requests. Database writes are transactional.

If the connection is interrupted, use **Retry connection**. The session is retained, and you can continue after reconnecting and confirming its state.

## Development and tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
node --test tests/frontend.cjs
```

Python tests use isolated temporary databases and a controlled clock. Node.js is only needed for the optional front-end regression tests.

- `app.py`: local HTTP service and API.
- `sidequest.py`: projects, timers, progress, backups, and SQLite transactions.
- `dist/`: HTML, CSS, and vanilla JavaScript interface.
- `tests/`: back-end and front-end regression tests.

The current code is the local Python edition. `dist/` depends on its Python API and cannot be deployed alone as a static site. An older hosted edition may differ; deploying this version requires suitable Python hosting and production server configuration.
