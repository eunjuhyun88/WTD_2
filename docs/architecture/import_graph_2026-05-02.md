# Engine Import Graph — Baseline (2026-05-02)

> Captured at W-0386-A start. Reference for measuring coupling reduction progress.

## Coupling Counts (before W-0386)

| 패턴 | count | 비고 |
|---|---|---|
| `from engine.research` (absolute, 전체) | 45 | research/ 내부 cross-import 포함 |
| `from research.` (relative, **research/ 외부** 파일에서) | 235 | 실제 외부 결합 — 핵심 지표 |
| `from research.` (relative, research/ 내부 cross) | (45 - 0 = 별도) | sub-package 분해 후 정리 대상 |
| `from engine.scanner` (external) | 0 | scanner는 외부 노출 없음 |
| `from engine.ledger` (external) | 0 | ledger는 외부 노출 없음 |

## 경쟁 진입점 (before W-0386, 실측)

| 진입점 | 위치 |
|---|---|
| `ResearchPipeline.run` | `engine/pipeline.py:328` |
| `run_scan` | `engine/scanner/realtime.py:230` |
| `scan_universe_job` | `engine/scanner/jobs/universe_scan.py:156` |
| `scan_alpha_observer_job` | `engine/scanner/jobs/alpha_observer.py:37` |
| `scan_alpha_warm_job` | `engine/scanner/jobs/alpha_warm.py:33` |
| `run_once` | `engine/research/autoresearch_runner.py:133` |
| `run_cycle` (loop) | `engine/research/autoresearch_loop.py:250` |
| `run_until` | `engine/research/autoresearch_loop.py:356` |
| `run_cycle` (orchestrator) | `engine/research/orchestrator.py:50` |
| `run_discovery_cycle` | `engine/research/discovery_agent.py:243` |
| `scan_universe_live` | `engine/research/live_monitor.py:175` |
| `scan_all_patterns_live` | `engine/research/live_monitor.py:378` |
| `run_pattern_benchmark_search` | `engine/research/pattern_search.py:3143` |
| `scan_universe` (pattern_scan) | `engine/research/pattern_scan/scanner.py:761` |
| `scan_universe` (event_tracker) | `engine/research/event_tracker/detector.py:58` |
| `run_full_validation` | `engine/research/validation/runner.py:65` |
| `run_layer2_through_layer6` | `engine/research/validation/facade.py:202` |
| `run_pattern_bounded_eval` | `engine/research/pattern_refinement.py:45` |
| `run_pattern_backtest` | `engine/research/backtest.py:306` |
| `run_pattern_market_search` | `engine/research/market_retrieval.py:490` |

**총 20개** 경쟁 진입점.

## 거대 파일 (before W-0386)

| 파일 | LOC | 비고 |
|---|---|---|
| `engine/research/pattern_search.py` | 3143 | W-0386 Non-Goal (별도 W-####) |
| `engine/scanner/feature_calc.py` | 1897 | W-0386 Non-Goal (별도 W-####) |
| `engine/scanner/scheduler.py` | 611 | Phase D에서 → ≤ 350 |
| `engine/pipeline.py` | 458 | Phase B에서 → ≤ 120 |

## 외부 결합 파일 목록 (from research. 사용, research/ 외부)

```
engine/api/main.py
engine/api/routes/captures.py
engine/api/routes/live_signals.py
engine/api/routes/patterns.py
engine/api/routes/research.py
engine/api/routes/search.py
engine/building_blocks/confirmations/cot_commercial_net_long.py
engine/building_blocks/confirmations/cot_large_spec_long.py
engine/building_blocks/confirmations/cot_large_spec_short.py
engine/building_blocks/confirmations/cot_positioning_flip.py
engine/patterns/risk_policy.py
engine/patterns/scanner.py
engine/pipeline.py
engine/scanner/alerts_pattern.py
engine/scanner/jobs/extreme_event_tracker.py
engine/scanner/jobs/pattern_refinement.py
engine/scanner/realtime.py
engine/scanner/scheduler.py
engine/scripts/autoresearch_1000.py
engine/scripts/backfill_signal_events.py
engine/scripts/run_quant_backtest.py
```

## Target (after W-0386-D)

| 지표 | before | target | phase |
|---|---|---|---|
| 경쟁 진입점 수 | 20개 | 1개 (`CoreLoopBuilder.run`) | B |
| `engine/pipeline.py` LOC | 458 | ≤ 120 | B |
| `engine/scanner/scheduler.py` LOC | 611 | ≤ 350 | D |
| `from research.` external imports | 235 | ≤ 30 (shim 경유) | C |
| import-linter violations | 측정 전 | 0 | D |
| research/ sub-packages | 0 | 4 (discovery/validation/ensemble/artifacts) | C |
