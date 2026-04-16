# Environment Variables

Canonical env contract for local/prod runtime.

## Required (All Environments)

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `ENGINE_URL` | `http://localhost:8000` | `app-web` | App -> engine API base URL |
| `DATABASE_URL` | none | `app-web` | Postgres connection |
| `ENGINE_PORT` | `8000` | `engine-api` | Engine HTTP port |
| `APP_ORIGIN` | `http://localhost:3000` | `engine-api` | CORS allow-origin |

## Strongly Recommended (Production)

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `RATE_LIMIT_REDIS_REST_URL` | empty | `app-web` | Distributed limiter backend |
| `RATE_LIMIT_REDIS_REST_TOKEN` | empty | `app-web` | Distributed limiter auth |
| `SHARED_CACHE_REDIS_REST_URL` | empty | `app-web` | Shared cache backend |
| `SHARED_CACHE_REDIS_REST_TOKEN` | empty | `app-web` | Shared cache auth |
| `TURNSTILE_SECRET_KEY` | empty | `app-web` | Bot/abuse protection |
| `SECURITY_ALLOWED_HOSTS` | empty | `app-web` | Optional Host allowlist (`host[:port]`, comma-separated) |
| `ENGINE_ALLOWED_HOSTS` | empty | `engine-api` | Optional Host allowlist (`host[:port]`, comma-separated) |
| `ENGINE_ALLOWED_ORIGINS` | empty | `engine-api` | Extra CORS allowlist origins |
| `ENGINE_EXPOSE_DOCS` | `false` | `engine-api` | Enable FastAPI `/docs` and `/openapi.json` |

## Auth/Secrets

| Variable | Used by |
|---|---|
| `PUBLIC_SUPABASE_URL` | app |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app |
| `SUPABASE_URL` | worker-control |
| `SUPABASE_SERVICE_ROLE_KEY` | worker-control only |
| `SECRETS_ENCRYPTION_KEY` | app/server |

Notes:

- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` is safe for browser/runtime use.
- `SUPABASE_SERVICE_ROLE_KEY` must never be present in `app-web`; the app runtime now fails fast if it is set.
- `SUPABASE_SERVICE_ROLE_KEY` belongs to `worker-control` background jobs only because it bypasses RLS.
- `DATABASE_URL` should use a least-privilege app role; avoid shipping a `postgres*` superuser DSN to production app-web.
- Set `SECURITY_ALLOWED_HOSTS` and `ENGINE_ALLOWED_HOSTS` in production to reject unexpected `Host` headers at the app and engine boundaries.
- Leave `ENGINE_EXPOSE_DOCS=false` on public deployments unless the engine is behind auth or a private network boundary.

## Data Providers

Typical optional provider keys:

- `COINGECKO_API_KEY`
- `COINALYZE_API_KEY`
- `COINMARKETCAP_API_KEY`
- `CRYPTOQUANT_API_KEY`
- `ETHERSCAN_API_KEY`

## Worker-Control Research

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `ENABLE_PATTERN_REFINEMENT_JOB` | `false` | `worker-control` | Enable scheduled bounded refinement cycles |
| `PATTERN_REFINEMENT_INTERVAL_SECONDS` | `21600` | `worker-control` | Interval for refinement job scheduling |
| `PATTERN_REFINEMENT_AUTO_TRAIN` | `false` | `worker-control` | Automatically execute `train_candidate` handoff after a successful bounded refinement cycle |

Notes:

- keep `ENABLE_PATTERN_REFINEMENT_JOB=false` until operator review is complete
- keep `PATTERN_REFINEMENT_AUTO_TRAIN=false` unless you explicitly want worker-control to train immediately after a successful refinement run

## Health Endpoints

- App health: `GET /healthz`
- App readiness: `GET /readyz` (checks engine availability)
- Engine health: `GET /healthz`
- Engine readiness: `GET /readyz` (scheduler/model state)
- Engine metrics: `GET /metrics`

## Local Setup

1. Copy `./.env.example` to `./.env` and fill required variables.
2. For app-specific extended keys, also review `app/.env.example`.
3. Start stack with `docker compose up --build`.
