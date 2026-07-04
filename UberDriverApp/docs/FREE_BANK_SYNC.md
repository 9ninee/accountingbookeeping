# Free Bank Transaction Sync — Setup Guide

The smartest way to sync real bank transactions into the app **without paying for anything**, verified June 2026.

## Why this architecture

The free Open Banking landscape changed in 2025–2026:

| Provider | Free option | Verdict for this project |
|---|---|---|
| **GoCardless Bank Account Data** | Was free (50 connections) | ❌ **Stopped accepting new signups July 2025.** The direct integration in this app still works only for legacy accounts. |
| **Plaid** | Sandbox free (fake data); free Trial plan is US/Canada-only | ⚠️ Keep your key for development testing with fake data. UK production isn't free. |
| **Teller** | 100 free live connections | ❌ US banks only. |
| **SimpleFIN Bridge** | $15/year | ❌ Not free, US only. |
| **Enable Banking** | **Restricted Production: free, unlimited use for your OWN whitelisted accounts** | ⚠️ **EU/EEA banks only** — their licence doesn't cover the UK post-Brexit, so no UK banks in free mode. |
| **Monzo (direct)** | Free OAuth API for your own account | ✅ **Built in.** The free UK path — no aggregator, no 90-day EB reconsent. See the Monzo section below. |
| **Starling (direct)** | Free personal access tokens | ✅ Same idea as Monzo if you bank with Starling (connector not built yet — ask). |
| **CSV import** | Always free, every bank | ✅ Already built into the app as the universal fallback. |

## How it works

```
Your bank ──(Open Banking, read-only)──► Enable Banking API
                                              │
                              Supabase Edge Function  `bank-sync`
                              (your private key stays server-side,
                               NEVER in the app bundle)
                                              │  writes + dedupes
                                    Supabase Postgres `transactions`
                                              │
            ┌─────────────────────────────────┼──────────────────────────┐
   pg_cron daily schedule              app pull sync                Streamlit
   (syncs even when the          (offline-first SQLite)             dashboard
    app is closed)
```

Everything runs on the **Supabase free tier** (500K Edge Function calls/month — a daily sync uses ~30).

Deduplication happens server-side using the **same hash algorithm as the app**
(`date|amount|normalized description` + bank transaction reference), so bank-synced
rows never duplicate your CSV or Apple Wallet imports. This is enforced by tests
(`__tests__/bankSyncMapper.test.ts`).

## One-time setup (~20 minutes)

### 1. Get free Enable Banking credentials

1. Sign up at [enablebanking.com](https://enablebanking.com) (free, self-serve).
2. In the **Control Panel**, create an application:
   - Environment: **Production**
   - Redirect URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/bank-sync/callback`
     (find `YOUR_PROJECT_REF` in your Supabase project URL)
3. Download the **private key (PEM)** and note the **Application ID**.
4. Activate the application via **"Activate by linking accounts"** — link your own
   bank account. This puts the app in free *restricted mode*: full production API
   access, limited to the accounts you whitelist. That's exactly what we need.

### 2. Deploy the Edge Function

```bash
cd UberDriverApp

# Install the Supabase CLI if needed: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Secrets stay on the server — never in the app or the repo
supabase secrets set EB_APPLICATION_ID="your-application-id"
supabase secrets set EB_PRIVATE_KEY="$(cat /path/to/private.pem)"
supabase secrets set CRON_SECRET="$(openssl rand -hex 24)"

# --no-verify-jwt because the bank's browser redirect can't carry an auth
# header; the function enforces auth in code for every data action.
supabase functions deploy bank-sync --no-verify-jwt
```

### 3. Update the database schema

Run the updated `supabase/schema.sql` in the Supabase **SQL Editor** (it's
idempotent — safe to re-run; it adds `provider`, `session_id`, `status`,
`last_synced_at` to `linked_banks`).

### 4. (Optional but recommended) Daily auto-sync

Edit `supabase/cron.sql` — replace `YOUR_PROJECT_REF` and `YOUR_CRON_SECRET` —
then run it in the SQL Editor. Your transactions will sync every morning at
06:00 UTC even if you never open the app. The app also auto-syncs (max once
per 24h) on launch.

### 5. Connect your bank in the app

1. Sign in (Settings tab) — the cloud path requires an account so Row Level
   Security can keep your data yours.
2. **Import tab → Bank Sync → Connect a Bank Account.**
3. Pick your bank, authorize read-only access on your bank's own website,
   then return and tap **"I've Finished Authorization."**
4. Tap **Sync All Banks** — transactions land in the cloud, then pull down
   into the on-device database automatically.

## Security model

- The Enable Banking **private key never leaves Supabase** — the mobile bundle
  contains no bank credentials at all.
- Access is **read-only** (PSD2 AIS). Nobody can move money.
- Consent expires after **90 days**; the app shows a countdown badge and a
  one-tap **Re-link** button.
- Postgres **Row Level Security** isolates every user's rows.
- The scheduled sync authenticates with a random `CRON_SECRET` header.

## Rate limits worth knowing

Banks may throttle Open Banking polling down to ~4 calls/day per account. That's
why the design syncs **once daily** (cron + throttled launch sync) instead of
polling — and why the manual "Sync All Banks" button may occasionally return a
rate-limit error if pressed many times in one day. The sync window overlaps 3
days each run, so late-booking transactions are never missed.

## Monzo setup (UK — the free path)

The `bank-sync` function has a built-in Monzo connector. One-time setup:

1. Go to [developers.monzo.com](https://developers.monzo.com) and sign in
   (enter your Monzo account email → tap the magic link → approve in the Monzo app).
2. **Clients → New OAuth Client**:
   - Name: `Uber Driver Tracker` (anything)
   - Redirect URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/bank-sync/callback`
   - Confidentiality: **Confidential** (required for refresh tokens)
3. Copy the **Client ID** and **Client Secret**, then:

   ```bash
   supabase secrets set MONZO_CLIENT_ID="oauth2client_..." MONZO_CLIENT_SECRET="mnzconf...."
   supabase functions deploy bank-sync --no-verify-jwt
   ```

4. Run the updated `supabase/schema.sql` in the SQL Editor (adds the
   service-role-only `bank_tokens` table).
5. In the app: **Import → Bank Sync → Connect a Bank Account → Monzo**.
   The browser opens Monzo's auth page (email magic link) → after the redirect,
   **open the Monzo app and approve access** → back in the tracker, tap
   **"I've Finished Authorization"** → **Sync All Banks**.

Notes:
- Monzo SCA limits API history to the **last ~90 days** — a daily sync never
  notices this.
- Access tokens auto-refresh server-side and live in `bank_tokens`, which has
  RLS enabled with **no policies** — only the Edge Function (service role) can
  read them. The app never sees bank tokens.
- A Development-tier Monzo client only works for **your own account** — exactly
  what we want.

## If you bank with Monzo or Starling

You can skip aggregators entirely — both offer free personal API tokens for your
own account ([Monzo](https://developers.monzo.com) ·
[Starling](https://developer.starlingbank.com)). Tokens don't have the 90-day
PSD2 reconsent dance. The Edge Function is the natural place to add those
connectors later (same table, same dedup).

## Fallbacks that always work

- **CSV import** (Import tab) — every UK bank exports CSV; the dedup engine
  handles overlaps with bank sync automatically.
- **Apple Wallet import** — paste wallet transaction JSON.
- **Plaid sandbox** — your existing key still works for testing flows with
  fake data (`PLAID_ENV=sandbox`).
