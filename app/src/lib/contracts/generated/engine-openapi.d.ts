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
         * Label Capture Verdict
         * @description Attach a founder verdict to a resolved capture (axis 3 close).
         *
         *     Requires status='outcome_ready'. The linked PatternOutcome is updated
         *     with user_verdict, a LEDGER:verdict record is appended, and the capture
         *     status advances to 'verdict_ready'.
         */
        post: operations["label_capture_verdict_captures__capture_id__verdict_post"];
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
            /** User Id */
            user_id: string;
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
            /**
             * Entry Price
             * @description Optional hint. Resolver derives entry_price from OHLCV regardless.
             */
            entry_price?: number | null;
        };
        /** CaptureCreateBody */
        CaptureCreateBody: {
            /**
             * Capture Kind
             * @default pattern_candidate
             * @enum {string}
             */
            capture_kind: "pattern_candidate" | "manual_hypothesis" | "chart_bookmark" | "post_trade_review";
            /** User Id */
            user_id?: string | null;
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
        /** ScanRequest */
        ScanRequest: {
            /** Symbols */
            symbols?: string[] | null;
            /**
             * Send Alerts
             * @default true
             */
            send_alerts: boolean;
        };
        /** ScanResponse */
        ScanResponse: {
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
            /** User Id */
            user_id?: string | null;
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
        /** VerdictBody */
        VerdictBody: {
            /**
             * User Verdict
             * @enum {string}
             */
            user_verdict: "valid" | "invalid" | "missed";
            /** User Note */
            user_note?: string | null;
        };
        /** VerdictRequest */
        VerdictRequest: {
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
        VerdictResponse: {
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
        /** _PatternAlertPolicyBody */
        _PatternAlertPolicyBody: {
            /** Mode */
            mode: string;
        };
        /** _PatternTrainBody */
        _PatternTrainBody: {
            /** User Id */
            user_id?: string | null;
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
                user_id?: string | null;
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
                "application/json": components["schemas"]["VerdictRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerdictResponse"];
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
                "application/json": components["schemas"]["ScanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScanResponse"];
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
    get_stats_patterns__slug__stats_get: {
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
    get_training_records_patterns__slug__training_records_get: {
        parameters: {
            query?: {
                limit?: number;
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
    get_model_registry_patterns__slug__model_registry_get: {
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
    list_captures_captures_get: {
        parameters: {
            query?: {
                user_id?: string | null;
                pattern_slug?: string | null;
                symbol?: string | null;
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
    label_capture_verdict_captures__capture_id__verdict_post: {
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
                "application/json": components["schemas"]["VerdictBody"];
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
                    "application/json": {
                        [key: string]: unknown;
                    };
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
