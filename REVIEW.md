# SideQuest: commercial readiness review

Review date: November 3, 2026. Goal: run SideQuest as an independent paid product earning **US$2,000 per month**.

## Verdict

The product core is good and unusually well engineered for an MVP: one recommended next step with its context, an optional server-side timer, an idea shelf, a guilt-free progress trail, transactional SQLite writes, and 29 regression tests. That loop solves a real problem: restarting a side project costs more energy than the time you have.

As of the previous commit, though, it **could not earn money at all**:

| Gap | Why it blocked revenue | Status after this branch |
| --- | --- | --- |
| Local-only, single user, bound to 127.0.0.1 | Nobody else could use it; nothing to sell | **Fixed.** Hosted mode with per-user workspaces |
| No accounts | No way to know who pays | **Fixed.** Email + password, sessions, resets, deletion |
| No payments | “Pro” was a concept page with “proposed pricing” | **Fixed.** Stripe Checkout, Customer Portal, verified webhooks |
| Weak Pro value (sync, partner, reports, none built) | Nothing to pay for | **Improved.** Free cap of 3 active projects; Pro = unlimited + 12-week and income report |
| No landing page or pricing page | No way to convert a visitor | **Fixed.** Landing, pricing toggle, FAQ, legal templates |
| No deploy path (`dist/` needs the Python API) | Could not go live | **Fixed.** Dockerfile, gunicorn entry, Render blueprint, `.env.example`, DEPLOY.md |
| Security for the open internet | Loopback-only assumptions | **Fixed.** CSRF tokens, same-origin checks, strict CSP, HSTS, login throttling, secure cookies |

The honest remaining risk is **distribution, not code**. The rest of this document is about that.

## Market position

Personal productivity is crowded: general task managers (Todoist, TickTick, Things, Notion), premium daily planners (Sunsama, Akiflow, Motion), focus timers (Forest, Session, Focusmate) and gamified habit apps (Habitica). Competing as “a better to-do app” would fail.

SideQuest's defensible angle is narrow and real: **people with a day job who are building something on the side** (a shop, a game, a newsletter, a portfolio, a freelance offer). Their problem isn't listing tasks; it's losing context between sessions that are days apart. The resume card (“where you left off” + one small next step), time-boxed picking and income tracking fit that audience and no mainstream tool leads with it.

Positioning used on the new landing page: *“Finish the thing you keep meaning to make.”*

## Pricing

Benchmarks: mainstream consumer productivity apps cluster around $4–10/month; premium planners for professionals charge $15–30/month. SideQuest is a focused consumer tool, so it belongs at the upper end of the first group.

**Implemented:** Free (3 active projects) and Pro at **$9/month or $72/year** (33% off yearly).

### The math to $2,000 MRR

| Assumption | Value |
| --- | --- |
| Blended revenue per paying user (half choose yearly) | ≈ $7.50/month |
| Stripe fees (≈2.9% + $0.30) | ≈ 6% |
| Paying users needed | **≈ 285** |
| Free → paid conversion (typical freemium: 2–5%) | 3% |
| Sign-ups needed | **≈ 9,500** cumulative, minus churn |
| Landing visitor → sign-up (typical: 3–8%) | 5% |
| Visitors needed | **≈ 190,000** over the ramp-up period |

Monthly churn of 5–8% means you also need a steady flow of roughly 15–25 new paying users per month just to stay at $2,000. Infrastructure is cheap (≈ $7–25/month on Render with a disk), so nearly all of the revenue is margin.

Levers that change the math most:

1. **Raise perceived value, then price.** An AI “break this into a 15-minute step” button is the most obvious premium feature for this exact audience; it would justify $12/$96. (Claude API cost is a few cents per user per month at this usage.)
2. **Weekly email recap** (“you moved 2 projects forward; here's your next step”). The strongest retention lever for a tool people open irregularly. Needs the SMTP setup already added.
3. **Annual-first pricing.** Yearly plans cut churn sharply; the pricing toggle already defaults to yearly.

## Go-to-market plan (first 90 days)

1. **Launch to a niche, not the world:** Indie Hackers, r/SideProject, r/EntrepreneurRideAlong, maker Discords, and “build in public” on X/Bluesky/Threads. Share real numbers.
2. **Product Hunt launch** once 20–30 real users have used it for 2+ weeks and the onboarding is smooth.
3. **SEO content** that matches the pain: “how to finish side projects with a full-time job”, “side project tracker”, “side hustle income tracker”. One honest, useful article per week.
4. **Built-in loop:** shared quest links now open on any device (hosted), so every share is a sign-up path. Add “Made with SideQuest” on shared links.
5. **Talk to every early user.** The previous `RESEARCH.md` already defines the right metrics: first step finished, return within 7 days, voluntary shares. Measure them before adding features.

## What changed in this branch

- `sidequest.py`: per-user workspaces and focus sessions; automatic migration of existing single-user databases; free-plan cap that only blocks *growth* (a downgraded user keeps every project); 12-week and income insights.
- `accounts.py` (new): sign-up/sign-in with salted hashes, throttling, one-hour single-use reset tokens, sign-out of other sessions after a password reset, account deletion.
- `billing.py` (new): Stripe Checkout, Customer Portal, subscription cancellation and HMAC-verified webhooks without an SDK. Webhook handling re-reads the subscription from Stripe so out-of-order events can't grant Pro.
- `app.py`: `SIDEQUEST_MODE=hosted` mode, CSRF/origin checks, CSP/HSTS/referrer headers, proxy awareness, 401/402 handling. Local mode behaves as before.
- `dist/landing.html`, `auth.html`, `auth.js`, `site.css`, `privacy.html`, `terms.html`, `robots.txt` (new); in-app account panel, real Pro dialog, upgrade-on-limit prompt, 12-week report, log out, delete account.
- Deployment: `wsgi.py`, `Dockerfile`, `.dockerignore`, `render.yaml`, `requirements-prod.txt`, `.env.example`, `DEPLOY.md`.
- Tests: 12 new hosted-mode tests (isolation, CSRF, throttling, plan cap, checkout, webhook signatures, stale-event protection, resets, deletion, migration). **41 Python tests pass.**

## What you still need to do (cannot be done from code)

1. Create a Stripe account, products and prices; enable the Customer Portal; add the webhook. See DEPLOY.md.
2. Buy a domain, deploy (Render blueprint included), set environment variables.
3. Set up transactional email (Postmark, Resend or SES) so password resets work.
4. Fill in and get a quick legal review of `privacy.html` and `terms.html` (bracketed placeholders).
5. Turn on database backups (Render disk snapshots, or Litestream to S3/R2).

## Recommended next engineering work, in order

1. Email verification and a welcome/onboarding email (prevents typo’d accounts that can’t reset).
2. Weekly recap email (retention).
3. AI step-splitting for Pro (value and price).
4. Error monitoring (Sentry) and privacy-friendly analytics (Plausible); both need the CSP extended.
5. Change-password and change-email screens in the app.
6. PWA install and reminders on phones.

Known limitation: the optional Node front-end tests (`tests/frontend.cjs`) were not run in this session because Node.js isn't installed on this machine.
