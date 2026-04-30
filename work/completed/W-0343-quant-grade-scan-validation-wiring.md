# W-0343 — Quant-Grade Scan Validation Wiring

> Wave: 5 | Priority: P0 | Effort: M (3-4일)
> Issue: #727
> Charter: In-Scope (research engine)
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal

메인 스캔 파이프라인(`autoresearch_loop.run_cycle` → `pattern_scan/scanner.scan_universe`)이 실제로 OOS 검증·진짜 walk-forward·올바른 BH-FDR family·자기상관 허용 t-test를 통과한 패턴만 산출하도록 한다. W-0317 facade의 `validate_and_gate()`를 메인 루프에 wiring하되, scanner 자체에도 시간 분할을 강제하여 "발견과 평가가 동일 데이터"라는 근본 결함을 제거한다.

**성공 정의**: 동일 universe·동일 시점에서 top_patterns 평균 Sharpe가 in-sample 대비 30~60% 하락하면서도 G1/G2/G4 재현이 안정(다음 사이클 ≥70% 일관).

---

## 왜 W-0317이 이걸 해결하지 못했나

| | W-0317 (기존) | W-0341 (이번) |
|---|---|---|
| facade 구현 | ✅ 완전한 Welch/DSR/BH | ✅ 재사용 |
| 실제 pack | ❌ `cases=[]` (빈 pack으로 호출) | ✅ holdout trades → BenchmarkCase bridge |
| 메인 스캔 연결 | ❌ discovery_tools에서만 호출 | ✅ autoresearch_loop에 wiring |
| 발견/평가 분리 | ❌ in-sample 전체 | ✅ train 70% / holdout 30% |
| Walk-forward | ❌ n_executed 카운트 | ✅ K=3 fold별 Sharpe |
| BH family | ❌ eligible 후보만 m | ✅ scan_universe m_total |

---

## Scope

### 수정 파일
- `engine/research/pattern_scan/scanner.py` — train/holdout split 도입, holdout per-trade returns 반환
- `engine/research/autoresearch_loop.py` — 진짜 walk-forward, bootstrap p-value, validate_and_gate 호출
- `engine/pipeline.py` — `_bh_correct()` m_total 명시 전달

### 신규 파일
- `engine/research/pattern_scan/oos_split.py` — `train_holdout_split()` (단일 책임)
- `engine/research/pattern_scan/trade_bridge.py` — `PatternResult` + returns → `BenchmarkCase` 변환
- `engine/tests/research/pattern_scan/test_oos_wiring.py`

### 읽기 전용 (변경 불가)
- `engine/research/pattern_search.py` (V-00 frozen, W-0214 §14.8)
- `engine/research/validation/{cv,walkforward,stats,pipeline,facade}.py` (재사용만)
- `engine/scanner/pnl.py`, `engine/backtest/metrics.py`

---

## Non-Goals

- W-0317 facade 시그니처 변경 — shadow stage 운영 중, 회귀 위험
- `validate_and_gate` Supabase registry 스키마 변경 — W-0317 영역
- `pattern_search.py` 수정 — V-00 frozen
- 새로운 피처 추가 — W-0340 Phase 1 범위
- HAC (Newey-West) standard error — 이번 wave 범위 초과, Phase 2에서
- Dynamic walk-forward window tuning — 고정 K=3 fold만

---

## CTO 관점

### Risk Matrix

| 위험 | 가능성 | 영향 | 완화 |
|---|---|---|---|
| holdout 30% → n_executed 부족으로 패턴 80%+ 탈락 | 高 | 高 | `MIN_HOLDOUT_TRADES=10` flag, 미달 시 `wf_ok=False`로 표기하되 결과 보존 (telemetry용) |
| fold별 재실행으로 사이클 시간 N×K 증가 | 高 | 中 | K=3 고정, fold parallel은 Phase 2; 1차 목표는 정확성 |
| BH family m_total 잘못 전달 시 FDR 과소 추정 | 中 | 高 | `assert m_total >= len(eligible)` 강제, 단위테스트 |
| trade-returns autocorr 무시한 채 Welch → type-I 인플레 | 中 | 中 | block-bootstrap p-value를 stats.py 기존 bootstrap 경로로 우회 (HAC는 Phase 2) |
| BenchmarkCase 변환 누락 필드로 facade 오류 | 低 | 高 | bridge 단위테스트 우선, facade 호출은 try/except + structured log |

### Dependencies / Rollback / Files Touched

- 의존: W-0317 facade (merged), W-0290 Ph2 walkforward (merged), W-0340 Ph1 (merged, PR #720)
- Rollback: `RESEARCH_OOS_WIRING=off` env flag로 즉시 in-sample 경로 복귀. 첫 사이클은 기본 off (shadow)
- 예상 LOC: scanner.py +120, autoresearch_loop.py +90, pipeline.py +30, 신규 모듈 ~250, 테스트 ~300

---

## AI Researcher 관점

### 왜 이게 필요한가 (논문 근거)

1. **In-sample bias** — Bailey & López de Prado (2014), "The Probability of Backtest Overfitting"; Harvey & Liu (2015) "Backtesting" — 동일 데이터 발견·평가는 Sharpe를 ~2배 부풀림. crypto regime 변화로 효과 더 큼.
2. **BH family 오정의** — Benjamini-Hochberg (1995): 전체 family m이 분모여야 함. eligible filter 후 적용은 selection-after-test → selection bias. López de Prado (2018) ch.8 "Selection Bias under Multiple Testing".
3. **IID 가정 위반** — 트레이딩 returns는 자기상관 + heteroscedasticity. 이항 검정 `(p-0.5)/sqrt(p(1-p)/n)`은 IID Bernoulli 가정. Newey-West HAC 또는 stationary block bootstrap (Politis & Romano 1994) 표준.
4. **Walk-forward 부재** — Pardo (2008) 책 전체 주제. n_executed 카운트로 시간 안정성 대체는 통계적 의미 없음.

### Data Impact / Statistical Validation / Failure Modes

- Data: Spot universe 2yr, holdout=30% 적용 시 fold당 ~2.4개월 → trade 빈도 낮은 패턴 자연 탈락 (의도된 효과)
- 새 게이트: G1 Welch(returns vs zero, two-sided), G2 DSR>0.5, G3 Walk-forward K=3 모두 Sharpe>0, G4 Bootstrap CI lower>0, BH-FDR(α=0.10) over m_total
- Failure modes:
  - 모든 패턴 탈락 → telemetry로 G1~G4 통과율 분포 모니터링
  - fold 결과 NaN → timestamp tz 버그 가능성 → fold 생성기 단위테스트 강제

---

## Decisions

**D1 — Option A + B 하이브리드 채택**
- Scanner 내부 train/holdout split (Option A): 발견·평가 분리 보장
- holdout trades → BenchmarkCase → `validate_and_gate()` (Option B): stats 엔진 재사용
- 거절 - Option A 단독: stats 엔진 또 짜야 함 (DRY 위반)
- 거절 - Option B 단독: 발견이 여전히 in-sample (P1 미해결)

**D2 — Walk-forward: scanner 외부 K=3 fold loop**
- 피처 재계산 없이, entry signal 대해 fold 윈도우 trades만 재평가
- 거절 - scanner 내부 K-fold: 피처 재계산 비용 N×K 폭발

**D3 — BH family: `scan_universe`가 m_total 반환**
- `ScanReport.m_total` = (pattern_slug × symbol) 평가 시도 횟수
- 거절 - 패턴 slug 수만 m: 심볼 차원 multiple testing 누락

**D4 — Autocorrelation: stationary block bootstrap (block_size=10)**
- 기존 `stats.py` bootstrap 코드 재사용
- 거절 - HAC Newey-West: 이번 wave 범위 초과

**D5 — 첫 배포: `RESEARCH_OOS_WIRING=off` 기본값 (shadow 운영)**
- 1사이클 telemetry 확인 후 on 전환 결정

---

## Open Questions

- [ ] [Q1] holdout 비율 30% vs 20%? Pardo 25% 권장. crypto regime 짧으면 20% 합리.
- [ ] [Q2] BH α=0.05 vs 0.10? m_total 폭증 시 0.05 너무 빡셀 수 있음. 1사이클 후 결정.
- [ ] [Q3] validate_and_gate 실패 시 drop vs keep+flag? 첫 wave는 keep+flag 권장.
- [ ] [Q4] K=3 fold 충분한가? telemetry 보고 조정.
- [ ] [Q5] block bootstrap block_size=10 고정 vs Politis-White 자동 선택? 1차는 10 고정.

---

## Implementation Plan

| Phase | 내용 | 파일 | 예상 |
|---|---|---|---|
| 1 | `oos_split.py` 신규 + `scanner.py` train/holdout split | oos_split.py(신규), scanner.py | 1일 |
| 2 | `_walkforward_validate()` K=3 fold Sharpe 구현 | autoresearch_loop.py | 1일 |
| 3 | `trade_bridge.py` + `validate_and_gate()` 연결 + block bootstrap | trade_bridge.py(신규), autoresearch_loop.py | 1일 |
| 4 | BH m_total fix (`_bh_correct` m 인자 추가) | pipeline.py, autoresearch_loop.py | 0.5일 |
| 5 | Tests + telemetry | test_oos_wiring.py(신규) | 0.5일 |

---

## Exit Criteria

- [ ] AC1: 1955+ engine tests green, 신규 ≥25 tests
- [ ] AC2: `_walkforward_validate`가 fold별 Sharpe를 평가함을 단위테스트로 증명 (n_executed 카운트 아님)
- [ ] AC3: 동일 universe에서 OOS wiring on vs off 시 top_patterns 평균 Sharpe **≥30% 하락** (in-sample 부풀림 정량 증명)
- [ ] AC4: BH `m` 인자 = `scan_universe.m_total`, `m_total >= len(eligible)` assert
- [ ] AC5: holdout n<10 패턴 → `wf_ok=False` + telemetry 미달률 출력
- [ ] AC6: 2 사이클 연속 실행 시 `validate_and_gate` 통과 패턴 **≥70%** 다음 사이클에도 통과 (재현성)
- [ ] AC7: typecheck/lint 0 errors
- [ ] AC8: `RESEARCH_OOS_WIRING=off`로 즉시 기존 동작 복귀 (rollback 단위테스트)
