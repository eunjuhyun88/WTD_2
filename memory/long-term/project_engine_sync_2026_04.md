---
name: engine-layer-sync
description: WTD engine architecture ground truth — 5 engine categories, 29 building blocks, gaps (scheduler/orchestrator/API bridge), and E-series priority order
type: project
---

## Engine Layer Sync — 2026-04-12

WTD monorepo merged: `engine/` (Python, ex cogochi-autoresearch) + `app/` (SvelteKit CHATBATTLE frontend).

### 5 Engine Categories

| Category | Location | Status |
|---|---|---|
| **data-engine** | `engine/data_cache/` (Binance klines fetch + CSV cache) | fetch/cache exists, no APScheduler |
| **metric-engine** | `engine/scanner/feature_calc.py` — compute_snapshot() (28 features) | fully implemented |
| **signal-engine** | `engine/building_blocks/` 29 blocks + `wizard/classifier_composer.py` | blocks done, no live loop |
| **chart-engine** | `app/src/components/terminal/` (lightweight-charts) | frontend only, no custom WebGL |
| **workspace-engine** | `app/src/lib/services/alertEngine.ts`, `strategyStore.ts` | local polling only, no server-side per-user |

### Building Blocks (29 total)

- triggers (6): recent_rally, breakout_above_high, volume_spike, gap_up/down, consolidation_then_breakout, recent_decline
- confirmations (10): bollinger_expansion/squeeze, cvd_state_eq, dead/golden_cross, ema_pullback, fib_retracement, funding_extreme, oi_change, range_break_retest, volume_dryup
- entries (8): bearish/bullish_engulfing, long_lower/upper_wick, rsi_bearish/bullish_divergence, rsi_threshold, support_bounce
- disqualifiers (3): extended_from_ma, extreme_volatility, volume_below_average
- context.py: regime, session, macro

### Critical Gaps (priority order)

1. **APScheduler live scan loop** — `engine/scanner/scheduler.py` doesn't exist. E7 needs this.
2. **Building blocks orchestrator** — no runner to compose 29 blocks into scan results
3. **WTD-CHATBATTLE API bridge** — no API route to deliver engine results to frontend
4. **SESSION_* atoms (8)** — deferred in app frontend, UI session storage decision pending
5. **Per-user workspace persistence** — alert/preset saving needs Supabase wiring

**Why:** This is the ground truth for E-series work priorities after the monorepo merge.
**How to apply:** When doing E-series engine tasks, follow this priority: scheduler -> orchestrator -> API bridge. Don't confuse frontend atoms with engine blocks — they're separate layers.
