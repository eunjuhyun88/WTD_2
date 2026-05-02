# W-0382-C — Dead Store Reduction

> Status: Complete | Branch: feat/W-0382-C-store-reduction

## Summary

Checked 43 store files in `app/src/lib/stores/`. 5 confirmed dead (zero direct imports anywhere in `app/src/`). Deleted all 5.

## Deleted Stores

- `authSessionStore.ts` — 0 imports. Exports `hydrateAuthSession`, `applyAuthenticatedUser`, `clearAuthenticatedUser` are duplicated in and consumed from `walletStore.ts` instead.
- `dbStore.ts` — 0 imports. In-memory table abstraction (`usersTable`, `matchesTable`, `signalsTable`, `predictionsTable`) with no consumers.
- `doctrineStore.ts` — 0 imports. `saveDoctrine`/`revertToVersion` name matches in other files are local functions, not imports from this store.
- `pnlStore.ts` — 0 imports. `totalPnL` match in `userProfileStore.ts` is a local type field, not an import.
- `warRoomStore.ts` — 0 imports. `warRoom` string matches in WarRoom components are `STORAGE_KEYS.warRoomScan` references, not store imports.

## Kept Stores (had usages)

- `activePairStore.ts` — 30 files
- `agentData.ts` — 3 files
- `alphaBuckets.ts` — 3 files
- `captureAnnotationsStore.ts` — 2 files
- `chartAIOverlay.ts` — 11 files
- `chartFreshness.ts` — 6 files
- `chartIndicators.ts` — 17 files
- `chartNotesStore.svelte.ts` — 6 files
- `chartSaveMode.ts` — 27 files
- `communityStore.ts` — 3 files
- `comparisonStore.ts` — 2 files
- `copyTradeStore.ts` — 2 files
- `crosshairBus.ts` — 2 files
- `douniRuntime.ts` — 2 files
- `gameState.ts` — 3 files
- `hydration.ts` — 9 files
- `matchHistoryStore.ts` — 2 files
- `mobileMode.ts` — 12 files
- `newsStore.ts` — 3 files
- `notificationStore.ts` — 10 files
- `patternCaptureContext.ts` — 2 files
- `positionStore.ts` — 6 files
- `predictStore.ts` — 2 files
- `priceStore.ts` — 15 files
- `profileDrawerStore.ts` — 1 file
- `progressionRules.ts` — 4 files
- `quickTradeStore.ts` — 12 files
- `storageKeys.ts` — 19 files
- `strategyStore.ts` — 6 files
- `terminalLayout.ts` — 2 files
- `terminalMode.ts` — 3 files
- `terminalState.ts` — 8 files
- `trackedSignalStore.ts` — 8 files
- `userProfileStore.ts` — 5 files
- `viewportTier.ts` — 7 files
- `walletModalStore.ts` — 5 files
- `walletStore.ts` — 16 files
- `whaleStore.ts` — 4 files

## svelte-check after deletion

- dangling imports introduced: 0 (verified by grep)
- svelte-check errors introduced: 0 (no files import from deleted stores)
