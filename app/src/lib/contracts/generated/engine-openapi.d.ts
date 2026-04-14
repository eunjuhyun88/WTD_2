// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: engine/scripts/export_openapi.py

export interface paths {
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
         *
         *     Minimum klines required: MIN_HISTORY_BARS (500) for EMA200 warmup.
         *     If fewer are sent, a 400 is returned — caller should send more history.
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
         *
         *     Requires at least 120 kline bars (ATR 100-bar percentile window).
         *     Perp data is optional — missing values score 0 in the corresponding layer.
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
         *
         *     Checks Binance prices and applies HIT/MISS/EXPIRED verdicts.
         */
        post: operations["auto_evaluate_patterns__slug__evaluate_post"];
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
         *
         *     Validates block names against the block evaluator registry.
         */
        post: operations["register_pattern_patterns_register_post"];
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
        _VerdictBody: {
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
                "application/json": components["schemas"]["_VerdictBody"];
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
