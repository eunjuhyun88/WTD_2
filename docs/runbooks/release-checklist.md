# Runbook: Release Checklist

## Pre-Release

- Confirm active work items are either completed or explicitly deferred.
- Confirm contract-impacting changes are documented.
- Confirm target tests/checks pass in changed scopes.
- If this release changes launch-critical paths, review `docs/runbooks/launch-readiness.md`.

## Release Gate

- No unresolved boundary violations (`app` reimplementing engine logic).
- No undocumented breaking contract changes.
- No hidden behavior drift without ADR or work-item note.
- No public launch candidate should ignore unresolved runtime-plane or control-plane blockers documented in the launch-readiness runbook.
