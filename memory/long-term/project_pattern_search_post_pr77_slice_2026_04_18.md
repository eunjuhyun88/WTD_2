---
name: W-0086 post-PR#77 three-slice session
description: Slice 1 (entry_profitable_rate metric), slice 2 (FARTCOIN stall corrected), slice 3 (breakout_above_high preserved+documented). 3 atomic commits on claude/dazzling-jepsen, not pushed.
type: project
originSessionId: 45567dac-e993-4913-8e5b-6b93837dad95
---
W-0086 post-PR#77 continuation, 2026-04-18. Three atomic slices landed on
branch `claude/dazzling-jepsen` (not yet pushed, not yet PR'd).

## Commits (claude/dazzling-jepsen, base eea6c94)

- `6c4c7d5` — slice 1: `entry_forward_returns` field on `VariantCaseResult`,
  `entry_profitable_rate` + `mean_max_forward_return` in `PromotionReport`,
  policy knobs `entry_profitable_threshold` + `min_entry_profitable_rate`.
  Default (0.0, 0.0) keeps existing fixtures green. 5 new tests, 70/70
  pattern_search tests pass, full engine 711 pass (2 pre-existing unrelated
  fails in test_security_runtime and test_research_inspection).
- `8f1fb4a` — slice 3: document `breakout_above_high` as preserved non-
  pattern-library trigger. Not deleted because it's still consumed by
  `autoresearch_real_data.BreakoutLongCombo` and registered in
  `scoring/ensemble` + `scoring/block_evaluator`. Fixed stale "consumed
  by TRADOOR setup" claim in docstring.
- `aac0987` — slice 2: FARTCOIN diagnosis. Corrects checkpoint finding.
  FARTCOIN does NOT stall at FAKE_DUMP — reaches REAL_DUMP at dump bar
  (2026-04-08 23:00) then regresses to ARCH_ZONE after max_bars=12
  timeout because `higher_lows_sequence` first fires at bar 16 (4 bars
  late). Diagnosis doc: `work/active/W-0086-fartcoin-diagnosis-2026-04-18.md`.

## Key technical discovery (slice 2)

FARTCOIN's blocker is `higher_lows_sequence` timing vs. `REAL_DUMP.max_bars`,
not a missing-block problem. `oi_hold_after_spike`, `positive_funding_bias`,
`ls_ratio_recovery` all fire at bar 0 of the REAL_DUMP window. Only
higher_lows misses by 4 bars. Park-Hahn-Lee 2023 4-12h range fits TRADOOR
(5-bar gap) but excludes FARTCOIN (16-bar gap).

## Recommended next slice (atomic)

Decouple `ACCUMULATION.transition_window_bars` from `REAL_DUMP.max_bars`
so ACCUMULATION can accept slower higher_lows formation without extending
REAL_DUMP's active lifetime. Single edit in `engine/patterns/library.py`.
Other options (widen max_bars, relax higher_lows, accept FARTCOIN as OOD)
catalogued but dispreferred.

## Worktree tripwire to avoid

Working across `/Users/ej/Projects/wtd-v2/engine` (main) and
`/Users/ej/Projects/wtd-v2/.claude/worktrees/dazzling-jepsen/engine`
is risky — `cd` into main worktree during edits caused slice 1 to commit
on `main` accidentally. Had to reset main back to eea6c94 and cherry-
pick onto task branch. Also slice-3 docstring edit went to wrong worktree
first. Work exclusively from the worktree path; avoid absolute paths
that resolve into the main working copy.

## Scratch tools on /tmp

- `/tmp/fartcoin_phase_trace.py` — slice 2 diagnostic, reads cache via
  symlink `worktrees/dazzling-jepsen/engine/data_cache/cache → main's
  engine/data_cache/cache`. Not committed per checkpoint policy.
