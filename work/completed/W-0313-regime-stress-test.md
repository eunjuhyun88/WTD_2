# W-0313 — 시뮬레이션 기반 사전 검증 (Regime Stress Test)

> Wave: 4 | Priority: P1 | Effort: M
> Status: 🟡 Design Draft
> Created: 2026-04-29

## Goal

신규 패턴 캡처 시점에 **즉시** 사전 EV 추정치를 제공해, 72h 실시간 버딕트 도래 전 "가정 운영" 공백을 통계적 추정으로 채운다. Prop AMM의 1000-trial 파라메트릭 시뮬레이션을 Cogochi 도메인(과거 유사 국면 N개 walk-forward)에 차용.

```
캡처 즉시 표시:
"사전 추정 EV: +1.2% (CI: [0.8%, 1.6%], n=23)"
72h 후:
"실제 verdict: HIT +1.4%  [✓ within CI]"
```

## Scope

- `engine/verification/pre_simulator.py` (신규, ~250 LoC)
- `engine/verification/schemas.py`에 `SimPreValidationResult` dataclass
- `engine/backtest/regime.py` D12 stub → D13 minimal classifier (volatility quintile + trend slope)
- `engine/backtest/simulator.walk_one_trade` 재사용 (수정 없음)
- API: `POST /verification/pre-validate`
- UI: `PreValidationBadge.svelte` (캡처 카드 prop 추가)
- 캘리브레이션 로깅: 72h 후 actual_verdict와 joinable

**파일**
- 신규: `engine/verification/pre_simulator.py`, `engine/verification/schemas.py` (SimPreValidationResult), `engine/api/routes/verification.py`, `engine/tests/verification/test_pre_simulator.py`, `app/src/lib/components/capture/PreValidationBadge.svelte`
- 수정: `engine/backtest/regime.py` (classify_regime 추가), `engine/research/candidate_search.py` (`as_of` 파라미터), `app/src/lib/components/capture/CaptureCard.svelte`

## Non-Goals

- copy_trading 변경 (Frozen)
- ORPO/DPO 학습 루프 (추론만 사용)
- D15 본격 regime classifier (HMM/Markov) — 본 W는 quintile-based만
- 사전 추정치를 autotrade 차단 신호로 사용 (advisory only)
- N<10 prior shrinkage (데이터 충분 후 재검토)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| walk_one_trade 30회 latency 폭발 (>2s) | M | H | top_k=30, klines pre-cache, async batch. P95<800ms 목표 |
| search returns <10 → 통계 무의미 | H | M | n<10 시 `confidence="insufficient"` 명시, win_rate 숨김 |
| Lookahead bias | M | **CRIT** | captured_at strict `<` 3-layer defense |
| Regime stub → 전부 unknown | M | M | quintile fallback (variance<1e-6 → single bucket) |
| 사전≠사후 systematic divergence | L | H | brier score 추적, calibration 대시보드 |
| API 추가로 캡처 path 차단 | L | H | fire-and-forget async, 실패 시 캡처 진행 |

### Dependencies / Files Touched

- 의존: `backtest.walk_one_trade` (read-only), `backtest.metrics.compute_metrics` (sharpe 일부)
- 의존: `research.candidate_search.search_similar_patterns` (as_of 파라미터 추가)
- 수정: `backtest/regime.py` (classify_regime), `candidate_search.py` (as_of)

### Rollback

- Feature flag `COGOCHI_PRE_VALIDATION_ENABLED=false` → API 503, UI badge 숨김
- DB 스키마 변경 없음 (캘리브레이션 테이블만 추가, drop 가능)
- 단일 commit revert로 전체 비활성화

## AI Researcher 관점

### 통계 설계

**Win rate CI**: Wilson score interval (95%)
- 공식: `p̂ ± z√(p̂(1-p̂)/n + z²/4n²) / (1 + z²/n)`, z=1.96
- N<30에서 normal approximation보다 보수적
- 최소 n: **10** (미만이면 confidence="insufficient")

**Expectancy CI**: Bootstrap percentile (B=2000, seed=42)
- 이유: trade-level PnL fat-tail → normal 가정 불가
- 95% CI = [P2.5, P97.5]

**Sharpe**: mean(returns)/std(returns) × √365 (A076 hardening 준수)
- n<20이면 표시 안 함 (variance 추정 불안정)

**Regime breakdown**: bucket 당 n≥3, 미만이면 "n/a"

### Regime 분류 (D13 minimal)

**Volatility** (3-bucket): 30-bar realized vol을 전체 history quintile로 분류
- low: Q1 이하, mid: Q2-Q4, high: Q5 이상

**Trend** (3-bucket): 30-bar linear regression slope t-stat
- trending_up: t>2, trending_down: t<-2, ranging: |t|≤2

**복합 라벨**: `{vol}_{trend}` → 9 bucket (UI: 4개 주요만 표시)

### Lookahead Bias 방지 (3-layer)

1. `search_similar_patterns(spec, as_of=spec.captured_at)` — `created_at < as_of` 필터
2. `walk_one_trade` 전달 klines: entry_ts ± 윈도우, 모두 captured_at 이전
3. 단위 테스트: T+1ms inject해도 누락 확인

### Failure Modes

| Mode | 감지 | 대응 |
|---|---|---|
| n=0 | search 빈 list | `confidence="no_history"`, UI: "최초 등장 패턴" |
| n<10 | count check | `confidence="insufficient"`, win_rate 비표시 |
| variance=0 | std<1e-9 | sharpe 비표시 |
| walk_one_trade 예외 | try/except per trial | trial drop, n_effective 별도 표기 |
| Calibration drift (brier>0.25) | nightly brier 집계 | 알림, prior shrinkage 도입 (별도 W) |

## Decisions

- **[D-0313-1]** Regime 분류: **복합 (vol × trend)**. 9 bucket, UI 4개 주요 표시
- **[D-0313-2]** CI: **Wilson (win_rate) + Bootstrap (expectancy)**. Hybrid가 각 분포에 정확
- **[D-0313-3]** 비교 표시: 72h 후 캡처 카드 dual-row (사전 추정 + 실제 verdict + within-CI 표시)

## Open Questions

- [ ] [Q-0313-1] similar pattern 유사도 threshold: top_k 고정 vs score≥0.7 필터?
- [ ] [Q-0313-2] 동일 symbol 자기 자신 포함 여부 → 제외(exclude_same_slug=True) 확정?
- [ ] [Q-0313-3] 사전 추정치 캐시 TTL: 캡처 당 1회 계산 vs 주기 재계산?

## Implementation Plan

**Phase 1** (1d): `backtest/regime.py` D13 minimal classifier
- `classify_regime(klines, as_of_idx, lookback=30) -> RegimeLabel`
- realized vol quintile + OLS t-stat
- Tests: 5 합성 시계열

**Phase 2** (1.5d): `verification/pre_simulator.py` core
```python
@dataclass(frozen=True)
class SimPreValidationResult:
    slug: str; n_sim: int; n_effective: int
    confidence: Literal["sufficient","insufficient","no_history"]
    win_rate_sim: float | None; win_rate_ci: tuple[float,float] | None
    expectancy_sim: float | None; expectancy_ci: tuple[float,float] | None
    sharpe_sim: float | None
    regime_breakdown: dict[RegimeLabel, RegimeStats]
    trials: list[SimTrial]; generated_at: datetime
```
- Wilson helper + Bootstrap helper → `verification/stats.py`
- `run_pre_validation(spec, klines_loader, top_k=30) -> SimPreValidationResult`

**Phase 3** (0.5d): API + persistence
- `POST /verification/pre-validate`
- `pre_validation_runs` 테이블 적재
- `verdict_calibration` view (72h join용)

**Phase 4** (0.5d): UI badge + CaptureCard wiring

**Phase 5** (0.5d): 15 tests (lookahead 3케이스, Wilson numeric, n<10, n=0, regime breakdown, bootstrap determinism)

**총 ~4.0d (Effort M)**

## Exit Criteria

- [ ] AC1: N≥10 시 `win_rate_ci` width < 0.30 (Wilson 95%)
- [ ] AC2: `regime_breakdown` 4개 이상 bucket (n≥10 케이스)
- [ ] AC3: 모든 `SimTrial.entry_ts < spec.captured_at` (1ms 후 inject 테스트)
- [ ] AC4: API P95 latency < 800ms (top_k=30)
- [ ] AC5: Feature flag off 시 캡처 path 정상, badge 숨김
- [ ] AC6: 72h 후 verdict와 join 가능한 `verdict_calibration` view 존재
- [ ] AC7: pytest 15/15 PASS, svelte-check 0 errors
- [ ] AC8: n<10 시 win_rate 절대 표시 안 함 (UI 단위 테스트)
