# W-0017 Engine Snapshot Contract and Observability

## Goal

Complete the engine-side primitives that the API already expects for snapshot contract normalization and in-process runtime metrics, while keeping the local research CLI tests environment-safe.

## Owner

engine

## Scope

- normalize reconstructed `SignalSnapshot` payloads consistently across score and challenge routes
- add the missing in-process metrics/timing helpers already referenced by `engine/api/main.py`
- verify those observability helpers with targeted engine tests
- make research CLI subprocess tests use the active Python interpreter instead of assuming `python` is on `PATH`

## Non-Goals

- introducing external metrics backends or Prometheus exporters
- redesigning score/challenge response schemas
- changing model behavior or training semantics
- committing generated research experiment artifacts

## Canonical Files

- `work/active/W-0017-engine-snapshot-contract-and-observability.md`
- `engine/api/main.py`
- `engine/api/routes/score.py`
- `engine/api/routes/challenge.py`
- `engine/observability/__init__.py`
- `engine/observability/health.py`
- `engine/observability/metrics.py`
- `engine/observability/timing.py`
- `engine/tests/test_observability_metrics.py`
- `engine/tests/test_snapshot_versioning.py`
- `engine/tests/test_research_cli.py`

## Decisions

- route-level `SignalSnapshot` reconstruction should pass through the same compatibility normalizer used by training routes
- in-process counters and timings remain file-local engine primitives, not a public metrics backend contract
- research CLI tests should invoke `sys.executable` for environment independence

## Next Steps

- decide whether `/metrics` should stay JSON-only or later expose Prometheus text format
- add lightweight request metrics assertions around `api.main` if runtime middleware becomes more complex
- separate any future metrics backend integration into a dedicated work item

## Exit Criteria

- score and challenge routes normalize snapshot payloads consistently with the existing snapshot version policy
- `engine/api/main.py` imports for metrics/timing resolve without missing-module gaps
- targeted tests cover the new observability helpers and CLI invocation path
