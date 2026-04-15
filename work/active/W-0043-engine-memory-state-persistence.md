# W-0043 Engine Memory State Persistence

## Goal

Make engine memory feedback and debug-session state survive process restarts through a local durable store.

## Owner

engine

## Scope

- Add a durable engine memory state store.
- Replace process-local feedback/debug persistence in `engine/api/routes/memory.py`.
- Add targeted engine tests for durable memory state behavior.

## Non-Goals

- No app-domain terminal routes.
- No analyze contract expansion.
- No terminal Save Setup capture logic.

## Canonical Files

- `work/active/W-0043-engine-memory-state-persistence.md`
- `engine/api/routes/memory.py`
- `engine/memory/state_store.py`
- `engine/tests/test_contract_memory_roundtrip.py`
- `engine/tests/test_memory_state_store.py`

## Facts

- The current mixed local diff already changes `engine/api/routes/memory.py` and adds `engine/memory/state_store.py` plus a targeted test.
- This slice is engine-only and should be mergeable without app persistence or terminal surface files.
- `W-0035` and `W-0037` already established the local durable-store pattern for engine runtime data.

## Assumptions

- SQLite WAL is acceptable for the first durable memory-state implementation.

## Open Questions

- Whether the app-side terminal memory adapter should stay out of this slice or be handled as a thin follow-up contract change.

## Decisions

- Keep engine memory durability separate from app persistence rollout.
- Validate with targeted engine tests only.

## Next Steps

1. Recover the engine memory store diff into a clean branch.
2. Run targeted memory tests.
3. Keep app-side memory adapters out unless required to unblock CI.

## Exit Criteria

- Memory feedback/debug state survives restart through the durable store.
- Targeted engine memory tests pass.
- The PR contains no app-domain route or terminal surface changes.

## Handoff Checklist

- Verification status: not yet restaged on a clean branch.
- Remaining blockers: extract the engine-only diff from the mixed local branch.
