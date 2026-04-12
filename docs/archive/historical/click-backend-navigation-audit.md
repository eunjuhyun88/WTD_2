# Click-Point Backend & Navigation Audit

Updated: 2026-02-21
Scope: active UI click points in `src/routes/*` + `src/components/*`

## 1) MetaMask-first baseline (must apply before wallet clicks)

References:
- MetaMask Wallet Docs: [https://docs.metamask.io/wallet](https://docs.metamask.io/wallet)
- Access accounts (connect flow): [https://docs.metamask.io/wallet/how-to/access-accounts/](https://docs.metamask.io/wallet/how-to/access-accounts/)
- Sign data (typed/sign-in flow): [https://docs.metamask.io/wallet/how-to/sign-data/](https://docs.metamask.io/wallet/how-to/sign-data/)

Required auth flow (server-authoritative):
1. `POST /api/auth/nonce` (issue nonce per address)
2. Client connects wallet via `eth_requestAccounts`
3. Client signs typed message (`eth_signTypedData_v4` recommended)
4. `POST /api/auth/verify-wallet` (verify signature + nonce)
5. Server issues session cookie + stores wallet linkage

## 2) Click points that need backend wiring

### P0 (must wire now)

1. Wallet connect / sign / signup clicks are still local simulation
- UI: `/Users/ej/Downloads/stockclaw-unified/src/components/modals/WalletModal.svelte:19`
- Local simulation call path: `/Users/ej/Downloads/stockclaw-unified/src/lib/stores/walletStore.ts:127`
- Existing server endpoints exist but are not used by this UI path:
  - `/Users/ej/Downloads/stockclaw-unified/src/routes/api/auth/register/+server.ts:3`
  - `/Users/ej/Downloads/stockclaw-unified/src/routes/api/auth/session/+server.ts:3`
  - `/Users/ej/Downloads/stockclaw-unified/src/routes/api/auth/wallet/+server.ts:3`
- Needed API binding:
  - `POST /api/auth/register`
  - `GET /api/auth/session` on app boot
  - `POST /api/auth/wallet` (replace fake sign flow)
  - `POST /api/auth/logout` (new)

2. Arena result writes only local store path
- Local write point: `/Users/ej/Downloads/stockclaw-unified/src/routes/arena/+page.svelte:830`
- Match API exists: `/Users/ej/Downloads/stockclaw-unified/src/routes/api/matches/+server.ts:132`
- Needed:
  - call `POST /api/matches` on result
  - add `POST /api/pnl` for `addPnLEntry` path

3. Quick trade open/close clicks are local only
- Trade action source: `/Users/ej/Downloads/stockclaw-unified/src/components/terminal/WarRoom.svelte:148`
- Local store mutations: `/Users/ej/Downloads/stockclaw-unified/src/lib/stores/quickTradeStore.ts:83`
- Needed:
  - `POST /api/trades/open`
  - `POST /api/trades/{id}/close`
  - `PATCH /api/trades/prices` (batch)

4. Track signal / convert signal clicks are local only
- Track click source: `/Users/ej/Downloads/stockclaw-unified/src/components/terminal/WarRoom.svelte:136`
- Signal store local mutation: `/Users/ej/Downloads/stockclaw-unified/src/lib/stores/trackedSignalStore.ts:88`
- Needed:
  - `POST /api/signals/track`
  - `POST /api/signals/{id}/convert`
  - `POST /api/signal-actions` (audit)

5. Copy-trade publish click is local only (opens local trade+signal)
- Modal publish action: `/Users/ej/Downloads/stockclaw-unified/src/components/modals/CopyTradeModal.svelte:30`
- Local publish implementation: `/Users/ej/Downloads/stockclaw-unified/src/lib/stores/copyTradeStore.ts:125`
- Needed:
  - `POST /api/copytrade/publish`
  - server-side transaction: create trade + tracked signal + signal action

### P1 (should wire next)

6. Agent chat send click is in-memory only
- Chat dispatch: `/Users/ej/Downloads/stockclaw-unified/src/components/terminal/IntelPanel.svelte:304`
- Chat state local only: `/Users/ej/Downloads/stockclaw-unified/src/routes/terminal/+page.svelte:164`
- Needed:
  - `POST /api/chat/messages`
  - `GET /api/chat/messages?channel=terminal`

7. Predict vote clicks are local state only
- Vote click: `/Users/ej/Downloads/stockclaw-unified/src/components/terminal/PredictPanel.svelte:30`
- Local vote storage only: `/Users/ej/Downloads/stockclaw-unified/src/lib/stores/predictStore.ts:96`
- Needed:
  - `POST /api/predictions/vote`
  - `POST /api/predictions/positions/open`
  - `POST /api/predictions/positions/{id}/close`

8. Settings clicks are local-only and reset is localStorage wipe
- Settings mutation: `/Users/ej/Downloads/stockclaw-unified/src/routes/settings/+page.svelte:30`
- Reset action: `/Users/ej/Downloads/stockclaw-unified/src/routes/settings/+page.svelte:41`
- Needed:
  - `PUT /api/preferences`
  - `GET /api/preferences`
  - `POST /api/account/reset-local-cache` (optional)

9. Profile clicks (avatar/name/tab) are local-only
- Avatar/name edit: `/Users/ej/Downloads/stockclaw-unified/src/routes/passport/+page.svelte:110`
- Needed:
  - `PATCH /api/profile`
  - `PUT /api/ui-state` (active tab)

10. Notifications tray clicks are memory-only store
- Tray actions: `/Users/ej/Downloads/stockclaw-unified/src/components/shared/NotificationTray.svelte:24`
- Store is volatile writable array: `/Users/ej/Downloads/stockclaw-unified/src/lib/stores/notificationStore.ts:42`
- Needed:
  - `GET /api/notifications`
  - `POST /api/notifications/read`
  - `DELETE /api/notifications/{id}`

### P2 (analytics / feed quality)

11. Live reaction clicks are ephemeral animation only
- Reaction click: `/Users/ej/Downloads/stockclaw-unified/src/routes/live/+page.svelte:111`
- Needed:
  - `POST /api/activity/reaction`
  - optional aggregate endpoint for emoji heatmap

12. Community post reactions in Intel panel have buttons but no handlers
- No click handlers bound: `/Users/ej/Downloads/stockclaw-unified/src/components/terminal/IntelPanel.svelte:181`
- Needed:
  - bind handlers + `POST /api/community/posts/{id}/react`

## 3) Navigation gaps (page movement / UX flow gaps)

1. `Signals -> COPY TRADE` only routes to terminal, no deep-link context
- Source: `/Users/ej/Downloads/stockclaw-unified/src/routes/signals/+page.svelte:158`
- Gap: selected signal is not carried to modal/draft
- Fix: navigate with params or event bus, e.g. `/terminal?copyTradeSignalId=...`

2. Home quick-nav has duplicate destination to passport
- Source: `/Users/ej/Downloads/stockclaw-unified/src/routes/+page.svelte:252` and `/Users/ej/Downloads/stockclaw-unified/src/routes/+page.svelte:266`
- Gap: `PASSPORT` and `PORTFOLIO` both route to `/passport`
- Fix: either split into separate portfolio route or rename/remove one CTA

3. Community reaction buttons render as clickable but do nothing
- Source: `/Users/ej/Downloads/stockclaw-unified/src/components/terminal/IntelPanel.svelte:181`
- Gap: missing `on:click`

4. Header back button can fail on direct-entry sessions
- Source: `/Users/ej/Downloads/stockclaw-unified/src/components/layout/Header.svelte:100`
- Gap: `history.back()` has no fallback route
- Fix: if history length <= 1 then `goto('/')`

5. Arena wallet-gate connect bypasses full signup/auth sequence
- Source: `/Users/ej/Downloads/stockclaw-unified/src/routes/arena/+page.svelte:1002`
- Gap: direct `connectWallet()` local transition, no auth/session handshake
- Fix: open wallet modal flow and route through auth API

6. `holdings` page is only redirect shell
- Source: `/Users/ej/Downloads/stockclaw-unified/src/routes/holdings/+page.svelte:5`
- Gap: menu/links can imply dedicated page but it always redirects
- Fix: remove route or map explicit dedicated holdings tab route

## 4) Immediate implementation order

1. Wallet/auth click path real API binding (`/api/auth/*`) and MetaMask signature verification
2. Trade/signal/copy-trade click path to DB APIs
3. Arena result -> matches/pnl API write
4. Chat, notifications, preferences, profile persistence
5. Community reaction handlers + activity feed API
6. Navigation deep-link fixes (`signals -> copytrade`, header back fallback, home duplicate CTA cleanup)

## 5) Done criteria

- All high-frequency click actions (wallet, trade, signal, match) call server endpoints.
- Refresh/device change preserves state for trades/signals/profile/preferences/chat.
- No visible clickable controls without handlers.
- Navigation flows carry context (especially copy-trade origin).
