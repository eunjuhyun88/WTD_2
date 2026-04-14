# W-0001 Repo Operating Baseline

## Goal

Establish a low-context operating baseline for this repository as an AI research operating system.

## Owner

contract

## Scope

- introduce layered root docs structure
- define read/exclude rules in `AGENTS.md`
- create work item and research folder standards

## Non-Goals

- refactor engine/app runtime code
- migrate all legacy docs in one pass

## Canonical Files

- `README.md`
- `AGENTS.md`
- `docs/product/*`
- `docs/domains/*`
- `docs/decisions/*`

## Decisions

- Engine stays canonical backend source.
- App-engine integration is contract-bound.
- Legacy docs remain reference-only until selectively promoted.

## Next Steps

- ~~Add canonical contract file~~ — see `docs/domains/contracts.md`.
- ~~Split `app/docs/COGOCHI.md`~~ — parts in `docs/archive/cogochi/`; stub at `app/docs/COGOCHI.md`.
- Optional: promote excerpts from archive into `docs/product` / `docs/domains` (no big-bang copy).
- Open `W-0003` for read-scope automation tooling.

## Exit Criteria

- New sessions can start from `AGENTS.md` + one work item + one domain doc.
