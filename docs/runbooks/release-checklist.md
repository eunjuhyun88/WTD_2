# Runbook: Release Checklist

## Pre-Release

- Confirm active work items are either completed or explicitly deferred.
- Confirm contract-impacting changes are documented.
- Confirm target tests/checks pass in changed scopes.

## Release Gate

- No unresolved boundary violations (`app` reimplementing engine logic).
- No undocumented breaking contract changes.
- No hidden behavior drift without ADR or work-item note.
