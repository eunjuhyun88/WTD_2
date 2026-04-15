# Environment Variables

Canonical env contract for local/prod runtime.

## Required (All Environments)

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `ENGINE_URL` | `http://localhost:8000` | `app-web` | App -> engine API base URL |
| `DATABASE_URL` | none | `app-web` | Postgres connection |
| `DB_SECURITY_RLS_EXEMPT_TABLES` | empty | `app-web` tooling | Comma-separated RLS audit exemptions |
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
| `PERFORMANCE_AUDIT_SUMMARIES` | empty | `app-web` tooling | Comma-separated k6 summary export paths for perf audit |
| `SECURITY_ALLOWED_HOSTS` | empty | `app-web` | Required in production: Host allowlist (`host[:port]`, comma-separated) |
| `ENGINE_ALLOWED_HOSTS` | empty | `engine-api` | Required in production: Host allowlist (`host[:port]`, comma-separated) |
| `ENGINE_ALLOWED_ORIGINS` | empty | `engine-api` | Extra CORS allowlist origins |
| `ENGINE_EXPOSE_DOCS` | `false` | `engine-api` | Enable FastAPI `/docs` and `/openapi.json` |
| `SECURITY_TRUST_PROXY_HEADERS` | empty | `app-web` | Trust `x-forwarded-*` headers only behind a known proxy |

## Auth/Secrets

| Variable | Used by |
|---|---|
| `PUBLIC_SUPABASE_URL` | app |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app |
| `SUPABASE_URL` | worker-control |
| `SUPABASE_SECRET_KEY` | worker-control only |
| `SUPABASE_SERVICE_ROLE_KEY` | worker-control only |
| `SECRETS_ENCRYPTION_KEY` | app/server |

Notes:

- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` is safe for browser/runtime use.
- `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must never be present in `app-web`; the app runtime now fails fast if either is set.
- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` belong to `worker-control` background jobs only because they bypass normal browser-safe restrictions.
- `DATABASE_URL` should use a least-privilege app role; avoid shipping a `postgres*` superuser DSN to production app-web.
- Set `SECURITY_ALLOWED_HOSTS` and `ENGINE_ALLOWED_HOSTS` in production; the runtimes now fail fast when they are missing.
- Leave `ENGINE_EXPOSE_DOCS=false` on public deployments unless the engine is behind auth or a private network boundary.
- `SECURITY_TRUST_PROXY_HEADERS` should stay false unless the app is behind a trusted reverse proxy that rewrites forwarded headers.
- Use `npm run security:db:audit -- --strict` plus `docs/runbooks/db-security-hardening.md` before production DB cutovers.
- For 500-user readiness, use `npm run performance:audit -- --strict` plus `docs/runbooks/performance-hardening.md`; the audit expects Redis-backed shared rate limiting/cache and scheduler isolation on public runtimes.

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
