# Secrets & Environment Variables

Beta: secrets are set directly in Cloud Run console env (no Secret Manager).
Post-beta: migrate to Secret Manager (tracked in W-XXXX-secret-manager-migration).

## Engine — Cloud Run env (cogotchi service)

| Key | Description | Who needs it |
|---|---|---|
| `OKX_API_KEY` | OKX exchange API key | Engine only |
| `OKX_SECRET_KEY` | OKX exchange secret | Engine only |
| `OKX_PASSPHRASE` | OKX exchange passphrase | Engine only |
| `SUPABASE_URL` | `https://hbcgipcqpuintokoooyg.supabase.co` | Engine |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for DB writes | Engine |
| `ENGINE_INTERNAL_SECRET` | Shared secret, must match app's value | Engine + App |
| `APP_ORIGIN` | App URL for CORS: `https://app.cogotchi.dev` | Engine |
| `ENABLE_OUTCOME_RESOLVER` | Set `true` to enable outcome resolver job | Engine |
| `ENABLE_REFINEMENT_TRIGGER` | Set `true` to enable refinement trigger job | Engine |
| `ENABLE_FETCH_OKX_SIGNALS` | Set `true` to enable OKX signals fetch | Engine |
| `ENABLE_CORPUS_BRIDGE_SYNC` | Set `true` to enable corpus bridge sync | Engine |
| `ENABLE_FEATURE_WINDOWS_PREFETCH` | Set `true` to enable feature prefetch | Engine |
| `ENABLE_ALPHA_OBSERVER_COLD` | Set `true` to enable cold alpha observer | Engine |
| `ENABLE_ALPHA_OBSERVER_WARM` | Set `true` to enable warm alpha observer | Engine |

## App — Vercel env

| Key | Description | Who needs it |
|---|---|---|
| `ENGINE_URL` | `https://cogotchi-103912432221.asia-southeast1.run.app` | App server |
| `ENGINE_INTERNAL_SECRET` | Shared secret, must match engine's value | App server |
| `SUPABASE_URL` | Supabase project URL | App server |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) | App server |
| `SUPABASE_ANON_KEY` | Anon key (used client-side) | App |
| `DATABASE_URL` | Direct Postgres URL for pg client | App server |
| `BETA_OPEN` | `true` = bypass allowlist gate | App server |
| `SESSION_SECRET` | SIWE session cookie signing key | App server |

## Access

Cloud Run env: GCP Console → Cloud Run → `cogotchi` → Edit & Deploy → Variables & Secrets tab.
Vercel env: Vercel Dashboard → Project → Settings → Environment Variables.

Only the project owner and explicitly authorized team members have access to these consoles.
