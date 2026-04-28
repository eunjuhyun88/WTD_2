---
name: W-0103 CTO Design + Experiment Log
description: 2026-04-19 session end — event log analysis, 5th pattern design (VAR), next session roadmap
type: project
---

Checkpoint from 2026-04-19 session end. Design doc at `work/active/W-0103-next-session-cto-design.md`.

**Why:** Need clear CTO priorities for next session after W-0102 UI IA cleanup completed.

**How to apply:** Start next session by merging PR #99 then following W-0103 roadmap.

## Experiment Log State (2026-04-19)

- `engine/data_cache/event_log/events.jsonl`: 114,384 events
  - `compression`: 114,304 — **per-bar firing = unusably noisy, needs onset dedup**
  - `funding_extreme`: 80 total, **3 predictive** (TRADOORUSDT only, +23~42% 72h)
- Key insight: compression detector needs `onset_only=True` before it can be used for pattern discovery

## PR Status

- **PR #99** (W-0102): screenshot-verified, 0 errors, ready to merge. `gh pr merge 99`

## Next Session Roadmap (priority order)

1. **P0** — Merge PR #99 + start **Pattern #5: Volume Absorption Reversal (VAR)**
   - SELLING_CLIMAX → ABSORPTION → BASE_FORMATION → BREAKOUT
   - New blocks: `volume_spike_down`, `delta_flip_positive` (CVD delta flip)
   - Benchmark: FARTCOIN/POPCAT/PEPE

2. **P1** — `ExtremeEventDetector` onset dedup (`onset_only=True`, min_gap=12 bars)
   - Reduces 114K compression events to ~1K usable onset signals

3. **P2** — WSR universe scan: 100 symbols → more benchmark cases

4. **P3** — Mobile TF switching verification + Verdict Inbox 4-pattern display

## 4-Pattern System Status

| Pattern | Score | Status |
|---------|-------|--------|
| TRADOOR OI Reversal | best-in-class | PROMOTED |
| Funding Flip Reversal | 0.807 | PROMOTED |
| Wyckoff Spring Reversal | 0.864 | PROMOTED |
| Whale Accumulation Reversal | TBD | promote_candidate |

## CTO Architecture Decisions

- Expanding pure-OHLCV patterns (WSR proved viability) → covers spot exchanges too
- CVD-based VAR needs only taker_buy_volume (no perp OI/funding)
- Pattern #6+ deferred until VAR is promoted
