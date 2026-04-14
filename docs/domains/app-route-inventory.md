# Domain: App Route Inventory

## Purpose

Classify app API routes by domain ownership, auth posture, cache policy, and engine dependency.

This is the Stage 5 baseline inventory for reducing maintenance load on a solo team.

## Current Shape

- API route handlers under `app/src/routes/api/**`: **113**
- Primary route families:
  - `auth/*`
  - `engine/[...path]`
  - `cogochi/*`
  - `market/*`
  - `terminal/*`
  - `patterns/*`
  - `positions/*`, `predictions/*`, `quick-trades/*`, `signals/*`
  - `profile/*`, `passport/*`, `pnl/*`, `notifications/*`, `memory/*`

## Route Classification (Critical Paths)

| Route | Domain | Auth | Cache policy | Engine dependency | Test status |
|---|---|---|---|---|---|
| `/api/cogochi/analyze` | orchestrated | optional | short TTL + dedupe | yes (`/deep`, `/score`) | yes |
| `/api/auth/session` | auth | cookie | no-store | no | yes |
| `/api/market/snapshot` | market orchestrated | mixed | public cache for anon, private no-store for auth | no direct engine | yes |
| `/api/engine/[...path]` | proxy | passthrough | upstream-defined | yes (proxy-only) | yes |
| `/api/cogochi/thermometer` | public market signal | no | default JSON | no direct engine | yes |

## Domain Rules

- **Proxy routes** (`/api/engine/*`): transport-only, no domain logic.
- **Orchestrated routes** (`/api/cogochi/*`, selected `market/*`): app assembles input/output envelopes.
- **App-domain routes** (auth/profile/preferences/etc.): no engine coupling by default.

## Consolidation Target

Keep route ownership explicit with these top-level groups:

- `auth`
- `engine`
- `cogochi`
- `market`
- `terminal`
- `trading`
- `profile`
- `internal`

## Notes

- This inventory intentionally starts with high-traffic critical paths and expands incrementally.
- New routes must declare: domain, auth requirement, cache policy, engine dependency.

