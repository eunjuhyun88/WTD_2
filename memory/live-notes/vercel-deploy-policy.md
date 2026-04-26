# Vercel Deploy Policy (Live Note)

**Tier:** core
**Source:** repo policy update
**Updated:** 2026-04-26

## Current State
- `cogochi-2` Git auto-deploy was disconnected after automated edit branches caused unwanted deploy churn. [Source: repo policy update, 2026-04-22 KST]
- `app/vercel.json` blocks Git deploys for `main`, `master`, `claude/**`, `claude-*`, `codex/**`, and `codex-*`. [Source: repo policy update, 2026-04-22 KST]
- If Git auto-deploy is re-enabled, `release` is the intended production branch. [Source: repo policy update, 2026-04-22 KST]
- Until remote Vercel settings are aligned with that branch model, manual deploy from `app/` remains the default path. [Source: repo policy update, 2026-04-22 KST]

## Next
- Reconnect Vercel Git only after confirming the remote project production branch is `release`.
