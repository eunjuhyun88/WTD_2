# W-0086 Slice 2 — FARTCOIN FAKE_DUMP stall diagnosis

Companion to `W-0086-checkpoint-2026-04-18.md`. Closes one of the
three top-priority next slices.

## Correction to the checkpoint

The checkpoint H6 table reports:

> FARTCOIN | -18.0% | +22.1%/72h | FAKE_DUMP (stuck) | ✗

This claim is **wrong**. The state machine does not stall at FAKE_DUMP.
It reaches REAL_DUMP on the exact dump bar, then regresses to ARCH_ZONE
before ACCUMULATION forms. The true failure mode is a REAL_DUMP →
ACCUMULATION timeout.

## Replay trace

Pattern: `tradoor-oi-reversal-v1`
Case window: 2026-04-06 23:00 UTC → 2026-04-11 23:00 UTC
Data: 1h klines (11,595 bars cached back to 2024-12-20), 800 perp bars.

Phase history within case window:

| Timestamp (UTC) | Phase |
|---|---|
| 2026-04-08 12:00 | ARCH_ZONE |
| **2026-04-08 23:00** | **REAL_DUMP** ← dump bar, pattern advances correctly |
| **2026-04-09 12:00** | **ARCH_ZONE** ← regression: 13 bars after REAL_DUMP entry |
| 2026-04-11 13:00 | ARCH_ZONE |

Final `current_phase`: **ARCH_ZONE** (not FAKE_DUMP). ACCUMULATION and
BREAKOUT are never reached.

13 bars = REAL_DUMP `max_bars=12` + 1 grace bar. The regression is a
phase-timeout, not a FAKE_DUMP stall.

## Why ACCUMULATION doesn't form in time

ACCUMULATION requires
`higher_lows_sequence AND oi_hold_after_spike AND (funding_flip | positive_funding_bias | ls_ratio_recovery)`
and must fire within REAL_DUMP's 12-bar transition window
(2026-04-08 23:00 → 2026-04-09 11:00).

Per-block firing across the 12-bar window:

| Block | First fire | In REAL_DUMP window? |
|---|---|---|
| `oi_hold_after_spike` | 2026-04-08 23:00 (bar 0) | ✓ |
| `positive_funding_bias` | 2026-04-08 23:00 (bar 0) | ✓ |
| `ls_ratio_recovery` | 2026-04-08 23:00 (bar 0) | ✓ |
| `funding_flip` | 2026-04-09 21:00 (bar 22) | ✗ |
| **`higher_lows_sequence`** | **2026-04-09 15:00 (bar 16)** | **✗** |

`oi_hold_after_spike` and the funding-group requirements are satisfied
immediately. The blocking gate is **`higher_lows_sequence`**, which
first fires at bar 16 — 4 bars past the REAL_DUMP max_bars=12 deadline.

## Why FARTCOIN differs from TRADOOR

The `REAL_DUMP.max_bars = 12` choice is anchored in Park, Hahn & Lee
(2023) "Liquidation cascades on crypto perpetuals" and was calibrated
against TRADOORUSDT's empirical 5-bar gap from REAL_DUMP entry to
first Sign-of-Strength (W-0086 run ade68a09).

| Symbol | REAL_DUMP entry | First higher_lows_sequence | Gap | Within max_bars=12? |
|---|---|---|---|---|
| TRADOOR | 2026-04-11 16:00 | 2026-04-11 21:00 | 5 bars | ✓ |
| **FARTCOIN** | **2026-04-08 23:00** | **2026-04-09 15:00** | **16 bars** | **✗ (4 bars too late)** |

TRADOOR hits higher lows fast after the cascade; FARTCOIN's post-dump
recovery has a longer consolidation tail before higher lows form.
Both sit inside Park-Hahn-Lee's cited 4-12h range for TRADOOR, but
FARTCOIN's 16-bar gap lands *outside* the cited distribution's upper
tail.

## Remediation options (none taken in this slice)

Each of these is a separate axis per W-0086 methodology lockin —
must not be bundled.

1. **Widen max_bars** (e.g. 12 → 18). Trade-off: more chart bars for
   higher-lows to form, but a longer REAL_DUMP window also delays
   ARCH_ZONE regression when the symbol genuinely failed. Needs
   literature beyond Park-Hahn-Lee's 4-12h or a new crypto-perp
   cascade-window study.
2. **Split ACCUMULATION transition_window_bars from REAL_DUMP max_bars**.
   Currently the same 12-bar value governs both "how long REAL_DUMP
   stays active before timing out" and "how long ACCUMULATION has to
   anchor to REAL_DUMP". Decoupling would let ACCUMULATION accept a
   longer higher_lows formation without extending REAL_DUMP's active
   lifetime.
3. **Relax `higher_lows_sequence`** definition. If FARTCOIN's 04-09
   bars contain e.g. equal-low compression rather than strictly higher
   lows, the block may be filtering valid consolidation. Requires
   independent study of block behaviour.
4. **Accept FARTCOIN as out-of-distribution**. If 16-bar gaps reflect
   a distinct post-dump regime (e.g. slower squeeze, lower-float
   token), the pattern may be legitimately silent. Add FARTCOIN to a
   labelled negative case set and validate that option (1)-(3) improve
   multi-symbol coverage without degrading TRADOOR.

Option (2) is the most surgical. Option (1) is simpler but risks
promotion-gate FDR regressions.

## Concrete next slice

Recommend option (2) with a literature-anchored default and a
parallel-verification run against the H6 pack. Should land as its
own atomic commit — probably a single edit to
`engine/patterns/library.py:110` setting
`ACCUMULATION.transition_window_bars` independent of REAL_DUMP
`max_bars`.

## Scratch tool

`/tmp/fartcoin_phase_trace.py` (not committed, per checkpoint
`off-repo scratch tools` policy). Reproduces the full trace above.
Reads cache from `engine/data_cache/cache` (symlinked into the
dazzling-jepsen worktree).
