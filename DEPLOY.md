# Deploying SideQuest (hosted edition)

The hosted edition is the same code with `SIDEQUEST_MODE=hosted`. It runs as one container with a persistent disk for SQLite. That comfortably serves thousands of users; move to Postgres only if you need several machines.

## 1. Stripe (start in test mode)

1. Create a Stripe account. In **Product catalog**, add a product “SideQuest Pro” with two recurring prices: **$9/month** and **$72/year**. Copy both price IDs (`price_…`).
2. **Settings → Billing → Customer portal:** enable it, allow cancelling and switching between the two prices, and set your branding.
3. **Developers → Webhooks → Add endpoint:** `https://YOUR-DOMAIN/api/billing/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the signing secret (`whsec_…`).
4. Copy the secret API key (`sk_test_…`). Switch every value to live mode (`sk_live_…`, live prices, live webhook) only when you launch.

## 2. Email for password resets

Any SMTP relay works (Postmark, Resend, Amazon SES, Mailgun). Verify your sending domain (SPF/DKIM), then set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`. Without SMTP the app still runs, but reset emails are only logged as “not sent”.

## 3. Deploy on Render

1. Push this repository to GitHub, then in Render choose **New → Blueprint** and select the repo. `render.yaml` creates a Starter web service with a 1 GB disk at `/data` and generates `SECRET_KEY`.
2. Fill in the remaining environment variables (see `.env.example`). `BASE_URL` must be your public `https://` address with no trailing slash.
3. Add your custom domain in Render and point DNS at it. HTTPS is automatic.
4. Open `/api/health`. It should return `{"app": "sidequest", "status": "ready"}`.

Any Docker host with a persistent volume works the same way (Fly.io, Railway, a VPS): build the `Dockerfile`, mount a volume at `/data`, set the environment variables, and run one machine.

## 4. Before taking real money

- [ ] Legal pages (`dist/privacy.html`, `dist/terms.html`) are written for Ontario, Canada with a 14-day refund. Before launch:
  - Replace `support@your-domain.com` (it appears in both files) with your real support inbox.
  - Add your legal name or registered business name after “SideQuest” in the first paragraph of each page. Stripe will ask for the same name.
  - If you use a host or email provider other than Render, update the “Who we share it with” list.
  - Have a lawyer or paralegal read both pages once; it costs far less than a dispute.
- [ ] Keep the promises the terms make:
  - **Renewal reminder:** in Stripe, **Settings → Billing → Subscriptions and emails**, turn on emails for upcoming renewals (the terms promise a reminder before yearly plans renew) and for failed payments.
  - **Refunds:** refund requests within 14 days of a charge go in full. Issue them from the payment in the Stripe Dashboard and cancel the subscription immediately.
  - **Backups:** the privacy policy says backups are kept for up to 30 days; set your snapshot or Litestream retention to match.
- [ ] Test the full flow in Stripe test mode with card `4242 4242 4242 4242`: sign up → upgrade → Pro → Manage billing → cancel → back to free at period end.
- [ ] Run `stripe listen --forward-to localhost:4173/api/billing/webhook` locally if you want to test webhooks before deploying.
- [ ] Turn on backups: Render takes daily disk snapshots on paid plans; for point-in-time recovery, add Litestream replicating `/data/sidequest.sqlite3` to S3 or Cloudflare R2.
- [ ] Sales tax: in Canada you must register for GST/HST once worldwide taxable sales pass CA$30,000 in four consecutive quarters (you can register earlier). Stripe Tax can calculate and add HST and foreign taxes at checkout; the terms already say taxes are added where required.

## Running hosted mode locally

```powershell
$env:SIDEQUEST_MODE="hosted"; $env:SECRET_KEY="dev-only-secret-key-not-for-production-0123456789"; $env:PORT="4180"; $env:SIDEQUEST_DB="instance\hosted-trial.sqlite3"
.\.venv\Scripts\python.exe app.py
```

Open <http://localhost:4180/>. Without Stripe variables, the Pro dialog says upgrades open soon, and everything else works.

## Configuration reference

| Variable | Purpose |
| --- | --- |
| `SIDEQUEST_MODE` | `hosted` for the online product; omit for the local single-user app |
| `SECRET_KEY` | Signs session cookies. 32+ random characters; changing it signs everyone out |
| `BASE_URL` | Public origin, e.g. `https://sidequest.app`. Enables secure cookies and links in emails |
| `SIDEQUEST_DB` | SQLite path; `/data/sidequest.sqlite3` in the container |
| `FREE_ACTIVE_QUESTS` | Free-plan cap on active projects (default 3) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Billing; upgrades stay closed until all are set |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Password reset email |
| `TRUSTED_PROXIES` | Number of reverse proxies in front of the app (default 1) |
