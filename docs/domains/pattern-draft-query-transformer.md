# Domain: Pattern Draft / Query Transformer

## Goal

Define the canonical architecture for:

`human note / chart evidence / image note -> AI parser -> PatternDraft -> engine QueryTransformer -> SearchQuerySpec -> seed search / benchmark / ledger`

This document exists to make the parser stage real without turning the LLM into backend truth.

## Problem Restatement

The repository already has strong engine-side search/runtime/ledger pieces, but the system still starts too late.

Current reality:

- `research_context` can store structured founder notes.
- `manual_hypothesis` can become a benchmark-pack draft and benchmark search run.
- phase truth is rule-first and persisted by the engine.
- human verdicts already flow back into the ledger and refinement lanes.

What is missing is the front door:

- free-form trader language is not yet converted into a canonical object
- the live agent path still mixes chat, app-owned market analysis, and search orchestration
- there is no enforced contract between parser output and deterministic search input

Without that boundary, the system risks becoming a clever assistant instead of a repeatable research/search engine.

## Design Principles

1. `engine/` remains the only backend truth.
2. LLM output is never market truth; it is a structured hypothesis only.
3. Parser and review are different agent roles with different success metrics.
4. `PatternDraft` is auditable and replayable; it must be stored exactly as emitted.
5. `SearchQuerySpec` is deterministic and versioned; it must be materialized by engine code, not by the parser.
6. search ranking combines feature, sequence, and optional text/chart similarity, but phase truth remains rule-first.
7. live chat must consume bounded context and canonical search results, not raw provider fan-out.

## Role Split

### 1. Parser Agent

Purpose:

- turn free-form founder notes into canonical structure

Allowed inputs:

- note text
- chart selection metadata
- image references
- bounded symbol/timeframe hints

Allowed output:

- `PatternDraft` only

Forbidden responsibilities:

- provider fetch
- threshold invention beyond explicit ambiguity reporting
- search execution
- verdict truth

Optimization target:

- structure recall
- vocabulary adherence
- schema validity
- ambiguity surfacing

### 2. QueryTransformer

Purpose:

- translate `PatternDraft` into deterministic `SearchQuerySpec`

Owner:

- engine search plane

Responsibilities:

- signal vocabulary lookup
- signal-to-rule registry application
- phase ordering / window hints
- exclusion rules
- version stamping (`transformer_version`, `signal_vocab_version`, `rule_registry_version`)

Optimization target:

- determinism
- reproducibility
- explainability

### 3. Search Engine

Purpose:

- run feature retrieval, sequence retrieval, and candidate ranking

Owner:

- engine search plane

Responsibilities:

- prefilter on required signals
- phase-path alignment
- corpus-first retrieval
- benchmark / historical replay
- candidate report persistence

### 4. Review Agent

Purpose:

- summarize current search/candidate/runtime context for the operator

Allowed inputs:

- bounded `AgentContextPack`
- current search result summary
- runtime selection summary
- verdict inbox context

Forbidden responsibilities:

- mutating search truth
- inventing missing search artifacts
- direct raw-provider market analysis for parser/search turns

### 5. Ledger / Runtime State

Purpose:

- own verdict truth, refinement evidence, and replay/audit history

Owner:

- engine runtime plane + ledger plane

Responsibilities:

- store captures
- store parser output audit trail
- persist search artifacts and verdicts
- provide calibration evidence for later threshold/rule updates

## Canonical Objects

### PatternDraft

`PatternDraft` is the exact parser output and the only contract allowed across the parser boundary.

Minimum shape:

```python
PatternDraft = {
  "schema_version": 1,
  "pattern_family": str,
  "pattern_label": str | None,
  "source_type": str,
  "source_text": str,
  "symbol_candidates": list[str],
  "timeframe": str | None,
  "thesis": list[str],
  "phases": list[PhaseDraft],
  "trade_plan": dict,
  "search_hints": dict,
  "confidence": float | None,
  "ambiguities": list[str],
}
```

`PhaseDraft` must include:

- `phase_id`
- `label`
- `sequence_order`
- `signals_required`
- `signals_preferred`
- `signals_forbidden`
- optional evidence text / importance / time hints

### ParserMeta

Stored alongside `PatternDraft` for audit:

```python
ParserMeta = {
  "parser_role": "pattern_parser",
  "parser_model": str,
  "parser_prompt_version": str,
  "pattern_draft_schema_version": int,
  "signal_vocab_version": str,
  "confidence": float | None,
  "ambiguity_count": int,
}
```

### SearchQuerySpec

This is the deterministic search object owned by the engine.

```python
SearchQuerySpec = {
  "schema_version": 1,
  "pattern_family": str,
  "reference_timeframe": str,
  "phase_path": list[str],
  "phase_queries": list[PhaseQuery],
  "must_have_signals": list[str],
  "preferred_timeframes": list[str],
  "exclude_patterns": list[str],
  "similarity_focus": list[str],
  "symbol_scope": list[str],
  "transformer_meta": {
    "transformer_version": str,
    "signal_vocab_version": str,
    "rule_registry_version": str,
  },
}
```

Production `PhaseQuery` requirements:

- `required_numeric`
- `required_boolean`
- `preferred_numeric`
- `preferred_boolean`
- `forbidden_numeric`
- `forbidden_boolean`
- `sequence_order`
- `max_gap_bars` or equivalent phase-bridge hint

Reason:

- canonical search must compare ordered windows, not score all phases against one aggregated feature row.

## Signal Vocabulary and Rule Registry

The parser may only emit allowed signal names.

Examples:

- `oi_spike`
- `higher_lows_sequence`
- `funding_flip_negative_to_positive`
- `range_high_break`

The transformer owns the signal registry:

`signal -> rule set -> phase query`

Rules:

- thresholds are defaults, not parser-generated truth
- forbidden rules must support numeric and boolean forms
- registry changes require version bumps
- ledger verdicts later calibrate registry values, not parser prompts

## Persistence Model

### Capture / Runtime Plane

First migration step:

- keep existing `research_context` compatibility fields
- add exact parser output and parser metadata without lossy conversion

Recommended shape:

```python
research_context = {
  "source": ...,
  "pattern_family": ...,
  "thesis": ...,
  "phase_annotations": ...,
  "entry_spec": ...,
  "outcome_spec": ...,
  "research_tags": ...,
  "draft": PatternDraft,
  "parser_meta": ParserMeta,
}
```

Why additive first:

- existing `manual_hypothesis` routes and tests continue to work
- benchmark-pack builder can migrate incrementally from compatibility projections to `draft`
- parser audit is preserved exactly

### Search / Artifact Plane

`SearchQuerySpec` should be stored on:

- seed-search runs
- benchmark search runs
- candidate/promotion artifacts where relevant

It should not live only in:

- chat history
- app-local memory
- unversioned note blobs

## Current Code Mapping

What already exists:

- capture persistence accepts structured `research_context` in [engine/api/routes/captures.py](/Users/ej/Projects/wtd-v2/engine/api/routes/captures.py)
- app contracts already mirror that envelope in [app/src/lib/contracts/terminalPersistence.ts](/Users/ej/Projects/wtd-v2/app/src/lib/contracts/terminalPersistence.ts)
- benchmark-pack draft generation exists in [engine/research/manual_hypothesis_pack_builder.py](/Users/ej/Projects/wtd-v2/engine/research/manual_hypothesis_pack_builder.py)
- search/runtime/ledger already exist in `engine/research`, `engine/patterns`, and `engine/ledger`

What is missing:

- canonical `PatternDraft` contract
- parser metadata contract
- engine-owned `QueryTransformer`
- `SearchQuerySpec` persistence on search artifacts
- live agent cutover from app-owned `analyze_market` to parser/search/runtime flow

## Pipeline Definitions

### A. Founder Note -> Searchable Pattern

1. user submits free-form note, range, and optional images
2. parser agent emits `PatternDraft`
3. app/orchestration submits a canonical capture with `research_context.draft`
4. engine persists the capture and compatibility projection
5. engine derives benchmark-pack draft and/or `SearchQuerySpec`
6. search plane executes recent/historical retrieval
7. candidate results persist as search artifacts
8. review agent reads only bounded summaries via `AgentContextPack`

### B. Inline Seed Search Without Prior Capture

1. user selects a chart range
2. parser agent emits inline `PatternDraft`
3. app submits inline draft to engine search route
4. engine materializes `SearchQuerySpec`
5. engine persists the run artifact with transformer metadata
6. returned run summary can later be attached to runtime state if the user saves/promotes it

### C. Verdict / Refinement Loop

1. search candidates resolve into outcome-ready artifacts
2. user reviews valid / invalid / missed
3. verdict lands in ledger/runtime state
4. calibration/refinement uses verdicted evidence to tune rules, not to rewrite parser behavior ad hoc

## Agent Context Rule

The live terminal AI should not use one undifferentiated “market analysis agent” for every turn.

Target split:

- parser turns: `free text -> PatternDraft`
- search/report turns: `AgentContextPack -> explanation / verdict assist`

`AgentContextPack` may include:

- current symbol/timeframe
- bounded fact summary
- latest search summary
- selected candidate summary
- runtime/verdict context

It must not include:

- raw provider payloads
- full chart history
- unbounded search corpus blobs
- transient tool chatter

## Performance Model

### Parser Agent

Measure:

- valid-schema rate
- vocabulary adherence
- ambiguity capture rate
- human correction rate

Optimize for:

- consistency, not prose

### QueryTransformer

Measure:

- deterministic output for identical draft + registry version
- rule coverage by signal vocabulary
- explainable phase-query materialization

Optimize for:

- reproducibility

### Search Engine

Measure:

- candidate precision at top-k on verdicted cases
- near-miss recall
- search latency under corpus-first retrieval

Optimize for:

- useful retrieval quality under bounded cost

### Review Agent

Measure:

- operator throughput
- verdict completion rate
- reduction in manual comparison time

Optimize for:

- workflow speed, not market truth generation

## Migration Plan

### Slice 1: Contracts

- add shared schemas for `PatternDraft`, `ParserMeta`, `SearchQuerySpec`
- extend `research_context` additively
- keep current `phase_annotations` compatibility path

### Slice 2: Transformer

- add engine rule registry
- implement deterministic `QueryTransformer`
- persist `SearchQuerySpec` on search artifacts

### Slice 3: Search Integration

- make benchmark-pack and seed-search consume draft-derived specs
- use `must_have_signals` as prefilter before ranking
- add ordered phase/window matching rather than single-row aggregate scoring

### Slice 4: Live Agent Cutover

- route parser turns away from DOUNI market-analysis tools
- use parser output + engine search + bounded `AgentContextPack`
- keep review/explanation turns separate from parse turns

### Slice 5: Ledger Calibration

- use verdicted candidates to tune rule registry defaults
- keep parser prompt stable unless structure failure evidence demands change

## Final Rule

The parser is a translator.

The engine is the search and validation machine.

The ledger is the judge.

If any one of these responsibilities is collapsed back into the LLM, the system becomes harder to audit, harder to improve, and easier to imitate.
