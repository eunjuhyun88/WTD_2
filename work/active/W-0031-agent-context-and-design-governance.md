# W-0031 Agent Context and Design Governance

## Goal

Strengthen repository operating rules so multiple agents work with explicit design-first planning, disciplined context management, and durable handoff memory instead of relying on chat residue.

## Owner

contract

## Scope

- tighten `AGENTS.md` with explicit rules for design-before-action, context budgeting, and action gating
- translate MemKraft-style patterns into repository operating policy for multi-agent collaboration
- sync top-level entry docs so the same rules are visible from session start
- enforce the operating loop in the work item template so future tasks inherit it by default
- redesign branch/worktree policy so commit splitting does not accidentally become branch sprawl

## Non-Goals

- implementing new runtime memory infrastructure in `engine/` or `app/`
- redesigning current product or engine architecture
- changing existing app-engine ownership boundaries

## Canonical Files

- `AGENTS.md`
- `CLAUDE.md`
- `docs/decisions/ADR-000-operating-system-baseline.md`
- `work/active/W-0031-agent-context-and-design-governance.md`
- external reference: `https://github.com/seojoonkim/memkraft`

## Facts

- root governance rules were merged via PR `#31`
- the active work item template now enforces facts, assumptions, open questions, and handoff fields
- branch/worktree execution rules are now visible from root entry docs

## Assumptions

- future agents will follow the stricter template instead of relying on chat-only planning

## Open Questions

- whether future scaffolding helpers should auto-create the stricter work-item sections

## Decisions

- MemKraft is used here as an operating-pattern reference, not as a direct implementation dependency.
- The most valuable patterns for this repository are context-aware recall, explicit feedback loops, rejected-hypothesis retention, and health checks.
- Design-first behavior should be explicit in operating rules, not left as an implied habit.
- Template enforcement is higher leverage than policy text alone, so the work item template must require facts, assumptions, open questions, and handoff state.
- Context discipline also requires deletion rules: active work items should keep only the latest actionable state, not a running history.
- The default execution unit is one active work item on one execution branch in one worktree.
- The branch-thread rule must be visible in prompt-entry files, not only in deeper runbooks, so agents see it before acting.
- Commit splitting and branch splitting are separate decisions; branch creation should require a new merge unit, not ordinary progress on the same task.
- Branch pointers created only for archival or commit-range preservation should not be treated as active execution branches.

## Next Steps

- keep future multi-agent guardrail work aligned with the stronger operating loop
- reflect the same branch lifecycle rules in any future orchestration helpers or scaffolding tools

## Handoff Checklist

- root governance policy is merged and resumable from `AGENTS.md` plus this work item
- only helper-script follow-up remains open
- no hidden dependency on chat context

## Exit Criteria

- a new session can discover design-first and context-management rules directly from root docs
- multi-agent handoff expectations are written as repository policy rather than inferred from chat
- MemKraft-derived operating patterns are translated into repository-native rules with no boundary drift
- new work items inherit explicit fact/assumption/question/handoff fields by default
- branch creation conditions are explicit enough that agents do not create extra branches by default
