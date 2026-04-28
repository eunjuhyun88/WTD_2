---
name: W-0103/W-0104 체크포인트 + Paradigm Autoresearch 방법론 분석
description: W-0103 완료(PR#101), W-0104 백테스트 부분 구현, Paradigm Autoresearch 5가지 methodology 적용 분석
type: project
---

# W-0103 / W-0104 Checkpoint (2026-04-19 저녁)

## 완료 상태

### W-0103 — Alert System + VAR 5th Pattern
- **Status**: PR #101 생성, 테스트 통과 (981/981)
- **변경사항**:
  - `engine/scanner/alerts_pattern.py` (신규): per-pattern 엔트리 레벨, Telegram 알림
  - `engine/research/live_monitor.py`: VAR promote_candidate (score=0.925)
  - `engine/patterns/library.py`: WHALE OR semantics, VAR 5th pattern
  - `engine/tests/test_whale_accumulation_reversal.py`: OR 테스트 업데이트
- **테스트**: 981 tests passed ✅

### W-0104 — Full Historical Backtest (부분 구현)
- **Status**: 설계 완료, 부분 구현 (CLI 미연결)
- **구현됨**:
  - `engine/research/backtest.py`: 핵심 로직 (BacktestSignal, BacktestResult, _measure_fwd, _scan_symbol)
  - `engine/tests/test_backtest.py`: 13 test cases
  - 4H 백테스트 결과 (한 번 실행됨, 이후 1H로 revert):
    - **WSR**: 10,947 signals (1H) → 718 signals (4H) = 93% reduction ✨
    - **VAR**: 8,212 signals (1H) → 720 signals (4H) = 91% reduction ✨
    - **FFR**: only pattern with positive edge (+5.3% avg_72h)
- **미해결**:
  - CLI 연동 (research.cli에 `backtest` subcommand 미추가)
  - 4H 타임프레임 변경 계속 1H로 revert (자동화 린터)

## Paradigm Autoresearch Methodology 분석

사용자 요청: "이런 방법론도입할게있나보고 완전다른 방향으로할수있는게 뭐가있나분석"

### 1. **Parallel Agent Hypothesis Sweeps** (도입 권장)
Ryan Li의 Paradigm 글: 1039개 전략을 20개 병렬 에이전트가 동시 실행 → 로컬 옵티마 탈출

**현재 WTD 상황**:
- WSR/VAR: 손수 튜닝 (timeframe, min_bars, threshold) → 각 파라미터 조합마다 백테스트 재실행 필요
- FFR: 유일하게 작동하는 패턴 → why? 분석 부족

**도입 방법**:
```python
# 자동화 parameter sweep
param_grid = {
    "timeframe": ["1h", "2h", "4h", "8h"],
    "min_bars": [3, 5, 8, 12],
    "threshold": [0.60, 0.70, 0.80],
    "required_any_groups": [
        [],  # OR 제거
        [["volume_dryup", "bollinger_squeeze"]],  # soft 요구
        [["breakout_volume_confirm", "cvd_buying"]],  # strict
    ]
}
# → 각 조합 병렬 백테스트 → best win_rate/avg_return 선택
```

**예상 효과**:
- WSR 1H의 noise (10K+ signals) 근본 원인 파악
- 각 timeframe별 최적 signal reduction ratio 발견 (1H=noise, 4H=structure, 8H=?)
- FFR이 +5.3%인 이유: threshold/min_bars/required_any_groups 조합이 자동으로 최적화됨

---

### 2. **From-Scratch Restarts** (큰 잠재력)
문제: WSR/VAR는 기존 "Wyckoff 원전 구조"에서 출발 → 만약 그 구조가 틀렸다면?

대안: FFR이 유일하게 작동 → FFR의 성공 요소를 역공학
```python
# FFR 역분석
- Funding rate 극값 감지 (funding_extreme_short, funding_extreme_long)
- 짧은 timeframe (1H)에서 수렴적 신호 (limited states)
- CVD 아닌 펀딩 기반 → 외부 데이터 (Binance 펀딩률)

# "From-scratch" 접근: FFR 성공요소만 추출
- Extreme event detector → 명확한 외부 이벤트 (극값)
- 짧은 timeframe → noise 제거
- 단순한 상태 머신 (few phases) → 과적합 방지

# WSR 재설계 (FFR 패턴 적용)
COMPRESSION_ZONE → EXTREME_VOLUME_DOWN (명확한 임계값) → RECOVERY
# vs 기존: COMPRESSION → SPRING → SOS → LPS → MARKUP (너무 많은 phase)
```

**예상 효과**:
- WSR의 5 phase → 3 phase로 단순화 (EXTREME_SELL → ABSORPTION → BREAKOUT)
- VAR도 동일: 3 phase로 재구성
- signal count 대폭 감소 (precision ↑)

---

### 3. **Multi-Period Validation** (필수)
현재 문제: 모두 2024-01-01 ~ 2026-04-19 (강세장) 데이터만 테스트

**개선**:
```
Period A: 2022-06 ~ 2023-12 (약세장 + 회복)
Period B: 2024-01 ~ 2024-12 (강세장)
Period C: 2025-01 ~ 2026-04 (초강세장)

각 기간별 win_rate, avg_return, hit_rate 측정
→ Robust pattern = 모든 period에서 일관적 성과
```

**WSR/VAR 리스크**: 2024-2026 강세장에만 작동 → 약세장에서는?

---

### 4. **Negative Result Logging** (구현 권장)
현재: 성공 케이스만 記록 (FARTCOIN +14.2%, ENA +20.3%)

추가: 실패 케이스 분석
```
- Why WSR fails on PEPE (2025-10): higher_lows_sequence 8-bar gap → timeout
- Why VAR noise on SOLANA (2024-Q2): volume_spike_down too loose (3σ)
- Why 1H frame generates 10K signals: every pullback in uptrend triggers

→ 향후 패턴 설계시 "이 조건에선 작동 안 함" 문서화
```

---

### 5. **Multi-Model / Architecture Exploration** (완전히 다른 방향)

#### 5A. **Event-Driven Backtest**
현재: bar-by-bar state machine scan

대안:
```python
# 114K compression events 있음 → 이걸 시작점으로
for event in compression_events:
    # event 발생 후 N bar 내에 패턴이 completion phase까지 도달하나?
    if pattern_completes_within_28_days(event):
        measure fwd return

# → "pattern detection rate" 아닌 "event-to-completion rate" 측정
# Ex: compression event의 45%가 28일 내 breakout 완료 → 유용한 신호
```

#### 5B. **ML-Driven Pattern Discovery** (장기)
```python
# 수동: Wyckoff phases → PhaseCondition → building blocks
# ML: 모든 하단 반전 이벤트 → OHLCV 피처 벡터화 → clustering
#      → "자동 발견된" 3-4개 natural patterns

# 114K compression events → 5000 successful reversals (clustering)
#                        → 95K failed → anti-pattern cluster
# → 수동 설계 bias 제거
```

#### 5C. **Exit Timing Model** (지금 필수)
현재 문제: entry는 감지 (patterns) → exit는?

```python
# 패턴이 entry 감지했는데 exit가 없음
# → 수익 실현, 손절 시점 불명확

# 추가: VAR/WSR에 exit phase
SELLING_CLIMAX → ABSORPTION → BASE_FORMATION → BREAKOUT → EXIT_PULLBACK
#                                                             (수익 실현)
```

---

## CTO 추천사항 (우선순위)

| 순위 | 방법론 | 난이도 | 기간 | 효과 |
|------|--------|--------|------|------|
| **1** | Parallel Parameter Sweep | 중 | 1 session | WSR/VAR noise 원인 파악 + auto-tuning |
| **2** | Multi-Period Validation | 중 | 2 sessions | robustness 검증 (약세장 테스트) |
| **3** | Exit Timing Model | 중 | 1 session | 현재 패턴의 실용적 완성도 |
| **4** | From-Scratch Redesign (FFR→WSR) | 상 | 2 sessions | WSR 5→3 phase 단순화 |
| **5** | Event-Driven Backtest | 중 | 1 session | event 기반 signal quality 재측정 |
| **6** | ML Pattern Discovery | 상 | 3+ sessions | 완전히 다른 패턴 발견 (장기) |

---

## 다음 Session Action Items

### Immediate (Session 1)
1. ✅ W-0103 PR #101 merge
2. ⏳ Parallel Parameter Sweep 자동화 스크립트 작성
   - 현재: 손수 timeframe 변경 → 린터 revert → 재시도
   - 목표: `sweep_parameters.py` → 모든 조합 자동 실행
3. ⏳ Multi-Period 데이터 로드 (2022-2026)
4. ⏳ Exit Phase 추가 (VAR/WSR)

### Medium-term (Sessions 2-3)
- From-Scratch WSR redesign (FFR 패턴 적용)
- Event-to-completion metric 구현
- Multi-period robustness 검증

### Long-term
- ML clustering on 114K events
- Auto pattern discovery

---

## 기술 Debt (Resolved by Paradigm approach)

| 문제 | 근본원인 | Paradigm 해결책 |
|------|---------|-----------------|
| WSR 10K signals | 1H + loose higher_lows | Parallel sweep → 자동으로 4H/8H 찾음 |
| VAR 8K signals | 1H + low threshold | Multi-model → 다른 구조 발견 |
| FFR only works | 펀딩 기반 + 단순 logic | From-scratch → FFR 성공요소 추출 후 VAR/WSR 재설계 |
| 12d negative return | entry timing | Exit phase 추가 → profit taking signal |
| 린터 revert loop | 자동화 된 코드 수정 | Paradigm sweep = 최적값 자동 발견 → 수동 조정 불필요 |

---

## 핵심 인사이트 (CTO 결론)

> "현재 패턴들이 실제로는 '유효한 시장 구조를 포착하고 있는데', 문제는:
> 1. **timeframe 선택** (1H는 noise, 4H는 structure)
> 2. **phase 수** (WSR 5→3, VAR 4→3으로 단순화 필요)
> 3. **exit timing** (entry는 감지 → exit는 missing)
>
> Paradigm의 parallel sweeps + from-scratch restarts를 도입하면,
> 이 세 축을 자동으로 최적화할 수 있다."

지금이 아니라 **자동화된 탐색 → manual tuning 불필요 → 모든 조합 동시 테스트**로 전환할 시점.
