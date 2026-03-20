# SECURITY

Purpose:
- Canonical security entry point for the frontend repo.

## Security Non-Negotiables

1. Client input may suggest; the server validates or derives truth.
2. Auth/session boundaries live on the server.
3. Secrets never live in repo or context snapshots.
4. Rate limiting and abuse controls are required for public-facing APIs.
5. External embeds or scripts should exist behind explicit policy.

## Canonical Security Sources

- `docs/references/active/BACKEND_SECURITY_REVIEW_2026-02-25.md`
- `docs/references/active/SECURITY_SCALE_PLAN_2026-02-25.md`
- `docs/API_CONTRACT.md`
- `src/hooks.server.ts`
- `src/lib/server/requestGuards.ts`
- `src/lib/server/distributedRateLimit.ts`

## Current Focus Areas

- Badge/profile server authority
- CSP and external embed policy
- rate-limit backend rollout
- auth/session hardening and request guards

## Upgrade Rule

If a security rule repeats in reviews or bugs, promote it from ad hoc commentary into:
- a canonical doc here,
- a server-side check,
- or a mechanical validation script.
