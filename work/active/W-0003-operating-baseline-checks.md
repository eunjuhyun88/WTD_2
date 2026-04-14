# W-0003 Operating Baseline Checks

## Goal

Turn the repository operating baseline into a repeatable local validation step instead of a docs-only policy.

## Owner

contract

## Scope

- add a root baseline checker for canonical docs, work items, and contract paths
- verify active work items use the required section template
- document the baseline check entry point in repo-facing docs

## Non-Goals

- replace existing app-specific context checks
- enforce semantic correctness of all doc content
- build full CI automation in this slice

## Canonical Files

- `scripts/check-operating-baseline.sh`
- `README.md`
- `docs/runbooks/local-dev.md`
- `AGENTS.md`

## Decisions

- Baseline checks should run from the repo root because the operating rules are repo-wide.
- The first version should validate structure and ownership, not deep semantic consistency.

## Next Steps

- Run the new baseline checker locally and fix failures.
- Decide whether to wire this script into broader CI or app scripts.
- Add contract/doc drift checks if route or schema ownership moves.

## Exit Criteria

- One repo-root command validates the operating baseline.
- Active work items fail fast when required sections or owner values are missing.
- Core canonical docs and contract paths are checked from one place.
