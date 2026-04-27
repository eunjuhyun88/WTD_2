# W-0129 Chatbattle Release Align

## Goal

Realign the stale `release` branch with current `main` so `chatbattle` release-lane deployments use the latest buildable app code.

## Owner

app

## Primary Change Type

Product surface change

## Verification Target

- confirm `release` contains `app/src/lib/server/engineTransport.ts`
- confirm the merge result includes the latest `chatbattle` build-hardening patch from `main`
- verify clean git state before pushing the aligned branch

## Scope

- merge `origin/main` into a clean branch based on `origin/release`
- preserve the existing release-lane branch identity while removing the stale code gap
- record the release-alignment reasoning and next deployment step

## Non-Goals

- changing Vercel dashboard settings
- adding or rotating Vercel environment variables
- unrelated code cleanup outside the release-alignment merge

## Canonical Files

- `work/active/W-0129-chatbattle-release-align.md`
- `app/src/lib/server/engineTransport.ts`
- `app/src/lib/server/exchange/binanceConnector.ts`
- `work/active/W-0128-chatbattle-deploy-hardening.md`
- `work/active/W-0125-vercel-branch-deploy-guardrails.md`

## Facts

- `origin/release` is behind `origin/main` and is missing `app/src/lib/server/engineTransport.ts`.
- `origin/release` is only ahead by W-0125 deploy-policy docs plus two empty deploy-trigger commits.
- `chatbattle` release deployments fail on commit `ae4aaaa` because the stale branch tip cannot resolve `engineTransport`.
- `main` now includes the build-hardening patch that prevents `EXCHANGE_ENCRYPTION_KEY` from crashing app builds at import time.

## Assumptions

- The user wants the deploy lane code-aligned with `main` more than they want to preserve the stale release-only trigger commits as a separate line of history.

## Open Questions

- none

## Decisions

- Align `release` by merging `origin/main` into a clean branch based on `origin/release`.
- Keep the release-only trigger commits in history instead of force-resetting the branch.

## Next Steps

1. Merge `origin/main` into the clean release-alignment branch.
2. Verify the merged branch now contains the previously missing server files.
3. Push the aligned branch and fast-forward `release` through a PR or direct branch update.

## Exit Criteria

- aligned branch contains the latest `main` app code needed by `chatbattle`
- release-alignment branch is ready to update `release` without chat context
- remaining remote-only steps are limited to deployment/env follow-up

## Handoff Checklist

- active work item: `work/active/W-0129-chatbattle-release-align.md`
- branch: `codex/w-0129-chatbattle-release-align`
- verification: pending
- remaining blockers: remote `release` update and Vercel env follow-up
