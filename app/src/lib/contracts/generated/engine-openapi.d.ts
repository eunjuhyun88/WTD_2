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
         *       user_verdict    — "valid" | "invalid" | "missed" | null
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
        /** _CaptureBody */
        _CaptureBody: {
            /** Symbol */
            symbol: string;
            /** User Id */
            user_id?: string | null;
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
        /** _WatchBody */
        _WatchBody: {
            /** User Id */
            user_id: string;
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
            verdict: "valid" | "invalid" | "missed";
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
    get_all_stats_patterns_stats_all_get: {
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
    list_captures_captures_get: {
        parameters: {
            query?: {
                user_id?: string | null;
                pattern_slug?: string | null;
                symbol?: string | null;
                status?: string | null;
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
