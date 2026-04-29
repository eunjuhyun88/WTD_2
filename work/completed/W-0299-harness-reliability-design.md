# W-0299 — Harness Reliability Repair

> Wave: MM (Maintenance) | Priority: P1 | Effort: M (0.5-1 day)
> Charter: In-Scope (existing tool stabilization, no new agent OS)
> Status: 🟡 Design Draft
> Created: 2026-04-29 by A080
> Issue: TBD

---

## Goal

Local verification must fail when the repo is actually unsafe, and every documented harness command must point to a tracked, executable implementation.

---

## Owner

contract

Primary change type: tooling / verification contract.

---

## Scope

- Include:
  - Fix `tools/verify.py` change detection so dirty, staged, and untracked code changes are verified.
  - Make `--engine-only` / `--app-only` overrides apply before docs-only or empty-diff early exits.
  - Restore or remove `tools/cycle-smoke.py`; do not leave AGENTS/runbooks pointing to a missing command.
  - Make `.claude/settings.json` and `.claude/hooks/post-edit-pytest.sh` agree on hook path, JSON shape, executable bit, cwd, and failure behavior.
  - Harden `tools/check_drift.sh` so drift detection never crashes and can return nonzero in strict mode.
  - Add compact self-tests for the harness itself.
- Files:
  - `tools/verify.py`
  - `tools/check_drift.sh`
  - `tools/cycle-smoke.py` or `docs/runbooks/cycle-smoke.md` / `AGENTS.md` if the command is intentionally removed
  - `.claude/settings.json`
  - `.claude/hooks/post-edit-pytest.sh`
  - `docs/runbooks/post-edit-hook.md`
  - optional: `tools/tests/test_verify_harness.py`
- API surface: none.

---

## Non-Goals

- No new dispatcher, orchestration framework, slash command system, or MemKraft replacement.
- No broad worktree cleanup automation beyond making existing drift checks reliable.
- No engine product logic changes.
- No model tiering work; W-0297/W-0298 harness-command-model-tiering remains separate.

---

## Canonical Files

- `tools/verify.py`
- `tools/check_drift.sh`
- `.claude/settings.json`
- `.claude/hooks/post-edit-pytest.sh`
- `docs/runbooks/cycle-smoke.md`
- `docs/runbooks/post-edit-hook.md`
- `AGENTS.md`

---

## Facts

- `tools/verify.py` currently derives changed files from `git diff --name-only origin/main..HEAD`, so working tree and untracked changes can be invisible.
- `.claude/settings.json` references `bash .claude/hooks/post-edit-pytest.sh`, but this worktree currently has no tracked hook file at that path.
- `docs/runbooks/cycle-smoke.md`, `AGENTS.md`, and W-0296 reference `tools/cycle-smoke.py`; `test -f tools/cycle-smoke.py` currently fails.
- `./tools/check_drift.sh` crashed with `LOCAL_AHEAD…: unbound variable` while trying to report drift, so even reporting is not reliable.
- Charter allows stabilizing existing `start.sh` / `claim.sh` / `end.sh` / verification tooling, but forbids building a new coordination stack.

---

## Assumptions

- Claude hook payload may arrive as either `tool_input.file_path` or `inputs.file_path`; supporting both is safer than relying on one shape.
- `uv run pytest ...` should be executed from `engine/` or with a path that matches the engine pyproject context.
- CI can run a lightweight harness self-test without pulling full app dependencies.

---

## Open Questions

- [ ] [Q-0299-1] Should `cycle-smoke.py` be restored as a real script, or should W-0296/AGENTS/runbooks remove it and rely on `tools/verify.py --engine-only`?
- [ ] [Q-0299-2] Should `check_drift.sh --strict` become pre-push blocking immediately, or only be wired into `/닫기` first?

---

## Decisions

- **[D-0299-1]** Treat `verify.py` as the single manual verification entrypoint. Hook and slash commands may call it or narrower pytest commands, but Pass/Fail must be subprocess exit-code based.
- **[D-0299-2]** Prefer repair over new harness creation. The scope is existing file stabilization plus self-tests, staying under the Charter tool-building boundary.
- **[D-0299-3]** `cycle-smoke.py` must be either tracked and tested or fully removed from docs. A documented missing command is worse than no command.
- **[D-0299-4]** Drift checks default to report-only for compatibility, with an explicit `--strict` mode for hooks/CI.

---

## CTO 관점

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|---|---:|---:|---|
| `verify.py` false PASS lets broken engine/app changes ship | High | High | Include `git status --porcelain` + staged + untracked in surface detection; add tests that create dirty files |
| Hook exists in settings but script missing or non-executable | High | Medium | Add path/executable self-check and AC for direct hook invocation |
| Hook blocks editing due env/cwd mismatch | Medium | Medium | Execute from engine root; missing `uv` stays silent, pytest failure exits 2 |
| Drift script crashes and hides real drift | Medium | Medium | Remove unsafe variable handling; add strict/report modes |
| Repair grows into a new coordination system | Medium | High | Cap scope to existing scripts; no new daemon/cron/registry design |

### Dependencies

- Existing `uv` engine environment.
- Current Claude hook schema in `.claude/settings.json`.
- Git available locally with `origin/main`.

### Rollback

- Revert W-0299 PR to restore old manual verification behavior.
- If hook causes friction, remove the PostToolUse hook entries while keeping `verify.py` improvements.

---

## AI Researcher 관점

### Data Impact

No market data, verdict, backtest, or training data changes. This work only changes whether agents correctly detect unsafe local changes before commit/PR.

### Statistical Validation

Not a model/statistical change. Validation is behavioral:
- dirty engine file must select engine tests;
- dirty app file must select app checks;
- docs-only must skip heavy checks;
- untracked `engine/*.py` must not return "변경 없음";
- missing `cycle-smoke.py` must be caught by a harness self-test.

### Failure Modes

- False positive: docs-only or memory-only changes run too many tests.
- False negative: generated or untracked files still bypass detection.
- Hook schema changes upstream and file path parsing silently stops.
- Strict drift mode blocks old maintenance branches unexpectedly.

---

## Implementation Plan

1. Baseline safety
   - Run `git status --short` and preserve unrelated dirty files.
   - Claim only harness/tooling paths, not engine verification product paths.
2. `verify.py`
   - Replace `changed_files()` with a union of:
     - `git diff --name-only <merge-base>..HEAD`
     - `git diff --name-only`
     - `git diff --cached --name-only`
     - `git ls-files --others --exclude-standard`
   - Apply `--engine-only` / `--app-only` before any docs-only or no-change early return.
   - Make quality grep include dirty and staged Python/TS diffs.
3. Hook repair
   - Ensure `.claude/hooks/post-edit-pytest.sh` is tracked and executable.
   - Parse both `tool_input.file_path` and `inputs.file_path`.
   - Run `(cd "$ENGINE_ROOT" && uv run pytest "$REL" -q --tb=short)`.
   - Update `docs/runbooks/post-edit-hook.md` to match actual JSON shape and cwd behavior.
4. Cycle smoke truth
   - Pick one:
     - restore `tools/cycle-smoke.py` with the documented 5 AC; or
     - remove `cycle-smoke.py` references from `AGENTS.md`, W-0296, and runbook.
   - Preferred: restore the script if the 5 AC still map to existing files.
5. Drift reliability
   - Fix `check_drift.sh` crash.
   - Add `--strict` returning nonzero when WARN > 0.
   - Keep default report-only for `/end` until strict mode has one clean run.
6. Self-tests
   - Add lightweight tests for file classification and hook path behavior.
   - Verification commands:
     - `./tools/verify.py --dry-run`
     - `./tools/verify.py --engine-only --dry-run`
     - `./tools/check_drift.sh || true`
     - `./tools/check_drift.sh --strict` on a clean fixture or mocked status
     - direct hook invocation with both JSON shapes.

---

## Exit Criteria

- [ ] AC1: Dirty tracked `engine/*.py` change makes `./tools/verify.py --dry-run` plan include engine surface.
- [ ] AC2: Untracked `engine/*.py` change is listed by `./tools/verify.py --dry-run`; no "변경 없음" false PASS.
- [ ] AC3: `./tools/verify.py --engine-only --dry-run` never returns docs-only/empty early PASS.
- [ ] AC4: `.claude/settings.json` references only hook files that exist and are executable.
- [ ] AC5: Direct hook invocation with `tool_input.file_path` and `inputs.file_path` both reach the same target path branch.
- [ ] AC6: `tools/cycle-smoke.py` either exists and `cd engine && uv run python ../tools/cycle-smoke.py` exits 0, or every doc reference to it is removed.
- [ ] AC7: `./tools/check_drift.sh` exits without shell errors; `./tools/check_drift.sh --strict` returns nonzero when drift is present.
- [ ] AC8: `./tools/verify.py --dry-run` and targeted harness tests pass in CI.
- [ ] PR merged + `CURRENT.md` main SHA updated.

---

## Next Steps

1. Decide Q-0299-1: restore `cycle-smoke.py` vs remove references.
2. Implement `verify.py` detection + hook repair first.
3. Add strict drift mode and self-tests.

---

## Handoff Checklist

- [ ] Run `./tools/start.sh`.
- [ ] Confirm no unrelated dirty files are modified.
- [ ] Claim harness/tooling scope before implementation.
- [ ] Preserve W-0297 model-tiering scope as separate.
- [ ] Update this work item Facts/Decisions if `cycle-smoke.py` is removed instead of restored.
