# W-0128 Chatbattle Deploy Hardening

## Goal

Stop `chatbattle` Vercel builds from failing on optional exchange secrets, and record the release-lane follow-up needed to avoid stale-branch deploy failures.

## Owner

app

## Primary Change Type

Product surface change

## Verification Target

- targeted app tests for exchange encryption behavior
- local app production build without `EXCHANGE_ENCRYPTION_KEY`
- manual review of the deploy follow-up notes against current Vercel failure logs

## Scope

- make the Binance exchange connector build-safe when `EXCHANGE_ENCRYPTION_KEY` is absent
- add focused tests that prove the secret is enforced at use time rather than import time
- document the `release` stale-branch follow-up needed for `chatbattle`

## Non-Goals

- changing remote Vercel environment variables directly
- repairing the current remote `release` branch history in this change
- broad cleanup of unrelated Svelte warnings

## Canonical Files

- `work/active/W-0128-chatbattle-deploy-hardening.md`
- `app/src/lib/server/exchange/binanceConnector.ts`
- `app/src/routes/api/exchange/connect/+server.ts`
- `app/src/routes/api/exchange/import/+server.ts`
- `app/package.json`
- `app/vercel.json`

## Facts

- `chatbattle` production deploys fail because `EXCHANGE_ENCRYPTION_KEY` is missing in Vercel.
- `app/src/lib/server/exchange/binanceConnector.ts` threw at module import time when the key was absent; this patch moves that check to use time.
- `chatbattle` `release` preview deploys fail on commit `ae4aaaa` because that branch does not contain `app/src/lib/server/engineTransport.ts`.
- `chatbattle` is configured with `Root Directory = app` on Vercel.
- `npm test -- src/lib/server/exchange/binanceConnector.test.ts` passes in the clean worktree.
- `env -u EXCHANGE_ENCRYPTION_KEY npm run build` now succeeds locally in the clean worktree.

## Assumptions

- Exchange import/connect is an optional feature and should not block the entire app build when its secret is absent.
- The user wants `release` to remain the intentional deploy lane once it is refreshed from a healthy branch tip.

## Open Questions

- none

## Decisions

- Move exchange-secret enforcement from module import time to encryption/decryption call sites.
- Verify the hardening with a focused unit test and a local production build.
- Treat the stale `release` branch as an operational follow-up, not as an app-code regression in this patch.

## Next Steps

1. Add `EXCHANGE_ENCRYPTION_KEY` to the `chatbattle` Vercel project for the environments that should support exchange import/connect.
2. Refresh the remote `release` branch from a healthy branch tip before expecting `chatbattle-git-release` deployments to pass.
3. Merge this hardening patch before the next `chatbattle` deploy cycle.

## Exit Criteria

- local production build no longer fails solely because `EXCHANGE_ENCRYPTION_KEY` is absent
- exchange secret use still fails loudly when connect/import actually requires it
- the remaining remote-only follow-up is documented without relying on chat history

## Handoff Checklist

- active work item: `work/active/W-0128-chatbattle-deploy-hardening.md`
- branch: `codex/w-0128-chatbattle-deploy-hardening`
- verification: focused exchange test passed; local production build without `EXCHANGE_ENCRYPTION_KEY` passed
- remaining blockers: remote `chatbattle` Vercel env and stale `release` branch still need follow-up after code hardening
