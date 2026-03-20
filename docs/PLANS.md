# PLANS

Purpose:
- Canonical entry point for execution plans.
- Distinguishes active work, completed work, and ongoing debt.

## Planning Rules

1. Small one-shot changes may live in a dated design doc.
2. Multi-step work should be represented in `docs/exec-plans/active/`.
3. Completed plans move to `docs/exec-plans/completed/` or are marked historical from the index.
4. The watch log records execution history; it is not the canonical plan.
5. Task contracts live beside plans, but do not replace them; plans describe sequence, contracts define finish.

## Current Active Planning Surface

- `docs/exec-plans/active/chatbattle-foundation-refactor-plan-2026-03-20.md`
- `docs/exec-plans/active/cogochi-stockclaw-final-placement-architecture-2026-03-17.md`
- `docs/exec-plans/active/full-stack-redesign-validation-2026-03-07.md`
- `docs/exec-plans/active/arena-uiux-layout-design-2026-03-07.md`
- `docs/exec-plans/active/arena-core-loop-design-2026-03-07.md`
- `docs/exec-plans/active/arena-page-controller-design-2026-03-07.md`
- `docs/exec-plans/active/frontend-backend-separation-plan-2026-03-07.md`
- `docs/exec-plans/index.md`
- `docs/exec-plans/active/internal-extraction-folder-map-2026-03-07.md`
- `docs/exec-plans/active/remaining-structure-refactor-batches-2026-03-07.md`
- `docs/exec-plans/active/canonical-frontend-refactor-plan-2026-03-06.md`
- `docs/exec-plans/active/context-system-rollout-2026-03-06.md` (now includes checkpoint/brief/handoff rollout)
- `docs/exec-plans/active/wip-branch-split-plan-2026-03-06.md` (current branch hygiene and slice extraction plan)
- `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`
- `docs/references/active/terminal-refactor-master-plan-2026-03-06.md`

## Current Debt Tracking Surface

- `docs/exec-plans/tech-debt-tracker.md`
- `docs/REFACTORING_BACKLOG.md`
- `docs/QUALITY_SCORE.md`

## Planning Discipline

- Plans should state scope, invariants, steps, and exit criteria.
- A plan should point to canonical design docs instead of copying them.
- If a dated design doc becomes the de facto authority, promote its stable parts into canonical docs.
