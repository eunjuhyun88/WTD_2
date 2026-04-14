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

## Auth/Secrets

| Variable | Used by |
|---|---|
| `PUBLIC_SUPABASE_URL` | app |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app |
| `SUPABASE_SERVICE_ROLE_KEY` | app/server |
| `SECRETS_ENCRYPTION_KEY` | app/server |

## Data Providers

Typical optional provider keys:

- `COINGECKO_API_KEY`
- `COINALYZE_API_KEY`
- `COINMARKETCAP_API_KEY`
- `CRYPTOQUANT_API_KEY`
- `ETHERSCAN_API_KEY`

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

