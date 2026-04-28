---
name: W-0202 Readiness Checkpoint (2026-04-25)
description: W-0156 foundation verified complete. W-0202 (FeatureWindowStore search cutover) is READY FOR CODE with clear scope and design.
type: project
---

# W-0202 Readiness Checkpoint (2026-04-25)

## W-0156 Foundation Status: ✅ COMPLETE

**Merged to origin/main:**
- PR #250: canonical feature materialization plane (7e8b3416)
- PR #259: feature_windows dual-backend SQLite + Supabase (bce9e7d1)

**What W-0156 Delivered:**
- `engine/features/canonical_pattern.py` — 7 canonical features (oi_raw, oi_zscore, funding_rate_zscore, funding_flip_flag, volume_percentile, pullback_depth_pct, cvd_price_divergence)
- Feature materialization store (SQLite-backed, build-time enrichment infrastructure)
- FeatureWindowStore: 40+ dimensional signal availability at build phase

## W-0202 Ready to Execute

**Dependency satisfied:** FeatureWindowStore is now available to use as corpus enrichment source.

**Clear Scope:**
1. Create `engine/research/corpus_builder.py`
   - Function: `_materialize_feature_signals_into_corpus()`
   - Input: FeatureWindowStore + raw corpus window_ids
   - Output: corpus_signals table (window_id, signal_name, signal_value)

2. Modify `engine/research/pattern_search.py`
   - Layer A: prefer `corpus.signals` over search-time enrichment
   - Graceful fallback to legacy 3-dim signature if missing

3. Build-time enrichment (batch corpus rebuild)
   - No real-time updates (batch only)
   - Reduce search-time N+1 queries → 3-5x performance gain
   - Temporal sensitivity via window-based materialization

**Exit Criteria (Clear):**
- corpus_builder.py: 40+ signals baked into corpus_signals table
- pattern_search.py Layer A: reads corpus signals with fallback chain
- Corpus rebuild script + Cloud Scheduler integration
- A/B test (new corpus vs old) passes precision/recall gates

**Open Questions to Resolve:**
- Rebuild frequency: weekly or monthly?
- Historical enrichment scope: 1 year of patterns or recent only?
- Signal priority fallback: feature_snapshot → fw_enrichment → search_hints?

## Current Session Modifications

Updated `/Users/ej/Projects/wtd-v2/work/active/CURRENT.md`:
- Moved W-0156 from IN-PROGRESS → COMPLETE section
- Set W-0202 status to "READY FOR CODE" (dependency satisfied)
- Clarified dependency chain: W-0202 → W-0203 → W-0201 sequential order
- main SHA: 9681e298

## Next Agent Actions

1. **Decision point:** Resolve the 3 open questions above (corpus rebuild scope/frequency/fallback order)
2. **Branch:** Create `feat/w-0202-fws-cutover` from main
3. **Code:** Implement `corpus_builder.py` + modify `pattern_search.py`
4. **Verify:** pytest on new store tests + A/B comparison script
5. **Merge:** PR with clear performance benchmarks

**Why this matters:** Layer A search (W-0162) was upgraded to 40+ dims but still incurs search-time N+1 queries for corpus enrichment. W-0202 bakes those signals in at corpus build time, completing the search optimization loop. This is a prerequisite for W-0203 (performance baseline establishment).
