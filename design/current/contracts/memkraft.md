# MemKraft Operating Contract

**Status:** current
**Verified by:** `design/current/invariants.yml`

## Rules

- The only active MemKraft store is root `memory/`.
- All CLI calls go through `./tools/mk.sh`.
- Direct global `memkraft` calls in repo automation are not allowed.
- `cd memory && memkraft ...` is not allowed because MemKraft 2.x can resolve `memory/memory/`.
- `app/memory/` and `memory/memory/` must not exist.
- `from memory.mk import mk` must resolve the repo-local wrapper and engine uv MemKraft dependency.

## Expected Commands

- `./tools/mk.sh health-check`
- `./tools/mk.sh doctor --base-dir memory`
- `./tools/start.sh`
- `./tools/save.sh "next"`
- `./tools/end.sh "shipped" "handoff"`
