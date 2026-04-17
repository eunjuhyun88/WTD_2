# W-0086 Benchmark Pack And Refinement Runner

## Goal

Implement the first search/control-plane slice that turns saved reference cases into a benchmark pack and evaluates multiple pattern variants against that pack with replay-based scoring.

## Owner

engine

## Scope

- define a durable benchmark-pack contract for PTB/TRADOOR-style reference windows
- define a minimal pattern-variant contract for runtime search candidates
- implement a replay-based refinement runner that evaluates multiple variants against one benchmark pack
- persist search-run results so the next slice can promote winners instead of hand-editing one contract at a time
- keep the slice local to engine runtime, JSON artifacts, and targeted tests

## Non-Goals

- user overlay or preset UI
- full promotion automation
- LLM-based chart verbalization
- app routes or terminal surface work

## Canonical Files

- `AGENTS.md`
- `work/active/W-0086-benchmark-pack-and-refinement-runner.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/patterns/types.py`
- `engine/patterns/library.py`
- `engine/patterns/replay.py`
- `engine/patterns/scanner.py`
- `engine/research/state_store.py`
- `engine/research/worker_control.py`
- `engine/tests/test_patterns_replay.py`

## Facts

- runtime foundation now supports replay restore, score-based `ACCUMULATION`, and `phase_attempt` evidence
- real cached replay now restores `PTBUSDT` to `ACCUMULATION`, while `TRADOORUSDT` still stalls earlier
- the domain design already defines `ReplayBenchmarkPack`, `PatternVariant`, `SearchRun`, and promotion-oriented scoring criteria
- existing research state infrastructure already persists durable refinement runs, but it is currently model-training oriented rather than benchmark-pack search oriented
- the first real benchmark search run on `2026-04-17` completed as a durable `research_run` and artifact, with canonical/reference score `0.52` and TRADOOR holdout score `0.09`, so the current seed variants are still a dead end rather than a promotable winner
- the first 3 seed variants were too narrow and all produced effectively the same replay result, which means the current search surface is under-exploring earlier phase contracts
- after expanding to 6 variants, one holdout-oriented variant now reaches `ARCH_ZONE`, but the current search score still ties it with `FAKE_DUMP` outcomes because phase-depth progress is underweighted
- after phase-depth progress was added to the objective, `tradoor-oi-reversal-v1__arch-soft-real-loose` became the clear winner with reference `0.54` and holdout `0.14`, which is still below promotion floor but proves the search can now rank structurally better variants
- the latest dead-end artifacts now include per-case `failed_reason_counts` and `missing_block_counts`, so the next useful mutation source is the latest winner case evidence rather than broader manual seed expansion
- the first winner-following mutation lane now expands the search set from 9 to 11 variants by cloning the latest winner into direct holdout-unblock mutations, but the real run on `2026-04-17` still plateaued at `0.42` overall with the same winner, so the next gap is not “more variants” but “stronger mutation proposals from richer evidence”
- the first `REAL_DUMP proxy` mutation proved the runner can push holdout depth further than the winner, but it also collapsed reference precision (`0.24` overall), which means the next mutation lane must explicitly trade off depth gain against reference damage instead of only unblocking the next phase
- after adding precision-guarded mutation reuse, the runner now suppresses previously damaging mutation suffixes and replaces them with safer retries; the latest real run on `2026-04-17` promoted `tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded` to the top with `reference 0.54 / holdout 0.24 / overall 0.45`
- the current artifact still stores results but not full searched variant specs or explicit parent-relative deltas, so a mutation winner cannot yet become a fully reconstructable parent for the next generation without inference
- the search artifact now persists searched `variant_specs` and parent-relative `variant_deltas`, and the runner can choose a reconstructable productive branch as the next mutation anchor instead of blindly following the last absolute winner
- the first productive-branch anchor replayed successfully on `2026-04-17`, but it anchored off `canonical__mut-real-unlock` and still plateaued at the same `0.42` overall band, so branch continuity is solved while search quality is still flat
- the current anchor selector only inspects one latest artifact, so a flat recent run can overwrite a stronger prior lineage even when an older mutation branch had better holdout and overall performance
- mutation lineage is now reconstructable across recent artifacts, but the runner still lacks a family-level notion of which anchor branches actually produce good descendants versus merely preserving a decent parent score
- search artifacts now persist branch-level mutation health, and the runner uses that branch score when choosing anchors from history
- after the branch-health pass on `2026-04-17`, unhealthy nested canonical branches stopped compounding and mutation generation fell back to the latest absolute winner branch instead
- the latest real run (`2b8353d8-34b3-460a-a091-6af0653c95e2`) still plateaued at `reference 0.54 / holdout 0.14 / overall 0.42`, but it now makes the flatness explicit: the `arch-soft-real-loose` branch has `0 productive / 1 damaging / 2 flat` descendants and a negative branch score, so that branch should no longer be treated as an expansion frontier
- the reset lane is now active: when the latest winner branch is unhealthy, the next run skips mutation descendants and injects reset families instead
- the first reset-lane run (`057f2ea8-70be-4402-ac3c-930f7c887560`) replaced `mut-real-*` descendants with `reset-real-proxy-balance`, `reset-reclaim-compression`, and `reset-direct-accum`; `reset-reclaim-compression` matched the best prior dead-end band (`0.42`) while `reset-real-proxy-balance` reproduced the known precision collapse (`0.24`)
- the runner still compares these reset candidates only as individual variants, so it cannot yet say “stay in the reclaim/compression reset family” or automatically suppress a reset family that already proved damaging
- family-level search insights now persist for `manual`, `auto_evidence`, `mutation_branch`, and `reset_lane` families, so the control plane can compare families directly instead of only raw variant winners
- after the history-aware reset-family pass on `2026-04-17`, the runner now keeps `reset-reclaim-compression` alive across runs while pruning the known-damaging `reset-real-proxy-balance`; the latest real run (`d176e894-120d-4144-89b1-a433cee159c6`) evaluated 11 variants instead of 12 and stayed on the reset lane without bouncing back into mutation descendants
- the current control plane still infers the active exploration lane from recent `family_insights`; it does not yet persist an explicit `active_family` decision into search artifacts or handoff metadata
- the family-promotion pass now persists `active_family_key/type/variant_slug` into the search artifact, selection metrics, and run handoff payload; the latest real run (`f441cbab-5c45-448c-a29d-4d5b8b4bae2b`) still chose `arch-soft-real-loose` as the raw winner but explicitly promoted `reset-reclaim-compression` as the active family
- dead-end memory now stores family-level outcomes and promoted baseline family refs, but `build_search_variants()` still prefers live artifacts and does not yet treat negative memory as a fallback control-plane source when artifacts are absent
- `build_search_variants()` now reconstructs a synthetic control-plane artifact from negative memory when live search artifacts are absent, so promoted reset-family continuity survives artifact loss
- `run_pattern_bounded_eval()` now inherits the latest completed run's `baseline_family_ref` as its default `baseline_ref`, so benchmark-search family promotion affects downstream refinement without manual wiring
- refinement reporting and train handoff now surface `baseline_family_ref`, so promoted family provenance survives through operator reports and training payloads
- the new `pattern-search-refinement-once` control-plane bridge now runs benchmark-search and bounded refinement back-to-back, carrying the promoted family baseline and upstream search lineage into the refinement handoff payload and report path
- when the bridged bounded-refinement run clears into `train_candidate`, the one-shot control-plane path now executes train handoff immediately and preserves both family baseline provenance and upstream search lineage in the resulting payload
- active reset-family expansion is now live: when `reset_lane` is promoted, `build_search_variants()` generates child variants from that family; the latest real run (`de1fcf3e-f8f0-43fe-96df-f8c2819e1256`) expanded the search width to 13 and surfaced `reset-reclaim-compression__fam-reclaim-window`/`__fam-reclaim-bias` as real evaluated candidates, with the control plane promoting `__fam-reclaim-window` as the next active family even though the raw winner still plateaued at `0.42`
- promoted-family descendants now carry explicit `selection_bias`, and recent active-family continuity only applies inside a narrow stickiness band; the latest real run (`309d644b-10f0-40dd-ba49-eda001683260`) promoted `reset-reclaim-compression__fam-reclaim-bias` as the active family even though replay scores were still tied, which means the control plane can now move on evidence-aligned priors rather than slug ordering
- reset-family expansion now normalizes to the reset root family before generating children, so active reset descendants no longer deepen into unbounded `__fam-*__fam-*` lineages
- family promotion heuristics are now explicit in `FamilySelectionPolicy`, persisted in search policy, search artifacts, and handoff metrics instead of being implicit constants only inside selection code
- benchmark-pack search is still effectively `1h`-only even though the contract already carries `candidate_timeframes`, so the next core slice is to connect that field to actual variant generation and replay evaluation for higher timeframe families
- benchmark search now expands real `1h/4h` variant families and evaluates them durably, but the first `4h` run underperformed sharply because cloned `1h` contracts kept `1h` bar windows, warmup depth, and lead-time scoring semantics instead of preserving wall-clock intent
- after wall-clock normalization, `4h` family scores improved for the best coarse variant (`arch-soft-real-loose__tf-4h` moved into the `0.166667` band), but timeframe clones are still polluting mutation-branch insights because `__tf-*` variants are being treated as descendants instead of a separate family axis
- `__tf-*` clones are now tagged with `search_origin="timeframe_family"` at expansion time, grouped under one `{base_slug}__tf-family` insight per root variant, and excluded from `select_active_family_insight`; the real run on `2026-04-18` (artifact `7e7aba5f-d3ce-4279-81d8-089eebb7ebf8`) shows `family_types = {auto_evidence, manual, mutation_branch, reset_lane, timeframe_family}`, no `__tf-*` entries in `variant_deltas`, and the mutation-branch axis stays anchored on real 1h lineage
- search runs now emit a `timeframe_recommendations` surface that compares each `timeframe_family` best-clone against its 1h parent and classifies the swing as `upgrade`, `keep`, or `avoid`; the real run on `2026-04-18` (artifact `c13d5d25-5bc4-4868-a8ac-96c25aeada00`) emitted 13 recommendations, all classified `avoid` with deltas from `-0.073` (`reset-real-proxy-balance`) to `-0.253` (`arch-soft-real-loose`, `reset-reclaim-compression`), which converts the earlier assumption that "4h clones underperform at current benchmark" into a persisted structural fact rather than an inferred hunch
- `PatternVariantSpec` now carries a `duration_scale` axis (0.5 / 1.0 / 2.0) that rescales each phase's `min_bars`, `max_bars`, and `transition_window_bars` at build time, without cross-producting with the timeframe axis; search now evaluates `duration_family` variants as a separate axis and emits `duration_recommendations` paralleling the timeframe surface
- the real run on `2026-04-18` (artifact `9128d385-ca46-4d27-99f2-7e9d7a487491`) expanded from 16 to 48 variants (6 manual + 12 timeframe_family + 2 auto_evidence + 4 reset_lane + 24 duration_family) and emitted 12 duration recommendations, all classified `keep` with delta `±0.000`, which establishes that the current 0.5x / 2.0x duration scaling does not move replay scores on the current benchmark cases and tells the next search to widen the duration scales or attach duration-sensitive scoring rather than re-explore 2x bands
- search runs now build an explicit `PromotionReport` against a `PromotionGatePolicy` (`promotion-gate-v1`) using six design-spec gates (`reference_recall`, `phase_fidelity`, `lead_time_bars`, `false_discovery_rate`, `robustness_spread`, `holdout_passed`); the report is persisted on the artifact and its decision is carried into run metrics and handoff payload (`promotion_decision`, `promotion_report_id`, `promotion_rejection_reasons`)
- the real run on `2026-04-18` (artifact `47515075-699e-484b-b102-a28c9daf9ccf`) rejected winner `reset-real-proxy-balance__dur-long` because `false_discovery_rate=1.0` (every reference entry hit ACCUMULATION but none reached BREAKOUT) and `holdout_passed=False`, even though search aggregate scores looked competitive; this proves the gate catches structural defects the scalar search score would otherwise have promoted, which is exactly the core-loop responsibility the design assigns to promotion
- the runner handoff now carries `promoted_variant_slug` and `promoted_family_ref`, populated only when `promotion_decision == "promote_candidate"`; `_derive_baseline_ref` in `pattern_refinement.py` prefers runs with a promoted_family_ref over legacy `baseline_family_ref`, and refinement reporting surfaces the promotion decision plus rejection reasons
- the real run on `2026-04-18` (artifact `991cc99c-6f83-40ef-8d14-4463593a5e3f`) again rejected its winner (`arch-soft-real-loose`) with `phase_fidelity 0.400 < 0.500`, `false_discovery_rate 1.000 > 0.400`, and `holdout_passed=False`, and wrote `promoted_variant_slug=None`/`promoted_family_ref=None` while preserving the legacy `baseline_family_ref` so downstream refinement still flows under backward compat until a variant actually clears the gate
- BREAKOUT phase now uses quant-anchored blocks in place of the raw `volume_spike(5x)` / `oi_change(10%/1h)` pair: `breakout_above_high` (5-day lookback, Park & Irwin 2007; Hudson & Urquhart 2021), `breakout_volume_confirm` (2.5x avg volume, Edwards & Magee 1948; Murphy 1999; Baur & Dimpfl 2018), and `oi_expansion_confirm` (5% OI over 24h, Bessembinder & Seguin 1993; Wang & Yau 2000). Each new block ships with a module docstring citing the literature trail, so the threshold change is traceable rather than magic-numbered.
- H1 (breakout_above_high 5d), H2 (breakout_volume_confirm 2.5x), H3 (oi_expansion_confirm 5%/24h) are each quant-grounded but collectively still dead-end on the current benchmark pack: the real run on `2026-04-18` (artifact `7855762f-7873-4326-b9bf-eef1c2d2da71`) kept `false_discovery_rate=1.0` with zero `target_hit` across all 48 evaluated variants. Direct trace on `PTBUSDT` full history (5406 bars, Sep 2025 - Apr 2026) shows the three blocks only fire together on a single bar (`2026-04-14 12:00 UTC`), which is `2h earlier` than the replay's `REAL_DUMP` detection (`2026-04-14 13:00 UTC`) and `ACCUMULATION` entry (`2026-04-14 14:00 UTC`); post-ACCUMULATION the block triple never fires again inside the 23h residual window at any lookback from 1d to 5d. `TRADOORUSDT` has `0` `breakout_above_high` hits in its entire 90h case window.
- Root cause is therefore temporal anchoring, not threshold calibration: rolling-window breakouts catch the pre-dump final rally, not the post-accumulation Sign-of-Strength break that Wyckoff (1911; Pruden 2007) and Weis & Wyckoff (2013) define relative to the accumulation range. Threshold tuning inside the rolling-window family is a confirmed dead end; the next architecturally-different move is a phase-anchored breakout block that uses the `REAL_DUMP` / `ACCUMULATION` transition as its reference point.
- H4 (phase-anchored Wyckoff Sign-of-Strength) is now live: new block `breakout_from_pullback_range` anchors the breakout reference to the most recent rolling low with a minimum-drawdown depth filter (Wyckoff 1911; Pruden 2007; Weis & Wyckoff 2013). BREAKOUT phase was restructured: `required_blocks=[breakout_from_pullback_range, oi_expansion_confirm]` with `breakout_volume_confirm` relegated to `optional_blocks`, anchored in crypto-specific asymmetric-volume literature (Koutmos 2019 on Bitcoin volume-return asymmetry; Easley, López de Prado & O'Hara 2021 on flash-crash microstructure showing recovery volume lower than crash volume). On the TRADOOR benchmark window the new block + OI confirmation fire together on 7 bars (2026-04-11 19:00-23:00 UTC), proving the architectural fix works; on the PTB window they fire only at 2026-04-14 12:00 UTC (pre-ACCUMULATION), confirming the PTB chart has no post-ACCUMULATION breakout event inside its 60h case window regardless of block calibration.
- Real run `db8e9f83-9e7e-4fbd-838d-32832c3b726a` on `2026-04-18` therefore still rejects its winner with `FDR=1.0` / `holdout_passed=False`, but the dead-end is now localised to two separable root causes rather than one opaque defect: (A) PTB case window is structurally undersized / the pattern is an in-progress setup that has not yet broken out within the available data (breakout engine cannot fire what data does not contain); (B) TRADOOR replay stalls at `FAKE_DUMP` and never reaches `ACCUMULATION`, so even with seven valid SOS+OI co-firing bars available later in its window, the state machine cannot advance through to BREAKOUT — this is a FAKE_DUMP→ARCH_ZONE transition defect, not a BREAKOUT defect.

## Assumptions

- the first benchmark pack can be file-backed JSON without introducing another database table
- the first runner can stay single-pattern-family and native-timeframe only; timeframe-family expansion comes later

## Open Questions

- whether benchmark-pack search runs should persist through existing `research/state_store.py` immediately or first via a dedicated JSON artifact store
- whether variant generation should start from explicit overrides only or also clone-and-mutate the canonical library contract automatically

## Decisions

- keep benchmark-pack persistence lightweight in Phase 2 so search semantics can stabilize before broader control-plane integration
- evaluate variants by replaying whole windows and scoring phase fidelity, entry recall, and lead-time oriented signals
- start with PTB/TRADOOR references and explicit variant overrides rather than generic mutation search
- reuse `research/state_store.py` only for bounded run lifecycle and selection/memory state; keep benchmark packs and full search-run artifacts in dedicated JSON stores
- keep the first runner native-timeframe only and seed it with explicit manual variants derived from the canonical TRADOOR family contract
- expand the next variant family across `ARCH_ZONE`, `REAL_DUMP`, and `ACCUMULATION`, not only accumulation scoring, because TRADOOR currently stalls before the later phase logic matters
- persist dead-end benchmark outcomes as explicit negative-result memory artifacts so flat search regions are queryable without re-running the same bad family
- update search scoring to reward deeper expected-phase progress so structurally better holdout variants can separate before they hit full `ACCUMULATION`
- use the latest winner artifact as the primary mutation anchor for the next refinement lane so new variants follow the furthest-reaching holdout path instead of only replaying generic evidence templates
- persist enough search metadata that a mutation winner can become the exact parent of the next mutation generation, not just a slug hint
- treat mutation branches as first-class search objects by scoring descendant improvement-per-damage at the branch level and using that score in the next anchor selection pass
- when a historical anchor branch has non-positive branch health, do not keep deepening its lineage; fall back to the current winner branch so search does not compound stale nested mutations
- when the latest winner branch itself is flat or damaging, stop generating more descendants from that branch in the next run and switch the search surface into a reset family instead
- keep reset families explicit in artifacts so the next slice can compare reset-lane families against prior mutation families instead of only comparing individual variant scores
- persist family-level search insights so the control plane can compare `manual`, `auto_evidence`, `mutation_branch`, and `reset_lane` families directly and prune known-bad families on the next run
- when recent history contains a viable reset family that ties or beats the latest family score, prefer that reset family as the active exploration lane over retrying stale mutation branches
- persist an explicit promoted `active_family` alongside the winner variant so future runs can reuse family intent directly instead of inferring it only from prior family rankings
- when viable families tie inside the top score band, preserve the recent active family if it still qualifies; otherwise prefer family type priority `reset_lane > manual > auto_evidence > mutation_branch`
- handoff metadata should expose both the raw winner variant and the promoted baseline family ref because downstream refinement may intentionally follow the family instead of the current winner variant
- when search artifacts are missing or compacted, the latest negative memory entry should be sufficient to reconstruct reset-lane continuity and promoted family baseline intent
- downstream bounded refinement should default to the latest promoted family baseline before falling back to model-registry baselines
- training/reporting lanes should preserve promoted family provenance so operators can trace which family baseline produced a candidate model
- the next control-plane slice should bridge `pattern-benchmark-search` into bounded refinement automatically, with the refinement run inheriting the search-promoted family baseline and recording the upstream search run in its handoff payload
- when a `reset_lane` family is promoted as the active exploration lane, the next search should generate descendants from that reset family instead of only preserving it as a static baseline
- when replay scores tie across promoted-family descendants, the control plane should use explicit evidence-aligned selection bias to break ties instead of falling back to incidental slug ordering
- family promotion policy should be explicit and persisted, not inferred from scattered constants in selection code
- higher-timeframe variants should preserve wall-clock semantics by scaling bar-count windows, warmup context, and lead-time normalization instead of reusing native `1h` counts unchanged
- timeframe-family expansion and mutation lineage are separate axes; `__tf-*` clones must not degrade branch health or family ranking as if they were mutation descendants

## Next Steps

The current FDR=1.0 dead end tells us threshold-level tuning on rolling-window blocks is confirmed flat. Applying the Paradigm autoresearch playbook (parallel hypothesis testing + reset lane + multi-seed robustness), the next move is **three concurrent architectural hypotheses**, not another threshold sweep:

H4 (phase-anchored Wyckoff SOS) landed and is architecturally correct (7 valid SOS+OI co-firing bars on TRADOOR), but FDR is still 1.0 because two separable root causes remain. Both must be addressed; H5 and H6 are now reframed around these specific defects.

1. **H7 (FAKE_DUMP stall diagnosis)** — TRADOOR replay stalls at `FAKE_DUMP` for the entire 90h case window even though post-dump SOS+OI fire correctly later. Diagnose which required block of `ARCH_ZONE` (`sideways_compression`) or `FAKE_DUMP`'s advance logic (min_bars, transition_window) is the upstream bind on real TRADOOR data. Until this is fixed, the engine cannot even reach BREAKOUT on TRADOOR so no H4-era block can matter.
2. **H5 (benchmark window repair)** — PTB post-ACCUMULATION 23h residual window contains no SOS hits and no vol hits at any calibration: the PTB chart simply has no post-ACCUMULATION breakout event inside the available 60h case. Either extend PTB end-date beyond 2026-04-15 12:00 UTC and confirm a breakout appears later, or replace PTB with a closed pattern instance where FAKE_DUMP→...→BREAKOUT is already complete. H5 now specifically means "reconstruct the PTB benchmark case to be a complete setup", not just "add hours".
3. **H6 (multi-symbol benchmark)** — add 3-5 more reference + holdout symbols (e.g. AAVE, 1000PEPE, WIF during recent short-squeeze windows) that are fully-closed cycles, so promotion robustness is evaluated across regimes, not just on PTB's single in-progress instance. Paradigm-style multi-seed coverage: the analogue of "3200 simulations across 16 seeds".

Run H7, H5, H6 in parallel; H7 is the upstream bind so it is the first to verify. Preserve dead-end evidence for each.

4. Introduce a Managed Default plane that listens for `promotion_decision="promote_candidate"` and updates the rule-first canonical default, so once at least one hypothesis clears the gate the promoted variant actually becomes the production baseline.
3. Decide whether family-level promotion deserves first-class persistence in `research_state_store` instead of only run payloads.
4. Keep sub-hour search blocked on finer raw cache support instead of piggybacking on 1h resampling.
5. Decide whether `avoid`-classified timeframe recommendations should feed back into `build_search_variants` to prune known-damaging timeframe clones on the next run, so dead-end 4h variants stop burning replay budget.
6. Widen the duration-family scale set or attach duration-sensitive scoring (e.g. lead-time-per-phase weight) now that the first 0.5x / 2.0x pass proved flat across all 12 base variants on the current benchmark; continuing to explore only 2x bands is a confirmed dead end for the current benchmark pack.
7. Decide whether a structurally-diverse runner-up should be preserved alongside the raw winner so ties (like the current duration-family flat landscape) don't collapse exploration into a single path.

## Exit Criteria

- the engine can load a benchmark pack and evaluate multiple variants against it
- search-run output explains which variant best matches the reference paths
- targeted tests pass and the first real benchmark run produces durable artifacts

## Handoff Checklist

- this slice is engine-only search/control-plane groundwork
- runtime authority remains the rule-first pattern engine
- promotion and UI follow only after benchmark-pack search results are durable
