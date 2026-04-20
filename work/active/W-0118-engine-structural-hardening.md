# W-0118 Engine Structural Hardening

## Goal

Close all 6 structural gaps in the pattern engine identified during the 2026-04-21 audit.
Features are 95% done (80 building blocks, 16 patterns). Infrastructure durability is 40%.
This work item tracks the remaining structural closure in priority order.

## Owner

engine

## Scope

- Merge W-0035 (durable state — already done on branch)
- Gap 2: Pattern registry (JSON-backed, versioned)
- Gap 3: Split ledger planes (6 independent record types)
- Gap 4: Pattern-keyed ML model identity
- Gap 5: Save Setup → canonical capture plane closure
- Gap 6: App contract discipline audit

## Non-Goals

- No new building blocks or patterns
- No UI changes except what's required for capture event emission
- No ML training or model promotion

## Current Status (as of 2026-04-21)

| Gap | Description | Status | Branch/Location |
|-----|-------------|--------|-----------------|
| 1 | Durable pattern state (SQLite) | ✅ DONE — merged (PR #43, 572a53b8) | main |
| 2 | Pattern-keyed ML model identity | ✅ DONE — merged (entry_scorer.py:76-80) | main |
| 3 | Canonical pattern registry | ❌ NOT started | — |
| 4 | Split ledger planes (6 types) | 🟡 PARTIAL | append_* methods exist in store.py:434–601 |
| 5 | Save Setup → capture plane | 🟡 PARTIAL | append_capture_record exists in store.py:476–497; no app→engine call |
| 6 | App contract audit | 🟡 PARTIAL | Current patterns/* routes are clean; domain doc flags historical drift |

## Canonical Files

- `engine/patterns/state_machine.py` — Gap 1 (hydrate_states, line 276 never called)
- `engine/patterns/library.py` — Gap 2 target
- `engine/ledger/types.py` — Gap 3 (PatternOutcome lines 19–144, 8 concerns in one type)
- `engine/ledger/store.py` — Gap 3/5 (append_* lines 434–601, append_capture_record lines 476–497)
- `engine/patterns/entry_scorer.py` — Gap 4 (get_engine call line 76 is generic)
- `engine/patterns/model_registry.py` — Gap 4 (PatternModelRegistryEntry lines 26–38 already has fields)
- `app/src/routes/api/patterns/+server.ts` — Gap 6
- `docs/domains/pattern-engine-runtime.md` — authoritative gap spec

## Slice Plan

### Slice 0 — W-0035 Foundation (P0, COMPLETED)

✅ **MERGED** (PR #43, commit 572a53b8): `PatternStateStore` SQLite layer now in main.
Durable pattern state, transition tracking, ledger linkage all in place.

### Slice 2 — Pattern-keyed ML Identity (P1, M) ✅ DONE

**File**: `engine/patterns/entry_scorer.py` line 76–80
**Implementation**:
```python
# Build pattern-keyed model identity: {pattern_slug}_{timeframe}_{target_name}_{fschema_v}_{lpolicy_v}
pattern_keyed_model_id = (
    f"{model_ref.pattern_slug}_{model_ref.timeframe}_{model_ref.target_name}"
    f"_{model_ref.feature_schema_version}_{model_ref.label_policy_version}"
)
engine = get_engine(pattern_keyed_model_id)
```
**Result**: Pattern-keyed LightGBM engine lookup now uses all 5 pattern-specific dimensions (pattern_slug, timeframe, target_name, feature_schema_version, label_policy_version) instead of generic model_key. 1193 tests pass.

### Slice 3 — Capture Plane Closure (P1, M) — NEXT

**Engine**: `append_capture_record()` exists (store.py:476–497) but never called from runtime
**App**: Need `POST /patterns/{slug}/capture` endpoint in engine API + SvelteKit proxy
**Closure**: capture_id → transition_id → outcome_id → verdict linkage

### Slice 4 — Pattern Registry (P2, M)

**File**: `engine/patterns/library.py` → `engine/patterns/registry.py`
**Schema**: `{ slug, version, phases[], entry_phase, target_phase, source, created_at }`
**library.py** becomes seeding mechanism on startup
**Benefit**: Versioning, rollback, user-defined patterns later

### Slice 5 — Split Ledger Planes (P2, L)

**Current**: One `PatternOutcome` type carries 8 concerns (types.py:19–144)
**Target**: 6 independent record types with shared outcome_id key
- EntryRecord, ScoreRecord, OutcomeRecord, VerdictRecord, ModelRecord, TrainingRunRecord
**Backward compat**: Keep PatternOutcome as view model assembled from split records

### Slice 6 — App Contract Audit (P3, S)

**Audit**: Scan all `app/src/routes/api/patterns/*` for synthetic fields, renamed fields, fabricated `since`
**Fix**: Move any view transforms to typed Svelte adapters; routes proxy engine envelopes

## Exit Criteria

- [x] W-0035 merged to main
- [x] Pattern-keyed model identity: entry_scorer.py uses pattern_slug+timeframe+target_name+fschema_v+lpolicy_v keyed engine (1193 tests pass)
- [ ] Capture plane: POST /patterns/{slug}/capture → append_capture_record → linked to ledger
- [ ] Pattern registry: JSON-backed registry with version field; library.py seeds on startup
- [ ] Ledger split: 6 independent record types in types.py; existing ledger tests pass
- [ ] App contract audit: no synthetic or renamed fields in patterns/* routes

## Handoff Checklist

- Active branch: (none — create per slice)
- W-0035 ready to PR immediately
- Tests: `uv run pytest` full suite must remain green after each slice
