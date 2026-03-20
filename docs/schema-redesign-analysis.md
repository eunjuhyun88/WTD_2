# STOCKCLAW Schema Redesign Analysis (Page/Reaction Based)

## 1) Scope

This analysis re-checks the current UI/route behavior and identifies what must be persisted server-side.

Primary code references:
- `src/routes/arena/+page.svelte`
- `src/routes/terminal/+page.svelte`
- `src/routes/signals/+page.svelte`
- `src/routes/live/+page.svelte`
- `src/routes/oracle/+page.svelte`
- `src/routes/passport/+page.svelte`
- `src/components/terminal/WarRoom.svelte`
- `src/components/terminal/IntelPanel.svelte`
- `src/components/modals/WalletModal.svelte`
- `src/lib/stores/*`
- `src/routes/api/*`

## 2) Key Reality Check

- Runtime server code currently uses `users`, `sessions`, `matches` directly.
- Most user actions are still localStorage/in-memory (stores), not API-backed.
- Existing docs/migrations still describe `app_users` / `auth_sessions` naming.
- Supabase live check (2026-02-21, REST/service-role):
  - `users/sessions` and compatibility `app_users/auth_sessions` 모두 노출됨
  - 클릭 반응용 확장 테이블(`user_preferences`, `user_ui_state`, `activity_events`, `signal_actions` 등)은 생성됨
  - `auth_nonces`만 누락되어 MetaMask nonce-verify 플로우가 완전하지 않음

Conclusion: `users/sessions` and `app_users/auth_sessions` are a naming split. Keep one canonical physical model.

## 3) Page-Level Persistence Matrix

### Arena (`/arena`)

User reactions/events:
- hypothesis submit (dir/conf/tp/sl/rr)
- agent vote stream and verdict
- match result (win/loss, LP delta, consensus)
- replayable phase feed (optional telemetry)

Current state:
- writes mostly to `matchHistoryStore`, `pnlStore`, `agentData`, `battleFeedStore` (local)

Required persistence:
- `matches` (already exists)
- `pnl_entries` (already exists)
- `agent_stats` (already exists)
- NEW `arena_phase_events` (optional but recommended for replay/audit)

### Terminal (`/terminal` + War Room + Intel)

User reactions/events:
- quick long/short open
- close trade
- track signal
- convert tracked signal to trade
- copy-trade publish intent
- agent chat send/response

Current state:
- `quickTradeStore`, `trackedSignalStore`, chat array in component, `copyTradeStore` local

Required persistence:
- `quick_trades` (exists)
- `tracked_signals` (exists)
- NEW `signal_actions` (track/copy/convert/action audit)
- NEW `copy_trade_runs` (draft + publish lineage)
- NEW `agent_chat_messages` (chat history)

### Signals (`/signals`)

User reactions/events:
- track signal
- copy-trade click
- filter selection

Current state:
- track goes to local tracked store
- copy-trade navigation only
- filters local only

Required persistence:
- `tracked_signals` (exists)
- NEW `signal_actions` for user intent history
- optional `user_ui_state.signals_filter`

### Live (`/live`)

User reactions/events:
- emoji reactions (floating)
- activity feed consumption

Current state:
- reactions are ephemeral component state
- feed composed from local stores

Required persistence:
- NEW `activity_events` (unified feed source)
- optional `activity_events` records for reaction clicks

### Oracle (`/oracle`)

User reactions/events:
- period/sort changes
- agent detail open

Current state:
- fully computed from local match history + agent stats

Required persistence:
- `agent_stats` + `matches` remain source of truth
- optional `user_ui_state.oracle_period`, `user_ui_state.oracle_sort`

### Passport (`/passport`)

User reactions/events:
- avatar change
- username edit
- tab switches
- wallet connect open

Current state:
- profile mostly local store
- holdings are fixture data

Required persistence:
- `users` + `user_profiles` (exists)
- NEW `portfolio_holdings` + optional `portfolio_snapshots` (if wallet tab becomes real)
- optional `user_ui_state.passport_active_tab`

### Settings (`/settings` + `SettingsModal`)

User reactions/events:
- timeframe/speed/sfx/signals/language/theme/dataSource changes

Current state:
- mostly local, partial write into `gameState`

Required persistence:
- NEW `user_preferences` (single source for app settings)

### Wallet modal/login flow

User reactions/events:
- signup
- wallet connect/disconnect
- sign-message verification

Current state:
- APIs exist (`/api/auth/*`) but UI still simulates many values

Required persistence:
- `users` + `sessions` (exists)
- optional NEW `wallet_connections` (history of link/unlink + provider)

## 4) Canonical Naming Decision (Remove Duplication)

### Recommended canonical physical tables

Use legacy/runtime names as canonical:
- `users`
- `sessions`
- `matches`

Reason:
- Current server code already queries these names.
- User DB is already provisioned with these names.
- Fastest path to eliminate split-brain between docs and runtime.

### Compatibility policy

- Do not keep duplicate physical tables (`app_users`, `auth_sessions`).
- If old code still expects old names, provide compatibility **views** only.

## 5) Revised Schema Shape

### Keep (existing 10 core tables)
- `users`
- `sessions`
- `user_profiles`
- `matches`
- `quick_trades`
- `tracked_signals`
- `pnl_entries`
- `predictions`
- `agent_stats`
- `community_posts`

### Add (required for current UX parity)
- `user_preferences`
- `user_ui_state`
- `user_notifications`
- `activity_events`
- `agent_chat_messages`
- `signal_actions`
- `copy_trade_runs`
- `community_post_reactions`

### Add (optional/next phase)
- `arena_phase_events`
- `wallet_connections`
- `portfolio_holdings`
- `portfolio_snapshots`

## 6) Minimal API Refactor Priority

1. Auth/session finalization
- `POST /api/auth/register`
- `GET /api/auth/session`
- `POST /api/auth/wallet`

2. Trading/signal write path
- `POST /api/trades/open|close`
- `POST /api/signals/track|convert`
- `POST /api/signal-actions`

3. Arena write path
- `POST /api/matches`
- `POST /api/pnl`
- optional `POST /api/arena/phase-events`

4. UX persistence
- `PUT /api/preferences`
- `PUT /api/ui-state`
- `POST /api/chat/messages`
- `GET /api/activity`

## 7) Data Ownership Rule

- DB is source of truth for business state (auth/match/trade/signal/profile).
- localStorage becomes cache/fallback only.
- component-only ephemeral UI animations (e.g., floating effects) remain non-persistent.

## 8) Acceptance Checklist

- Same user sees same trades/signals/profile after refresh/device change.
- Live feed is reconstructed from DB events, not only local stores.
- Terminal chat history survives refresh.
- Settings/timeframe/layout restore from server profile.
- No dual physical user/session tables remain.
