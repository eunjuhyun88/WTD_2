# V-track Integration Acceptance Report

## V-04 Sequence Completion (real benchmark_packs)

- **n_packs**: 12
- **n_cases**: 35
- **g6_pass_exact**: 35
- **g6_pass_dwell**: 35
- **g6_pass_shuffled**: 0
- **avg_completion_exact**: 1.0
- **avg_completion_shuffled**: 0.7676190476190481
- **avg_latency_ms_per_3calls**: 0.06284995303888406
- **p95_latency_ms_per_3calls**: 0.15595805598422885
- **max_latency_ms_per_3calls**: 0.18516700947657228
- **perf_budget_pass**: True

## V-06 Stats Engine (realistic 1000 samples)

- **samples_n**: 1000
- **bootstrap_point**: 0.0022777112251013286
- **bootstrap_ci_low**: 0.0007329395407634192
- **bootstrap_ci_high**: 0.0038154527992963656
- **bootstrap_ms_for_10k_iter**: 64.80020796880126
- **dsr_realistic_n_trials_2000**: 39.2910993691279
- **dsr_ms**: 3.2005839748308063
- **profit_factor_normal**: 1.261814378356992
- **profit_factor_all_positive_capped**: 999.0
- **n1_cap_pass**: True
- **hit_rate**: 0.546
- **json_serializable**: True
- **perf_budget_bootstrap_ms**: True

## V-01 PurgedKFold (synthetic 1000-period series)

- **n_samples**: 1000
- **n_splits_yielded**: 5
- **leak_count**: 0
- **avg_train_size**: 788.8
- **avg_test_size**: 200.0
- **total_split_ms**: 4.081457969732583
- **no_leak_pass**: True

## V-02 phase_eval (module-load smoke; klines absent in worktree)

- **module_loadable**: True
- **has_measure_phase_conditional_return**: True
- **has_PhaseConditionalReturn**: True
- **has_measure_random_baseline**: True
- **real_data_skipped_reason**: klines parquet cache not in worktree

## Memory delta: **74.8 KB** (tracemalloc)

## ✅ All acceptance gates passed

