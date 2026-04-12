# Full File Audit

Date: 2026-02-21

## Scope

- Reviewed: 85 non-binary files (source/config/docs)
- Excluded from audit target: `node_modules/`, `.git/`, `.svelte-kit/`, `static/` image assets
- Secret handling: `.env` existence/path reviewed only; secret value not reproduced

## Priority Summary

- P0: 4 files
- P1: 13 files
- P2: 18 files
- P3: 50 files

## Key Findings

1. Session validation is format-based and can mark malformed sessions as authenticated.
   - `src/routes/api/auth/session/+server.ts:20`
2. Auth and match APIs use in-memory stores, so server restart drops records.
   - `src/routes/api/auth/register/+server.ts:11`
   - `src/routes/api/matches/+server.ts:11`
3. Settings reset key mismatch: one reset path clears `agentData` instead of `stockclaw_agents`.
   - `src/routes/settings/+page.svelte:28`
   - `src/components/modals/SettingsModal.svelte:21`
4. Timeframe representation is inconsistent (`1h/4h` and `1H/4H`) across domains.
   - `src/lib/stores/gameState.ts:11`
   - `src/lib/stores/gameState.ts:115`
   - `src/components/arena/SquadConfig.svelte:15`
   - `src/lib/api/coinalyze.ts:13`
5. Two very large UI files carry multiple responsibilities and dominate regression risk.
   - `src/routes/arena/+page.svelte`
   - `src/components/arena/ChartPanel.svelte`

## Full Matrix

| File | Lines | Priority | Reason |
|---|---:|---|---|
| `.env` | 1 | P0 | Secret material (content not reproduced) |
| `src/components/arena/ChartPanel.svelte` | 853 | P0 | Chart rendering + fetch/ws + indicators + drawing coupled |
| `src/routes/api/auth/session/+server.ts` | 42 | P0 | Session validation currently format-based |
| `src/routes/arena/+page.svelte` | 2122 | P0 | Phase orchestration + replay + feed + UI state concentrated |
| `src/components/modals/WalletModal.svelte` | 768 | P1 | Large file, likely multi-responsibility |
| `src/lib/api/binance.ts` | 169 | P1 | External API integration + error mapping |
| `src/lib/api/coinalyze.ts` | 255 | P1 | External API integration + error mapping |
| `src/lib/api/polymarket.ts` | 77 | P1 | External API integration + error mapping |
| `src/lib/stores/dbStore.ts` | 160 | P1 | Core persisted state; schema/key consistency risk |
| `src/lib/stores/gameState.ts` | 180 | P1 | Core persisted state; schema/key consistency risk |
| `src/lib/stores/matchHistoryStore.ts` | 102 | P1 | Core persisted state; schema/key consistency risk |
| `src/lib/stores/userProfileStore.ts` | 261 | P1 | Core persisted state; schema/key consistency risk |
| `src/lib/stores/walletStore.ts` | 194 | P1 | Core persisted state; schema/key consistency risk |
| `src/routes/+page.svelte` | 883 | P1 | Large file, likely multi-responsibility |
| `src/routes/api/auth/register/+server.ts` | 76 | P1 | In-memory users map and weak durability |
| `src/routes/api/matches/+server.ts` | 75 | P1 | In-memory matches persistence |
| `src/routes/settings/+page.svelte` | 307 | P1 | Reset key mismatch risk (agentData vs stockclaw_agents) |
| `src/components/arena/HypothesisPanel.svelte` | 567 | P2 | Medium complexity; regression surface exists |
| `src/components/arena/MatchHistory.svelte` | 410 | P2 | Medium complexity; regression surface exists |
| `src/components/arena/SquadConfig.svelte` | 497 | P2 | Medium complexity; regression surface exists |
| `src/components/layout/Header.svelte` | 396 | P2 | Live data updates/intervals affect global state |
| `src/components/modals/CopyTradeModal.svelte` | 534 | P2 | Medium complexity; regression surface exists |
| `src/components/shared/NotificationTray.svelte` | 361 | P2 | Medium complexity; regression surface exists |
| `src/components/shared/TokenDropdown.svelte` | 367 | P2 | Medium complexity; regression surface exists |
| `src/components/terminal/BottomPanel.svelte` | 618 | P2 | Medium complexity; regression surface exists |
| `src/components/terminal/IntelPanel.svelte` | 599 | P2 | Medium complexity; regression surface exists |
| `src/components/terminal/PredictPanel.svelte` | 393 | P2 | Medium complexity; regression surface exists |
| `src/components/terminal/TerminalChat.svelte` | 450 | P2 | Medium complexity; regression surface exists |
| `src/components/terminal/WarRoom.svelte` | 560 | P2 | Live data updates/intervals affect global state |
| `src/lib/engine/chartPatterns.ts` | 156 | P2 | Randomized simulation utility; deterministic tests needed |
| `src/routes/live/+page.svelte` | 399 | P2 | Medium complexity; regression surface exists |
| `src/routes/oracle/+page.svelte` | 405 | P2 | Medium complexity; regression surface exists |
| `src/routes/passport/+page.svelte` | 662 | P2 | Medium complexity; regression surface exists |
| `src/routes/signals/+page.svelte` | 431 | P2 | Medium complexity; regression surface exists |
| `src/routes/terminal/+page.svelte` | 631 | P2 | Live data updates/intervals affect global state |
| `.claude/settings.local.json` | 41 | P3 | UI/static or low-complexity |
| `.gitignore` | 26 | P3 | UI/static or low-complexity |
| `.npmrc` | 1 | P3 | UI/static or low-complexity |
| `README.md` | 283 | P3 | Documentation only |
| `docs/github-issues-refactor.md` | 257 | P3 | Documentation only |
| `package-lock.json` | 1630 | P3 | Generated lockfile; review only for dependency diffs |
| `package.json` | 26 | P3 | UI/static or low-complexity |
| `src/app.css` | 202 | P3 | UI/static or low-complexity |
| `src/app.d.ts` | 13 | P3 | UI/static or low-complexity |
| `src/app.html` | 11 | P3 | UI/static or low-complexity |
| `src/components/arena/BattleStage.svelte` | 237 | P3 | UI/static or low-complexity |
| `src/components/arena/Lobby.svelte` | 297 | P3 | UI/static or low-complexity |
| `src/components/arena/SpeechBubble.svelte` | 116 | P3 | UI/static or low-complexity |
| `src/components/layout/BottomBar.svelte` | 203 | P3 | UI/static or low-complexity |
| `src/components/modals/OracleModal.svelte` | 132 | P3 | UI/static or low-complexity |
| `src/components/modals/PassportModal.svelte` | 188 | P3 | UI/static or low-complexity |
| `src/components/modals/SettingsModal.svelte` | 182 | P3 | UI/static or low-complexity |
| `src/components/shared/ContextBanner.svelte` | 143 | P3 | UI/static or low-complexity |
| `src/components/shared/EmptyState.svelte` | 190 | P3 | UI/static or low-complexity |
| `src/components/shared/P0Banner.svelte` | 141 | P3 | UI/static or low-complexity |
| `src/components/shared/ToastStack.svelte` | 211 | P3 | UI/static or low-complexity |
| `src/components/terminal/QuickTradePanel.svelte` | 313 | P3 | UI/static or low-complexity |
| `src/lib/audio/sfx.ts` | 64 | P3 | UI/static or low-complexity |
| `src/lib/data/agents.ts` | 174 | P3 | UI/static or low-complexity |
| `src/lib/data/holdings.ts` | 36 | P3 | UI/static or low-complexity |
| `src/lib/data/tokens.ts` | 112 | P3 | UI/static or low-complexity |
| `src/lib/data/warroom.ts` | 205 | P3 | UI/static or low-complexity |
| `src/lib/engine/gameLoop.ts` | 92 | P3 | UI/static or low-complexity |
| `src/lib/engine/phases.ts` | 62 | P3 | UI/static or low-complexity |
| `src/lib/engine/replay.ts` | 76 | P3 | UI/static or low-complexity |
| `src/lib/engine/scoring.ts` | 28 | P3 | UI/static or low-complexity |
| `src/lib/index.ts` | 1 | P3 | UI/static or low-complexity |
| `src/lib/stores/agentData.ts` | 85 | P3 | UI/static or low-complexity |
| `src/lib/stores/battleFeedStore.ts` | 54 | P3 | UI/static or low-complexity |
| `src/lib/stores/communityStore.ts` | 67 | P3 | UI/static or low-complexity |
| `src/lib/stores/copyTradeStore.ts` | 152 | P3 | UI/static or low-complexity |
| `src/lib/stores/notificationStore.ts` | 226 | P3 | UI/static or low-complexity |
| `src/lib/stores/pnlStore.ts` | 94 | P3 | UI/static or low-complexity |
| `src/lib/stores/predictStore.ts` | 161 | P3 | UI/static or low-complexity |
| `src/lib/stores/quickTradeStore.ts` | 176 | P3 | UI/static or low-complexity |
| `src/lib/stores/trackedSignalStore.ts` | 178 | P3 | UI/static or low-complexity |
| `src/routes/+layout.svelte` | 66 | P3 | UI/static or low-complexity |
| `src/routes/api/auth/wallet/+server.ts` | 41 | P3 | UI/static or low-complexity |
| `src/routes/api/coinalyze/+server.ts` | 65 | P3 | UI/static or low-complexity |
| `src/routes/api/polymarket/markets/+server.ts` | 66 | P3 | UI/static or low-complexity |
| `src/routes/api/polymarket/orderbook/+server.ts` | 37 | P3 | UI/static or low-complexity |
| `src/routes/holdings/+page.svelte` | 10 | P3 | UI/static or low-complexity |
| `svelte.config.js` | 13 | P3 | UI/static or low-complexity |
| `tsconfig.json` | 20 | P3 | UI/static or low-complexity |
| `vite.config.ts` | 6 | P3 | UI/static or low-complexity |
