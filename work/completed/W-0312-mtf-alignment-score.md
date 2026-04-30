# W-0312 — 크로스 타임프레임 정렬 점수 (MTF Alignment)

> Wave: 4 | Priority: P1 | Effort: M
> Status: 🟡 Design Draft
> Created: 2026-04-29

## Goal

동일 `(symbol, pattern_slug)` 조합에 대해 여러 타임프레임의 PatternStateMachine phase를 집계하여 단일 `mtf_alignment_score ∈ [0, 1]` 값을 산출한다. 이 스칼라를 candidate ranking에 주입하여, "1h만 BREAKOUT" 같은 단일 TF 노이즈 후보보다 "1h+4h+1d 모두 BREAKOUT" 같은 다중 TF 정렬 후보가 상위에 노출되도록 한다.

핵심 가설: 상위 TF가 동일 phase를 지지하는 setup은 평균 HIT rate가 높고 MAE가 낮다.

## Scope

**포함**
- `engine/patterns/mtf_alignment.py` (신규) — `compute_mtf_score(phases_by_tf, target_phase, weights, partial_table) -> MTFResult`
- `engine/patterns/scanner.py` — `run_pattern_scan` 후 동일 symbol의 멀티 TF 결과를 `MTFAggregator`로 묶음
- `engine/research/candidate_search.py` — `mtf_alignment_score` context feature 추가
- `engine/scoring/candidate_score.py` — `score *= (0.5 + 0.5 × mtf_score)` 곱산
- `engine/tests/test_mtf_alignment.py` — 단위 테스트 + golden fixture (12 케이스)
- `research/validation/test_mtf_hit_correlation.py` — MTF score vs HIT rate 통계 검증

**API**
```python
@dataclass(frozen=True)
class MTFResult:
    score: float                      # [0, 1]
    available_tfs: tuple[str, ...]    # ("1h", "4h")
    aligned_tfs: tuple[str, ...]
    partial_tfs: tuple[str, ...]
    raw_phases: dict[str, str]        # {"1h": "BREAKOUT", ...}
    weight_sum: float

def compute_mtf_score(
    phases_by_tf: dict[str, str],
    target_phase: str,
    weights: dict[str, float] = DEFAULT_TF_WEIGHTS,   # {1h:1.0, 4h:2.0, 1d:3.0}
    partial_table: dict[str, dict[str, float]] = DEFAULT_PARTIAL,
) -> MTFResult: ...
```

**파일**
- 신규: `engine/patterns/mtf_alignment.py`, `engine/tests/test_mtf_alignment.py`, `research/validation/test_mtf_hit_correlation.py`
- 수정: `engine/patterns/scanner.py`, `engine/research/candidate_search.py`, `engine/scoring/candidate_score.py`
- 스키마: `PatternScanResult.mtf_alignment: MTFResult | None` 추가 (Optional → 하위호환)

## Non-Goals

- Cross-symbol alignment (BTC-ETH 동조) — 별 work item
- 동일 symbol 다른 pattern_slug 매칭 — 동일 slug만
- Hill Climbing으로 TF 가중치 학습 — Phase 2로 분리 (D-0312-3)
- 15m/5m 타임프레임 — noise 과다

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Scanner N배 호출 증가 | High | M | 이미 multi-tf 스캔 중. aggregator는 메모리 join만 |
| 1d phase stale (24h 갱신) | High | H | partial_table에서 ACCUM→BREAKOUT = 0.5 |
| TF 결손 시 점수 왜곡 | Med | M | available_tf 기반 정규화 |
| MTF-HIT 무상관 위험 | Med | H | validation test Spearman ρ≥0.15 게이트 |
| Layer C 미구현 | Low | M | 곱산으로 결정 (D-0312-1), Layer C는 후속 |

### Dependencies / Files Touched

- 의존: PatternStateMachine phase 정의 (FROZEN)
- 신규: `engine/patterns/mtf_alignment.py`, 테스트 2개
- 수정: scanner.py (1곳), candidate_search.py (Layer C), candidate_score.py (1줄)

### Rollback

- Feature flag `MTF_ALIGNMENT_ENABLED` (default False → True after AC pass)
- Disable 시 곱산 multiplier=1.0, Layer C mtf feature=0.0
- `PatternScanResult.mtf_alignment` Optional → downstream None 처리만

## AI Researcher 관점

### MTF 가중치 설계 이유

1. **SNR**: 상위 TF candle은 마이크로 노이즈 평균화 → phase 판정 FP rate 낮음
2. **Trend persistence**: 1d BREAKOUT은 multi-day 추세 동반. 1h는 1~4h mean-revert 가능
3. **Information leakage**: 상위 TF phase → 하위 TF future phase에 정보 흘림 (역방향은 약함)

고정 가중치: `{1h: 1.0, 4h: 2.0, 1d: 3.0}` (선형, 지수 대비 1h 신호 과도 무시 방지)

### Phase 부분 정렬 수치화

target=`BREAKOUT` 기준 partial_table:

| Observed | Score | 근거 |
|---|---|---|
| BREAKOUT | 1.0 | 완전 정렬 |
| ACCUMULATION | 0.5 | 직전 단계, leading indicator |
| ARCH_ZONE | 0.3 | 중립 |
| REAL_DUMP | 0.0 | 반대 방향 차단 |
| FAKE_DUMP | 0.2 | reversal 가능성 약간 |

5×5 lookup table (target × observed). 하드코딩 + golden fixture.

### Statistical Validation

`research/validation/test_mtf_hit_correlation.py`:
1. 6개월 backtest → candidates별 mtf_score 계산
2. 4분위 분할 → Q4 hit_rate ≥ Q1 + 0.05
3. Spearman ρ(mtf_score, forward_return_24h) ≥ 0.15
4. BH-FDR q < 0.05 (multiple testing 보정)
5. Walk-forward: IS→OOS hit_rate decay < 30%

게이트 실패 시: multiplier=1.0 무력화 (코드는 land, production effect=0)

### Failure Modes

1. Whipsaw on 1h: PatternStateMachine 내 hysteresis로 debounce
2. TF 시간 정렬 오차: 4h close 직후 1h만 갱신 → 4h는 직전 종가 기준 (명시적 트레이드오프)
3. Phase definition drift: partial_table을 PatternStateMachine과 동일 모듈에 정의
4. 희소 TF: 신규 상장 → 1d weight를 candle 수로 감쇠 (Phase 2)
5. Pattern asymmetry: mirror invariant 단위테스트 강제

## Decisions

- **[D-0312-1]** 경로: **곱산** `score *= (0.5 + 0.5×mtf_score)`. Layer C는 미구현 stub → 즉시 ranking 효과. floor=0.5로 단일 TF도 보존
- **[D-0312-2]** TF 조합: **{1h, 4h, 1d}**. 15m/5m noise 과다, 1w 데이터 희소
- **[D-0312-3]** 가중치: **Phase 1 고정 {1h:1.0, 4h:2.0, 1d:3.0}** → Phase 2 HC 학습 (별 work item)

## Open Questions

- [ ] [Q-0312-1] 4h candle close 직후 1h만 갱신된 순간 → always-fresh vs boundary-aligned?
- [ ] [Q-0312-2] 신규 상장 1d candles<30 시 weight 감쇠 적용 시점 (Phase 1 vs 2)?
- [ ] [Q-0312-3] pattern_slug별 partial_table 분리 필요 여부?
- [ ] [Q-0312-4] mtf_score UI 노출 여부 + 사용자 해석 메타데이터?

## Implementation Plan

1. **(0.5d)** `engine/patterns/mtf_alignment.py` — `MTFResult` + `compute_mtf_score` + DEFAULT_TF_WEIGHTS + DEFAULT_PARTIAL_TABLE
2. **(0.5d)** `engine/tests/test_mtf_alignment.py` — 12 golden fixture (완전/부분/반대/TF결손 3종/mirror invariant/정규화/edge)
3. **(0.5d)** `scanner.py` `MTFAggregator` — per-symbol multi-tf join + `MTF_ALIGNMENT_ENABLED` flag
4. **(0.5d)** `candidate_score.py` 곱산 1줄
5. **(1.0d)** `research/validation/test_mtf_hit_correlation.py` — Spearman/BH-FDR/walkforward
6. **(0.5d)** integration test + PR

## Exit Criteria

- [ ] AC1: BTCUSDT fixture에서 mtf=1.0(3-TF BREAKOUT)이 mtf<0.3 대비 ranking 상위 10/10
- [ ] AC2: `available_tfs=("1h",)` 시 weight_sum=1.0 정규화, division-by-zero 없음
- [ ] AC3: 5×5 partial_table mirror invariant 만족 (rally vs dump 거울 대칭)
- [ ] AC4: 6개월 backtest Q4 hit_rate ≥ Q1+0.05, Spearman ρ≥0.15, BH-FDR q<0.05
- [ ] AC5: Walk-forward IS→OOS hit_rate decay < 30%
- [ ] AC6: scanner per-symbol latency 증가 < 5%
- [ ] AC7: `MTF_ALIGNMENT_ENABLED=False` 시 candidate ranking byte-identical
- [ ] AC8: 12개 golden fixture 100% PASS
- [ ] AC9: `PatternScanResult.mtf_alignment` Optional → downstream 미수정 시 정상 동작
