# 🚀 SharpDog Launch Guide

Follow these steps in order. Each one takes a few minutes.

---

## 1. Go live on the web (Vercel — free)

1. Go to **vercel.com** → sign in with your GitHub account
2. **Add New → Project** → import `underdog-analyzer`
3. Before deploying, open **Environment Variables** and add:

   | Variable | Value |
   |---|---|
   | `ODDS_API_KEY` | your odds-api.io key |
   | `AUTH_SECRET` | a long random string (e.g. from passwordsgenerator.net, 40+ chars) |
   | `NEXT_PUBLIC_SITE_URL` | your app URL (add after first deploy, then redeploy) |

4. Click **Deploy**. Your app is live at `https://<project>.vercel.app`
5. Optional: **Settings → Domains** to attach a custom domain like `sharpdog.app`

**Your admin login:** username `sharpdogadmin`, password `Zabdiel2025!`
(Change it later by setting `ADMIN_PASSWORD_HASH` in Vercel env vars.)

---

## 2. Make signups permanent (Upstash — free)

Without this, user accounts reset every time the app redeploys.

1. Go to **upstash.com** → create a free account → **Create Database** (Redis, any region)
2. In the database page, find the **REST API** section
3. Copy the two values into Vercel env vars:
   - `KV_REST_API_URL` = the REST URL
   - `KV_REST_API_TOKEN` = the REST token
4. Redeploy

---

## 3. Turn on subscriptions (Stripe)

Until Stripe is configured, registered users get free access (good for building
an early user base). Once you add these vars, the paywall switches on automatically.

1. Go to **stripe.com** → create account → activate payments (business details, bank account)
2. **Product catalog → Add product**: name it "SharpDog Premium"
   - Add a **monthly** recurring price (e.g. $9.99/month) → copy its price ID (`price_...`)
   - Add a **yearly** recurring price (e.g. $79.99/year) → copy its price ID
3. **Developers → API keys** → copy the **Secret key** (`sk_live_...`)
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-APP-URL/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_...`)
5. Add to Vercel env vars and redeploy:

   | Variable | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_live_...` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
   | `STRIPE_PRICE_MONTHLY` | `price_...` (monthly) |
   | `STRIPE_PRICE_YEARLY` | `price_...` (yearly) |
   | `NEXT_PUBLIC_PRICE_MONTHLY_DISPLAY` | `$9.99` (what the page shows) |
   | `NEXT_PUBLIC_PRICE_YEARLY_DISPLAY` | `$79.99` |

Money flow: subscriber pays → Stripe notifies your webhook → access unlocks
instantly. Cancellations/failed payments lock access automatically. Payouts go
to your bank on Stripe's schedule.

---

## 4. Get into the app stores

The app is already a PWA (installable, has icons + manifest). The fastest path
to both stores is **PWABuilder** (free, by Microsoft):

### Android (Google Play) — ~$25 one-time
1. Go to **pwabuilder.com** → enter your live app URL → it scores your PWA
2. Click **Package for Stores → Android** → download the signed package (`.aab`)
3. Create a **Google Play Console** account ($25 one-time) at play.google.com/console
4. Create app → upload the `.aab` → fill in store listing (use `og-image.png` and the icons) → submit for review (usually 1–3 days)

### iPhone (Apple App Store) — $99/year
1. Join the **Apple Developer Program** at developer.apple.com ($99/year)
2. On **pwabuilder.com** → **Package for Stores → iOS** → download the Xcode project
3. You need a Mac (or a service like MacinCloud) to open it in Xcode → sign with your developer account → upload via App Store Connect
4. Apple review is stricter: include the entertainment disclaimer, age rating 17+/18+, and note it does not take bets itself (it's an information/analysis tool). Gambling-related apps may require extra review steps depending on country.

> Tip: launch Android first (cheaper, faster review), iOS second.

---

## 5. Growth checklist ("go viral" is earned, but here's the engine)

Built into the app already:
- **Share button (↗) on every pick** — one tap shares the pick + your link
- **Social cards** — links pasted into X/IG/iMessage show a branded preview
- **Installable PWA** — users can add to home screen before the store apps land

Playbook that works for picks apps:
1. **Post the daily pick publicly** (X/Twitter, TikTok, IG Reels) *with yesterday's result* — transparency is the hook. Win or lose, post it.
2. **Track record = content.** Screenshot the "My Record" tab weekly.
3. **Free tier as the funnel:** keep Stripe off for the first 2–4 weeks, build users, then announce the paywall date ("founding members lock in $X/mo").
4. Short-form video of the pick each morning (15s: matchup, odds, edge %, "link in bio").
5. Referral idea for later: give a free month for every 3 signups (can be added when you're ready).

---

## Env vars quick reference

See `.env.example` for the full list with comments.

| Var | Required for |
|---|---|
| `ODDS_API_KEY` | picks data |
| `AUTH_SECRET` | secure logins (production) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | permanent accounts |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | paywall |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | change admin login |
| `NEXT_PUBLIC_SITE_URL` | share cards |
