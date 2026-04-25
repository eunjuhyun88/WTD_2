# Domain: Pattern Wiki Compiler

## Goal

Define the Karpathy-style wiki layer that turns raw trader memory into compact,
reviewable, engine-compilable pattern knowledge.

The purpose is not general note-taking. The purpose is to convert:

`trade diary / chart range / screenshot / telegram note / outcome export`

into:

`PatternWiki pages -> PatternDraft candidate -> SearchQuerySpec -> BenchmarkPack -> NegativeSet`

without letting the LLM become backend truth.

## Source Inspiration

This domain adapts the `LLM Wiki` operating pattern from:

- `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`

Applied rule:

- raw sources remain immutable
- the wiki is an LLM-maintained synthesis layer
- compiled artifacts are deterministic inputs to engine verification
- only engine verification can promote a claim to runtime truth

## Boundary

Owns:

- pattern memory organization
- source-to-wiki ingest rules
- wiki page schemas
- compile targets for parser/search/eval lanes
- lint rules for stale, unsupported, or contradictory claims

Does not own:

- phase truth
- market data truth
- search ranking truth
- outcome or verdict truth
- runtime promotion decisions

Those remain owned by `engine/` contracts, feature stores, search artifacts,
ledger records, and promotion gates.

## Layer Model

```text
L0. Raw Sources
  immutable source material from trader behavior and market evidence

L1. Pattern Wiki
  LLM-maintained markdown synthesis, cross-linked by pattern, phase, signal,
  reference case, negative case, and open question

L2. Compiler Artifacts
  deterministic JSON or markdown-derived payloads:
  PatternDraft, SearchQuerySpec, BenchmarkPack, NegativeSet

L3. Engine Verification
  replay/search/outcome/ledger validation inside engine-owned lanes
```

Design rule:

- `Pattern Wiki` is a compiler front-end.
- `engine/` is the validator and runtime authority.

## Recommended Repository Layout

First implementation should be file-backed and small.

```text
research/pattern_wiki/
  AGENTS.md
  raw/
    trade_diary/
    telegram_notes/
    screenshots/
    imported_captures/
    outcome_exports/
  wiki/
    index.md
    log.md
    patterns/
    phases/
    signals/
    cases/
    negatives/
    benchmark_packs/
  compiled/
    pattern_drafts/
    search_query_specs/
    benchmark_packs/
    negative_sets/
  reports/
    lint.md
    promotion-readiness.md
```

Reason:

- keeps mutable research memory out of `docs/`
- keeps unverified synthesis out of `engine/`
- lets verified artifacts later flow into `engine/research` and `engine/patterns`

## Page Types

Every wiki page must have frontmatter.

```yaml
---
kind: pattern | phase | signal | case | negative | benchmark_pack
id: stable-slug
status: draft | compiled | benchmarked | promoted | deprecated
definition_id:
source_count: 0
evidence_grade: weak | mixed | strong
last_compiled_at:
engine_verified: false
---
```

### Pattern Page

Required sections:

- `Thesis`
- `Phase Path`
- `Required Signals`
- `Preferred Signals`
- `Forbidden Signals`
- `Reference Cases`
- `Negative Cases`
- `Open Questions`
- `Engine Artifacts`
- `Contradictions`
- `Promotion Readiness`

Rule:

- no pattern page may be compiled without at least one reference case and one
  negative case, unless explicitly marked `evidence_grade: weak`.

### Phase Page

Required sections:

- `Meaning`
- `Entry Conditions`
- `Exit Conditions`
- `Timeout / Duration Hints`
- `Feature Bindings`
- `Common False Positives`
- `Related Cases`

Rule:

- phase language may be human-readable, but feature bindings must use canonical
  signal names from the engine vocabulary before compilation.

### Signal Page

Required sections:

- `Definition`
- `Canonical Feature Binding`
- `Used In Phases`
- `Threshold Defaults`
- `Known Ambiguities`
- `Engine Vocabulary Status`

Rule:

- the wiki cannot invent a new promoted signal. New signals require vocabulary
  migration in the engine-owned signal registry.

### Case Page

Required sections:

- `Source`
- `Chart Range`
- `Observed Phase Path`
- `Feature Snapshot Refs`
- `Outcome`
- `Verdict`
- `Why It Matters`

Rule:

- cases should store refs to captures, features, and search artifacts rather than
  copying large raw payloads into markdown.

### Negative Page

Required sections:

- `Looks Similar Because`
- `Fails Because`
- `Failed Signal / Phase`
- `Outcome / Verdict`
- `Reranker Use`

Rule:

- negative pages are first-class assets. They are not cleanup notes.

## Operating Workflow

### 1. Ingest

```text
raw source added
  -> source summary created
  -> related pattern/phase/signal/case/negative pages updated
  -> contradictions marked
  -> wiki/index.md refreshed
  -> wiki/log.md appended
```

Ingest output:

- updated wiki pages
- source refs
- unresolved ambiguities

No engine artifact is produced during ingest unless compile is explicitly run.

### 2. Compile

```text
pattern page
  -> PatternDraft candidate
  -> QueryTransformer input
  -> SearchQuerySpec
  -> BenchmarkPack
  -> NegativeSet
```

Compile output:

- `compiled/pattern_drafts/*.json`
- `compiled/search_query_specs/*.json`
- `compiled/benchmark_packs/*.json`
- `compiled/negative_sets/*.json`

Rule:

- compile should fail loudly if the wiki uses unknown signal ids, missing phase
  order, unresolved contradiction, or missing required source refs.

### 3. Verify

```text
compiled artifact
  -> engine search/replay/eval
  -> outcome and verdict artifacts
  -> wiki pages updated with engine results
  -> promotion readiness recomputed
```

Verification output:

- benchmark result refs
- search result refs
- outcome/verdict refs
- promotion readiness status

Rule:

- engine verification can reject wiki claims. The wiki must record the rejection
  instead of rewriting the claim as if it never existed.

### 4. Lint

Lint checks:

- orphan page
- stale claim with no source ref
- unknown signal id
- pattern without negative set
- case without outcome or verdict status
- benchmark pack without holdout case
- wiki claim contradicted by engine result
- compiled artifact older than source pages

Lint output:

- `reports/lint.md`

## Connection To Existing Engine Planes

The wider engine-strengthening method is defined in:

- `docs/domains/engine-strengthening-methodology.md`

```text
Pattern Wiki
  -> PatternDraft
  -> engine/research/query_transformer.py
  -> SearchQuerySpec
  -> engine/research/pattern_search.py
  -> Benchmark/Search Artifact
  -> engine/ledger and engine/runtime evidence
```

Capture refs should point at:

- `engine/capture/store.py` records

Feature refs should point at:

- `engine/features/materialization_store.py`
- `feature_windows`
- `search_corpus_signatures`

Definition refs should align with:

- `engine/patterns/definition_refs.py`
- `/runtime/definitions/*`

## First Slice

Work item:

- `W-0201-pattern-wiki-compiler`

Reference pattern:

- `tradoor-oi-reversal-v1`

Minimum first-slice artifacts:

- one pattern page
- four to five phase pages
- five to eight signal pages
- at least two reference cases
- at least two negative cases
- one compiled `PatternDraft`
- one compiled `BenchmarkPack`
- one lint report

First-slice non-goal:

- no UI
- no vector store
- no graph database
- no automatic engine promotion

## Promotion Rule

A pattern wiki entry can move from `compiled` to `benchmarked` only when:

- the compiled `PatternDraft` validates
- the compiled `SearchQuerySpec` uses known signal ids
- the benchmark pack has at least one reference case and one holdout or negative
  case
- engine search/replay has run and produced an artifact ref

A pattern wiki entry can move from `benchmarked` to `promoted` only when:

- promotion decision references an evaluation protocol
- positive and negative evidence are both retained
- rollback criteria are named
- the runtime pattern definition is engine-owned

## Final Rule

The wiki remembers and compiles.

The parser translates.

The transformer materializes deterministic search input.

The engine verifies.

The ledger judges.

If the wiki starts acting as truth, the loop becomes a note-taking system instead
of a pattern research operating system.
