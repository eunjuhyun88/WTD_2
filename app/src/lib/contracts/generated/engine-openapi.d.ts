// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: engine/scripts/export_openapi.py

export interface paths {
    "/chart/klines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chart Klines */
        get: operations["chart_klines_chart_klines_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/score": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Score
         * @description Compute features + ML score for the latest bar.
         */
        post: operations["score_score_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/deep": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Deep
         * @description Run all L2 market_engine indicators for a single symbol.
         */
        post: operations["deep_deep_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ctx/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ctx Status
         * @description Return a diagnostic snapshot of the current GlobalCtx cache.
         */
        get: operations["ctx_status_ctx_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ctx/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ctx Refresh
         * @description Force a full GlobalCtx refresh and return the updated summary.
         *
         *     This blocks until all L0 fetches complete (typically 3-8 seconds).
         *     Concurrent calls share the single in-flight request.
         */
        post: operations["ctx_refresh_ctx_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ctx/kimchi-premium": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ctx Kimchi Premium
         * @description Return current Kimchi Premium % (Upbit BTC/KRW vs Binance BTC/USDT × USD/KRW).
         *
         *     30s server-side cache (function-level). Returns zeros on fetch failure.
         *     Response: { premium_pct, source, usd_krw, ts }
         */
        get: operations["ctx_kimchi_premium_ctx_kimchi_premium_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ctx/fact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ctx Fact
         * @description Return a bounded engine-owned fact context for one symbol/timeframe.
         */
        get: operations["ctx_fact_ctx_fact_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/price-context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Price Context */
        get: operations["facts_price_context_facts_price_context_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/perp-context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Perp Context */
        get: operations["facts_perp_context_facts_perp_context_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/reference-stack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Reference Stack */
        get: operations["facts_reference_stack_facts_reference_stack_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/chain-intel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Chain Intel */
        get: operations["facts_chain_intel_facts_chain_intel_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/market-cap": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Market Cap */
        get: operations["facts_market_cap_facts_market_cap_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/confluence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Confluence */
        get: operations["facts_confluence_facts_confluence_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/facts/indicator-catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Facts Indicator Catalog */
        get: operations["facts_indicator_catalog_facts_indicator_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Catalog */
        get: operations["search_catalog_search_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/seed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search Seed */
        post: operations["search_seed_search_seed_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/seed/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Seed Result */
        get: operations["search_seed_result_search_seed__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search Scan */
        post: operations["search_scan_search_scan_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/scan/{scan_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Scan Result */
        get: operations["search_scan_result_search_scan__scan_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/query-spec/transform": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search Query Spec Transform */
        post: operations["search_query_spec_transform_search_query_spec_transform_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Search Similar
         * @description 3-layer pattern similarity search.
         *
         *     Layer A — feature signature distance (always active)
         *     Layer B — phase path LCS similarity (active when observed_phase_paths provided)
         *     Layer C — ML p_win from LightGBM (active when model is trained)
         */
        post: operations["search_similar_search_similar_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/similar/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Similar Result */
        get: operations["search_similar_result_search_similar__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/quality/judge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Search Quality Judge
         * @description Record a user judgement (good/bad/neutral) on a search candidate.
         *
         *     This feeds the weight recalibration loop: after _MIN_SAMPLES_FOR_RECALIBRATION
         *     judgements the blend weights for Layer A/B/C shift toward whichever layer
         *     has the higher user-validated accuracy.
         */
        post: operations["search_quality_judge_search_quality_judge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/quality/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search Quality Stats
         * @description Return per-layer accuracy stats and the current active blend weights.
         */
        get: operations["search_quality_stats_search_quality_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/captures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Runtime Captures */
        get: operations["list_runtime_captures_runtime_captures_get"];
        put?: never;
        /**
         * Create Runtime Capture
         * @description Create a canonical runtime capture.
         *
         *     This route reuses the existing CaptureRecord schema while moving new
         *     runtime consumers to the `/runtime` plane.
         */
        post: operations["create_runtime_capture_runtime_captures_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/captures/{capture_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Runtime Capture */
        get: operations["get_runtime_capture_runtime_captures__capture_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/definitions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Runtime Definitions */
        get: operations["list_runtime_definitions_runtime_definitions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/definitions/{pattern_slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Runtime Definition */
        get: operations["get_runtime_definition_runtime_definitions__pattern_slug__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/workspace/pins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Workspace Pin */
        post: operations["create_workspace_pin_runtime_workspace_pins_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/workspace/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Workspace */
        get: operations["get_workspace_runtime_workspace__symbol__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/setups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Setup */
        post: operations["create_setup_runtime_setups_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/setups/{setup_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Setup */
        get: operations["get_setup_runtime_setups__setup_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/research-contexts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Research Context */
        post: operations["create_research_context_runtime_research_contexts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/research-contexts/{context_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Research Context */
        get: operations["get_research_context_runtime_research_contexts__context_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/ledger/{ledger_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Ledger */
        get: operations["get_ledger_runtime_ledger__ledger_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Ledger */
        get: operations["list_ledger_runtime_ledger_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/universe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Universe
         * @description Return ranked token universe.
         *
         *     Query params:
         *         limit   : max tokens to return (default 200, max 500)
         *         sector  : sector filter (e.g. "DeFi", "AI", "Meme") — empty = all
         *         sort    : sort field — rank | vol | trending | oi | pct24h
         *         refresh : set true to force-rebuild the cache
         */
        get: operations["universe_universe_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/universe/sectors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sectors
         * @description Return list of distinct sectors in the current universe.
         */
        get: operations["sectors_universe_sectors_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/universe/search/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Market Search Status */
        get: operations["market_search_status_universe_search_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunity/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Run */
        post: operations["run_opportunity_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/backtest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Backtest
         * @description Run a portfolio backtest for the given block set over the universe.
         */
        post: operations["backtest_backtest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/challenge/create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Challenge
         * @description Register a new challenge from 1–5 reference snaps.
         */
        post: operations["create_challenge_challenge_create_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/challenge/{slug}/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Scan Challenge
         * @description Find current universe bars that match the saved challenge pattern.
         */
        get: operations["scan_challenge_challenge__slug__scan_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/train": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Train
         * @description Retrain LightGBM on new trade records.
         *
         *     Records with outcome == -1 (timeout / neutral) are excluded from
         *     training — only clear wins (1) and losses (0) are used.
         */
        post: operations["train_train_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/train/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Train Report
         * @description Model report endpoint with feature importance ranking.
         */
        get: operations["train_report_train_report_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/verdict": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verdict
         * @description Compute auto-verdict for a signal given subsequent bars.
         */
        post: operations["verdict_verdict_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanner/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Trigger Scan
         * @description Run a full scan cycle and optionally send Telegram alerts.
         */
        post: operations["trigger_scan_scanner_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/parse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Parse Pattern Text
         * @description Parse free-text trading memo → PatternDraftBody JSON via configured LLM.
         *
         *     AC: POST {"text": "OI가 급등하면서 가격이 하락했다"} → PatternDraftBody JSON
         */
        post: operations["parse_pattern_text_patterns_parse_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Patterns
         * @description List all patterns in the library.
         */
        get: operations["list_patterns_patterns_library_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/registry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pattern Registry
         * @description Return the JSON-backed pattern registry (versioned metadata per slug).
         */
        get: operations["get_pattern_registry_patterns_registry_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/active-variants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Active Variants
         * @description Return the effective active pattern variants used by live runtime.
         */
        get: operations["get_active_variants_patterns_active_variants_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/states": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get All States
         * @description Current phase (rich) for all tracked symbols across all patterns.
         */
        get: operations["get_all_states_patterns_states_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/transitions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Recent Transitions
         * @description Recent phase transitions, optionally filtered by symbol or pattern slug.
         *
         *     B4: Feeds the transitions panel on /patterns and /patterns/[slug] detail pages.
         */
        get: operations["get_recent_transitions_patterns_transitions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get All Candidates
         * @description Entry candidates across all patterns.
         */
        get: operations["get_all_candidates_patterns_candidates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/draft-from-range": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Draft From Range
         * @description Extract 12 features from a chart range and return a PatternDraftBody.
         *
         *     Accepts (symbol, start_ts, end_ts) and computes features over that window.
         *     Features unavailable from a single-symbol window (btc_corr, venue_div)
         *     are returned as null — this is not an error per spec.
         */
        post: operations["draft_from_range_patterns_draft_from_range_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Trigger Pattern Scan
         * @description Trigger a pattern scan cycle in background.
         */
        post: operations["trigger_pattern_scan_patterns_scan_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/stats/all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get All Stats
         * @description Bulk ledger stats for all patterns — avoids N+1 fan-out from callers.
         */
        get: operations["get_all_stats_patterns_stats_all_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/lifecycle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Lifecycle Statuses
         * @description Return lifecycle status for all known PatternObjects.
         *
         *     File-backed lifecycle records are sparse. Existing library patterns are
         *     production objects by default; explicit draft/candidate/archive records
         *     override that default.
         */
        get: operations["get_lifecycle_statuses_patterns_lifecycle_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Candidates
         * @description Entry candidates for a specific pattern.
         */
        get: operations["get_candidates_patterns__slug__candidates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/similar-live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Similar Live
         * @description Return current symbols ranked by pattern-state similarity for one family.
         */
        get: operations["get_similar_live_patterns__slug__similar_live_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/f60-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get F60 Gate Status
         * @description F-60 multi-period acceptance gate (L-3, R-05).
         *
         *     Returns:
         *         passed: bool — gate 통과 여부 (median≥0.55 AND floor≥0.40 AND count≥200)
         *         verdict_count: int — 누적 verdict 수 (all 5 cats included)
         *         remaining_to_threshold: int — 200까지 남은 수
         *         median_accuracy / floor_accuracy: float — W1/W2/W3 통계
         *         window_accuracies / window_counts: list — 30d 윈도우 3개 분포
         *         reason: "insufficient_data" | "insufficient_windows" | "failed_threshold" | "passed"
         *
         *     근거: Ryan Li 16-seed validation + Kropiunig $32 variance on identical code.
         *     Single-period accuracy 0.60이 multi-period 0.45보다 나쁠 수 있음 → median+floor.
         */
        get: operations["get_f60_gate_status_patterns__slug__f60_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Stats
         * @description Ledger statistics for a pattern. v3: includes ML shadow readiness.
         */
        get: operations["get_stats_patterns__slug__stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/pnl-stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pnl Stats
         * @description W-0365: Realized P&L statistics for a pattern slug.
         *
         *     Queries ledger_outcomes for pnl_bps_net + pnl_verdict.
         *     Returns preliminary=True if N < 30.
         */
        get: operations["get_pnl_stats_patterns__slug__pnl_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/training-records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Training Records
         * @description Preview canonical training rows derived from the ledger.
         */
        get: operations["get_training_records_patterns__slug__training_records_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/alert-policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alert Policy
         * @description Return current alert policy for a pattern.
         */
        get: operations["get_alert_policy_patterns__slug__alert_policy_get"];
        /**
         * Set Alert Policy
         * @description Update current alert policy for a pattern.
         */
        put: operations["set_alert_policy_patterns__slug__alert_policy_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/lifecycle-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Lifecycle Status
         * @description Return current lifecycle status for a pattern (draft/candidate/object/archived).
         */
        get: operations["get_lifecycle_status_patterns__slug__lifecycle_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Pattern Status
         * @description Transition pattern lifecycle status.
         *
         *     Allowed: draft→candidate|archived, candidate→object|archived, object→archived.
         *     Returns { ok, slug, from_status, to_status, updated_at }.
         *     Raises 422 on invalid transition, 404 if pattern not in library.
         */
        patch: operations["patch_pattern_status_patterns__slug__status_patch"];
        trace?: never;
    };
    "/patterns/{slug}/model-registry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Model Registry
         * @description Return the current registry snapshot for a pattern.
         */
        get: operations["get_model_registry_patterns__slug__model_registry_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/model-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Model History
         * @description Return training/model ledger history for a pattern.
         */
        get: operations["get_model_history_patterns__slug__model_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pattern Def
         * @description Return the pattern definition.
         */
        get: operations["get_pattern_def_patterns__slug__library_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/verdict": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set User Verdict
         * @description Set user_verdict on the most recent outcome for (slug, symbol).
         */
        post: operations["set_user_verdict_patterns__slug__verdict_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/capture": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Record Capture
         * @description Record a Save Setup capture event into the ledger capture plane.
         *
         *     Links the capture to a durable phase transition via candidate_transition_id
         *     so the full chain capture_id → transition_id → outcome_id → verdict is traceable.
         */
        post: operations["record_capture_patterns__slug__capture_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Auto Evaluate
         * @description v2: Auto-evaluate pending outcomes past their evaluation window.
         */
        post: operations["auto_evaluate_patterns__slug__evaluate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/train-model": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Train Pattern Model
         * @description Train a pattern-scoped model from durable ledger outcomes.
         */
        post: operations["train_pattern_model_patterns__slug__train_model_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/promote-model": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Promote Pattern Model
         * @description Promote a candidate model to active rollout state.
         */
        post: operations["promote_pattern_model_patterns__slug__promote_model_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Register Pattern
         * @description Register a user-defined pattern into the library.
         */
        post: operations["register_pattern_patterns_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/benchmark-pack-draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Benchmark Pack Draft
         * @description Build a benchmark pack from a capture and save it.
         */
        post: operations["create_benchmark_pack_draft_patterns__slug__benchmark_pack_draft_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/benchmark-search-from-capture": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Benchmark Search From Capture
         * @description Build benchmark pack and run a full benchmark search from a capture.
         */
        post: operations["run_benchmark_search_from_capture_patterns__slug__benchmark_search_from_capture_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/objects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Pattern Objects
         * @description List all seeded PatternObjects from Supabase.
         *
         *     ?phase=FAKE_DUMP  — filter by phase_id
         *     ?tag=oi_reversal  — filter by tag
         */
        get: operations["list_pattern_objects_patterns_objects_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/objects/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pattern Object
         * @description Get one PatternObject by slug.
         */
        get: operations["get_pattern_object_patterns_objects__slug__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/verify-paper": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify Paper
         * @description Run paper-trading verification for a pattern using recorded outcome ledger.
         */
        post: operations["verify_paper_patterns__slug__verify_paper_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/patterns/{slug}/backtest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pattern Backtest
         * @description Historical backtest stats for a pattern (W-0369 Phase 1).
         *
         *     ?tf=1h            — kline timeframe
         *     ?universe=default — comma-separated symbols, or "default" for DEFAULT_UNIVERSE
         *     ?since_days=365   — lookback window in days
         */
        get: operations["get_pattern_backtest_patterns__slug__backtest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Captures */
        get: operations["list_captures_captures_get"];
        put?: never;
        /**
         * Create Capture
         * @description Create a canonical capture record from Save Setup.
         */
        post: operations["create_capture_captures_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/bulk_import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bulk Import Captures
         * @description Cold-start lane: ingest N founder hypotheses in one call.
         *
         *     Every row becomes a ``manual_hypothesis`` CaptureRecord with
         *     ``status='pending_outcome'`` so outcome_resolver (scanner Job 3b)
         *     picks it up on the next window tick.
         */
        post: operations["bulk_import_captures_captures_bulk_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/outcomes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Verdict Inbox
         * @description Verdict Inbox — resolved captures awaiting user verdict.
         *
         *     Defaults to ``status='outcome_ready'`` (needs review). Pass
         *     ``status='verdict_ready'`` to inspect previously labelled items.
         */
        get: operations["list_verdict_inbox_captures_outcomes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/{capture_id}/verdict": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set Capture Verdict
         * @description Apply user verdict to a resolved capture.
         *
         *     Requires status in {'outcome_ready', 'verdict_ready'} — the capture must
         *     have a linked PatternOutcome. The verdict is written to the outcome
         *     record, appended to LEDGER:verdict, and the capture is flipped to
         *     ``status='verdict_ready'`` so it leaves the inbox.
         */
        post: operations["set_capture_verdict_captures__capture_id__verdict_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/{capture_id}/benchmark_pack_draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Capture Benchmark Pack Draft */
        post: operations["create_capture_benchmark_pack_draft_captures__capture_id__benchmark_pack_draft_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/{capture_id}/benchmark_search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Capture Benchmark Search */
        post: operations["create_capture_benchmark_search_captures__capture_id__benchmark_search_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/chart-annotations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Chart Annotations
         * @description Return capture markers formatted for TradingView chart overlay.
         *
         *     Poll at ~60s intervals. Each annotation includes price levels from
         *     chart_context so the frontend can render entry/stop/tp lines.
         *
         *     Response shape (one entry per capture):
         *       capture_id      — unique ID
         *       kind            — capture_kind
         *       status          — pending_outcome | outcome_ready | verdict_ready | closed
         *       pattern_slug    — e.g. "tradoor-oi-reversal-v1"
         *       phase           — e.g. "SPRING"
         *       captured_at_s   — unix seconds (chart x-axis anchor)
         *       entry_price     — from chart_context.entry_price (null if not set)
         *       stop_price      — from chart_context.stop (null if not set)
         *       tp1_price       — from chart_context.tp1 (null if not set)
         *       tp2_price       — from chart_context.tp2 (null if not set)
         *       eval_window_ms  — evaluation window in ms (for shading end x)
         *       p_win           — float 0–1 if recorded
         *       user_verdict    — "valid" | "invalid" | "near_miss" | "too_early" | "too_late" | null
         */
        get: operations["get_chart_annotations_captures_chart_annotations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/{capture_id}/watch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Watch Capture
         * @description Mark a capture as watching. Idempotent — calling twice is safe.
         */
        post: operations["watch_capture_captures__capture_id__watch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/{capture_id}/verdict-link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Verdict Deeplink
         * @description F-3: Generate a signed 72h deep-link token for Telegram verdict submission.
         *
         *     Token = HMAC-SHA256 signed payload (stateless, no DB write).
         *     The app /verdict?token=xxx validates and pre-fills the VerdictModal.
         */
        post: operations["create_verdict_deeplink_captures__capture_id__verdict_link_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/captures/{capture_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Capture */
        get: operations["get_capture_captures__capture_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/memory/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Memory Query */
        post: operations["memory_query_memory_query_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/memory/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Memory Feedback */
        post: operations["memory_feedback_memory_feedback_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/memory/feedback/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Memory Feedback Batch */
        post: operations["memory_feedback_batch_memory_feedback_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/memory/debug-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Memory Debug Session */
        post: operations["memory_debug_session_memory_debug_session_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/memory/rejected/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Memory Rejected Search */
        post: operations["memory_rejected_search_memory_rejected_search_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/screener/runs/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Latest Run */
        get: operations["latest_run_screener_runs_latest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/screener/listings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Listings */
        get: operations["listings_screener_listings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/screener/assets/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Asset Detail */
        get: operations["asset_detail_screener_assets__symbol__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/screener/universe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Filtered Universe */
        get: operations["filtered_universe_screener_universe_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/rag/terminal-scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Terminal Scan */
        post: operations["terminal_scan_rag_terminal_scan_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/rag/quick-trade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Quick Trade */
        post: operations["quick_trade_rag_quick_trade_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/rag/signal-action": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Signal Action */
        post: operations["signal_action_rag_signal_action_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/rag/dedupe-hash": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dedupe Hash */
        post: operations["dedupe_hash_rag_dedupe_hash_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live-signals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Live Signals
         * @description Return current live scan results (ACCUMULATION / REAL_DUMP candidates).
         *
         *     Results are cached for LIVE_SIGNAL_CACHE_TTL_SECONDS (default 1h) to
         *     avoid hammering the Binance API on every terminal load.
         */
        get: operations["get_live_signals_live_signals_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/live-signals/verdict": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Verdict
         * @description Record user verdict for a live signal.
         *
         *     Appends one JSON line to verdicts.jsonl.
         */
        post: operations["post_verdict_live_signals_verdict_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/observability/flywheel/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Flywheel Health */
        get: operations["flywheel_health_observability_flywheel_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/observability/agent-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Agent Status
         * @description Real-time harness observability — scheduler jobs + pattern scan state.
         *
         *     Feeds the /status page and CI canary checks.
         *     Returns scheduler job list + flywheel health without full KPI compute.
         */
        get: operations["agent_status_observability_agent_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dalkkak/gainers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gainers
         * @description 실시간 Binance Futures 상승률 상위 후보 유니버스.
         *
         *     딸깍 전략 원칙: 24h 상승률 + 변동성(ATR%) + 신규 상장 여부를
         *     composite score로 조합해 진입 우선순위를 결정.
         */
        get: operations["gainers_dalkkak_gainers_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dalkkak/positions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Positions
         * @description 단방향 가드에 등록된 현재 열린 포지션 목록.
         */
        get: operations["list_positions_dalkkak_positions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dalkkak/positions/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Open Position
         * @description 포지션 등록 — 단방향 원칙 검사 후 가드에 기록.
         *
         *     이 엔드포인트는 실제 주문 집행 후 호출한다.
         *     주문 집행 자체는 클라이언트 / 별도 자동매매 모듈이 담당.
         */
        post: operations["open_position_dalkkak_positions_open_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dalkkak/positions/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Close Position
         * @description 포지션 닫기 — 가드에서 제거.
         */
        post: operations["close_position_dalkkak_positions_close_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dalkkak/caption": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Caption
         * @description 트레이드 결과를 KOL 스타일 SNS 캡션으로 변환.
         *
         *     Claude API (ANTHROPIC_API_KEY) 없으면 plain text fallback.
         */
        post: operations["caption_dalkkak_caption_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dalkkak/risk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Risk Plan
         * @description 200 USDT 고정 손절 기반 포지션 플랜 계산.
         *
         *     진입가와 ATR을 받아서:
         *       - stop 가격 (1.5 ATR, 최대 200U 손실 제한)
         *       - 포지션 크기 (코인 수)
         *       - 목표가 (3:1 R/R)
         *     를 반환.
         */
        get: operations["risk_plan_dalkkak_risk_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/world-model": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha World Model
         * @description Return current phase state for all Alpha Universe symbols.
         *
         *     Optionally filter by watchlist grade (A / B / all).
         */
        get: operations["get_alpha_world_model_alpha_world_model_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/token/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha Token Detail
         * @description Return detailed state for one Alpha Universe token.
         */
        get: operations["get_alpha_token_detail_alpha_token__symbol__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/token/{symbol}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha Token History
         * @description Return phase transition history for one symbol.
         */
        get: operations["get_alpha_token_history_alpha_token__symbol__history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/anomalies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha Anomalies
         * @description Return anomaly queue. By default returns unreviewed anomalies.
         */
        get: operations["get_alpha_anomalies_alpha_anomalies_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/watch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Alpha Watch
         * @description Register a user watch on a symbol/phase combination.
         */
        post: operations["post_alpha_watch_alpha_watch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/find": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Alpha Find
         * @description Ad-hoc multi-condition token filter across the Alpha Universe.
         *
         *     Each condition can be:
         *       - block:  name of a block in _BLOCKS (fires True/False on latest bar)
         *       - feature: raw column + op + value comparison on the latest features row
         *
         *     Returns symbols where at least min_match conditions are met.
         */
        post: operations["post_alpha_find_alpha_find_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/scroll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha Scroll
         * @description Scroll segment analysis: indicator snapshot + anomaly flags + similar segments.
         *
         *     Trigger: chart scroll event stops on a time range.
         *     Returns segment analysis + alpha composite score + top-K similar historical windows.
         *     Cache: 5min (same symbol+from+to+tf).
         *     Timeout: 3s.
         */
        get: operations["get_alpha_scroll_alpha_scroll_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/alpha/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha Scan
         * @description Compute Alpha composite scores for a list of symbols or the full universe.
         *
         *     ?symbols=ETHUSDT,BTCUSDT  — specific symbols
         *     ?universe=all             — full 3-source alpha universe
         *     Returns scores sorted descending.
         */
        get: operations["get_alpha_scan_alpha_scan_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refinement/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get All Stats
         * @description Return performance stats for all registered patterns.
         */
        get: operations["get_all_stats_refinement_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refinement/stats/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pattern Stats
         * @description Return detailed stats for a single pattern slug.
         */
        get: operations["get_pattern_stats_refinement_stats__slug__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refinement/suggestions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Suggestions
         * @description Return actionable threshold suggestions for all patterns with data.
         */
        get: operations["get_suggestions_refinement_suggestions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refinement/leaderboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Leaderboard
         * @description Rank patterns by expected value (EV = win_rate * avg_gain + loss_rate * avg_loss).
         */
        get: operations["get_leaderboard_refinement_leaderboard_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/features/window": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Feature Window
         * @description Latest materialized feature_window for symbol/timeframe.
         *
         *     Computes and persists on-demand from local cache (offline=True) if not
         *     yet materialized. Never fans out to providers.
         */
        get: operations["get_feature_window_features_window_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/features/pattern-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pattern Events
         * @description List persisted pattern_events for symbol/timeframe/pattern_family.
         */
        get: operations["get_pattern_events_features_pattern_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Logout
         * @description Revoke the caller's JWT.
         *
         *     The token is added to the Redis blacklist with TTL = remaining validity.
         *     Subsequent requests with the same token will receive 403.
         *
         *     Requires: Authorization: Bearer <token>
         */
        post: operations["logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{user_id}/f60-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get F60 Status
         * @description H-07: F-60 copy-signal gate status for a user.
         *
         *     Returns verdicts remaining + current accuracy + pass/fail.
         *     Cached 5 min (same TTL as PatternStatsEngine).
         */
        get: operations["get_f60_status_users__user_id__f60_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{user_id}/verdict-accuracy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Verdict Accuracy
         * @description H-08: per-user verdict accuracy detail. Alias of f60-status for compatibility.
         */
        get: operations["get_verdict_accuracy_users__user_id__verdict_accuracy_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/metrics/user/{user_id}/wvpl": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get User Wvpl
         * @description Return rolling WVPL breakdowns for the last ``weeks`` KST weeks.
         *
         *     Response shape:
         *         {
         *           "user_id": "...",
         *           "weeks": [
         *             {"week_start": "...", "loop_count": N, "capture_n": ..., "search_n": ..., "verdict_n": ...},
         *             ...  # most-recent first
         *           ]
         *         }
         */
        get: operations["get_user_wvpl_metrics_user__user_id__wvpl_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/viz/route": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Route Viz Intent
         * @description Classify visualization intent and return template + data.
         *
         *     - WHY/STATE/EXECUTION: no search, returns capture context data.
         *     - SEARCH/COMPARE/FLOW: returns search_triggered=True + routing info.
         *       Client should follow up with GET /search/similar?capture_id=...
         */
        post: operations["route_viz_intent_viz_route_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/personalization/verdict": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Verdict
         * @description Record a verdict and return updated affinity score + threshold delta.
         *
         *     Cold-start users (n < 10) get mode="cold_start" with delta=null.
         *     Warm users (n ≥ 10) get mode="personalized" with computed delta.
         */
        post: operations["post_verdict_personalization_verdict_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/personalization/user/{user_id}/variant/{pattern_slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Variant
         * @description Resolve personalized (or global fallback) variant for user × pattern.
         */
        get: operations["get_variant_personalization_user__user_id__variant__pattern_slug__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/personalization/user/{user_id}/affinity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Affinity
         * @description Return top-k affinity scores for a user across all patterns.
         */
        get: operations["get_affinity_personalization_user__user_id__affinity_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/personalization/user/{user_id}/rescue/{pattern_slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Rescue
         * @description Manually trigger rescue for always-invalid patterns.
         *
         *     Returns rescued=False if needs_rescue check fails (valid_rate > 5% or n < 30).
         */
        post: operations["post_rescue_personalization_user__user_id__rescue__pattern_slug__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Validate Pattern
         * @description Run validate_and_gate() for a pattern slug.
         *
         *     Rate limit: 20/day per IP.
         *     503 if VALIDATION_PIPELINE_ENABLED=false.
         */
        post: operations["validate_pattern_research_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/discover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Discover
         * @description Trigger autonomous pattern discovery agent (W-0316).
         *
         *     Internal-only: requires x-engine-internal-secret header.
         *     Rate limit: 5/day. Discovery runs cost up to $0.50/cycle.
         *     503 if DISCOVERY_AGENT_ENABLED=false.
         */
        post: operations["discover_research_discover_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/autoresearch/trigger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Trigger Autoresearch
         * @description Manually trigger one autoresearch cycle (admin-only).
         *
         *     Requires X-API-Key header matching ENGINE_API_KEY env var.
         *     Returns immediately with run summary (runs synchronously in thread).
         */
        post: operations["trigger_autoresearch_research_autoresearch_trigger_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/signals/{symbol}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Signals
         * @description Return active promoted signals for a symbol.
         *
         *     Filters to signals with expires_at > now AND promoted_at > now - lookback.
         */
        get: operations["get_signals_research_signals__symbol__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Run
         * @description Return status of a specific autoresearch run.
         */
        get: operations["get_run_research_runs__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/findings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Findings
         * @description List inbox findings. date format: YYYY-MM-DD.
         */
        get: operations["list_findings_research_findings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/alpha-quality": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Alpha Quality
         * @description GET /research/alpha-quality — Welch+BH-FDR+Spearman alpha quality report.
         */
        get: operations["get_alpha_quality_research_alpha_quality_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/market-search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Market Search
         * @description W-0365: Run pattern market search and return ranked candidates.
         */
        post: operations["market_search_research_market_search_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/indicator-features": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Indicator Features
         * @description W-0366: Return user-facing indicator feature catalog for UI.
         */
        get: operations["get_indicator_features_research_indicator_features_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/signals/{signal_id}/components": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Signal Components
         * @description GET /research/signals/{signal_id}/components — component_scores for a signal event.
         */
        get: operations["get_signal_components_research_signals__signal_id__components_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/research/top-patterns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Top Patterns */
        get: operations["get_top_patterns_research_top_patterns_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/propfirm/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Summary */
        get: operations["get_summary_propfirm_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/propfirm/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Account */
        post: operations["create_account_propfirm_accounts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/pattern_scan/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Pattern Scan
         * @description Cloud Scheduler → trigger pattern state machine scan.
         */
        post: operations["run_pattern_scan_jobs_pattern_scan_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/outcome_resolver/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Outcome Resolver
         * @description Cloud Scheduler → run outcome resolution for pending captures.
         */
        post: operations["run_outcome_resolver_jobs_outcome_resolver_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/auto_capture/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Auto Capture
         * @description Cloud Scheduler → capture current pattern candidates.
         */
        post: operations["run_auto_capture_jobs_auto_capture_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/market_search_index_refresh/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Market Search Index Refresh
         * @description Cloud Scheduler → rebuild the local market search index.
         */
        post: operations["run_market_search_index_refresh_jobs_market_search_index_refresh_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/db_cleanup/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Db Cleanup
         * @description Cloud Scheduler (daily) → purge stale rows from high-growth tables.
         *
         *     Retention policy:
         *       engine_alerts            →  7 days  (scan signals, replaced each cycle)
         *       opportunity_scans        →  7 days  (per-table comment: 7d recommended)
         *       terminal_pattern_captures → 90 days (user data: longer retention)
         */
        post: operations["run_db_cleanup_jobs_db_cleanup_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/feature_windows_build/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Feature Windows Build
         * @description Cloud Scheduler → rebuild FeatureWindowStore from local CSV cache.
         *
         *     Runs every 6 hours (BINANCE_30 × [15m, 1h, 4h], 90 days history).
         *     Idempotent: UPSERT only writes bars not already stored.
         */
        post: operations["run_feature_windows_build_jobs_feature_windows_build_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/feature_materialization/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Feature Materialization
         * @description Cloud Scheduler → materialize canonical feature_windows for universe.
         *
         *     Reads from existing local cache (offline=True) — never fans out to providers.
         *     Produces feature_windows, pattern_events, search_corpus_signatures in
         *     engine/state/feature_materialization.sqlite.
         */
        post: operations["run_feature_materialization_jobs_feature_materialization_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/raw_ingest/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Raw Ingest
         * @description Cloud Scheduler → ingest raw market data for universe into canonical raw store.
         *
         *     Fetches from Binance and writes raw_market_bars, raw_perp_metrics,
         *     raw_orderflow_metrics into engine/state/canonical_raw.sqlite.
         *     Also refreshes the legacy CSV cache so downstream jobs stay in sync.
         */
        post: operations["run_raw_ingest_jobs_raw_ingest_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/jobs/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Jobs Status
         * @description Return resource guard state for all managed jobs.
         */
        get: operations["jobs_status_jobs_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Healthz */
        get: operations["healthz_healthz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readyz */
        get: operations["readyz_readyz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Metrics */
        get: operations["metrics_metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanner/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Scanner Status */
        get: operations["scanner_status_scanner_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AffinityEntry */
        AffinityEntry: {
            /** Pattern Slug */
            pattern_slug: string;
            /** Alpha Valid */
            alpha_valid: number;
            /** Beta Valid */
            beta_valid: number;
            /** N Total */
            n_total: number;
            /** Score */
            score: number;
            /** Is Cold */
            is_cold: boolean;
            /** Updated At */
            updated_at: string;
        };
        /** AffinityListResponse */
        AffinityListResponse: {
            /** User Id */
            user_id: string;
            /** Patterns */
            patterns: components["schemas"]["AffinityEntry"][];
        };
        /** AutoresearchTriggerResponse */
        AutoresearchTriggerResponse: {
            /** Status */
            status: string;
            /** Run Id */
            run_id?: string | null;
            /** N Symbols */
            n_symbols?: number | null;
            /** N Promoted */
            n_promoted?: number | null;
            /** N Written */
            n_written?: number | null;
            /** Elapsed S */
            elapsed_s?: number | null;
            /** Reason */
            reason?: string | null;
            /** Error */
            error?: string | null;
        };
        /** BacktestConfig */
        BacktestConfig: {
            /**
             * Stop Loss
             * @default 0.02
             */
            stop_loss: number;
            /**
             * Take Profit
             * @default 0.04
             */
            take_profit: number;
            /**
             * Timeout Bars
             * @default 24
             */
            timeout_bars: number;
            /**
             * Universe
             * @default binance_30
             */
            universe: string;
        };
        /** BacktestMetrics */
        BacktestMetrics: {
            /** N Trades */
            n_trades: number;
            /** Win Rate */
            win_rate: number;
            /** Expectancy */
            expectancy: number;
            /** Profit Factor */
            profit_factor: number;
            /** Max Drawdown */
            max_drawdown: number;
            /** Sortino */
            sortino: number;
            /** Walk Forward Pass Rate */
            walk_forward_pass_rate: number;
        };
        /** BacktestRequest */
        BacktestRequest: {
            blocks: components["schemas"]["BlockSet"];
            config?: components["schemas"]["BacktestConfig"];
        };
        /** BacktestResponse */
        BacktestResponse: {
            metrics: components["schemas"]["BacktestMetrics"];
            /** Passed */
            passed: boolean;
            /** Gate Failures */
            gate_failures: string[];
        };
        /** BlockSet */
        BlockSet: {
            /** Triggers */
            triggers?: string[];
            /** Confirmations */
            confirmations?: string[];
            /** Entries */
            entries?: string[];
            /** Disqualifiers */
            disqualifiers?: string[];
        };
        /** BulkImportBody */
        BulkImportBody: {
            /** Rows */
            rows: components["schemas"]["BulkImportRow"][];
        };
        /**
         * BulkImportRow
         * @description One row in a founder bulk-import payload.
         *
         *     Constraints are intentionally minimal to ease CSV translation — the
         *     resolver handles missing OHLCV gracefully by leaving the capture as
         *     pending_outcome for the next tick.
         */
        BulkImportRow: {
            /** Symbol */
            symbol: string;
            /**
             * Timeframe
             * @default 1h
             */
            timeframe: string;
            /**
             * Captured At Ms
             * @description Unix ms when the setup was observed
             */
            captured_at_ms: number;
            /**
             * Pattern Slug
             * @default
             */
            pattern_slug: string;
            /**
             * Phase
             * @default
             */
            phase: string;
            /** User Note */
            user_note?: string | null;
            research_context?: components["schemas"]["ResearchContextBody"] | null;
            /**
             * Entry Price
             * @description Optional hint. Resolver derives entry_price from OHLCV regardless.
             */
            entry_price?: number | null;
        };
        /** CaptionRequest */
        CaptionRequest: {
            /**
             * Symbol
             * @description 예: BTCUSDT
             */
            symbol: string;
            /**
             * Direction
             * @description long | short
             */
            direction: string;
            /** Entry Price */
            entry_price: number;
            /** Exit Price */
            exit_price: number;
            /**
             * Pnl Usdt
             * @description 손익 USDT (+수익 / -손실)
             */
            pnl_usdt: number;
            /**
             * Pnl Pct
             * @description 손익 %
             */
            pnl_pct: number;
            /**
             * Pattern Name
             * @description 발동 패턴 이름
             */
            pattern_name: string;
            /**
             * Hold Hours
             * @description 보유 시간 (h)
             */
            hold_hours: number;
        };
        /** CaptureBenchmarkSearchBody */
        CaptureBenchmarkSearchBody: {
            /** Candidate Timeframes */
            candidate_timeframes?: string[] | null;
            /**
             * Warmup Bars
             * @default 240
             */
            warmup_bars: number;
            /**
             * Min Reference Score
             * @default 0.55
             */
            min_reference_score: number;
            /**
             * Min Holdout Score
             * @default 0.35
             */
            min_holdout_score: number;
        };
        /** CaptureCreateBody */
        CaptureCreateBody: {
            /**
             * Capture Kind
             * @default pattern_candidate
             * @enum {string}
             */
            capture_kind: "pattern_candidate" | "manual_hypothesis" | "chart_bookmark" | "post_trade_review";
            /** Symbol */
            symbol: string;
            /**
             * Pattern Slug
             * @default
             */
            pattern_slug: string;
            /**
             * Pattern Version
             * @default 1
             */
            pattern_version: number;
            /**
             * Phase
             * @default
             */
            phase: string;
            /**
             * Timeframe
             * @default 1h
             */
            timeframe: string;
            /** Candidate Transition Id */
            candidate_transition_id?: string | null;
            /** Candidate Id */
            candidate_id?: string | null;
            /** Scan Id */
            scan_id?: string | null;
            /** User Note */
            user_note?: string | null;
            /** Chart Context */
            chart_context?: {
                [key: string]: unknown;
            };
            research_context?: components["schemas"]["ResearchContextBody"] | null;
            /** Feature Snapshot */
            feature_snapshot?: {
                [key: string]: unknown;
            } | null;
            /** Block Scores */
            block_scores?: {
                [key: string]: unknown;
            };
        };
        /** ChallengeCreateRequest */
        ChallengeCreateRequest: {
            /** Snaps */
            snaps: components["schemas"]["SnapInput"][];
            /** User Id */
            user_id?: string | null;
        };
        /** ChallengeCreateResponse */
        ChallengeCreateResponse: {
            /** Slug */
            slug: string;
            /** Strategies */
            strategies: components["schemas"]["StrategyResult"][];
            /** Recommended */
            recommended: string;
            /** Feature Vector */
            feature_vector: number[];
        };
        /** ChallengeScanResponse */
        ChallengeScanResponse: {
            /** Slug */
            slug: string;
            /**
             * Scanned At
             * Format: date-time
             */
            scanned_at: string;
            /** Matches */
            matches: components["schemas"]["ScanMatch"][];
        };
        /** CreateAccountBody */
        CreateAccountBody: {
            /** User Id */
            user_id: string;
            /** Action */
            action: string;
            /** Exit Policy */
            exit_policy?: {
                [key: string]: unknown;
            } | null;
            /** Strategy Id */
            strategy_id?: string | null;
            /** Symbols */
            symbols?: string[] | null;
        };
        /** DebugHypothesis */
        DebugHypothesis: {
            /** Id */
            id: string;
            /** Text */
            text: string;
            /**
             * Status
             * @enum {string}
             */
            status: "open" | "confirmed" | "rejected";
            /** Evidence */
            evidence?: string[];
            /** Rejection Reason */
            rejection_reason?: string | null;
        };
        /** DeepPerpData */
        DeepPerpData: {
            /** Fr */
            fr?: number | null;
            /** Oi Pct */
            oi_pct?: number | null;
            /** Ls Ratio */
            ls_ratio?: number | null;
            /** Taker Ratio */
            taker_ratio?: number | null;
            /** Price Pct */
            price_pct?: number | null;
            /** Oi Notional */
            oi_notional?: number | null;
            /** Vol 24H */
            vol_24h?: number | null;
            /** Mark Price */
            mark_price?: number | null;
            /** Index Price */
            index_price?: number | null;
            /**
             * Short Liq Usd
             * @default 0
             */
            short_liq_usd: number;
            /**
             * Long Liq Usd
             * @default 0
             */
            long_liq_usd: number;
            /** Spot Price */
            spot_price?: number | null;
        };
        /** DeepRequest */
        DeepRequest: {
            /** Symbol */
            symbol: string;
            /** Klines */
            klines: components["schemas"]["KlineBar"][];
            perp?: components["schemas"]["DeepPerpData"];
        };
        /** DeepResponse */
        DeepResponse: {
            /** Symbol */
            symbol: string;
            /** Total Score */
            total_score: number;
            /** Verdict */
            verdict: string;
            /** Layers */
            layers: {
                [key: string]: components["schemas"]["LayerOut"];
            };
            /** Atr Levels */
            atr_levels: {
                [key: string]: unknown;
            };
            /** Alpha */
            alpha?: {
                [key: string]: unknown;
            } | null;
            /** Hunt Score */
            hunt_score?: number | null;
        };
        /** DiscoverResponse */
        DiscoverResponse: {
            /** Cycle Id */
            cycle_id: string;
            /** Proposals */
            proposals: number;
            /** Turns Used */
            turns_used: number;
            /** Stop Reason */
            stop_reason: string | null;
            /** Error */
            error: string | null;
            /** Proposal Paths */
            proposal_paths: string[];
        };
        /** EnsembleSignal */
        EnsembleSignal: {
            /** Direction */
            direction: string;
            /** Ensemble Score */
            ensemble_score: number;
            /** Ml Contribution */
            ml_contribution: number;
            /** Block Contribution */
            block_contribution: number;
            /** Regime Contribution */
            regime_contribution: number;
            /** Confidence */
            confidence: string;
            /** Reason */
            reason: string;
            /** Block Analysis */
            block_analysis: {
                [key: string]: unknown;
            };
        };
        /** FindingsResponse */
        FindingsResponse: {
            /** Date */
            date: string;
            /** Findings */
            findings: string[];
            /** Count */
            count: number;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * KlineBar
         * @description One normalized OHLCV bar from exchange data.
         */
        KlineBar: {
            /** T */
            t: number;
            /** O */
            o: number;
            /** H */
            h: number;
            /** L */
            l: number;
            /** C */
            c: number;
            /** V */
            v: number;
            /**
             * Tbv
             * @default 0
             */
            tbv: number;
        };
        /** LayerOut */
        LayerOut: {
            /** Score */
            score: number;
            /** Sigs */
            sigs: {
                [key: string]: string;
            }[];
            /** Meta */
            meta: {
                [key: string]: unknown;
            };
        };
        /** LogoutResponse */
        LogoutResponse: {
            /** Ok */
            ok: boolean;
            /** Message */
            message: string;
        };
        /** MarketSearchRequest */
        MarketSearchRequest: {
            /** Pattern Slug */
            pattern_slug: string;
            /** Variant Slug */
            variant_slug?: string | null;
            /**
             * Timeframe
             * @default 1h
             */
            timeframe: string;
            /** Universe */
            universe?: string[] | null;
            /**
             * Top K
             * @default 20
             */
            top_k: number;
            /**
             * Run Type
             * @default user
             */
            run_type: string;
            /** Indicator Filters */
            indicator_filters?: {
                [key: string]: unknown;
            }[] | null;
        };
        /** MarketSearchResponse */
        MarketSearchResponse: {
            /** Run Id */
            run_id: string;
            /** Pattern Slug */
            pattern_slug: string;
            /** Candidates */
            candidates: {
                [key: string]: unknown;
            }[];
            /** Total Candidates */
            total_candidates: number;
            /** Retrieval Source */
            retrieval_source: string;
            /** Run Type */
            run_type: string;
            /** Elapsed Ms */
            elapsed_ms: number;
            /** No Candidates Reason */
            no_candidates_reason?: string | null;
        };
        /** MemoryCandidate */
        MemoryCandidate: {
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "identity" | "belief" | "experience" | "preference" | "fact" | "procedure" | "debug_hypothesis" | "debug_rejected";
            /** Text */
            text: string;
            /**
             * Base Score
             * @default 0
             */
            base_score: number;
            /**
             * Confidence
             * @default observed
             * @enum {string}
             */
            confidence: "verified" | "observed" | "hypothesis";
            /**
             * Access Count
             * @default 0
             */
            access_count: number;
            /** Tags */
            tags?: string[];
            /** Conditions */
            conditions?: {
                [key: string]: unknown;
            };
        };
        /** MemoryContext */
        MemoryContext: {
            /** Symbol */
            symbol?: string | null;
            /** Timeframe */
            timeframe?: string | null;
            /** Mode */
            mode?: string | null;
            /** Intent */
            intent?: string | null;
            /** Challenge Slug */
            challenge_slug?: string | null;
            /** Challenge Instance */
            challenge_instance?: string | null;
            /** As Of */
            as_of?: string | null;
        };
        /** MemoryDebugSessionRequest */
        MemoryDebugSessionRequest: {
            /** Session Id */
            session_id: string;
            context?: components["schemas"]["MemoryContext"];
            /** Hypotheses */
            hypotheses: components["schemas"]["DebugHypothesis"][];
            /** Started At */
            started_at: string;
            /** Ended At */
            ended_at?: string | null;
        };
        /** MemoryDebugSessionResponse */
        MemoryDebugSessionResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Schema Version
             * @default 1
             */
            schema_version: number;
            /** Session Id */
            session_id: string;
            /** Rejected Indexed */
            rejected_indexed: number;
            /** Updated At */
            updated_at: string;
        };
        /** MemoryFeedbackBatchItem */
        MemoryFeedbackBatchItem: {
            /** Memory Id */
            memory_id: string;
            /**
             * Access Count
             * @default 0
             */
            access_count: number;
            /** Updated At */
            updated_at: string;
        };
        /** MemoryFeedbackBatchRequest */
        MemoryFeedbackBatchRequest: {
            /** Items */
            items: components["schemas"]["MemoryFeedbackRequest"][];
        };
        /** MemoryFeedbackBatchResponse */
        MemoryFeedbackBatchResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Schema Version
             * @default 1
             */
            schema_version: number;
            /** Processed */
            processed: number;
            /** Items */
            items: components["schemas"]["MemoryFeedbackBatchItem"][];
        };
        /** MemoryFeedbackRequest */
        MemoryFeedbackRequest: {
            /** Query Id */
            query_id: string;
            /** Memory Id */
            memory_id: string;
            /**
             * Event
             * @enum {string}
             */
            event: "retrieved" | "used" | "dismissed" | "contradicted" | "confirmed";
            context?: components["schemas"]["MemoryContext"];
            /** Occurred At */
            occurred_at?: string | null;
            /** Note */
            note?: string | null;
        };
        /** MemoryFeedbackResponse */
        MemoryFeedbackResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Schema Version
             * @default 1
             */
            schema_version: number;
            /** Memory Id */
            memory_id: string;
            /**
             * Access Count
             * @default 0
             */
            access_count: number;
            /** Updated At */
            updated_at: string;
        };
        /** MemoryQueryDebug */
        MemoryQueryDebug: {
            /** Rerank Applied */
            rerank_applied: boolean;
            /** Base Result Count */
            base_result_count: number;
            /** Elapsed Ms */
            elapsed_ms: number;
        };
        /** MemoryQueryRequest */
        MemoryQueryRequest: {
            /** Query */
            query: string;
            context?: components["schemas"]["MemoryContext"];
            /** Candidates */
            candidates?: components["schemas"]["MemoryCandidate"][];
            /**
             * Top K
             * @default 8
             */
            top_k: number;
        };
        /** MemoryQueryResponse */
        MemoryQueryResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Schema Version
             * @default 1
             */
            schema_version: number;
            /** Query Id */
            query_id: string;
            /** Records */
            records: components["schemas"]["MemoryRankedRecord"][];
            debug: components["schemas"]["MemoryQueryDebug"];
        };
        /** MemoryRankedRecord */
        MemoryRankedRecord: {
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "identity" | "belief" | "experience" | "preference" | "fact" | "procedure" | "debug_hypothesis" | "debug_rejected";
            /** Text */
            text: string;
            /** Score */
            score: number;
            /** Base Score */
            base_score: number;
            /**
             * Confidence
             * @enum {string}
             */
            confidence: "verified" | "observed" | "hypothesis";
            /** Access Count */
            access_count: number;
            /** Tags */
            tags: string[];
            /** Reasons */
            reasons?: string[];
        };
        /** MemoryRejectedLookupRequest */
        MemoryRejectedLookupRequest: {
            /** Symbol */
            symbol?: string | null;
            /** Intent */
            intent?: string | null;
            /** Query */
            query?: string | null;
            /**
             * Limit
             * @default 10
             */
            limit: number;
        };
        /** MemoryRejectedLookupResponse */
        MemoryRejectedLookupResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Schema Version
             * @default 1
             */
            schema_version: number;
            /** Records */
            records: components["schemas"]["MemoryRejectedRecord"][];
        };
        /** MemoryRejectedRecord */
        MemoryRejectedRecord: {
            /** Id */
            id: string;
            /** Session Id */
            session_id: string;
            /** Text */
            text: string;
            /** Rejection Reason */
            rejection_reason?: string | null;
            /** Symbol */
            symbol?: string | null;
            /** Intent */
            intent?: string | null;
            /** Updated At */
            updated_at: string;
        };
        /** OpenPositionRequest */
        OpenPositionRequest: {
            /**
             * Symbol
             * @description 예: BTCUSDT
             */
            symbol: string;
            /**
             * Direction
             * @description long | short
             */
            direction: string;
            /**
             * Entry Price
             * @description 진입가 USDT
             */
            entry_price: number;
            /**
             * Size Coin
             * @description 포지션 크기 (코인 수)
             */
            size_coin: number;
            /**
             * Stop Price
             * @description 손절가 USDT
             */
            stop_price: number;
            /**
             * Target Price
             * @description 목표가 USDT
             */
            target_price: number;
        };
        /** OpportunityMacroBackdrop */
        OpportunityMacroBackdrop: {
            /** Fedfundsrate */
            fedFundsRate?: number | null;
            /** Yieldcurvespread */
            yieldCurveSpread?: number | null;
            /** M2Changepct */
            m2ChangePct?: number | null;
            /** Overallmacroscore */
            overallMacroScore: number;
            /** Regime */
            regime: string;
        };
        /** OpportunityRunRequest */
        OpportunityRunRequest: {
            /**
             * Limit
             * @default 15
             */
            limit: number;
            /** User Id */
            user_id?: string | null;
        };
        /** OpportunityRunResponse */
        OpportunityRunResponse: {
            /** Coins */
            coins: components["schemas"]["OpportunityScore"][];
            macroBackdrop: components["schemas"]["OpportunityMacroBackdrop"];
            /** Scannedat */
            scannedAt: number;
            /** Scandurationms */
            scanDurationMs: number;
        };
        /** OpportunityScore */
        OpportunityScore: {
            /** Symbol */
            symbol: string;
            /** Name */
            name: string;
            /** Slug */
            slug: string;
            /** Price */
            price: number;
            /** Change1H */
            change1h: number;
            /** Change24H */
            change24h: number;
            /** Change7D */
            change7d: number;
            /** Volume24H */
            volume24h: number;
            /** Marketcap */
            marketCap: number;
            /** Momentumscore */
            momentumScore: number;
            /** Volumescore */
            volumeScore: number;
            /** Socialscore */
            socialScore: number;
            /** Macroscore */
            macroScore: number;
            /** Onchainscore */
            onchainScore: number;
            /** Totalscore */
            totalScore: number;
            /** Direction */
            direction: string;
            /** Confidence */
            confidence: number;
            /** Reasons */
            reasons: string[];
            /** Sentiment */
            sentiment?: number | null;
            /** Socialvolume */
            socialVolume?: number | null;
            /** Galaxyscore */
            galaxyScore?: number | null;
            /** Alerts */
            alerts: string[];
            /** Compositescore */
            compositeScore?: number | null;
        };
        /** ParseRequest */
        ParseRequest: {
            /** Text */
            text: string;
            /** Symbol */
            symbol?: string | null;
        };
        /** ParserMetaBody */
        ParserMetaBody: {
            /** Parser Role */
            parser_role: string;
            /** Parser Model */
            parser_model: string;
            /** Parser Prompt Version */
            parser_prompt_version: string;
            /**
             * Pattern Draft Schema Version
             * @default 1
             */
            pattern_draft_schema_version: number;
            /** Signal Vocab Version */
            signal_vocab_version: string;
            /** Confidence */
            confidence?: number | null;
            /**
             * Ambiguity Count
             * @default 0
             */
            ambiguity_count: number;
        };
        /** PatternDraftBody */
        PatternDraftBody: {
            /**
             * Schema Version
             * @default 1
             */
            schema_version: number;
            /** Pattern Family */
            pattern_family: string;
            /** Pattern Label */
            pattern_label?: string | null;
            /** Source Type */
            source_type: string;
            /** Source Text */
            source_text: string;
            /** Symbol Candidates */
            symbol_candidates?: string[];
            /** Timeframe */
            timeframe?: string | null;
            /** Thesis */
            thesis?: string[];
            /** Phases */
            phases?: components["schemas"]["PatternDraftPhaseBody"][];
            /** Trade Plan */
            trade_plan?: {
                [key: string]: unknown;
            };
            search_hints?: components["schemas"]["PatternDraftSearchHintsBody"];
            /** Confidence */
            confidence?: number | null;
            /** Ambiguities */
            ambiguities?: string[];
        };
        /** PatternDraftPhaseBody */
        PatternDraftPhaseBody: {
            /** Phase Id */
            phase_id: string;
            /** Label */
            label: string;
            /**
             * Sequence Order
             * @default 0
             */
            sequence_order: number;
            /**
             * Description
             * @default
             */
            description: string;
            /** Timeframe */
            timeframe?: string | null;
            /** Signals Required */
            signals_required?: string[];
            /** Signals Preferred */
            signals_preferred?: string[];
            /** Signals Forbidden */
            signals_forbidden?: string[];
            /** Directional Belief */
            directional_belief?: string | null;
            /** Evidence Text */
            evidence_text?: string | null;
            /** Time Hint */
            time_hint?: string | null;
            /** Importance */
            importance?: number | null;
        };
        /** PatternDraftSearchHintsBody */
        PatternDraftSearchHintsBody: {
            /** Must Have Signals */
            must_have_signals?: string[];
            /** Preferred Timeframes */
            preferred_timeframes?: string[];
            /** Exclude Patterns */
            exclude_patterns?: string[];
            /** Similarity Focus */
            similarity_focus?: string[];
            /** Symbol Scope */
            symbol_scope?: string[];
        };
        /** PatternDraftTransformRequest */
        PatternDraftTransformRequest: {
            pattern_draft: components["schemas"]["PatternDraftBody"];
            parser_meta?: components["schemas"]["ParserMetaBody"] | null;
        };
        /** PatternDraftTransformResponse */
        PatternDraftTransformResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default search
             * @constant
             */
            plane: "search";
            /**
             * Status
             * @default transformed
             * @constant
             */
            status: "transformed";
            /** Generated At */
            generated_at: string;
            /** Search Query Spec */
            search_query_spec: {
                [key: string]: unknown;
            };
            /** Transformer Meta */
            transformer_meta?: {
                [key: string]: unknown;
            };
            /** Parser Meta */
            parser_meta?: {
                [key: string]: unknown;
            } | null;
        };
        /** PatternObjectResponse */
        PatternObjectResponse: {
            /** Slug */
            slug: string;
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Direction */
            direction: string;
            /** Timeframe */
            timeframe: string;
            /** Version */
            version: number;
            /** Entry Phase */
            entry_phase: string;
            /** Target Phase */
            target_phase: string;
            /** Phase Ids */
            phase_ids: string[];
            /** Tags */
            tags: string[];
            /** Universe Scope */
            universe_scope: string;
        };
        /**
         * PerpSnapshot
         * @description Current-bar derivatives data with neutral-safe defaults.
         */
        PerpSnapshot: {
            /**
             * Funding Rate
             * @default 0
             */
            funding_rate: number;
            /**
             * Oi Change 1H
             * @default 0
             */
            oi_change_1h: number;
            /**
             * Oi Change 24H
             * @default 0
             */
            oi_change_24h: number;
            /**
             * Long Short Ratio
             * @default 1
             */
            long_short_ratio: number;
            /** Taker Buy Ratio */
            taker_buy_ratio?: number | null;
        };
        /** PnLStatsPoint */
        PnLStatsPoint: {
            /** Ts */
            ts: string;
            /** Cumulative Pnl Bps */
            cumulative_pnl_bps: number;
        };
        /** PnLStatsResponse */
        PnLStatsResponse: {
            /** Pattern Slug */
            pattern_slug: string;
            /** N */
            n: number;
            /** Mean Pnl Bps */
            mean_pnl_bps: number | null;
            /** Std Pnl Bps */
            std_pnl_bps: number | null;
            /** Sharpe Like */
            sharpe_like: number | null;
            /** Win Rate */
            win_rate: number | null;
            /** Loss Rate */
            loss_rate: number | null;
            /** Indeterminate Rate */
            indeterminate_rate: number | null;
            /** Ci Low */
            ci_low: number | null;
            /** Ci High */
            ci_high: number | null;
            /** Preliminary */
            preliminary: boolean;
            /** Btc Hold Return Pct */
            btc_hold_return_pct: number | null;
            /** Equity Curve */
            equity_curve: components["schemas"]["PnLStatsPoint"][];
        };
        /** QualityJudgementRequest */
        QualityJudgementRequest: {
            /** Run Id */
            run_id: string;
            /** Candidate Id */
            candidate_id: string;
            /**
             * Verdict
             * @description 'good' | 'bad' | 'neutral'
             */
            verdict: string;
            /** Symbol */
            symbol?: string | null;
            /** Layer A Score */
            layer_a_score?: number | null;
            /** Layer B Score */
            layer_b_score?: number | null;
            /** Layer C Score */
            layer_c_score?: number | null;
            /** Final Score */
            final_score?: number | null;
            /** User Id */
            user_id?: string | null;
        };
        /** QualityJudgementResponse */
        QualityJudgementResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /** Judgement Id */
            judgement_id: string;
        };
        /** QualityStatsResponse */
        QualityStatsResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default search
             * @constant
             */
            plane: "search";
            /** Total Judgements */
            total_judgements: number;
            /** Layers */
            layers?: {
                [key: string]: unknown;
            };
            /** Active Weights */
            active_weights?: {
                [key: string]: number;
            };
            /** Generated At */
            generated_at: string;
        };
        /** RagDedupeHashRequest */
        RagDedupeHashRequest: {
            /** Pair */
            pair: string;
            /** Timeframe */
            timeframe: string;
            /** Direction */
            direction: string;
            /** Regime */
            regime: string;
            /** Source */
            source: string;
            /**
             * Windowminutes
             * @default 60
             */
            windowMinutes: number;
        };
        /** RagDedupeHashResponse */
        RagDedupeHashResponse: {
            /** Dedupehash */
            dedupeHash: string;
        };
        /** RagQuickTradeEmbeddingRequest */
        RagQuickTradeEmbeddingRequest: {
            /** Pair */
            pair: string;
            /** Direction */
            direction: string;
            /** Entryprice */
            entryPrice: number;
            /** Currentprice */
            currentPrice: number;
            /** Tp */
            tp?: number | null;
            /** Sl */
            sl?: number | null;
            /** Source */
            source: string;
            /**
             * Confidence
             * @default 50
             */
            confidence: number;
            /**
             * Timeframe
             * @default 4h
             */
            timeframe: string;
        };
        /** RagScanSignal */
        RagScanSignal: {
            /** Agentid */
            agentId: string;
            /** Vote */
            vote: string;
            /** Confidence */
            confidence: number;
        };
        /** RagSignalActionEmbeddingRequest */
        RagSignalActionEmbeddingRequest: {
            /** Pair */
            pair: string;
            /** Direction */
            direction: string;
            /** Actiontype */
            actionType: string;
            /** Confidence */
            confidence?: number | null;
            /** Source */
            source: string;
            /**
             * Timeframe
             * @default 4h
             */
            timeframe: string;
        };
        /** RagTerminalScanEmbeddingRequest */
        RagTerminalScanEmbeddingRequest: {
            /** Signals */
            signals: components["schemas"]["RagScanSignal"][];
            /** Timeframe */
            timeframe: string;
            /**
             * Datacompleteness
             * @default 0.7
             */
            dataCompleteness: number;
        };
        /** RagVectorResponse */
        RagVectorResponse: {
            /** Embedding */
            embedding: number[];
        };
        /** RangeRequest */
        RangeRequest: {
            /** Symbol */
            symbol: string;
            /** Start Ts */
            start_ts: number;
            /** End Ts */
            end_ts: number;
            /**
             * Timeframe
             * @default 1h
             */
            timeframe: string;
        };
        /** RescueResponse */
        RescueResponse: {
            /** Rescued */
            rescued: boolean;
            /** New Score */
            new_score: number;
        };
        /** ResearchContextBody */
        ResearchContextBody: {
            source?: components["schemas"]["ResearchSourceBody"] | null;
            /** Pattern Family */
            pattern_family?: string | null;
            /** Thesis */
            thesis?: string[];
            /** Phase Annotations */
            phase_annotations?: components["schemas"]["ResearchPhaseAnnotationBody"][];
            entry_spec?: components["schemas"]["ResearchEntrySpecBody"] | null;
            outcome_spec?: components["schemas"]["ResearchOutcomeSpecBody"] | null;
            /** Research Tags */
            research_tags?: string[];
            pattern_draft?: components["schemas"]["PatternDraftBody"] | null;
            parser_meta?: components["schemas"]["ParserMetaBody"] | null;
        };
        /** ResearchEntrySpecBody */
        ResearchEntrySpecBody: {
            /** Entry Phase Id */
            entry_phase_id: string;
            /** Entry Trigger */
            entry_trigger?: string | null;
            /** Stop Rule */
            stop_rule?: string | null;
            /** Target Rule */
            target_rule?: string | null;
        };
        /** ResearchOutcomeSpecBody */
        ResearchOutcomeSpecBody: {
            /** Confirm Breakout Within Bars */
            confirm_breakout_within_bars?: number | null;
            /** Min Forward Return Pct */
            min_forward_return_pct?: number | null;
            /** Stretch Return Pct */
            stretch_return_pct?: number | null;
        };
        /** ResearchPhaseAnnotationBody */
        ResearchPhaseAnnotationBody: {
            /** Phase Id */
            phase_id: string;
            /** Label */
            label: string;
            /** Timeframe */
            timeframe: string;
            /** Start Ts */
            start_ts?: number | null;
            /** End Ts */
            end_ts?: number | null;
            /** Signals Required */
            signals_required?: string[];
            /** Signals Preferred */
            signals_preferred?: string[];
            /** Signals Forbidden */
            signals_forbidden?: string[];
            /** Note */
            note?: string | null;
        };
        /** ResearchSourceBody */
        ResearchSourceBody: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "telegram_post" | "chart_image" | "manual_note" | "terminal_capture";
            /** Author */
            author?: string | null;
            /** Title */
            title?: string | null;
            /** Text */
            text?: string | null;
            /** Image Refs */
            image_refs?: string[];
        };
        /** RunOut */
        RunOut: {
            /** Run Id */
            run_id: string;
            /** Started At */
            started_at: string;
            /** Finished At */
            finished_at: string | null;
            /** Status */
            status: string;
            /** N Symbols */
            n_symbols: number;
            /** N Patterns */
            n_patterns: number;
            /** N Promoted */
            n_promoted: number;
            /** Elapsed S */
            elapsed_s: number | null;
            /** Error Msg */
            error_msg: string | null;
        };
        /** RuntimeCaptureListResponse */
        RuntimeCaptureListResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Captures */
            captures: {
                [key: string]: unknown;
            }[];
            /** Count */
            count: number;
        };
        /** RuntimeCaptureResponse */
        RuntimeCaptureResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Capture */
            capture: {
                [key: string]: unknown;
            };
        };
        /** RuntimeLedgerListResponse */
        RuntimeLedgerListResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Ledgers */
            ledgers: {
                [key: string]: unknown;
            }[];
            /** Count */
            count: number;
        };
        /** RuntimeLedgerResponse */
        RuntimeLedgerResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Ledger */
            ledger: {
                [key: string]: unknown;
            };
        };
        /** RuntimePatternDefinitionListResponse */
        RuntimePatternDefinitionListResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Definitions */
            definitions: {
                [key: string]: unknown;
            }[];
            /** Count */
            count: number;
        };
        /** RuntimePatternDefinitionResponse */
        RuntimePatternDefinitionResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Definition */
            definition: {
                [key: string]: unknown;
            };
        };
        /** RuntimeResearchContextCreate */
        RuntimeResearchContextCreate: {
            /** Symbol */
            symbol?: string | null;
            /** Pattern Slug */
            pattern_slug?: string | null;
            /** User Id */
            user_id?: string | null;
            /** Title */
            title?: string | null;
            /** Summary */
            summary?: string | null;
            /** Fact Refs */
            fact_refs?: string[];
            /** Search Refs */
            search_refs?: string[];
            /** Payload */
            payload?: {
                [key: string]: unknown;
            };
        };
        /** RuntimeResearchContextResponse */
        RuntimeResearchContextResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Research Context */
            research_context: {
                [key: string]: unknown;
            };
        };
        /** RuntimeSetupCreate */
        RuntimeSetupCreate: {
            /** Symbol */
            symbol?: string | null;
            /** Timeframe */
            timeframe?: string | null;
            /** User Id */
            user_id?: string | null;
            /** Title */
            title?: string | null;
            /** Summary */
            summary?: string | null;
            /** Payload */
            payload?: {
                [key: string]: unknown;
            };
        };
        /** RuntimeSetupResponse */
        RuntimeSetupResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Setup */
            setup: {
                [key: string]: unknown;
            };
        };
        /** RuntimeWorkspacePinCreate */
        RuntimeWorkspacePinCreate: {
            /** Symbol */
            symbol: string;
            /** Timeframe */
            timeframe?: string | null;
            /** User Id */
            user_id?: string | null;
            /**
             * Kind
             * @default pin
             */
            kind: string;
            /** Summary */
            summary?: string | null;
            /** Payload */
            payload?: {
                [key: string]: unknown;
            };
            /** Pin Id */
            pin_id?: string | null;
        };
        /** RuntimeWorkspaceResponse */
        RuntimeWorkspaceResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default runtime
             * @constant
             */
            plane: "runtime";
            /**
             * Status
             * @default fallback_local
             * @enum {string}
             */
            status: "durable" | "fallback_local" | "read_only";
            /** Generated At */
            generated_at: string;
            /** Workspace */
            workspace: {
                [key: string]: unknown;
            };
        };
        /** ScanMatch */
        ScanMatch: {
            /** Symbol */
            symbol: string;
            /**
             * Timestamp
             * Format: date-time
             */
            timestamp: string;
            /** Similarity */
            similarity: number;
            /** P Win */
            p_win: number | null;
            /** Price */
            price: number;
        };
        /** ScoreRequest */
        ScoreRequest: {
            /** Symbol */
            symbol: string;
            /** Klines */
            klines: components["schemas"]["KlineBar"][];
            perp?: components["schemas"]["PerpSnapshot"];
        };
        /** ScoreResponse */
        ScoreResponse: {
            /** Snapshot */
            snapshot: {
                [key: string]: unknown;
            };
            /** P Win */
            p_win: number | null;
            /** Blocks Triggered */
            blocks_triggered: string[];
            ensemble?: components["schemas"]["EnsembleSignal"] | null;
            /**
             * Ensemble Triggered
             * @default false
             */
            ensemble_triggered: boolean;
        };
        /** SearchCandidate */
        SearchCandidate: {
            /** Candidate Id */
            candidate_id: string;
            /** Window Id */
            window_id?: string | null;
            /** Symbol */
            symbol?: string | null;
            /** Timeframe */
            timeframe?: string | null;
            /** Score */
            score: number;
            /** Definition Ref */
            definition_ref?: {
                [key: string]: unknown;
            } | null;
            /** Payload */
            payload?: {
                [key: string]: unknown;
            };
        };
        /** SearchCatalogResponse */
        SearchCatalogResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default search
             * @constant
             */
            plane: "search";
            /** Status */
            status: string;
            /** Generated At */
            generated_at: string;
            /** Total Windows */
            total_windows: number;
            /** Windows */
            windows?: components["schemas"]["SearchCorpusWindowSummary"][];
        };
        /** SearchCorpusWindowSummary */
        SearchCorpusWindowSummary: {
            /** Window Id */
            window_id: string;
            /** Symbol */
            symbol: string;
            /** Timeframe */
            timeframe: string;
            /** Start Ts */
            start_ts: string;
            /** End Ts */
            end_ts: string;
            /** Bars */
            bars: number;
            /** Source */
            source: string;
            /** Signature */
            signature?: {
                [key: string]: unknown;
            };
        };
        /** SeedSearchRequest */
        SeedSearchRequest: {
            /** Definition Id */
            definition_id?: string | null;
            /** Symbol */
            symbol?: string | null;
            /** Timeframe */
            timeframe?: string | null;
            /** Signature */
            signature?: {
                [key: string]: unknown;
            };
            /**
             * Limit
             * @default 10
             */
            limit: number;
        };
        /** SeedSearchResponse */
        SeedSearchResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default search
             * @constant
             */
            plane: "search";
            /** Status */
            status: string;
            /** Generated At */
            generated_at: string;
            /** Run Id */
            run_id: string;
            /** Request */
            request?: {
                [key: string]: unknown;
            };
            /** Candidates */
            candidates?: components["schemas"]["SearchCandidate"][];
        };
        /** SignalOut */
        SignalOut: {
            /** Symbol */
            symbol: string;
            /** Pattern */
            pattern: string;
            /** Timeframe */
            timeframe: string;
            /** Sharpe */
            sharpe: number | null;
            /** Hit Rate */
            hit_rate: number | null;
            /** N Trades */
            n_trades: number | null;
            /** Promoted At */
            promoted_at: string;
            /** Expires At */
            expires_at: string;
        };
        /** SignalsResponse */
        SignalsResponse: {
            /** Symbol */
            symbol: string;
            /** Signals */
            signals: components["schemas"]["SignalOut"][];
            /** Count */
            count: number;
        };
        /** SimilarCandidate */
        SimilarCandidate: {
            /** Candidate Id */
            candidate_id: string;
            /** Window Id */
            window_id: string;
            /** Symbol */
            symbol: string;
            /** Timeframe */
            timeframe: string;
            /** Start Ts */
            start_ts: string;
            /** End Ts */
            end_ts: string;
            /** Bars */
            bars: number;
            /**
             * Final Score
             * @description Blended 3-layer score ∈ [0, 1]
             */
            final_score: number;
            /**
             * Layer A Score
             * @description Feature signature similarity
             */
            layer_a_score: number;
            /**
             * Layer B Score
             * @description Phase path LCS similarity (None if no observed_phase_paths)
             */
            layer_b_score?: number | null;
            /**
             * Layer C Score
             * @description ML p_win from LightGBM (None if model not trained)
             */
            layer_c_score?: number | null;
            /**
             * Candidate Phase Path
             * @description Actual observed phase sequence for this candidate symbol.
             */
            candidate_phase_path?: string[];
            /** Signature */
            signature?: {
                [key: string]: unknown;
            };
            /**
             * Close Return Pct
             * @description Corpus window close-to-close return % (proxy outcome for display).
             */
            close_return_pct?: number | null;
        };
        /** SimilarSearchRequest */
        SimilarSearchRequest: {
            /**
             * Pattern Draft
             * @description PatternDraft with phases and search_hints. search_hints.target_return_pct / volatility_range / volume_breakout_threshold are used for Layer A scoring.
             */
            pattern_draft?: {
                [key: string]: unknown;
            };
            /**
             * Observed Phase Paths
             * @description Ordered phase IDs the user has already observed (e.g. ['DUMP','ACCUMULATION']). Activates Layer B scoring.
             */
            observed_phase_paths?: string[];
            /**
             * Symbol
             * @description Optional corpus filter — restrict candidates to one symbol.
             */
            symbol?: string | null;
            /**
             * Timeframe
             * @description Target timeframe for corpus candidates.
             * @default 4h
             */
            timeframe: string;
            /**
             * Top K
             * @description Maximum candidates returned.
             * @default 10
             */
            top_k: number;
        };
        /** SimilarSearchResponse */
        SimilarSearchResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default search
             * @constant
             */
            plane: "search";
            /** Status */
            status: string;
            /** Generated At */
            generated_at: string;
            /** Run Id */
            run_id: string;
            /** Request */
            request?: {
                [key: string]: unknown;
            };
            /** Candidates */
            candidates?: components["schemas"]["SimilarCandidate"][];
            /**
             * Scoring Layers
             * @description Which layers were active: {layer_a, layer_b, layer_c}
             */
            scoring_layers?: {
                [key: string]: boolean;
            };
            /**
             * Active Layers
             * @description Canonical layer visibility alias for scoring_layers.
             */
            active_layers?: {
                [key: string]: boolean;
            };
            /**
             * Stage Counts
             * @description Search pipeline visibility counts for corpus/ranking/return stages.
             */
            stage_counts?: {
                [key: string]: number;
            };
            /** Degraded Reason */
            degraded_reason?: string | null;
        };
        /** SnapInput */
        SnapInput: {
            /** Symbol */
            symbol: string;
            /**
             * Timestamp
             * Format: date-time
             */
            timestamp: string;
            /**
             * Label
             * @default
             */
            label: string;
        };
        /** StrategyResult */
        StrategyResult: {
            /** Name */
            name: string;
            /** Win Rate */
            win_rate: number;
            /** Match Count */
            match_count: number;
            /** Expectancy */
            expectancy: number;
        };
        /** ThresholdDeltaOut */
        ThresholdDeltaOut: {
            /** Stop Mul Delta */
            stop_mul_delta: number;
            /** Entry Strict Delta */
            entry_strict_delta: number;
            /** Target Mul Delta */
            target_mul_delta: number;
            /** N Used */
            n_used: number;
            /** Shrinkage Factor */
            shrinkage_factor: number;
            /** Clamped */
            clamped: boolean;
        };
        /** TokenInfo */
        TokenInfo: {
            /** Rank */
            rank: number;
            /** Symbol */
            symbol: string;
            /** Base */
            base: string;
            /** Name */
            name: string;
            /** Sector */
            sector: string;
            /** Price */
            price: number;
            /** Pct 24H */
            pct_24h: number;
            /** Vol 24H Usd */
            vol_24h_usd: number;
            /** Market Cap */
            market_cap: number;
            /** Oi Usd */
            oi_usd: number;
            /** Is Futures */
            is_futures: boolean;
            /** Trending Score */
            trending_score: number;
        };
        /** TopPatternItem */
        TopPatternItem: {
            /** Pattern Slug */
            pattern_slug: string;
            /** Symbol */
            symbol: string | null;
            /** Direction */
            direction: string | null;
            /** Composite Score */
            composite_score: number | null;
            /** Quality Grade */
            quality_grade: string | null;
            /** N Trades Paper */
            n_trades_paper: number | null;
            /** Win Rate Paper */
            win_rate_paper: number | null;
            /** Sharpe Paper */
            sharpe_paper: number | null;
            /** Max Drawdown Pct Paper */
            max_drawdown_pct_paper: number | null;
            /** Expectancy Pct Paper */
            expectancy_pct_paper: number | null;
            /** Model Source */
            model_source?: string | null;
        };
        /** TopPatternsResponse */
        TopPatternsResponse: {
            /** Patterns */
            patterns: components["schemas"]["TopPatternItem"][];
            /** Generated At */
            generated_at: string | null;
            /** Pipeline Run Id */
            pipeline_run_id: string | null;
            /** Total Available */
            total_available: number;
            /** Limit Applied */
            limit_applied: number;
        };
        /** TradeRecord */
        TradeRecord: {
            /** Snapshot */
            snapshot: {
                [key: string]: unknown;
            };
            /** Outcome */
            outcome: number;
        };
        /** TrainRequest */
        TrainRequest: {
            /** Records */
            records: components["schemas"]["TradeRecord"][];
        };
        /** TrainResponse */
        TrainResponse: {
            /** Auc */
            auc: number;
            /** N Samples */
            n_samples: number;
            /** Model Version */
            model_version: string;
        };
        /** UniverseResponse */
        UniverseResponse: {
            /** Total */
            total: number;
            /** Tokens */
            tokens: components["schemas"]["TokenInfo"][];
            /** Updated At */
            updated_at: string;
        };
        /** ValidateRequest */
        ValidateRequest: {
            /** Slug */
            slug: string;
            /** Symbol */
            symbol: string;
            /** Timeframe */
            timeframe: string;
            /** Family */
            family?: string | null;
            /**
             * Existing Promotion Pass
             * @default false
             */
            existing_promotion_pass: boolean;
        };
        /** ValidateResponse */
        ValidateResponse: {
            /** Slug */
            slug: string;
            /** Overall Pass */
            overall_pass: boolean;
            /** Stage */
            stage: string;
            /** Hypothesis Id */
            hypothesis_id: string | null;
            /** Dsr N Trials */
            dsr_n_trials: number;
            /** Family */
            family: string;
            /** Computed At */
            computed_at: string;
            /** Error */
            error: string | null;
            /** Gate */
            gate: {
                [key: string]: unknown;
            } | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
        /** VariantOut */
        VariantOut: {
            /** Pattern Slug */
            pattern_slug: string;
            /** Variant Slug */
            variant_slug: string;
            /** Timeframe */
            timeframe: string;
            /** Mode */
            mode: string;
            delta: components["schemas"]["ThresholdDeltaOut"] | null;
            /** Base Variant Slug */
            base_variant_slug: string;
            /** Resolved At */
            resolved_at: string;
        };
        /**
         * VerdictBar
         * @description One bar after the signal bar.
         */
        VerdictBar: {
            /** H */
            h: number;
            /** L */
            l: number;
            /** C */
            c: number;
        };
        /** _BenchmarkPackDraftBody */
        _BenchmarkPackDraftBody: {
            /** Capture Id */
            capture_id: string;
            /**
             * Max Holdouts
             * @default 4
             */
            max_holdouts: number;
        };
        /** _BenchmarkSearchBody */
        _BenchmarkSearchBody: {
            /** Capture Id */
            capture_id: string;
            /**
             * Max Holdouts
             * @default 4
             */
            max_holdouts: number;
        };
        /** _CaptureBody */
        _CaptureBody: {
            /** Symbol */
            symbol: string;
            /**
             * Phase
             * @default
             */
            phase: string;
            /**
             * Timeframe
             * @default 1h
             */
            timeframe: string;
            /**
             * Capture Kind
             * @default pattern_candidate
             */
            capture_kind: string;
            /** Candidate Transition Id */
            candidate_transition_id?: string | null;
            /** Scan Id */
            scan_id?: string | null;
            /** User Note */
            user_note?: string | null;
            /**
             * Chart Context
             * @default {}
             */
            chart_context: {
                [key: string]: unknown;
            };
            /** Feature Snapshot */
            feature_snapshot?: {
                [key: string]: unknown;
            } | null;
            /**
             * Block Scores
             * @default {}
             */
            block_scores: {
                [key: string]: unknown;
            };
            /** Outcome Id */
            outcome_id?: string | null;
            /** Verdict Id */
            verdict_id?: string | null;
        };
        /** _FindBody */
        _FindBody: {
            /** Conditions */
            conditions: components["schemas"]["_FindCondition"][];
            /**
             * Min Match
             * @default 1
             */
            min_match: number;
            /**
             * Universe
             * @default alpha
             */
            universe: string;
        };
        /** _FindCondition */
        _FindCondition: {
            /** Block */
            block?: string | null;
            /** Feature */
            feature?: string | null;
            /** Op */
            op?: string | null;
            /** Value */
            value?: number | null;
            /** Persist Bars */
            persist_bars?: number | null;
        };
        /** _PatternAlertPolicyBody */
        _PatternAlertPolicyBody: {
            /** Mode */
            mode: string;
        };
        /** _PatternStatusBody */
        _PatternStatusBody: {
            /** Status */
            status: string;
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** _PatternTrainBody */
        _PatternTrainBody: {
            /** Definition Id */
            definition_id?: string | null;
            /**
             * Target Name
             * @default breakout
             */
            target_name: string;
            /**
             * Feature Schema Version
             * @default 1
             */
            feature_schema_version: number;
            /**
             * Label Policy Version
             * @default 1
             */
            label_policy_version: number;
            /**
             * Threshold Policy Version
             * @default 1
             */
            threshold_policy_version: number;
            /** Min Records */
            min_records?: number | null;
        };
        /** _PromotePatternModelBody */
        _PromotePatternModelBody: {
            /** Definition Id */
            definition_id?: string | null;
            /** Model Key */
            model_key: string;
            /** Model Version */
            model_version: string;
            /**
             * Threshold Policy Version
             * @default 1
             */
            threshold_policy_version: number;
        };
        /** _RegisterPatternBody */
        _RegisterPatternBody: {
            /** Slug */
            slug: string;
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Phases */
            phases: {
                [key: string]: unknown;
            }[];
            /** Entry Phase */
            entry_phase: string;
            /** Target Phase */
            target_phase: string;
            /**
             * Timeframe
             * @default 1h
             */
            timeframe: string;
            /**
             * Tags
             * @default []
             */
            tags: string[];
        };
        /** _VizRouteBody */
        _VizRouteBody: {
            /** Capture Id */
            capture_id?: string | null;
            /** Intent */
            intent?: ("WHY" | "STATE" | "COMPARE" | "SEARCH" | "FLOW" | "EXECUTION") | null;
            /** Text Input */
            text_input?: string | null;
            /** Symbol */
            symbol?: string | null;
        };
        /** _WatchBody */
        _WatchBody: {
            /** Symbol */
            symbol: string;
            /** Target Phase */
            target_phase: string;
            /**
             * Min Confidence
             * @default 0.7
             */
            min_confidence: number;
            /** Notify Channels */
            notify_channels?: string[];
            /**
             * Expires Hours
             * @default 168
             */
            expires_hours: number;
        };
        /** _VerdictBody */
        api__routes__captures___VerdictBody: {
            /**
             * Verdict
             * @enum {string}
             */
            verdict: "valid" | "invalid" | "near_miss" | "too_early" | "too_late";
            /** User Note */
            user_note?: string | null;
        };
        /** _VerdictBody */
        api__routes__live_signals___VerdictBody: {
            /** Signal Id */
            signal_id: string;
            /** Symbol */
            symbol: string;
            /** Phase */
            phase: string;
            /** Verdict */
            verdict: string;
            /** Note */
            note?: string | null;
        };
        /** _VerdictBody */
        api__routes__patterns___VerdictBody: {
            /** Symbol */
            symbol: string;
            /** Verdict */
            verdict: string;
        };
        /** ScanRequest */
        api__routes__scanner__ScanRequest: {
            /** Symbols */
            symbols?: string[] | null;
            /**
             * Send Alerts
             * @default true
             */
            send_alerts: boolean;
        };
        /** ScanResponse */
        api__routes__scanner__ScanResponse: {
            /** Scanned At */
            scanned_at: string;
            /** N Symbols */
            n_symbols: number;
            /** N Signals */
            n_signals: number;
            /** Signals */
            signals: {
                [key: string]: unknown;
            }[];
            /** Errors */
            errors: string[];
            /** Duration Sec */
            duration_sec: number;
        };
        /** VerdictRequest */
        api__routes__verdict__VerdictRequest: {
            /** Entry Price */
            entry_price: number;
            /**
             * Direction
             * @default long
             */
            direction: string;
            /** Bars After */
            bars_after: components["schemas"]["VerdictBar"][];
            /**
             * Target Pct
             * @default 0.01
             */
            target_pct: number;
            /**
             * Stop Pct
             * @default 0.01
             */
            stop_pct: number;
            /**
             * Max Bars
             * @default 24
             */
            max_bars: number;
        };
        /** VerdictResponse */
        api__routes__verdict__VerdictResponse: {
            /** Outcome */
            outcome: string;
            /** Pnl Pct */
            pnl_pct: number;
            /** Bars Held */
            bars_held: number;
            /** Exit Price */
            exit_price: number;
            /** Max Favorable */
            max_favorable: number;
            /** Max Adverse */
            max_adverse: number;
            /** Direction */
            direction: string;
        };
        /** ScanRequest */
        api__schemas_search__ScanRequest: {
            /** Definition Id */
            definition_id?: string | null;
            /** Symbol */
            symbol?: string | null;
            /** Timeframe */
            timeframe?: string | null;
            /**
             * Limit
             * @default 20
             */
            limit: number;
        };
        /** ScanResponse */
        api__schemas_search__ScanResponse: {
            /**
             * Ok
             * @default true
             */
            ok: boolean;
            /**
             * Owner
             * @default engine
             * @constant
             */
            owner: "engine";
            /**
             * Plane
             * @default search
             * @constant
             */
            plane: "search";
            /** Status */
            status: string;
            /** Generated At */
            generated_at: string;
            /** Scan Id */
            scan_id: string;
            /** Request */
            request?: {
                [key: string]: unknown;
            };
            /** Candidates */
            candidates?: components["schemas"]["SearchCandidate"][];
        };
        /** VerdictRequest */
        personalization__api__VerdictRequest: {
            /** User Id */
            user_id: string;
            /** Pattern Slug */
            pattern_slug: string;
            /**
             * Verdict
             * @enum {string}
             */
            verdict: "valid" | "invalid" | "near_miss" | "too_early" | "too_late";
            /** Captured At */
            captured_at: string;
        };
        /** VerdictResponse */
        personalization__api__VerdictResponse: {
            /** Mode */
            mode: string;
            delta: components["schemas"]["ThresholdDeltaOut"] | null;
            /** Affinity Score */
            affinity_score: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    chart_klines_chart_klines_get: {
        parameters: {
            query?: {
                /** @description Trading pair, e.g. BTCUSDT */
                symbol?: string;
                /** @description Timeframe string, e.g. 1h / 4h / 1d */
                tf?: string;
                /** @description Number of bars to return */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    score_score_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScoreRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScoreResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    deep_deep_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeepRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeepResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ctx_status_ctx_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    ctx_refresh_ctx_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    ctx_kimchi_premium_ctx_kimchi_premium_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    ctx_fact_ctx_fact_get: {
        parameters: {
            query: {
                symbol: string;
                timeframe?: string;
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_price_context_facts_price_context_get: {
        parameters: {
            query: {
                symbol: string;
                timeframe?: string;
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_perp_context_facts_perp_context_get: {
        parameters: {
            query: {
                symbol: string;
                timeframe?: string;
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_reference_stack_facts_reference_stack_get: {
        parameters: {
            query?: {
                symbol?: string;
                timeframe?: string;
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_chain_intel_facts_chain_intel_get: {
        parameters: {
            query?: {
                symbol?: string;
                chain?: string;
                family?: string | null;
                timeframe?: string;
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_market_cap_facts_market_cap_get: {
        parameters: {
            query?: {
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_confluence_facts_confluence_get: {
        parameters: {
            query: {
                symbol: string;
                timeframe?: string;
                offline?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    facts_indicator_catalog_facts_indicator_catalog_get: {
        parameters: {
            query?: {
                status?: string | null;
                family?: string | null;
                stage?: string | null;
                query?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_catalog_search_catalog_get: {
        parameters: {
            query?: {
                symbol?: string | null;
                timeframe?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchCatalogResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_seed_search_seed_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SeedSearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeedSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_seed_result_search_seed__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeedSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_scan_search_scan_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["api__schemas_search__ScanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["api__schemas_search__ScanResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_scan_result_search_scan__scan_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scan_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["api__schemas_search__ScanResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_query_spec_transform_search_query_spec_transform_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatternDraftTransformRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatternDraftTransformResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_similar_search_similar_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimilarSearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimilarSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_similar_result_search_similar__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimilarSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_quality_judge_search_quality_judge_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QualityJudgementRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualityJudgementResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_quality_stats_search_quality_stats_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualityStatsResponse"];
                };
            };
        };
    };
    list_runtime_captures_runtime_captures_get: {
        parameters: {
            query?: {
                definition_id?: string | null;
                pattern_slug?: string | null;
                symbol?: string | null;
                status?: string | null;
                watching?: boolean | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeCaptureListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_runtime_capture_runtime_captures_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaptureCreateBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeCaptureResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_runtime_capture_runtime_captures__capture_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeCaptureResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_runtime_definitions_runtime_definitions_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimePatternDefinitionListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_runtime_definition_runtime_definitions__pattern_slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pattern_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimePatternDefinitionResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workspace_pin_runtime_workspace_pins_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuntimeWorkspacePinCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeWorkspaceResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workspace_runtime_workspace__symbol__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeWorkspaceResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_setup_runtime_setups_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuntimeSetupCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeSetupResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_setup_runtime_setups__setup_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                setup_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeSetupResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_research_context_runtime_research_contexts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuntimeResearchContextCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeResearchContextResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_research_context_runtime_research_contexts__context_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                context_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeResearchContextResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_ledger_runtime_ledger__ledger_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ledger_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeLedgerResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_ledger_runtime_ledger_get: {
        parameters: {
            query?: {
                definition_id?: string | null;
                kind?: string | null;
                subject_id?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeLedgerListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    universe_universe_get: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Filter by sector (empty = all) */
                sector?: string;
                /** @description rank | vol | trending | oi | pct24h */
                sort?: string;
                /** @description Force cache refresh */
                refresh?: boolean;
                /** @description Token symbol, name, or contract search */
                q?: string;
                /** @description Allow live provider fallback on local index miss */
                live_fallback?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UniverseResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sectors_universe_sectors_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    market_search_status_universe_search_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    run_opportunity_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpportunityRunRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityRunResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    backtest_backtest_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BacktestRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BacktestResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_challenge_challenge_create_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChallengeCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChallengeCreateResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    scan_challenge_challenge__slug__scan_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChallengeScanResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    train_train_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrainRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrainResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    train_report_train_report_get: {
        parameters: {
            query?: {
                top_k?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verdict_verdict_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["api__routes__verdict__VerdictRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["api__routes__verdict__VerdictResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    trigger_scan_scanner_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["api__routes__scanner__ScanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["api__routes__scanner__ScanResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    parse_pattern_text_patterns_parse_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ParseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatternDraftBody"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_patterns_patterns_library_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_pattern_registry_patterns_registry_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_active_variants_patterns_active_variants_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_all_states_patterns_states_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_recent_transitions_patterns_transitions_get: {
        parameters: {
            query?: {
                limit?: number;
                symbol?: string | null;
                slug?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_all_candidates_patterns_candidates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    draft_from_range_patterns_draft_from_range_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RangeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatternDraftBody"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    trigger_pattern_scan_patterns_scan_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_all_stats_patterns_stats_all_get: {
        parameters: {
            query?: {
                definition_scope?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_lifecycle_statuses_patterns_lifecycle_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_candidates_patterns__slug__candidates_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_similar_live_patterns__slug__similar_live_get: {
        parameters: {
            query?: {
                variant_slug?: string | null;
                timeframe?: string | null;
                top_k?: number;
                min_similarity_score?: number;
                window_bars?: number;
                staleness_hours?: number;
                warmup_bars?: number;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_f60_gate_status_patterns__slug__f60_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_stats_patterns__slug__stats_get: {
        parameters: {
            query?: {
                definition_id?: string | null;
                definition_scope?: string;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pnl_stats_patterns__slug__pnl_stats_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PnLStatsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_training_records_patterns__slug__training_records_get: {
        parameters: {
            query?: {
                limit?: number;
                definition_id?: string | null;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alert_policy_patterns__slug__alert_policy_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_alert_policy_patterns__slug__alert_policy_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_PatternAlertPolicyBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_lifecycle_status_patterns__slug__lifecycle_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_pattern_status_patterns__slug__status_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_PatternStatusBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_model_registry_patterns__slug__model_registry_get: {
        parameters: {
            query?: {
                definition_id?: string | null;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_model_history_patterns__slug__model_history_get: {
        parameters: {
            query?: {
                limit?: number;
                definition_id?: string | null;
                record_type?: string | null;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pattern_def_patterns__slug__library_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_user_verdict_patterns__slug__verdict_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["api__routes__patterns___VerdictBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_capture_patterns__slug__capture_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_CaptureBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    auto_evaluate_patterns__slug__evaluate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    train_pattern_model_patterns__slug__train_model_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_PatternTrainBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    promote_pattern_model_patterns__slug__promote_model_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_PromotePatternModelBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    register_pattern_patterns_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_RegisterPatternBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_benchmark_pack_draft_patterns__slug__benchmark_pack_draft_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_BenchmarkPackDraftBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_benchmark_search_from_capture_patterns__slug__benchmark_search_from_capture_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_BenchmarkSearchBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_pattern_objects_patterns_objects_get: {
        parameters: {
            query?: {
                phase?: string | null;
                tag?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatternObjectResponse"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pattern_object_patterns_objects__slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatternObjectResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_paper_patterns__slug__verify_paper_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pattern_backtest_patterns__slug__backtest_get: {
        parameters: {
            query?: {
                tf?: string;
                universe?: string;
                since_days?: number;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_captures_captures_get: {
        parameters: {
            query?: {
                user_id?: string | null;
                pattern_slug?: string | null;
                symbol?: string | null;
                status?: string | null;
                watching?: boolean | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_capture_captures_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaptureCreateBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    bulk_import_captures_captures_bulk_import_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BulkImportBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_verdict_inbox_captures_outcomes_get: {
        parameters: {
            query?: {
                user_id?: string | null;
                pattern_slug?: string | null;
                symbol?: string | null;
                status?: "outcome_ready" | "verdict_ready";
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_capture_verdict_captures__capture_id__verdict_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["api__routes__captures___VerdictBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_capture_benchmark_pack_draft_captures__capture_id__benchmark_pack_draft_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["CaptureBenchmarkSearchBody"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_capture_benchmark_search_captures__capture_id__benchmark_search_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["CaptureBenchmarkSearchBody"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_chart_annotations_captures_chart_annotations_get: {
        parameters: {
            query: {
                user_id?: string | null;
                /** @description e.g. BTCUSDT */
                symbol: string;
                timeframe?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    watch_capture_captures__capture_id__watch_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_verdict_deeplink_captures__capture_id__verdict_link_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_capture_captures__capture_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capture_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    memory_query_memory_query_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MemoryQueryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemoryQueryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    memory_feedback_memory_feedback_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MemoryFeedbackRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemoryFeedbackResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    memory_feedback_batch_memory_feedback_batch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MemoryFeedbackBatchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemoryFeedbackBatchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    memory_debug_session_memory_debug_session_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MemoryDebugSessionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemoryDebugSessionResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    memory_rejected_search_memory_rejected_search_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MemoryRejectedLookupRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemoryRejectedLookupResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    latest_run_screener_runs_latest_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    listings_screener_listings_get: {
        parameters: {
            query?: {
                /** @description A | B | C | excluded */
                grade?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    asset_detail_screener_assets__symbol__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    filtered_universe_screener_universe_get: {
        parameters: {
            query?: {
                /** @description A | B */
                min_grade?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    terminal_scan_rag_terminal_scan_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RagTerminalScanEmbeddingRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RagVectorResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    quick_trade_rag_quick_trade_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RagQuickTradeEmbeddingRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RagVectorResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    signal_action_rag_signal_action_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RagSignalActionEmbeddingRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RagVectorResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dedupe_hash_rag_dedupe_hash_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RagDedupeHashRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RagDedupeHashResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_live_signals_live_signals_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    post_verdict_live_signals_verdict_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["api__routes__live_signals___VerdictBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    flywheel_health_observability_flywheel_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    agent_status_observability_agent_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    gainers_dalkkak_gainers_get: {
        parameters: {
            query?: {
                top_n?: number;
                /** @description 최소 24h 거래량 */
                min_volume_usdt?: number;
                /** @description 최소 상승률 % */
                min_price_change_pct?: number;
                /** @description 신규 상장 기준일 */
                new_listing_days?: number;
                /** @description 신규 상장 가중치 */
                new_listing_boost?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_positions_dalkkak_positions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    open_position_dalkkak_positions_open_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpenPositionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    close_position_dalkkak_positions_close_post: {
        parameters: {
            query: {
                /** @description 심볼 예: BTCUSDT */
                symbol: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    caption_dalkkak_caption_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaptionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    risk_plan_dalkkak_risk_get: {
        parameters: {
            query: {
                /** @description 진입가 USDT */
                entry_price: number;
                /** @description 현재 ATR (USDT) */
                atr: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_world_model_alpha_world_model_get: {
        parameters: {
            query?: {
                grade?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_token_detail_alpha_token__symbol__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_token_history_alpha_token__symbol__history_get: {
        parameters: {
            query?: {
                since?: string | null;
                limit?: number;
            };
            header?: never;
            path: {
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_anomalies_alpha_anomalies_get: {
        parameters: {
            query?: {
                investigated?: boolean;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_alpha_watch_alpha_watch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_WatchBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_alpha_find_alpha_find_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_FindBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_scroll_alpha_scroll_get: {
        parameters: {
            query: {
                symbol: string;
                from_ts: string;
                to_ts: string;
                timeframe?: string;
                top_k?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_scan_alpha_scan_get: {
        parameters: {
            query?: {
                symbols?: string | null;
                universe?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_all_stats_refinement_stats_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_pattern_stats_refinement_stats__slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_suggestions_refinement_suggestions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_leaderboard_refinement_leaderboard_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_feature_window_features_window_get: {
        parameters: {
            query: {
                symbol: string;
                timeframe?: string;
                venue?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pattern_events_features_pattern_events_get: {
        parameters: {
            query: {
                symbol: string;
                timeframe?: string;
                venue?: string;
                pattern_family?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LogoutResponse"];
                };
            };
        };
    };
    get_f60_status_users__user_id__f60_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_verdict_accuracy_users__user_id__verdict_accuracy_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_user_wvpl_metrics_user__user_id__wvpl_get: {
        parameters: {
            query?: {
                weeks?: number;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    route_viz_intent_viz_route_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["_VizRouteBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_verdict_personalization_verdict_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["personalization__api__VerdictRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["personalization__api__VerdictResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_variant_personalization_user__user_id__variant__pattern_slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
                pattern_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VariantOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_affinity_personalization_user__user_id__affinity_get: {
        parameters: {
            query?: {
                top_k?: number;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AffinityListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_rescue_personalization_user__user_id__rescue__pattern_slug__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
                pattern_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RescueResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    validate_pattern_research_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ValidateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ValidateResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    discover_research_discover_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiscoverResponse"];
                };
            };
        };
    };
    trigger_autoresearch_research_autoresearch_trigger_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AutoresearchTriggerResponse"];
                };
            };
        };
    };
    get_signals_research_signals__symbol__get: {
        parameters: {
            query?: {
                /** @description e.g. 1h, 6h, 24h, 7d */
                lookback?: string;
            };
            header?: never;
            path: {
                symbol: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignalsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_run_research_runs__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_findings_research_findings_get: {
        parameters: {
            query?: {
                date?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FindingsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_alpha_quality_research_alpha_quality_get: {
        parameters: {
            query?: {
                lookback?: string;
                pattern_slug?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    market_search_research_market_search_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarketSearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MarketSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_indicator_features_research_indicator_features_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_signal_components_research_signals__signal_id__components_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                signal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_top_patterns_research_top_patterns_get: {
        parameters: {
            query?: {
                limit?: number;
                min_grade?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopPatternsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_summary_propfirm_summary_get: {
        parameters: {
            query: {
                user_id: string;
                account_id?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_account_propfirm_accounts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAccountBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_pattern_scan_jobs_pattern_scan_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_outcome_resolver_jobs_outcome_resolver_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_auto_capture_jobs_auto_capture_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_market_search_index_refresh_jobs_market_search_index_refresh_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_db_cleanup_jobs_db_cleanup_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_feature_windows_build_jobs_feature_windows_build_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_feature_materialization_jobs_feature_materialization_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    run_raw_ingest_jobs_raw_ingest_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    jobs_status_jobs_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    healthz_healthz_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    readyz_readyz_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    metrics_metrics_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    scanner_status_scanner_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
}
