---
name: parallel-verification methodology lock-in
description: Atomic single-axis slices with literature anchor — bundling axes hides which fix worked. Confirmed by experience.
type: feedback
---

When tuning pattern engine thresholds, phase composition, benchmark pack, or promotion-gate policy, **each axis lands as its own atomic commit with its own quant-literature anchor in the relevant module docstring**. Never bundle axes into one slice.

**Why**: Two bundling attempts during W-0086 session (2026-04-18) broke 10 state-machine tests. The 13 single-axis atomic slices each kept all 696 tests green and made it possible to attribute the FDR change to the correct axis. With bundling, when a still-failing state appears, attribution is ambiguous.

**How to apply**:
- Axis A (block threshold change) — one block, one number, cite the paper
- Axis B (block composition for a phase) — change `required_blocks` / `required_any_groups` / `optional_blocks` / `disqualifier_blocks` for ONE phase
- Axis C (benchmark pack composition) — add / extend / replace cases
- Axis D (promotion-gate policy) — only as last resort; the gate is the measurement instrument, not the target. Never lower the gate to produce a "pass"

After each commit, real benchmark run is mandatory even if unit tests pass — infrastructure-only test passage does not imply the axis moved the promotion gate. Multiple slices in the W-0086 session passed unit tests but had no FDR effect, which only the real run exposed.

Inspired by the Paradigm autoresearch playbook ("Parallel Exploration > Sequential Optimization") and the Cogochi H1 four-axis verification plan.
