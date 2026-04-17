# W-0039 Terminal Save Setup Capture Link

## Goal

Wire `/terminal` Save Setup to create canonical engine `CaptureRecord` rows when the save came from a pattern candidate signal.

## Owner

app

## Scope

- Parse rich `candidate_records` from `/api/patterns` in `PatternStatusBar`.
- Carry selected pattern candidate context into `ChartBoard`.
- Let `SaveSetupModal` post to `/api/engine/captures` when a candidate transition id is available.
- Preserve the existing `/api/engine/challenge/create` fallback for manual/general setup saves.

## Non-Goals

- No outcome/verdict UI.
- No auth/user-id wiring.
- No app persistence rollout changes.
- No replacement of legacy challenge capture.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0039-terminal-save-setup-capture-link.md`
- `app/src/components/terminal/workspace/PatternStatusBar.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/workspace/SaveSetupModal.svelte`
- `app/src/routes/terminal/+page.svelte`

## Facts

- Engine `/patterns/candidates` now exposes `candidate_records` with `candidate_transition_id`.
- Engine `/captures` accepts `pattern_candidate` records only when the transition context matches.
- Existing app worktree has unrelated terminal persistence changes; this slice should avoid `app/src/routes/terminal/+page.svelte` if possible.
- `/api/engine/[...path]` proxies browser calls like `/api/engine/captures` to the engine.
- `npm --prefix app run check` is green after moving capture context out of `terminal/+page.svelte`.

## Assumptions

- A direct `/api/engine/captures` proxy route exists or is handled by the existing engine proxy convention.
- Saves without candidate context should remain challenge/manual saves.

## Open Questions

- Whether later user identity should be added in the app proxy or directly in Save Setup payload.

## Decisions

- Prefer `candidate_records` over legacy `entry_candidates`; fallback to legacy symbols for compatibility.
- Keep pattern candidate context in a small shared store instead of terminal page state so this slice does not couple to unrelated terminal persistence work.
- Require an explicit pattern-signal selection before Save Setup upgrades to a canonical pattern capture.
- Clear the selected candidate after a successful pattern capture to avoid stale transition reuse.
- Make `SaveSetupModal` choose the endpoint based on the presence of `candidate_transition_id`.

## Next Steps

1. Commit the app capture-link slice with only scoped staged hunks.
2. Next slice: add outcome/verdict linkage from captures to ledger.
3. Keep terminal persistence changes as a separate merge unit.

## Exit Criteria

- Pattern candidate Save Setup posts a `pattern_candidate` payload to `/api/engine/captures`.
- Manual Save Setup still posts the existing challenge payload.
- Pattern signal selection carries symbol and transition id into the modal.

## Handoff Checklist

- Active branch: `task/w-0024-terminal-attention-implementation`
- Verification status: `git diff --cached --check` passes. `npm --prefix app run check` passes.
- Remaining blockers: `app/src/routes/terminal/+page.svelte` still has unrelated unstaged terminal persistence changes and must stay outside this commit.
