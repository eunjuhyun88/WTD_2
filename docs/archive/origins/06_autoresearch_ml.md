# COGOCHI — AutoResearch & ML 파이프라인

> 역할: 거래 피드백 → 패턴 weight 최적화 → 모델 개선 → 정확도 향상  
> 핵심: "쓸수록 나를 닮고, 나보다 정확해진다"의 엔진  
> Phase: Hill Climbing (Phase 1) → KTO (Phase 2) → LoRA (Phase E)

---

## AutoResearch 4단계 (성장 로드맵)

| Phase | 이름 | 피드백 수 | 방법 | GPU 필요 |
|-------|------|----------|------|---------|
| A | Doctrine Hill Climbing | 10~100개 | weight 최적화 | ❌ 불필요 |
| B | KTO Fine-tuning | 100개+ | ✓/✗ → good/bad label | ✅ 필요 |
| C | ORPO/DPO | 500개+ | chosen/rejected 쌍 | ✅ 필요 |
| D | LoRA on Validated Patterns | 검증 통과 후 | per-user 파인튜닝 | ✅ 필요 |

**현재 Phase 1 = Phase A (Hill Climbing)**

---

## Phase A — Doctrine Hill Climbing

### 역할

피드백 데이터를 기반으로 각 패턴의 weight(중요도)를 자동 최적화.  
GPU 없이 Python 순수 연산. 피드백 10개면 시작 가능.

### 입력 / 출력

| 항목 | 내용 |
|------|------|
| 입력 | alert_logs의 피드백 (hit/miss/void, agree/disagree) |
| 처리 | Hill Climbing으로 각 패턴 weight 조정 |
| 출력 | 업데이트된 Doctrine (pattern.weight 갱신) |
| 소요 시간 | 10분 이내 (피드백 100개 기준) |

### Hill Climbing 알고리즘

```
현재 weight 배열: [0.7, 0.5, 0.3, ...]

반복:
  1. 랜덤하게 하나의 weight를 ±0.05 조정
  2. 조정된 weight로 과거 피드백 재평가
  3. 적중률(hitRate) 계산
  4. 개선됐으면 weight 채택, 아니면 원복
  5. N회 반복 또는 개선 없으면 종료

출력: 최적화된 weight 배열
```

### 피드백 → weight 직접 규칙 (즉시 적용)

| 피드백 | weight 변화 |
|--------|-----------|
| Scanner ✓ (동의) | +0.05 |
| Scanner ✗ (반박) | -0.03 |
| 자동 HIT | +0.02 |
| 자동 MISS | -0.02 |
| 자동 VOID | 변화 없음 |

### 실행 조건

| 플랜 | 자동 실행 | 수동 실행 |
|------|----------|----------|
| Free | 월 1회 자동 | 불가 |
| Pro | 주 1회 자동 | 언제든 가능 |
| 트리거 | 피드백 10개 이상 누적 시 | 버튼 클릭 |

---

## Phase B — KTO Fine-tuning

### 역할

✓/✗ 피드백을 good/bad 레이블로 변환 → LLM 파인튜닝  
쌍 매칭 불필요. 피드백 100개 이상부터 의미있음.

### 훈련 데이터 자동 생성

| 사용자 액션 | 훈련 데이터 | ML 용도 |
|-----------|-----------|--------|
| 시그널 동의 (✓) | Chosen | KTO good |
| 시그널 반박 (✗) | Rejected | KTO bad |
| 사용자 수정 | 수정=chosen, 원본=rejected | DPO pair |
| Scanner ✓ 피드백 | 패턴 강화 | weight +0.05 |
| Scanner ✗ 피드백 | 패턴 약화 | weight -0.03 |
| 자동 판정 (1H) | Confidence 보정 | 캘리브레이션 |
| 포지션 결과 | R:R calibration | 출력 보정 |

---

## Phase C — ORPO/DPO

### 역할

chosen/rejected 쌍을 구성해 직접 선호도 최적화.  
피드백 500개+ 필요. 더 정교한 개인화.

---

## Phase D — LoRA per-user 파인튜닝

### 4-Layer ML 아키텍처

```
Layer 1: Base Model (공유, SFT, 월 1회 업데이트)
    ↓
Layer 2: Asset LoRA (BTC/ETH/SOL별, ORPO, 주 1회)
    ↓
Layer 3: User LoRA (사용자별, KTO/DPO, 30개 피드백마다) ← 핵심
    ↓
Layer 4: Validation (Stage 1 gate, walk-forward, deploy/reject)
```

### 실전 배포 구조

```
시장 데이터
    ↓
Feature 28개 계산
    ↓
LightGBM P(win) 예측
    ↓
Regime 필터 (bull/bear/chop 체크)
    ↓
Execution 규칙 (threshold 0.55, 쿨다운, 동시제한 3개)
    ↓
리스크 관리 (1% risk/trade, 일손실 -3% 중지)
    ↓
시그널 출력: "LONG BTCUSDT | prob 0.61 | stop 23.81 | take 25.27"
```

### LoRA 배포 조건

- Stage 1 게이트 통과한 패턴에만 적용
- 새 버전이 이전 버전보다 Expectancy 높을 때만 교체
- 배포 실패 시 자동 롤백

---

## LightGBM Signal Engine (Layer 2)

### Feature 28개

| 카테고리 | Feature |
|---------|---------|
| Trend | ema20_slope, ema50_slope, ema_alignment, price_vs_ema50 |
| Momentum | rsi14, rsi14_slope, macd_hist, roc_10 |
| Volatility | atr_pct, atr_ratio_short_long, bb_width, bb_position |
| Volume | volume_24h, vol_ratio_3, obv_slope |
| Structure | htf_structure, dist_from_20d_high, dist_from_20d_low, swing_pivot_distance |
| Microstructure | funding_rate, oi_change_1h, oi_change_24h, long_short_ratio |
| Order flow | cvd_state, taker_buy_ratio_1h |
| Meta | regime, hour_of_day, day_of_week |

### P(win) Threshold

| Threshold | 의미 |
|-----------|------|
| 0.55 | 기본 진입 기준 |
| 0.60 | 보수적 진입 |
| 0.65 | 최고 신뢰도만 |

### 검증된 결과 (2026-04-12 기준)

| 지표 | 수치 |
|------|------|
| Feature ceiling | +2.08% excess |
| t-statistic | ≈28σ |
| 데이터 | 30코인 × 6년 × 1H = ~1.56M 바 |
| 최고 feature | atr_ratio_short_long (13%), dist_from_20d_low (11%) |
| Leak | 없음 확정 |

---

## Regime Filter (Layer 3)

### 현재 상태

현재 stub ("unknown" 반환). D15에서 구현 예정.

### 구현 예정 로직

```
BTC 30일 수익률:
  > +10% → bull
  < -10% → bear
  사이 → chop

ATR 과열 체크:
  ATR > 1.5 × 20일 평균 → volatile

결합:
  bull + 정상 ATR → BULL
  bull + 과열 ATR → VOLATILE
  bear → BEAR (롱 신호 전면 차단)
  chop → CHOP (신호 품질 저하)
```

### Circuit Breaker

| 조건 | 동작 |
|------|------|
| 일일 손실 -3% | 당일 진입 중지 |
| 주간 손실 -8% | 주간 진입 중지 |
| 연속 5회 손실 | 24시간 pause |

---

## 4단계 검증 사다리

| 단계 | 이름 | 질문 | 통과 기준 |
|------|------|------|----------|
| Stage 1 | 백테스트 | 과거에 돈 벌었나? | Expectancy > 0, MDD < -20%, Profit Factor > 1.2, N ≥ 30, Tail ratio ≥ 1, Sortino ≥ 0.5 |
| Stage 2 | Walk-forward | 시간 흘러도 유지? | 72개월 중 75%+ quarter에서 양의 expectancy |
| Stage 3 | 페이퍼 트레이드 | 실시간도 비슷? | 30일, 백테스트 대비 expectancy 괴리 < 30% |
| Stage 4 | 소액 실거래 | 수수료+슬리피지 넣고도 +? | 60일 실거래, 순 PnL > 0 |

각 단계가 다음의 진입 게이트. 미통과 시 다음 진행 불가.

---

## PnL 시뮬레이션 규칙 (ADR-002)

| 항목 | 규칙 |
|------|------|
| 진입 | 매칭 바의 open 가격 |
| Stop/Target 판정 | 이후 바마다 체크 |
| 같은 바 동시 터치 | stop 먼저 (pessimistic) |
| Horizon 끝 | close 가격으로 청산 |
| 수수료 | taker 10 bps (5bps × 2) |
| Slippage | base 2 bps + sqrt-impact |
| 동시 포지션 | 최대 3개 |
| 심볼당 | 최대 1개 |
| 리스크 | 1% risk/trade |
| 쿨다운 | 3바 |

---

## Stage 1 검증 결과 (2026-04-12)

| Challenge | Expectancy | Win Rate | MDD | Profit Factor | N | 판정 |
|-----------|-----------|----------|-----|---------------|---|------|
| btc-macd-style | **+2.01%** | **75.8%** | **-5.1%** | **6.07** | **359** | **✅ PASS** |
| sample-rally | -2.01% | 29.1% | -99.5% | 0.37 | 1221 | ❌ FAIL |
| ake-style | -1.89% | 25.0% | -98.8% | 0.29 | 101 | ❌ FAIL |
| exhaustion-short | -1.52% | 32.8% | -72.3% | 0.50 | 64 | ❌ FAIL |
| lgb-long-v1 | -1.43% | 11.8% | -11.6% | 0.24 | 17 | ❌ FAIL |

---

## Kill 기준 — ML

| 시점 | 조건 | 액션 |
|------|------|------|
| D14 | lgb-long-v1 어떤 파라미터도 Expectancy > 0 불가 | classifier track 보류 |
| D16 | Walk-forward 75% 미달 | Regime 특화 전략 전환 |
| D16 | btc-macd-style bear quarter에서 Expectancy < 0 | Regime filter 필수 |
| Phase E | LoRA < LightGBM baseline | LoRA 보류 |

---

## DB 스키마 — ML 관련

```
ml_train_jobs
├── id           UUID
├── user_id      FK
├── method       "kto" / "orpo" / "dpo" / "hill_climbing"
├── status       "pending" / "running" / "done" / "failed"
├── data_path    훈련 데이터 경로
├── output_path  어댑터 저장 경로
└── metrics_json { expectancy, win_rate, auc, ... }

ml_model_registry
├── id                UUID
├── user_id           FK
├── version           "v1", "v2", ...
├── adapter_path      S3/R2 경로
├── expectancy        배포 시점 측정값
├── win_rate          배포 시점 측정값
├── deployed_at       배포 시각
└── previous_version_id  롤백용 FK
```
