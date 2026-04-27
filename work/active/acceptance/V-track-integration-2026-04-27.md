# V-track Integration Acceptance Report

## V-04 Sequence Completion (real benchmark_packs)

- **n_packs**: 12
- **n_cases**: 35
- **g6_pass_exact**: 35
- **g6_pass_dwell**: 35
- **g6_pass_shuffled**: 0
- **avg_completion_exact**: 1.0
- **avg_completion_shuffled**: 0.7676190476190481
- **avg_latency_ms_per_3calls**: 0.04135475028306246
- **p95_latency_ms_per_3calls**: 0.0457499991171062
- **max_latency_ms_per_3calls**: 0.09066599886864424
- **perf_budget_pass**: True

## V-06 Stats Engine (realistic 1000 samples)

- **samples_n**: 1000
- **bootstrap_point**: 0.0022777112251013286
- **bootstrap_ci_low**: 0.0007329395407634192
- **bootstrap_ci_high**: 0.0038154527992963656
- **bootstrap_ms_for_10k_iter**: 79.6552500105463
- **dsr_realistic_n_trials_2000**: 39.2910993691279
- **dsr_ms**: 4.43058303790167
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
- **total_split_ms**: 5.4966669995337725
- **no_leak_pass**: True

## V-02 phase_eval (REAL klines from data_cache parent-repo cache)

- **n_packs_with_klines_cache**: 15
- **n_entries_attempted**: 35
- **n_results_h4**: 35
- **n_results_h24**: 35
- **max_latency_ms_h4**: 3499.910083017312
- **max_latency_ms_h24**: 3557.1813749847934
- **avg_latency_ms_h4**: 2046.8007666718524
- **c1_cost_delta_observed_pct**: 0.14999999999999997
- **c1_cost_fix_pass**: True
- **perf_budget_ok_h4**: True

## Memory delta: **264.0 KB** (tracemalloc)

## ✅ All acceptance gates passed

