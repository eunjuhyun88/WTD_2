# W-0032 Semi-Auto File-Back Design

## Goal

Define a low-risk semi-automatic `file-back` pattern that helps agents update active work items with current state without turning them into noisy append-only logs.

## Owner

contract

## Scope

- define when an agent may propose work-item updates automatically
- define when updates require explicit human or agent confirmation before writing
- define replacement, deletion, and conflict rules so active work items keep only the latest actionable state
- define a minimal rollout path that does not require full memory tiers, agentic search, or nightly maintenance

## Non-Goals

- implementing full MemKraft search or memory infrastructure
- building nightly maintenance jobs
- introducing append-only activity feeds into `work/active/*.md`
- changing current `engine` / `app` ownership boundaries

## Canonical Files

- `AGENTS.md`
- `work/active/W-0000-template.md`
- `work/active/W-0031-agent-context-and-design-governance.md`
- `work/active/W-0032-semi-auto-file-back-design.md`
- external reference: `https://github.com/seojoonkim/memkraft`

## Facts

- active work items are now intended to hold current compressed state, not historical logs
- the repository already enforces design-first planning and handoff updates through `AGENTS.md`
- fully automatic append behavior would conflict with the current context-budget policy

## Assumptions

- agents can reliably identify a narrow set of update candidates such as completed next steps, answered questions, and superseded assumptions
- write proposals are safer than unconditional writes for most file-back cases

## Open Questions

- which write classes should be auto-apply vs suggest-only in the first rollout
- whether semi-auto file-back should be exposed as a script, a command alias, or agent-side behavior only

## Decisions

- `file-back` in this repository should be semi-automatic, not fully automatic.
- The default behavior is `propose first, write second`.
- The system should prefer `replace or delete` over `append`.
- Only current-task artifacts may be updated automatically; canonical docs and ADRs remain manual.

## Proposed Model

### Update Classes

- `safe-replace`
  - mark a `Next Steps` bullet complete and remove it
  - replace an answered `Open Questions` bullet with a fact or decision
  - remove an assumption once verified or invalidated
- `safe-compact`
  - merge duplicate bullets in `Facts` or `Next Steps`
  - delete stale bullets that are explicitly superseded by newer state
- `suggest-only`
  - adding a new `Decision`
  - rewriting `Goal`, `Scope`, or `Non-Goals`
  - changing owner, change type, or exit criteria
  - touching files outside the active work item

### Write Policy

- agents may auto-apply `safe-replace` and `safe-compact` only when the replacement source is explicit in the current task context
- if two bullets conflict and the winning state is not obvious, propose a diff instead of writing
- every write must preserve the shortest current-state representation possible
- no append-only journaling into active work items

### Conflict Rules

- if new state supersedes old state, replace the old bullet in place
- if old state is no longer relevant, delete it rather than keeping both
- if both states matter, promote the stable conclusion to `Decisions` and remove transient notes
- if conflict cannot be resolved locally, keep one `Open Question`, not two competing facts

### Rollout Path

1. manual discipline only
   - agents follow the rule set without tooling
2. suggested diffs
   - agent or script prepares a compact patch for the active work item
3. narrow auto-apply
   - only `safe-replace` / `safe-compact` classes auto-write
4. expanded automation
   - consider broader file-back only after conflict rates stay low

## Success Criteria

- work items get shorter or stay flat as tasks progress
- repeated stale bullets decrease across handoffs
- agents spend less time reconstructing recent state from chat or noisy notes
- no append-only drift appears in `work/active/*.md`

## Next Steps

- decide the initial `auto-apply` boundary for `safe-replace`
- decide whether the first implementation lives as agent behavior or a local helper script
- align any future file-back implementation with the context-budget and deletion rules in `AGENTS.md`

## Exit Criteria

- the repository has a documented semi-auto `file-back` model with clear safety boundaries
- automatic updates are limited to compact current-state maintenance, not history logging
- future implementation work can start from one file without re-deriving the policy

## Handoff Checklist

- latest policy reflects current compressed-state rules
- next agent can explain what may auto-write and what must stay suggest-only
- unresolved implementation boundary questions remain in `Open Questions`
- no hidden dependency on chat context
