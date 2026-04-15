# W-0034 Context Overhead Reduction

## Goal

Adapt the Hermes context-overhead reduction pattern to WTD so multiple agents, packs, and memory lanes remain available without loading unnecessary context by default.

## Owner

contract

## Scope

- define narrow default context packs and late-bound expansion rules
- add preview-first loading rules for docs, tools, and memory lanes
- compact work-item and context-save/checkpoint outputs so state stays resumable without bloat
- keep the design aligned with existing governance and file-back rules

## Non-Goals

- implementing full Hermes runtime behavior or agentic search
- building automatic memory tiering or nightly maintenance
- changing app/engine ownership boundaries

## Canonical Files

- `AGENTS.md`
- `work/active/W-0000-template.md`
- `work/active/W-0031-agent-context-and-design-governance.md`
- `work/active/W-0032-semi-auto-file-back-design.md`
- `work/active/W-0034-context-overhead-reduction.md`
- `app/scripts/dev/context-save.sh`
- `app/scripts/dev/context-checkpoint.sh`
- external reference: `https://github.com/Reiunmute/hermes-context-overhead-reduction`

## Facts

- Hermes reduces overhead in three steps: narrow default loading, compact preview/on-demand lookup, and schema compaction
- this repo already has read-order, context-budget, and file-back rules but does not yet define explicit context packs
- context-save and checkpoint artifacts currently accept verbose free-form text unless manually kept short

## Assumptions

- WTD benefits more from narrow default loading than from adding more automatic retrieval
- owner and change type are sufficient to select a small default context pack for most turns

## Open Questions

- whether future helpers should materialize context packs as explicit commands or keep them as policy only
- whether memory lookup should default to `mk:brief` before any wider memkraft command

## Decisions

- Hermes should be translated into repository policy, not copied as a runtime architecture.
- WTD should support many possible docs/tools/packs but load only a narrow default set per execution unit.
- Preview-first and late-bound expansion are safer than broad default injection.
- Context-save and checkpoint outputs should compact by default, with explicit opt-out for full verbosity.

## Next Steps

- encode default context pack and late-bound pack rules in `AGENTS.md`
- add explicit max-bullet guidance to the work-item template
- make context-save and context-checkpoint compact by default

## Exit Criteria

- root operating rules define narrow default packs and expand-on-demand behavior
- active work items stay brief even when multiple packs exist in the repo
- saved context artifacts default to compact resumable output instead of verbose logs

## Handoff Checklist

- start from Hermes Phase A/B/C as policy translation, not runtime cloning
- preserve multi-agent capability while shrinking default payload width
- keep implementation limited to policy and artifact compaction unless a later work item expands scope
