# Multi-Agent OS Contract

**Status:** current
**Verified by:** `design/current/invariants.yml`

## Current Layers

- `memory/`: MemKraft decisions, incidents, sessions, live notes.
- `state/`: generated state only.
- `spec/`: active priorities, contracts, roadmap.
- `design/`: verifiable current/proposed/rejected specs.
- `tools/`: boot, claim, save, end, verification, and MemKraft wrapper scripts.

## Agent Loop

Every non-trivial session starts with:

```bash
./tools/start.sh
```

Before touching a file-domain:

```bash
./tools/claim.sh "domain"
```

Before ending:

```bash
./tools/end.sh "shipped" "handoff"
```

`tools/end.sh` runs design verification when `tools/verify_design.sh` exists.
