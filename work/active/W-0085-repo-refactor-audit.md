# W-0085 Repo Refactor Audit

## Goal
Produce a current, repo-wide refactor audit that identifies the highest-ROI structural cleanup lanes without changing behavior.

## Owner
research

## Scope
- inspect `app/`, `engine/`, `research/`, and repo hygiene for refactor candidates
- identify monoliths, boundary violations, contract duplication, and artifact sprawl
- propose a phased execution order that matches current local-first priorities

## Non-Goals
- landing code changes in this slice
- redesigning product behavior or trading logic
- rewriting the whole repo under one umbrella PR

## Canonical Files
- `work/active/W-0085-repo-refactor-audit.md`
- `work/active/W-0006-full-architecture-refactor-design.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/server/scanEngine.ts`
- `app/src/lib/server/intelPolicyRuntime.ts`
- `app/src/lib/server/engineClient.ts`
- `app/src/lib/server/engine-runtime/local/cogochi.ts`
- `app/src/lib/services/scanService.ts`
- `engine/scanner/feature_calc.py`
- `engine/research/pattern_search.py`
- `.gitignore`

## Facts
- Terminal surface remains the largest app hotspot: `app/src/routes/terminal/+page.svelte` is 1930 LOC, while terminal components such as `IntelPanel.svelte` (2775 LOC) and `ChartBoard.svelte` (2272 LOC) still mix UI, orchestration, and state-heavy behavior.
- App server orchestration still concentrates too much behavior in a few files: `scanEngine.ts` (1208 LOC), `providers/rawSources.ts` (1120 LOC), `llmService.ts` (1104 LOC), `intelPolicyRuntime.ts` (1101 LOC), and `ragService.ts` (984 LOC).
- App-engine boundaries are still blurred: `app/src/lib/engine/` contains 61 files, `app/src/lib/data-engine/` contains 18 files, and `app/src/lib/server/engine-runtime/local/cogochi.ts` still imports `$lib/engine/cogochi/layerEngine`.
- Engine research logic is still monolithic: `engine/research/pattern_search.py` is 2931 LOC and combines variant generation, evaluation, selection, and artifact handling; `engine/scanner/feature_calc.py` is 1721 LOC and combines primitive indicators with both snapshot and vectorized table APIs.
- Repo hygiene is weakening iteration: current `git status` includes runtime artifacts under `engine/ledger_records/`, `engine/research/pattern_search/`, `research/experiments/`, and `output/`, while `.gitignore` does not currently cover `engine/.venv/` or those experiment/search-output trees.

## Assumptions
- Near-term priority is still local research velocity and inference-path correctness, not multi-user production hardening.
- Some runtime artifacts may be intentionally kept for reproducibility, but their storage policy is not yet explicit enough.

## Open Questions
- Should the app-local engine/runtime remain as an explicit offline fallback, or should more of it move behind the engine runtime boundary?
- Which research artifacts must stay versioned for reproducibility, and which should move to ignored output roots?
- Should terminal refactoring start from a state-model/controller split or from panel-by-panel extraction first?

## Decisions
- Prioritize terminal surface decomposition first on the app side because it combines the most code volume with the most user-facing change risk.
- Treat boundary cleanup as a separate lane from UI decomposition: local engine/runtime duplication and contract drift should not stay embedded inside feature work.
- Split engine research code by lifecycle stage: feature calculation, variant generation, evaluation, and artifact persistence should become separate modules before adding more search heuristics.
- Fix artifact hygiene early because noisy worktrees and mixed runtime outputs degrade every future slice, regardless of owner.

## Next Steps
- Open a child work item for terminal shell decomposition centered on state ownership, controller slimming, and panel extraction.
- Open a child work item for runtime-boundary consolidation covering `engineClient`, local engine fallbacks, and `scanService`/`scanEngine` responsibilities.
- Open a child work item for engine research modularization covering `pattern_search.py`, `feature_calc.py`, and artifact/output relocation policy.

## Exit Criteria
- The top refactor lanes are documented with concrete canonical files and ordering.
- Follow-up work can start from files instead of chat history.
- The audit distinguishes boundary cleanup, UI decomposition, engine modularization, and artifact hygiene instead of treating refactor as one undifferentiated task.

## Handoff Checklist
- Current worktree is dirty; future slices must avoid reverting unrelated runtime or research outputs.
- No code behavior changed in this audit slice.
- Follow-up slices should confirm artifact retention policy before changing `.gitignore` or moving research outputs.
