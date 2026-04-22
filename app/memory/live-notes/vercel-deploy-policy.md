# Vercel Deploy Policy (Live Note)

**Tier: core**

> Durable operating note for app deployment ownership and branch policy

## Tracking Config
- **Type:** policy
- **Started:** 2026-04-22
- **Last Update:** 2026-04-22
- **Update Count:** 1
- **Source:** repo policy update

## Current State
- `cogochi-2` Git auto-deploy was disconnected after repeated automated edits caused unwanted deploy churn. [Source: repo policy update, 2026-04-22 KST]
- `app/vercel.json` now disables Vercel Git deployments for `main`, `master`, `claude/**`, `claude-*`, `codex/**`, and `codex-*`. [Source: repo policy update, 2026-04-22 KST]
- The intended steady-state model is `release` as the only production branch if Git auto-deploy is re-enabled. [Source: repo policy update, 2026-04-22 KST]
- Until remote Vercel Git settings are explicitly aligned with that branch model, manual deploy from `app/` is the default safe path. [Source: repo policy update, 2026-04-22 KST]

## Recent Activity
- **2026-04-22** | Promoted the branch/deploy policy into root and app agent rule documents so future agents do not reintroduce auto-deploy on agent branches. [Source: repo policy update, 2026-04-22 KST]

## Key Points
- Agent branches are work lanes, not production lanes. [Source: repo policy update, 2026-04-22 KST]
- `release` is the only acceptable Vercel production branch for the app project when Git deploy is enabled. [Source: repo policy update, 2026-04-22 KST]
- Manual `vercel deploy --prod` remains valid regardless of Git integration state. [Source: repo policy update, 2026-04-22 KST]

## Related Entities
- `AGENTS.md`
- `CLAUDE.md`
- `app/AGENTS.md`
- `app/vercel.json`

## Open Threads
- [ ] Reconnect Vercel Git only after confirming the remote project production branch is set to `release`. [Source: repo policy update, 2026-04-22 KST]

---

## Timeline (Full Record)

- **2026-04-22** | Disconnected `cogochi-2` Git auto-deploy to stop repeated production deploys triggered by automated edit branches. [Source: repo policy update, 2026-04-22 KST]
- **2026-04-22** | Added repo-level branch deployment guardrails in `app/vercel.json`. [Source: repo policy update, 2026-04-22 KST]
- **2026-04-22** | Added cross-agent Vercel deployment rules to root and app router documents. [Source: repo policy update, 2026-04-22 KST]
