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

- This slice has been reconstructed on clean branch `codex/w-0043-engine-memory-state-persistence-clean`.
- `engine/api/routes/memory.py` now persists feedback/debug state through `engine/memory/state_store.py`.
- This slice is engine-only and does not include app persistence or terminal surface files.
- Targeted engine memory tests pass.

## Assumptions

- SQLite WAL is acceptable for the first durable memory-state implementation.

## Open Questions

- Whether the app-side terminal memory adapter should stay out of this slice or be handled as a thin follow-up contract change.

## Decisions

- Keep engine memory durability separate from app persistence rollout.
- Validate with targeted engine tests only.

## Next Steps

1. Commit and open the clean `W-0043` PR.
2. Keep app-side memory adapters out of this engine slice.
3. Apply any CI-only fixes without expanding into app-domain work.

## Exit Criteria

- Memory feedback/debug state survives restart through the durable store.
- Targeted engine memory tests pass.
- The PR contains no app-domain route or terminal surface changes.

## Handoff Checklist

- Verification status: `uv run pytest tests/test_contract_memory_roundtrip.py tests/test_memory_state_store.py` passed from `engine/`.
- Remaining blockers: none before PR; CI still needs to confirm.
