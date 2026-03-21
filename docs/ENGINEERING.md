# Engineering Authority

## Current Inventory Snapshot
<!-- BEGIN MEMENTO MANAGED INVENTORY -->
Refreshed: `2026-03-21`

| Surface | Routes | Stores | APIs | Mapping Mode |
| --- | --- | --- | --- | --- |
| `core` | 1 | 0 | 0 | auto-seeded-all |

### Unmapped Discovered Routes
- `/agent`
- `/agents`
- `/create`
- `/arena`
- `/arena-v2`
- `/arena-war`
- `/holdings`
- `/live`
- `/lab`
- `/oracle`
- `/passport`
- `/settings`
- `/signals`
- `/signals/[postId]`
- `/terminal`
- `/world`
- `/creator/[userId]`
- `src/routes/+layout.svelte`
- `src/routes/+page.svelte`
- `src/routes/terminal/+page.svelte`
- `src/routes/arena/+page.svelte`
- `src/routes/passport/+page.svelte`

### Unmapped Discovered Stores
- `priceStore`
- `gameState`
- `arenaV2State`
- `arenaWarStore`
- `activeGamesStore`
- `authSessionStore`
- `walletStore`
- `walletModalStore`
- `remoteSessionGuard`
- `userProfileStore`
- `quickTradeStore`
- `trackedSignalStore`
- `copyTradeStore`
- `positionStore`
- `predictStore`
- `matchHistoryStore`
- `communityStore`
- `notificationStore`
- `pnlStore`
- `battleFeedStore`
- `agentData`
- `warRoomStore`
- `dbStore`
- `hydration`
- `progressionRules`
- `storageKeys`

### Unmapped Discovered APIs
- none

Review this snapshot, then replace the placeholder language in `State Authority` with project-specific rules.
<!-- END MEMENTO MANAGED INVENTORY -->

## State Authority

Replace this placeholder with project-specific truth for:

- routes/surfaces
- client or local state
- server-authoritative state
- persistence

## Boundary Rules

- Parse external data at boundaries
- Prefer stable contracts over inferred shapes
- Document ownership changes here before large refactors spread
- Promote repeated state and API ownership rules into this file
