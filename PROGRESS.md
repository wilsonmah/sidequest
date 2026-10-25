# Sidequest — saved progress

## Product
A playful project workspace for resuming unfinished projects, completing small focus sessions, and tracking income ideas. The user wants it to be useful, playful, and potentially profitable.

## Current local version — October 21, 2026
- User requested a minimal Python logic layer and explicitly chose a local Python version first.
- Run `start.cmd`, or `.venv\Scripts\python.exe app.py`, then open http://127.0.0.1:4173/.
- Stack: Python 3.12 (verified), Flask, standard-library SQLite, HTML/CSS and browser-only JavaScript. No Node.js runtime, package manager, or build step required. `requirements.txt` has one direct dependency.
- `sidequest.py` owns validation, task/idea CRUD, recommendation, milestones/stats, backup merging, timer state and XP. `app.py` serves the UI and API on loopback only, with same-origin and request-token write checks.
- Database: `instance/sidequest.sqlite3` (ignored). One local workspace shared by browsers on this computer. No accounts or remote access.
- SQLite transactions protect changes and serialize XP claims. Server-time sessions exclude pauses and prevent duplicate/concurrent XP claims. Editing/deleting a focused task invalidates the session. No resume UI after page refresh yet; reopen the quest to start anew.
- Old JSON backups remain compatible. Import preserves edited local quests, replaces untouched matching starter examples, and deduplicates wins and ideas. Browser localStorage data is not automatically migrated; use Export on the old site, then Restore backup locally.
- Removed the superseded Node preview, JavaScript business-logic tests and separate progress script. Python unittest now checks the actual logic layer; 20 tests pass. JavaScript syntax and static element/HTML checks pass.
- Browser verified: Today loads; focus opens with XP locked; start and pause work; idea capture and promotion persist after reload; Progress renders without console errors. Full timer completion and deletion failure/concurrency paths verified with controlled-clock/API tests. QA-created quest removed; existing user backups and artifacts untouched.
- Local-only work: the live site below has NOT been updated. Do not publish current `dist/` alone: it now requires the Python API. A future deployment needs a Python-capable host.
- See README.md for setup, migration, testing, and limitations. Preview is stopped after verification; start it with `start.cmd` when needed.

## Last published JavaScript version (unchanged)
- Private live app: https://sidequest-studio-wilson.wilsonmah1226179405.chatgpt.site
- Canonical source checkout: `C:\MY PROJECTS\sidequest` (moved from the previous Linux workspace).
- Published source revision: `657c2e4edf471e7ed3307d42b3bcb1ecf9958b19`
- Plain HTML, CSS, and JavaScript in `dist/`; no dependency installation or compilation required.
- Sites project ID: `appgprj_6aa8c1f3241081919ba2b50f4a333486`
- Saved version ID: `appgprj_6aa8c1f3241081919ba2b50f4a333486~appgver_297c282086148191b126bf5f6e2cbaf4` (version 5)
- Successful deployment ID: `appgdep_6aab54d949c88191a8c4a1f8cd8c72c9`

## Implemented
- Create and edit quests with last-session context, next action, blockers, and 15/30/60-minute estimates.
- Income and personal project filters; income goals and manually recorded earnings.
- Quick-win picker based on available time, preferring unblocked projects.
- Focus timer with start, pause, resume, and reset.
- Finish steps, earn 25 XP, progress through levels, and see recent wins.
- Completing without a next action moves the project to the win pile; projects can be reopened.
- Browser-local saving, JSON backup download, and merge-based backup restore.
- Three clearly labeled editable starter ideas.
- Responsive interface, reduced-motion support, native dialogs, custom favicon.
- WebMCP tools to list quests and open a focus session.
- Pro concept with proposed $8/month pricing, explicitly marked unavailable.

## Verified
- JavaScript syntax check passed.
- Browser checks passed for creating a quest, updating income totals, opening and starting focus, completing a project, awarding XP, persistence across reload, and completed-project display.
- WebMCP list and focus calls worked; an invalid quest ID failed intentionally.
- Smaller-screen layout visually inspected.
- Private deployment reported succeeded.

## Boundaries and next steps
- This is a working local-state MVP, not yet a paid service. No payment collection, subscriptions, cross-device sync, shared accounts, or server-backed user records.
- Actual quests live in each browser's local storage. Saving source does not back up a user's browser data. Use the app's download-backup button for that.
- Potential next development: decide the first paid benefit; implement accounts and durable per-user storage; add payments and subscription access once the provider and business details are supplied; validate demand with real users.
- Before expanding features, review the current app with the user and choose the next slice.
- Backup restore, desktop-wide rendering, and full accessibility behavior have not had exhaustive browser testing.

## Resume notes
- Use the Windows checkout above; its `dist/` contains the app source.
- Reuse the existing Sites project; do not create a replacement.
- The preview server has been stopped. Start a new local preview if needed.
- No credentials are saved in this note. Obtain a fresh Sites source-write credential when publishing changes.
- Sites scripts disappeared from their installed path during the previous turn. If still absent, locate the current plugin before relying on its scripts. The successful static archive contained `dist/index.html`, `dist/style.css`, `dist/app.js`, and `dist/.openai/hosting.json`.
- The top-level workspace `.git` was read-only; the canonical checkout has its own working Git repository.

## User's latest instruction
Finish reshaping SideQuest as a phone-friendly companion with a richer desktop workspace, organized around before/during/after project work.

## Resume verification — September 15, 2026
- Repository HEAD matches the saved source revision; app source has no uncommitted changes.
- `node --check dist/app.js` passed on Windows.
- Root `.openai/hosting.json` retains the existing Sites project ID and static `dist` directory. The nested hosting file mentioned in the old archive note is absent in this checkout.
- Sites confirmed the project is active, with version 1 and the same live URL; access remains owner-only.
- The installed Sites execution-profile script is available and detects portable execution. This static app needs no framework setup.
- User selected testing and polishing the current app.

## Current polish pass
- Backup imports validate the complete merged workspace before changing it. Imports and new quest creation cannot save more quests than reload supports; finishing steps also respects the win limit.
- Completed quests can be edited without reopening them. “Pick it back up” explicitly reopens with a required next step.
- Dialogs have accessible names and filters/navigation expose their selected state.
- Hidden controls remain hidden despite the shared input styles.
- Added a dependency-free Node preview (`node scripts/preview.mjs`) and four regression tests (`node --test tests/workspace.test.cjs`); all pass.
- Browser checked: create quest and income, timer start/pause/resume/reset, complete quest and XP, reload persistence, edit completed quest income, valid/repeated/invalid backup restore, keyboard dialog opening/Escape/focus return, desktop and 375px viewport layout. Mobile had no horizontal overflow. This is targeted QA, not a full accessibility audit.
- Test quests exist only in the local preview browser, not the deployed app.
- Published privately; deployment reported succeeded on September 15, 2026 (Toronto).
- Windows packaging: the currently installed plugin is under `C:\Users\nimro\.codex\plugins\cache\openai-bundled\sites\0.1.66`. Its Node packager requires Bash in PATH. Running `skills/sites-hosting/scripts/package-site.sh` with `C:\Program Files\Git\bin\bash.exe` and `/c/...` argument paths worked. Locate the current plugin again if its version changes.

## Retention and sharing pass — September 16, 2026
- Research and product rationale are in `RESEARCH.md`: Forest, Habitica, and Todoist. Adoption claims are vendor-reported; causal retention/viral-growth effects are hypotheses, not measured outcomes.
- Added a rolling seven-day progress trail and a suggested three active days, with lasting milestones at 1/5/20/50 completed steps. All progress derives from existing wins, so old backups remain compatible.
- Added completion receipts with next-step context and optional win messages. Quest name and action are opt-in in win messages.
- Added editable quest recipe links and recipient preview before saving a separate copy. Only title/action/minutes/category are serialized; no notes, income, blockers, IDs, or history. Links use URL fragments and do not grant site access.
- The quest board remains ahead of the progress section; focus, income tracking, and device-local saving remain central.
- Site remains owner-private. Public acquisition testing requires an explicit future audience change; no access changes or outgoing messages were made.
- Automated checks cover dates/DST, milestones, Unicode and unsafe links, privacy defaults, clipboard fallback, and existing workspace regressions. Run `node --test tests/*.test.cjs`.
- Browser checks passed for sharing preview/copy confirmation, recipient cancel/save, saved next actions, completion receipts, five-step milestone, mobile layout/overflow, and invalid-link rejection. No browser console errors observed. Test data stays on localhost.
- Published privately; deployment reported succeeded on September 16, 2026 (Toronto). All 11 automated tests passed. The local preview server was stopped after publication.

## Companion reshape
- Default Today view: one recommended quest with its next action and last-session context. Unblocked personal work takes priority over starter ideas, then the most recently updated quest. A 15-minute toggle narrows recommendations and handles no matching step.
- Quests view retains the full board, filters, time picker, editing, income goals, sharing, and the win pile. Progress contains stats, the seven-day trail, milestones, and recent wins.
- Quick capture saves a single thought in a separate idea shelf. Ideas become quests only after a next step is saved; cancellation or invalid saves retain the idea. Today shows up to three ideas; Quests exposes the whole shelf.
- Optional `ideas` and `updatedAt` fields preserve old-backup compatibility. All edits, step completions, exports, and merges preserve captured ideas. Imports deduplicate ideas by ID.
- Mobile has persistent Today/Quests/Progress navigation, touch-friendly actions, visible backup access, and a full-screen focus dialog. Desktop keeps its sidebar and a two-column Today surface.
- Focus makes the timer optional, encourages doing the work outside the app, and asks for the next step on completion. Receipt sharing is secondary and collapsed; save failures stay visible.
- Still browser-local and owner-private. This pass does not add accounts, cross-device sync, a PWA service worker, or a native mobile app.
- 17 automated tests passed, including recommendation ordering, no-budget-match states, idea persistence/promotion/merge, view switching, and optional focus timer. Syntax, local asset references, duplicate IDs, and HTML section/form/dialog/details structure checked. No new browser QA was performed in this pass.
- Published privately; deployment reported succeeded on September 16, 2026 (Toronto). Local preview server stopped after publication.

## Timer requirement and deletion
- XP now requires the selected quest's focus timer to finish. Idle and paused time do not count; reset, closing, or switching sessions clears eligibility. Each completed session awards XP once. Timer is always visible.
- Quests and saved ideas have delete controls with named confirmation. Quest deletion preserves historical wins and XP, and removes its recorded income from the total. Storage failure keeps the item intact.
- All 21 automated tests pass, including timer boundaries, pause/resume, reset, session switching, duplicate claims, deletion cancellation/persistence, and failed storage. JavaScript syntax and static HTML references/structure checked. No browser QA requested or performed.
- Published privately; deployment reported succeeded on September 16, 2026 (Toronto).

## Local connection repair — October 22, 2026
- User reported localhost unavailable and requested a front-end scan. Python and Flask worked; no listener was running after the prior preview had been stopped.
- Added launcher.py: binds before opening the browser, probes /api/health, reuses an existing SideQuest service. start.cmd validates Flask and uses the launcher.
- Added visible retry connection UI, request timeout and useful offline/restarted-service errors. Failed writes are not blindly retried. Timer polls retain sessions through temporary transport errors, keep XP locked until confirmation, and reject obsolete poll results after timer actions.
- Passed 20 Python tests, 4 optional dependency-free Node front-end regression tests, JS syntax and diff checks. HTTP homepage/health and duplicate launcher verified. Browser loaded Today normally with no console errors.
- Started an explicit local application service in the background and LEFT IT RUNNING for the user (PID 23072 at handoff, launcher.py on 127.0.0.1:4173). Logs in instance/server.log and instance/server-error.log. This is not auto-start at login; use start.cmd after reboot. No online publication or user-data changes.

## End-to-end flow verification — October 22, 2026
- Used isolated database tmp/qa-flows-20261022.sqlite3 and port 4174; did not mutate the user's workspace. QA clock advanced 901 seconds via test-only injected clock; production timer unchanged.
- Browser exercised: create Chinese-named quest, XP disabled before timer ends, start timer, timer completion unlocks claim, +25 XP receipt and first milestone, download JSON backup, cancel deletion, user-confirmed deletion, restore deleted completed quest from downloaded backup, repeat restore without extra quests/XP, reject malformed backup, reload preserves 25 XP and one win. No browser console errors.
- Found and fixed an actual edge case: backup replacing a focused starter quest left its old focus session valid, allowing the replacement task to use old timer eligibility. Changed import to invalidate the session only when the starter actually changes; identical restores retain eligibility.
- Added full lifecycle regression plus changed/identical restore session tests. All 23 Python tests and 4 front-end tests pass.
- Restarted only verified normal SideQuest launcher to load the fix (PID 16980 at handoff); /api/health is ready. Normal service remains running on port 4173. Isolated QA server stopped after verification.
