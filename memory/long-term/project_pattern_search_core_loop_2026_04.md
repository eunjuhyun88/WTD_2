---
name: pattern-search core loop closure (W-0086, PR #77)
description: W-0086 pattern engine session 2026-04-18 — first core-loop closure on TRADOOR + H6 reframe. PR #77 merged.
type: project
---

W-0086 pattern-search core loop work, merged via PR #77 on 2026-04-18.

**Architecture delivered (reusable for any rule-based pattern)**:
- 5-phase state machine with score-based contracts (required_blocks + required_any_groups + optional + disqualifier + score_threshold + anchor / transition_window)
- PromotionReport gate (6 design-spec metrics)
- promoted_*_ref propagation into `_derive_baseline_ref` so gate-cleared variants become canonical baseline
- Search axes: timeframe-family + duration-family (orthogonal, informational only)
- Wyckoff Sign-of-Strength block `breakout_from_pullback_range` (phase-anchored, not rolling)

**Quant-anchored thresholds** (each in module docstrings, see commit `4ef13e6` and follow-ups):
- breakout_above_high 5d (Park-Irwin 2007)
- breakout_volume_confirm 2.5x (Murphy 1999)
- oi_expansion_confirm 5%/24h (Bessembinder-Seguin 1993)
- oi_spike_with_dump / oi_hold_after_spike 8% (Park-Hahn-Lee 2023; Koutmos 2019)
- REAL_DUMP.max_bars 12 (Park-Hahn-Lee accumulation-formation 4-12h)
- ARCH_ZONE accepts sideways_compression OR bollinger_squeeze OR volume_dryup (Pruden 2007 multi-precursor generalization)

**First closed case**: TRADOORUSDT holdout — ACCUMULATION entry 2026-04-12 00:00 UTC @ close 3.482, BREAKOUT 10:00 UTC @ 4.733. Edge: +35.93%/10h, +60.71%/48h, +111% peak. Three independent variants converged on the same entry timestamp.

**H6 multi-symbol reframe (most important insight)**: scanning 42 Binance perp candidates found 3 OI-active whale-squeeze events (KOMA/FARTCOIN/DYM). Engine reaches ACCUMULATION on 3 of 4 holdouts but BREAKOUT only on TRADOOR. Per-symbol `breakout_above_high` trace at 1d/2d/3d/5d shows 0 hits on KOMA/DYM post-ACCUMULATION — the charts genuinely do not break the pre-dump high. Engine is correctly distinguishing Wyckoff-complete V-reversals from partial-range retracements. The "overfit" is in the promotion metric (target_hit = pattern completion), not the engine. Promotion gate conflates pattern-completion with trading-edge — KOMA had +20.9% peak from entry without target_hit.

**Next blocker**: implement `entry_profitable_at_N(threshold=X%)` parallel metric so promotion gate accepts EITHER strict pattern completion OR economic edge. Without this, gate is structurally incompatible with non-V-reversal recoveries.

**Methodology lock-in**: 4-axis parallel verification (Axis A threshold / B composition / C benchmark pack / D promotion-gate policy). Bundling axes broke 10 state-machine tests in this session; 13 single-axis atomic slices kept all 696 tests green. Bundling forbidden going forward.

**Diagnostic scripts in /tmp** (not committed): sensitivity_sweep.py, ptb_extension_check.py, scan_whale_squeeze_v3.py, h6_run.py.

**Checkpoint doc**: `work/active/W-0086-checkpoint-2026-04-18.md` has full commit chain, run timeline, per-symbol breakdown, prioritised next slices.
