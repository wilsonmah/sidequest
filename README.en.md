# SideQuest

English | [中文](README.md)

SideQuest helps you make steady progress on side projects. Capture an idea, define a small next step, and pick up where you left off. It comes in two editions from the same code: a local app for one person on one computer, and a hosted product with accounts and paid plans. The interface is in English; data is stored in SQLite.

## Two editions

| | Local (default) | Hosted (`SIDEQUEST_MODE=hosted`) |
| --- | --- | --- |
| Who it's for | You, on this computer | Anyone, in a browser on any device |
| Accounts | None | Email and password, password reset by email, account deletion |
| Plans | Every feature included | Free: up to 3 active projects. Pro: unlimited projects and a 12-week report, $9/month or $72/year through Stripe |
| Where data lives | `instance/sidequest.sqlite3` on this computer | The server's database (`/data/sidequest.sqlite3` in the container), separate per account |
| How to run | `start.cmd` | Docker / Render; see [DEPLOY.md](DEPLOY.md) |

The commercial review, pricing math and launch plan are in [REVIEW.md](REVIEW.md).

## Features

- Capture ideas and turn them into projects with context, a next action, blockers, and optional income goals.
- Find a step that fits your available time and see a seven-day progress trail, milestones, and XP.
- Earn 25 XP for completing a step. The timer is optional; you can finish before it runs out or without starting it.
- Step completion and project completion are separate. Leave the next step blank to keep the project active; use **Finish project** and confirm to move it to completed projects. Completed projects can be reopened.
- The focus session is saved on the server (your computer for the local edition, your account for the hosted one). Close the dialog or refresh, then use **Return to step** to resume. A running timer continues and a paused timer stays paused. Unsubmitted next-step text is not guaranteed to survive a refresh.
- Export or import a JSON backup, copy a progress message, or share an editable step link.
- Hosted edition only: a landing page with pricing, sign-up and sign-in, an upgrade prompt when the free limit is reached, **Manage billing** for subscribers, **Log out** and **Delete account** in the footer.

## Run the local edition

Requires Python 3.12 or newer and Flask. SQLite and the test framework are included with Python. Node.js and a front-end build are not needed.

For first-time setup on Windows, from the project directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Double-click `start.cmd` to open <http://127.0.0.1:4173/> once the service is ready. The launcher reuses an existing service. Keep the original window open; press Ctrl+C to stop it. Alternatively:

```powershell
.\.venv\Scripts\python.exe app.py
```

## Try the hosted edition on your computer

```powershell
$env:SIDEQUEST_MODE="hosted"; $env:SECRET_KEY="dev-only-secret-key-not-for-production-0123456789"; $env:PORT="4180"
.\.venv\Scripts\python.exe app.py
```

Open <http://localhost:4180/> for the landing page and sign up with any test email. Without Stripe settings the Pro dialog says upgrades open soon; everything else works. Production setup (Stripe, email, domain, backups) is in [DEPLOY.md](DEPLOY.md).

## Data, backups, and privacy

**Local edition:** single user, listening only on `127.0.0.1`, with no accounts or remote access. Browsers connected to the same local service share the workspace at `instance/sidequest.sqlite3`, which is not committed to the repository. Stop the app before copying the SQLite file directly.

**Hosted edition:** each account has its own workspace; one account cannot read or change another's. Passwords are stored only as salted hashes. Payments are handled by Stripe, and the app stores only the Stripe customer and subscription IDs and status, never card details. **Delete account** removes the account and its workspace and cancels any subscription. The privacy policy and terms in `dist/` are templates that must be completed before launch.

**Backups (both editions):** use the download button at the top of the page to export a backup and **Restore backup** in the footer to import one. Import merges projects and ideas by ID, deduplicates history, and preserves edited projects; an unedited sample project may be replaced by an imported project with the same ID. Older backups are supported. Backups contain projects, ideas, and progress, but not the active focus session.

A shared step link contains only the project name, step, duration, and category; the recipient can read and edit them before saving a separate copy. With the hosted edition the link works on any device; with the local edition it only opens on this computer. In the local edition the Pro dialog only explains the hosted plan; there is no checkout.

## Sessions and consistency

Only one focus session can be active at a time per workspace. Switching steps requires confirmation and ends the previous session; editing or deleting the current project also invalidates its session. The server calculates the timer using elapsed time and excludes pauses; a finished timer does not automatically complete a step. Each session can award XP only once, including under duplicate or concurrent requests. Database writes are transactional.

If the connection is interrupted, use **Retry connection**. The session is retained, and you can continue after reconnecting and confirming its state.

## Development and tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
node --test tests/frontend.cjs
```

Python tests (`test_app.py` for the shared logic and local edition, `test_hosted.py` for accounts, plans and billing) use isolated temporary databases, a controlled clock, and a fake Stripe API, so no keys or network are needed. Node.js is only needed for the optional front-end regression tests.

- `app.py`: HTTP service and API for both editions.
- `sidequest.py`: projects, timers, progress, backups, plan limits, and SQLite transactions.
- `accounts.py`, `billing.py`: hosted accounts and Stripe billing.
- `wsgi.py`, `Dockerfile`, `render.yaml`, `requirements-prod.txt`, `.env.example`: production deployment.
- `dist/`: app, landing, sign-in and legal pages (HTML, CSS, and vanilla JavaScript).
- `tests/`: back-end and front-end regression tests.

`dist/` depends on the Python API and cannot be deployed alone as a static site.
