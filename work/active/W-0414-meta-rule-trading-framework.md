# W-0414 — Meta-rule Trading Framework

## Status

- Phase: 설계 (이론 분석 + 우리 구조 매핑)
- Owner: ej
- Priority: P1
- Created: 2026-05-05
- Depends on: W-0409 (Workshop UI — 노출 지점), W-0404 (AI Agent — directives 호환)
- Branch: TBD

## Why

kieran.ai (Hypertrader) 분석 결과: 우리와 signal/backtest/lifecycle 은 동급이지만 **3개 핵심이 빠져 있음**:

1. **진입 메타게이트** (signal ≠ entry) — regime/capacity/sizing 4축 통과 필요
2. **online self-correction** — bucket × outcome attribution 으로 변수 가중치 자동 보정
3. **라이브 무인 루프** — signal listener → gate → auto-entry → triple-barrier exit → attribution

이 셋을 **퀀트 논문의 표준 방법론**으로 풀어 우리 구조에 이식. 단순 kieran 모방이 아닌 학술 근거 기반.

## Goals

1. **Triple-barrier 라벨링** (López de Prado 2018) — verdict 시스템과 호환되는 dual-source label
2. **Bayesian bucket attribution** (Beta-Binomial conjugate) — 변수×버킷별 자동 status
3. **4-게이트 진입 평가기** — regime_penalty / portfolio_capacity / position_sizing / tier_score
4. **Deflated Sharpe Ratio** (Bailey & López de Prado 2014) — 백테스트 우연성 정량화
5. **online learning loop** — 매 trade close → attribution refresh → gate 가중치 갱신
6. **Paper runner v2** — INTERNAL_RUN account 위에 signal-listener + auto-entry + safe-stop
7. **Workshop 노출** — 4-게이트 임계값을 슬라이더로 조정 + DSR 표시

## Non-Goals

- 실거래(LIVE) 자동매매 — paper only. LIVE 는 별도 W item + 사용자 명시적 opt-in
- 신규 ML 모델 학습 (DL/RL) — 본 W 는 frequentist + Bayesian conjugate 만
- HFT/마켓메이킹 — 본 W 는 swing/position trading scope (≥4h holding)
- 신규 시그널 정의 — 기존 8 FACTOR_BLOCKS + W-0399 indicators 재사용

---

## M. Kieran.ai 경쟁 분석 (실측 기반, 설계 근거)

> 본 §M 은 W-0414 설계의 **검증 가능한 출발점**. kieran.ai (Hypertrader) 의 공개 API 에서 직접 추출한 signal/gate/attribution 구조 → §A 학술 매핑과 §B 우리 구조 매핑의 *실증적* 근거.

### M1. 자동매매 동작 확인 (Paper 모드)

`/api/positions` 라이브 응답에서 추출한 실시간 오픈 포지션 (관측 시점):

| Asset | Side | Entry | Size | Signal | Lev |
|-------|------|-------|------|--------|-----|
| BTC | short | 79409.5 | $924 | `vwap_reclaim` | 2x |
| DOGE | short | 0.1133 | $3026 | `range_resistance_touch` | 2x |
| BTC | long | 80297.5 | $937 | `breakout` (conf 0.85) | 2x |

→ **시그널 발생 → 자동 entry/sizing/exit 무인 실행**. "Closed Paper Trades" + uPnL + funding/fees 모두 라이브 추적.

### M2. Signal 8종 (tier + confidence + 룰)

`/api/signals` 24h 로그에서 추출:

| Signal | Tier | Conf | Bias | 룰 (구체) |
|--------|------|------|------|-----------|
| `breakout` | 1 | 0.85 | long | 30d 고점 돌파 + 4.6x 평균 거래량 |
| `range_resistance_touch` | 1 | 0.7 | short | 56d 고점에서 0.6% 이내 |
| `oi_surge` | 2 | 0.6 | neutral | 4h OI z-score ≥ 2.0 |
| `oi_divergence_bearish` | 2 | 0.6 | short | 가격 ↑ + OI ↓ (롱 청산) |
| `oi_divergence_bullish` | 2 | 0.6 | long | 가격 ↓ + OI ↓ (숏 소진) |
| `vwap_reclaim` | 1 | 0.5 | long | 일봉 VWAP 위로 재돌파 |
| `vwap_rejection` | 1 | 0.5 | short | 일봉 VWAP 거부 |
| `volume_spike` | 1 | 0.5 | neutral | 7d 평균 거래량 5.2x |

→ **Tier 1 = level/momentum, Tier 2 = positioning (OI 기반).** 우리 FACTOR_BLOCKS 8종 (RSI/EMA/MACD/CVD/OBV/ATR/BB/Price action) 과 카테고리는 다르지만 **8종 단위 + tier×confidence 구조** 는 동일 차용 가능.

### M3. 4-gate 메타룰 (signal ≠ entry, 34 variables)

`/api/formula-attribution` 에서 추출한 게이트 stack:

```
signal (8종, tier+conf)
  ↓
[gate1] tier2_score        (composite score, 5 vars 포함 entry_flip)
  ↓
[gate2] regime_penalty     (counter_multiplier × regime_distance × penalty_applied, 10 vars)
  ↓
[gate3] portfolio_capacity (slot_utilization bucket, max_positions_block, 5 vars)
  ↓
[gate4] position_sizing    (risk_pct × leverage_cap × selected_equity × candidate_risk × resize_block, 14 vars)
  ↓
entry → outcome (TP / stop / timeout 라벨링)
  ↓
bucket별 (tp_rate, stop_rate, avg_score, accepted_rate) 누적
  ↓
variable status (ok / watch / learning / promising / low_sample)
  ↓
다음 사이클 entry 가중치 자동 조정 (closed loop)
```

**Total = 5 + 10 + 5 + 14 = 34 variables**, 매 trade 후 bucket attribution 으로 자동 재평가.

### M4. 실측 attribution sample (BTC short)

`/api/formula-attribution?symbol=BTC&side=short`:

> `slot_utilization` 67–99% bucket: n=51, stop_rate 67%, tp_rate 33%, accepted_rate 9.8% → status=`watch`

해석: **포지션 슬롯이 거의 찼을 때 진입한 51건 중 67% 가 손절**. 이 bucket 이 자동으로 future entry 9.8% 까지 차단.

→ 학술 근거: §A3 Beta-Binomial conjugate (n=51, k=17 TP → posterior Beta(α₀+17, β₀+34) → posterior mean 33%, watch threshold 적용).

### M5. 우리와 공통 부분 (9개 — 이미 있음, 재구현 X)

| 영역 | kieran | 우리 (확인 모듈) |
|------|--------|------------------|
| Signal 정의 (8종) | breakout / vwap / oi / range / volume | FACTOR_BLOCKS 8종 (RSI/EMA/MACD/CVD/OBV/ATR/BB/Price action) ✅ |
| Backtest 엔진 | 서버 (Hypertrader) | `engine/backtest` + 클라 `runMultiCycleBacktest` ✅ |
| Pattern lifecycle | candidate → object | draft → candidate → object → archived ✅ |
| Counterfactual | `/lab/counterfactual` Welch t-test | `engine/api/routes/counterfactual` ✅ |
| Multi-cycle 검증 | bucket × outcome | `MARKET_CYCLES` 10 사이클 ✅ |
| Capture/setup import | Decision Inspector | `buildLabDraftFromCapture` ✅ |
| Outcome 라벨링 | TP/stop/timeout | Verdict (사용자 + auto-train) ✅ |
| Optimization | "Optuna blocked" 흔적 | `engine/scoring/hill_climbing.py` ✅ |
| Copy-trading | 보임 | `CopyTradingLeaderboard` ✅ |

→ **W-0414 는 이 9개를 재구현하지 않음.** 위 모듈 재사용 + 부족한 3개만 추가.

### M6. 결정적 차이 3개 (W-0414 가 채우는 격차)

| # | kieran 가짐 | 우리 현 상태 | W-0414 매핑 |
|---|------------|-------------|------------|
| ① | 4-게이트 메타룰 (regime_penalty + portfolio_capacity + position_sizing 포트폴리오 단위) | entry = signal 통과만, 슬롯 제약 없음, regime 감점 없음 | §B `engine/gating/{regime_penalty, portfolio_capacity, position_sizing, tier_score, gate_stack}.py` (PR4) |
| ② | 변수 attribution online loop (34 vars × bucket → status → 자동 가중치) | `hill_climbing.py` 가 leaderboard/suggestions 만 — 실시간 entry 차단 X | §B `engine/attribution/bucket_stats.py` + nightly job (PR2 + PR8) |
| ③ | 라이브 무인 루프 (signal listener → gate → auto-entry → auto-exit → attribution) | `runMultiCycleBacktest` = 시뮬만, `PatternRunPanel` = 1회 트리거 | §B `engine/runner/paper_runner.py` + circuit breaker (PR7) |

### M7. kieran 컴포넌트 → 우리 UI 직매핑

| kieran 화면 | 우리 매핑 (W-0414 + W-0409) |
|------------|----------------------------|
| Live signals stream | `LiveSignalsStream.svelte` (W-0414 PR5 §L2) |
| Open positions | `OpenPositionsPanel.svelte` (W-0414 PR5) |
| Formula attribution | `BucketAttributionSection.svelte` (W-0414 PR6) |
| Decision tree (signal → gates → entry) | `DecisionTraceModal.svelte` (W-0414 PR5 §L3, 신규) |
| 백테스트 결과 | `BacktestResultPanel.svelte` (W-0414 PR11 §L6, 신규) |
| Recent trades | `TradeLogTable.svelte` (W-0414 PR5 §L7) |
| 슬라이더 자동 재실행 | W-0409 PR5 Workshop (300ms debounce auto-rerun) ✅ |

### M8. 학술 매핑 — kieran 실측이 §A 어디로 연결되는가

| Kieran 메커니즘 | §A 학술 근거 | §B 우리 모듈 |
|-----------------|--------------|--------------|
| 4-gate stack (signal ≠ entry) | A1 Meta-labeling (López de Prado 2018, Ch 3.6) | `gate_stack.py` |
| `regime_penalty` (counter_multiplier) | A4 Hamilton MS / A5 Moskowitz-Ooi-Pedersen TSMOM | `regime_penalty.py` |
| `portfolio_capacity` (slot_utilization bucket) | A6 + Markowitz capacity constraint | `portfolio_capacity.py` |
| `position_sizing` (risk_pct × leverage_cap × candidate_risk) | A7 Kelly + Thorp + Moreira-Muir vol-target | `position_sizing.py` |
| TP/stop/timeout 라벨링 | A2 Triple-barrier (López de Prado 2018, Ch 3.4) | `triple_barrier.py` + `meta_outcomes` |
| variable × bucket → status | A3 Beta-Binomial conjugate / A9 Contextual bandit | `bucket_stats.py` + `meta_bucket_stats` |
| Backtest 우연성 (Sharpe 낙관) | A8 Deflated Sharpe Ratio (Bailey & López de Prado 2014) | `deflated_sharpe.py` (Workshop 노출) |
| 자동 entry → exit 루프 | A10 Almgren-Chriss execution cost | `paper_runner.py` + circuit breaker |

### M9. 차별화 포인트 (kieran 대비 W-0414 의 추가 가치)

1. **학술 명시성** — kieran 은 black-box 슬라이더, 우리는 §A 논문 인용 + AC 검증 (DSR/PSR go/no-go)
2. **Hyperliquid wallet 서명 통합** (§K) — kieran 은 Binance API key, 우리는 EVM 서명 재사용 (PR #1154)
3. **사용자 토글 32+ 파라미터** (§J) — kieran 슬라이더 = 변수 attribution view 수준, 우리는 D21 Settings 락 + 3 preset
4. **3-tier 안전장치** (D9 + D10 + D17) — circuit breaker + LIVE opt-in + Workshop ↛ runner 자동 적용 차단
5. **AC7 Confluence backtest** — composite ≥3 카테고리 ≥70 → 실제 +20% 24h pump precision ≥40% (W-0415 prior 활용)

---

## N. 우리 구조 실측 + W-0414 가 만들 OUR signals/gates/attribution

> §M 은 *kieran* 실측. §N 은 **우리 코드 실측 + W-0414 가 산출할 OUR 사양**. 1:1 직역이 아닌 우리 시스템 이식 결과.

### N1. 현 코드 실측 (확인)

| 자산 | 위치 | 현 상태 |
|------|------|---------|
| 17 indicator blocks (5 카테고리) | `app/src/lib/stores/strategyStore.ts` (실측) | ✅ 존재 — kieran 8 signal 보다 **풍부** |
| Block evaluator | `engine/scoring/block_evaluator.py:228 evaluate_blocks` | ✅ 존재 |
| LGBM scorer | `engine/scoring/scorer.py LGBMScorer.score_latest` | ✅ 존재 — composite score 산출 |
| Verdict outcome 저장 | migration 023, 038, 049, 055 (verdict_label_rename / ledger_outcome_pnl / capture_record_verdict / verdict_streak_history) | ✅ 존재 — but TP/stop/timeout **labeling 미통일** |
| Hill climbing | `engine/scoring/hill_climbing.py` | ✅ 존재 — leaderboard only |
| Regime detector | `engine/regime/` | ❌ 없음 |
| Gating layer | `engine/gating/` | ❌ 없음 |
| Bucket attribution | `engine/attribution/` | ❌ 없음 |
| Paper runner v2 | `engine/runner/paper_runner.py` | ❌ 없음 (현 PatternRunPanel = 1회 트리거) |

### N2. OUR 8 Signal 정의 (kieran 8 → 우리 17 indicator 합성)

W-0414 는 17 indicator 를 그대로 쓰지 않고 **우리 식 8 signal** 로 합성 (kieran 8 = signal 단위, 우리 17 = building block 단위).

| Our Signal | Bias | Tier | Conf | 합성 룰 (17 indicator 조합) |
|------------|------|------|------|----------------------------|
| `bb_squeeze_breakout` | long | 1 | 0.85 | `BB_SQUEEZE < 20` (lower 20 percentile) **AND** `VOLUME_SPIKE > 3` **AND** `HIGHER_HIGH = 1` |
| `range_top_rejection` | short | 1 | 0.7 | `BB_POSITION > 80` **AND** `RSI > 70` **AND** `LOWER_LOW = 1` |
| `cvd_divergence_bull` | long | 2 | 0.6 | `LOWER_LOW = 1` (가격) **AND** `CVD_SLOPE > 0` (delta 매수 우위) |
| `cvd_divergence_bear` | short | 2 | 0.6 | `HIGHER_HIGH = 1` (가격) **AND** `CVD_SLOPE < 0` (delta 매도 우위) |
| `ema_trend_pullback` | long | 1 | 0.5 | `EMA_TREND > 50bp` **AND** `RSI < 40` **AND** `PRICE_VS_SMA200 > 0` |
| `ema_dead_rebound` | short | 1 | 0.5 | `EMA_CROSS = -1` 직후 + `BB_POSITION > 60` (반등 매도) |
| `obv_volume_thrust` | long | 1 | 0.5 | `OBV_TREND > 0` **AND** `VOLUME_SPIKE > 2.5` **AND** `MACD_HISTOGRAM > 0` |
| `atr_compression_setup` | neutral | 2 | 0.6 | `ATR_PERCENT < 6m_p20` **AND** `BB_WIDTH < 6m_p20` (변동성 코일) |

→ **Tier 1 = level/structure (5)**, **Tier 2 = positioning (3)**. kieran 분포 (Tier1 5개 + Tier2 3개) 와 동일 비율로 매핑.

### N3. OUR 4-gate 변수 인벤토리 (총 32 vars, 우리 코드 기준)

kieran 34 vars → 우리 32 vars (Hyperliquid one-way mode 로 hedge 변수 2개 제거).

#### Gate 1 — `tier_score.py` (composite, 5 vars)

| Var | 정의 | 임계 |
|-----|------|------|
| `signal_tier` | 1 또는 2 | tier_1_min_conf 0.5 / tier_2_min_conf 0.6 |
| `signal_confidence` | N2 표 conf | gate_min 0.5 |
| `lgbm_score` | `LGBMScorer.score_latest()` | gate_min 0.55 (D3) |
| `entry_flip_count_24h` | 동일 심볼 long↔short 전환 횟수 | flip > 3 → reject |
| `composite_score` | `0.4·lgbm + 0.3·conf + 0.2·(1-flip/5) + 0.1·tier` | gate_min 0.5 |

#### Gate 2 — `regime_penalty.py` (10 vars)

| Var | 정의 |
|-----|------|
| `regime_id` | 9 buckets = 3 (trend/range/vol) × 3 (bull/neutral/bear) (D4 rule v1) |
| `regime_distance` | signal bias vs regime 매치 거리 0~1 |
| `counter_multiplier` | 1.0 (match) / 0.5 (orthogonal) / 0.2 (counter) |
| `regime_posterior_mean` | bucket 누적 tp_rate (Beta-Binomial) |
| `regime_n` | bucket sample size |
| `regime_status` | ok / watch / learning / promising / low_sample |
| `regime_age_bars` | 현 regime 진입 후 bars |
| `regime_volatility_bin` | low / mid / high |
| `regime_trend_strength` | EMA200 slope %/일 |
| `regime_penalty_applied` | counter_multiplier × regime_distance × posterior_factor |

#### Gate 3 — `portfolio_capacity.py` (5 vars)

| Var | 정의 |
|-----|------|
| `open_positions_count` | 현 paper 포지션 수 |
| `max_positions` | preset 별 (Conservative 3 / Balanced 5 / Aggressive 8, D24 J2) |
| `slot_utilization` | open / max ∈ [0,1] |
| `slot_util_bucket` | 0-33 / 34-66 / 67-99 / 100 (kieran 동일 binning) |
| `max_positions_block` | slot_utilization == 1 → reject |

#### Gate 4 — `position_sizing.py` (12 vars, kieran 14 - hedge 2)

| Var | 정의 |
|-----|------|
| `account_equity` | wallet balance USDC (Hyperliquid info) |
| `risk_pct` | 단일 trade 손실 한도, default 1% (D24) |
| `risk_usd` | equity × risk_pct |
| `daily_loss_so_far` | 24h cumulative loss |
| `daily_loss_limit` | equity × 2% (D9 W-0414, user 명시) |
| `kelly_fraction` | posterior win_rate × avg_win/avg_loss − (1−p) |
| `kelly_capped` | min(kelly, 0.25) (D5) |
| `vol_target_pct` | 15% annualized (D6 Moreira-Muir) |
| `atr_pct_now` | ATR_14 / close |
| `effective_RR` | (TP_dist − cost) / (SL_dist + slippage), gate_min 1.5 (D24) |
| `liq_distance_atr` | (entry − liq_price) / ATR, gate_min 2.0 (D27) |
| `position_size_usd` | min(kelly_capped·equity, vol_target_size, risk_usd / SL_pct) |

→ **Total = 5 + 10 + 5 + 12 = 32 vars** (W-0414 Hyperliquid one-way mode 적용 결과).

### N4. OUR 데이터 흐름 (단일 trade lifecycle, 우리 코드 기반)

```
strategyStore.ts 17 blocks
   ↓ (사용자 Workshop 슬라이더 OR auto-train)
engine/scoring/block_evaluator.evaluate_blocks() 
   ↓ feature_matrix
engine/scoring/scorer.LGBMScorer.score_latest()
   ↓ composite_score
engine/signals/composer.py (NEW) — 17 blocks → N2 표 8 signal 합성
   ↓ {signal_id, tier, conf, bias}
engine/gating/gate_stack.evaluate(signal, ctx)
   │ ├─ Gate1 tier_score.evaluate(5 vars) → score
   │ ├─ Gate2 regime_penalty.apply(10 vars) → score' = score × multiplier
   │ ├─ Gate3 portfolio_capacity.check(5 vars) → block? continue
   │ └─ Gate4 position_sizing.compute(12 vars) → size_usd, lev, RR
   ↓ {decision: enter|skip, full trace}
meta_decisions 테이블 INSERT (모든 signal 영속화 — entry/skip 무관, §L4)
   ↓ if enter
engine/runner/paper_runner.submit_order()
   ↓ Hyperliquid info (paper) OR exchange (live, D10 opt-in)
meta_positions UPSERT
   ↓ poll 1m + funding 1h
engine/labeling/triple_barrier.label_outcome(position) when exit
   ↓ {outcome: TP|SL|timeout, realized_pnl, hold_bars}
meta_outcomes INSERT (PR1)
   ↓ nightly 02:00 UTC (D33)
engine/attribution/bucket_stats.update_posterior()
   ↓ 모든 32 var × bucket 별 (n, tp, sl, accepted, posterior_mean) 갱신
meta_bucket_stats UPSERT
   ↓ 다음 signal 평가 시 Gate2/Gate3/Gate4 의 posterior_* 변수가 자동 갱신된 값 사용 (closed loop)
```

### N5. OUR sample attribution computation (kieran §M4 등가, 우리 sample)

가정: balanced preset, 90일 운영 후 누적.

| Bucket key | n | tp | sl | tp_rate | posterior_mean | status | future_block? |
|-----------|---|----|----|---------|----------------|--------|---------------|
| `slot_util_bucket=67-99` | 47 | 16 | 28 | 34% | 36.2% | watch | accepted_rate 자동 ↓ 12% |
| `regime_id=trend_bull, signal=bb_squeeze_breakout` | 22 | 14 | 6 | 64% | 60.3% | promising | counter_multiplier 1.1 적용 |
| `regime_id=range_neutral, signal=ema_trend_pullback` | 31 | 9 | 19 | 29% | 31.5% | watch | counter_multiplier 0.6 |
| `signal=cvd_divergence_bear, atr_pct_now=high` | 8 | 5 | 2 | 63% | 55.8% | learning (n<10) | conservative size 0.5x |
| `kelly_fraction>0.4` (overlev candidate) | 12 | 3 | 8 | 25% | 28.1% | watch | size cap to 0.15 |

→ §A3 Beta-Binomial: prior Beta(2,2), n=47, k=16 → posterior Beta(18, 33), mean = 18/51 = 35.3% (표 36.2% 와 prior 효과 차이). N5 의 *모든 행은 우리 시스템 구동 후 산출* — 현재는 schema 만 정의 (PR2).

### N6. OUR UI — kieran §M7 매핑을 우리 컴포넌트 트리에 흡수

| 우리 페이지 | 신규/기존 | 컴포넌트 | 데이터 소스 |
|-----------|---------|----------|-----------|
| `/patterns?tab=workshop` | 기존 (W-0409 PR5) | `StrategyBuilder.svelte` 슬라이더 | `strategyStore.ts` 17 blocks |
| `/patterns?tab=workshop` 우측 | **신규 (W-0414 PR5)** | `PreTradeGatesPanel.svelte` | `/api/gates/evaluate` (gate_stack 4축 라이브 시뮬) |
| `/patterns?tab=research` | **신규 (W-0414 PR6)** | `BucketAttributionSection.svelte` (= kieran formula-attribution) | `/api/research/bucket-attribution` |
| `/patterns?tab=live` (또는 신규 `/runner`) | **신규 (W-0414 PR5)** | `LiveSignalsStream.svelte` + `OpenPositionsPanel.svelte` + `TradeLogTable.svelte` | `/ws/runner` WS push |
| modal (live 어디서나) | **신규 (W-0414 PR5)** | `DecisionTraceModal.svelte` (32 var trace) | `/api/runner/decisions/:id` |
| `/patterns?tab=workshop` 우측 통계 하단 | **신규 (W-0414 PR11)** | `BacktestResultPanel.svelte` (DSR + equity curve + per-bucket) | `/api/backtest/runs/:id` |
| Settings → Meta-rule | **신규 (W-0414 PR9)** | `MetaRuleSettings.svelte` (32+ 슬라이더 + 3 preset) | `meta_user_config` 테이블 |

### N7. OUR W-0414 차별점 (§M9 보다 *우리 시스템 강점* 강조)

1. **17 indicator → 8 signal 합성 분리** — kieran 은 signal 단위 black-box, 우리는 N2 표로 indicator 조합이 명시적 → 사용자가 Workshop 에서 signal 정의 자체를 편집 가능
2. **Hyperliquid wallet-auth 통합** (#1154 재사용) — kieran 은 Binance API key 직접 입력, 우리는 EVM 서명 1회 → 키 노출 0
3. **W-0415 forensic prior 주입** — Gate2 `regime_posterior_mean` 의 초깃값을 W-0415 BigQuery 80-signal confluence score 로 bootstrap → cold-start 문제 해결 (kieran 은 초기 90일 학습 필요)
4. **AC30 Decision Modal 1초 + AC32 deterministic 재현** — 모든 entry 가 32-var trace 영구 보존 + 같은 seed 로 재실행 시 결과 일치
5. **3 preset (J2) Korean-aligned** — Conservative/Balanced/Aggressive 가 한국 자본 규모 (1k~50k USDC) 기준 calibration

---

## O. Kieran 매매룰 실측 분석 (Live API extraction)

> 2026-05-05 `kieran.ai/api/signals` + `/api/positions` + `/api/formula-attribution` 라이브 응답에서 직접 추출. §M 보다 더 구체화된 룰북.

### O1. Signal 구체 룰 (관측 7종, 라이브 100건 sample)

| Signal | Tier | Conf | Severity | Bias | 구체 트리거 (detail 원문) |
|--------|------|------|----------|------|---------------------------|
| `momentum_shift` | 1 | 0.65 | alert | short | `8 EMA crossed below 21 EMA on 2h` (즉, 2h 봉 8/21 EMA 데드크로스) |
| `oi_divergence_bearish` | 2 | 0.6 | alert | short | 가격 ↑ + OI ↓ ≥3.2% (`longs closing, weak rally`) |
| `oi_divergence_bullish` | 2 | 0.6 | alert | long | 가격 ↓ + OI ↓ ≥3.3% (`shorts closing, exhaustion`) |
| `oi_surge` | 2 | 0.6 | alert | neutral | 4h OI z-score ≥ 2.0 (sample: `OI surged 0.2% in 4h $2.97M z=2.0`) |
| `range_resistance_touch` | 1 | 0.7 | alert | short | 56d 고점 0.9% 이내 (예: `80015.50 within 0.9% of 56d high 80762.00`) |
| `vwap_reclaim` | 1 | 0.5 | info | long | 일봉 VWAP 위로 재돌파 (`Price reclaimed daily VWAP at 414.11`) |
| `vwap_rejection` | 1 | 0.5 | info | short | 일봉 VWAP 거부 |

**시간프레임**: momentum = 2h, OI = 4h, VWAP/range = 1d.
**Severity**: `alert` 5개 = 진입 후보, `info` 2개 (vwap_*) = 약신호 (메타게이트 통과율 낮음 확인됨).
**관측 분포 (100건)**: vwap_reclaim 30 / vwap_rejection 20 / oi_surge 19 / oi_divergence_bullish 14 / oi_divergence_bearish 8 / range_resistance_touch 8 / momentum_shift 1 → vwap 류가 50% (low-conf 0.5 다수).

> **이전 §M2 에서 본 `breakout` / `volume_spike` 는 이 snapshot 에 없음** — 시장상태 의존 룰. signal 카탈로그는 실제 8~10종, 현재 활성은 7종 관측.

### O2. Position 구조 (라이브 BTC short sample)

```json
ticker: BTC, direction: short, entry: 79409.5, current: 79984.5
size_usd: 924.54, leverage: 2x, age_hours: 5.37
unrealized_pct: -0.72%, unrealized_usd: -$6.69
signals: [{name: "vwap_reclaim", tier: 1, bias: long, conf: 0.5, feature_group: momentum}]
execution_costs: {
  funding_rate: 4.41e-06,
  funding_rate_pct_8h: 0.000441%,
  estimated_funding_8h_usd: -0.0041,
  cost_scope: "fee_spread_slippage_depth_funding"
}
```

**관찰**:
- Leverage 2x 표준 (D24 Conservative preset 과 동일)
- Size 균일 ($900~$3000 범위, slot 5개)
- **Funding cost 실시간 추적** — 우리 D28 (Hyperliquid 1h funding) 과 동일 컨셉
- **포지션의 진입 signal 이 bias 와 다를 수 있음** — vwap_reclaim(long) 시그널로 short 진입 = 메타게이트가 signal 을 *역으로* 사용한 케이스 (regime_penalty 가 long 신호를 short 우호로 뒤집음). 이는 §A1 meta-labeling 실증.

### O3. 4-게이트 실측 변수 + bucket attribution (라이브 1500-row diagnostic)

**상태**: `diagnostic_only=true, sample_rows=1500` — 즉 메타룰이 *돌긴 돌지만 production gate 활성화 X* (관측). production 활성 시 `accepted_n` 가 `n` 의 5~10% 가 됨.

#### Setting 1: `portfolio_capacity` (n=1278, 5 vars, status=watch)

| Variable | Bucket | n | tp | sl | accepted | tp_rate | accepted_rate | status |
|---|---|---|---|---|---|---|---|---|
| slot_utilization | **67-99%** | 51 | 17 | 34 | 5 | **33%** | **9.8%** | **watch** |
| slot_utilization | 34-66% | 626 | 119 | 287 | 18 | 20% | 2.9% | learning |
| slot_utilization | 0-33% | 367 | 117 | 139 | 37 | 32% | 10.1% | learning |

→ **슬롯이 차면 (67-99%) 진입승률 33% / 거부율 90.2%** — capacity 게이트가 자동 차단. 슬롯 비었을 때 (0-33%) 도 32% TP-rate 인 게 흥미 (signal noise 자체가 50/50 base).

#### Setting 2: `position_sizing` (n=1302, 14 vars, status=learning)

| Variable | Bucket | n | tp | sl | accepted | tp_rate | status |
|---|---|---|---|---|---|---|---|
| leverage_cap | 5-8x | 1278 | 286 | 503 | 61 | 22.4% | learning |
| selected_equity_usd | 2.5-5k | 735 | 200 | 194 | 39 | 27.2% | learning |
| candidate_risk_pct | **<1%** | 588 | 165 | 209 | 4 | 28.1% | learning |

→ Leverage 5~8x 대구간 (kieran 은 우리 default 5x 보다 약간 공격적), 자본구간 $2.5~5k (실험계정 추정), risk_pct < 1% 가 강하게 enforced (n=588 / acc=4 → **0.7% 만 통과**).

#### Setting 3: `regime_penalty` (n=1500, 10 vars, status=learning)

| Variable | Bucket | n | tp | sl | accepted | tp_rate | status |
|---|---|---|---|---|---|---|---|
| penalty_applied | **not_applied** | 1483 | 292 | 512 | 61 | 19.7% | learning |
| counter_multiplier | <0.25 | 1272 | 280 | 503 | 61 | 22% | learning |
| regime_distance | <0.5x | 1135 | 258 | 479 | 51 | 22.7% | learning |

→ **penalty_applied=not_applied 가 1483/1500 (98.9%)** — 즉 regime gate 가 *대부분 시그널을 통과시키지만* tp_rate 19.7% 로 base. counter_multiplier < 0.25 도 비슷 → regime gate 가 현재 약한 페널티만 부과.

#### Setting 4: `tier2_score` (n=1302, 5 vars, status=learning)

| Variable | Bucket | n | tp | sl | accepted | tp_rate | status |
|---|---|---|---|---|---|---|---|
| entry_flip | **flipped** | 771 | 133 | 335 | 43 | **17.3%** | learning |
| entry_flip | no_flip | 531 | 161 | 177 | 18 | **30.3%** | learning |
| tier2_score | 2-5 | 554 | 164 | 148 | 23 | **52.6%** | learning |

→ **결정적 발견**: `entry_flip=flipped` (직전 반대 방향 시그널 후 전환) **tp_rate 17.3%** vs `no_flip` 30.3% → **flip 패널티 13%p**. tier2_score 2~5 구간은 **tp_rate 52.6%** (양호) — composite score 의 sweet spot.

### O4. 룰 추론 (실측 → 메타룰 decision tree)

```
signal in [momentum_shift, range_resistance_touch, oi_divergence_*, oi_surge]?  // alert tier만 production
  ↓ no → skip
  ↓ yes
tier2_score ∈ [2, 5]?              // sweet spot: tp_rate 52.6%
  ↓ no → severe penalty
  ↓ yes
entry_flip == "no_flip"?            // flip 차단: 17% → 30% 회복
  ↓ flipped → confidence × 0.5
regime: counter_multiplier ≥ 0.25?  // 역행 차단 (D7 Counter-trend penalty 와 일치)
portfolio_capacity: slot_util < 67%? // 67-99% 면 거부율 90.2%
  ↓
position_sizing:
  candidate_risk_pct < 1%           // 99.3% 거부 (강제 보수화)
  leverage ∈ [5, 8]
  selected_equity ≈ $2.5-5k
  ↓
ENTER (paper, 2x lev, ~$900-3000 size)
  ↓
exit_label ∈ {tp, sl, timeout}
  ↓
update bucket_stats → 다음 cycle 가중치
```

### O5. 우리 W-0414 와 정밀 매핑

| Kieran 룰 (실측) | W-0414 매핑 | gap |
|---|---|---|
| 7 signal (vwap_*, oi_*, range_*, momentum_shift) | §N2 OUR 8 signal (bb_squeeze, range_top, cvd_div, ema_*, obv, atr) | **카테고리 다름** (kieran=VWAP/OI 위주, 우리=BB/CVD/OBV 위주) — 둘 다 합치면 16개 풀세트 |
| `severity=alert` 만 production | OUR: tier_1_min_conf 0.5 / tier_2 0.6 임계로 동일 컨셉 | ✅ |
| `entry_flip` (flipped/no_flip) tier2_score 변수 | §N3 Gate1 `entry_flip_count_24h` (flip>3 reject) | ✅ — 우리는 더 엄격 (24h 3회) |
| `regime_penalty.counter_multiplier <0.25` | §N3 Gate2 `counter_multiplier 0.2 (counter)` | ✅ — 동일 binning |
| `slot_utilization 67-99% → 9.8% accept` | §N3 Gate3 `slot_util_bucket 67-99 → 자동 차단 검토` | ✅ |
| `candidate_risk_pct <1%` 강제 (99.3% 거부) | §N3 Gate4 `risk_pct default 1% (D24)` | ✅ — 우리도 1% lock |
| `leverage_cap 5-8x` 실측 | §J2 Balanced 5x / Aggressive 10x | ✅ — Aggressive 가 kieran 상한과 일치 |
| `tier2_score ∈ [2,5]` sweet spot tp 52.6% | §N3 Gate1 `composite_score gate_min 0.5` | ⚠️ — **임계값 캘리브레이션 필요** (우리 0.5 = kieran 의 sweet spot 어디?) |
| `diagnostic_only=true` (gate 비활성) | OUR: D10 LIVE 토글 (paper 우선) | ✅ — 같은 안전장치 패턴 |

### O6. Kieran 룰의 *수치적* tp_rate 베이스라인 (우리 기대치 보정)

| 조건 | tp_rate | sample n | 해석 |
|------|---------|----------|------|
| no_flip + tier2 [2,5] + slot < 67% | **~50% 추정** | 결합 sample 약 100~200 | 양호 setup |
| flipped + slot 67-99% | **~17%** | 51 | **자동 차단 대상** |
| 전체 (game-baseline) | 22% (286/1278) | 1278 | base rate |

→ **W-0414 AC3 (24h 급등 backtest precision ≥60%)** 는 kieran 의 best-case 50% 보다 10%p 공격적. 합리성 검토 필요 — `composite ≥70` 이라는 *추가* 필터를 거니까 가능. 단, prior 학습 90일 후 측정.

### O7. 추가 발견 (W-0414 보강 항목)

1. **`feature_group` 필드** (kieran position 의 signal 안) — 우리 시그널에도 추가하면 attribution bucket 차원이 한 축 늘어남 (signal_name × feature_group). §B3 `meta_outcomes` 에 컬럼 추가 검토.
2. **`execution_costs.cost_scope` 명시** — `fee_spread_slippage_depth_funding` 5요소 분해. 우리 §K3 funding 만 본 것 → 5요소 분해로 확장 (PR10 live runner 에 반영).
3. **`telemetry_quality` 필드** — `partial_missing_next_funding_time` 등 데이터 결측 추적. 우리 `meta_decisions` 에 `data_quality` 컬럼 추가.
4. **`feature_group` 별 attribution** — `momentum / liquidity / volatility / structure` 같은 상위 카테고리. §B3 schema 보강.

---

## A. 학술 근거 (이론 매핑)

### A1. Meta-labeling (López de Prado 2018, Ch 3.6)

**원리**: 1차 모델 M1 = signal generator. 2차 모델 M2 = (context, M1_output) → P(TP_hit). M2 가 threshold 이상일 때만 trade.

**우리 매핑**:
- M1 = `engine/scoring/` 기존 시그널 (FACTOR_BLOCKS 조합)
- M2 = 4-gate stack (regime + capacity + sizing + tier) — 합쳐서 `pre_trade_score ∈ [0, 1]`
- gate threshold = Workshop 슬라이더로 노출

### A2. Triple-Barrier (López de Prado 2018, Ch 3.4)

**원리**: 매 entry 시 3 barrier — Take-Profit (+kσ), Stop-Loss (−kσ), Time-Horizon (T bars). 가장 먼저 닿는 것이 outcome label ∈ {TP, SL, TIMEOUT}.

**동적 barrier**:
- TP = entry × (1 + α · ATR_pct)
- SL = entry × (1 − β · ATR_pct)
- T = `MARKET_CYCLES` 의 avg_holding_time × scale

**우리 매핑**:
- DB: `pattern_outcomes` (또는 신규 `meta_outcomes`) 테이블에 `barrier_label` (`TP|SL|TIMEOUT`), `barrier_time_bars`, `tp_distance_atr`, `sl_distance_atr` column 추가
- engine: `engine/labeling/triple_barrier.py`
- **verdict 와 dual-source**: 사용자 verdict (수동) + triple_barrier (자동) 둘 다 저장. attribution 은 triple_barrier 기반(객관성), verdict 는 사용자 직관 시그널

### A3. Bayesian Bucket Attribution (Beta-Binomial conjugate)

**원리**: 변수 v 의 bucket b 마다 outcome counter (TP, SL, TIMEOUT). Posterior tp_rate ~ Beta(α=1+TP_n, β=1+SL_n). E[p|b] = α/(α+β).

**Status 룰**:
- `low_sample`: n < 30
- `watch`: n ≥ 30, posterior_mean < 0.40 (95% credible interval upper < 0.50)
- `learning`: 0.40 ≤ posterior_mean < 0.55
- `promising`: posterior_mean ≥ 0.55, n ≥ 50
- `ok`: posterior_mean ≥ 0.55, n ≥ 200, lower 95% CI ≥ 0.50

**우리 매핑**:
- engine: `engine/attribution/bucket_stats.py` — 단일 진입점 `update(variable, bucket, outcome)` + `lookup(variable, bucket) → BucketStat`
- DB: `meta_bucket_stats` (variable, bucket, alpha, beta, n, status, last_update)
- API: `GET /api/research/bucket-attribution?variable=&signal=&regime=`
- Workshop: Research 탭 sub-section `BucketAttribution.svelte`

### A4. Regime Detection (Hamilton 1989, Ang-Bekaert 2002 — 단순화 버전)

**1차 버전 — Rule-based 3-axis binning** (HMM 도입은 PR 추가):
- `trend`: `close > SMA(200)` ? bull : bear
- `vol`: ATR_pct z-score 90d ≥ 1 ? high : low
- `momentum`: r_{12-1} > 0 ? up : down

→ 8 regime ID (2³). 향후 HMM 으로 교체 가능 (인터페이스 동일).

**우리 매핑**:
- engine: `engine/regime/detector.py` — `classify(symbol, ts) → regime_id`
- DB: `regime_history` (symbol, ts, regime_id, features) — daily snapshot
- 학술 출처: TSMOM (Moskowitz, Ooi, Pedersen 2012) — same-direction-as-trend 통계적 우위

### A5. Counter-trend Penalty

**원리**: 진입 방향 vs regime trend 정합도 → counter_multiplier.

```
regime_distance = direction_mismatch(entry_dir, regime_trend) ∈ {0, 1}
                + |z(realized_vol) − z(target_vol)| · ε
counter_multiplier = max(0.5, 1 − regime_distance · penalty_strength)
gate_pass: random/score gate × counter_multiplier ≥ threshold
```

**학술**: Moskowitz et al. (2012) TSMOM — 매도 시그널이 강세 regime 에서 통계적 노이즈인 경우 다수.

### A6. Portfolio Capacity (slot_utilization)

**원리**: 동시 보유 max_positions M (예: 5). 현재 사용률 u = active / M. Bayesian attribution 으로 bucket 별 historical TP rate 추적.

```
slot_utilization_bucket = floor(u × 3) / 3  → {0-33%, 34-66%, 67-99%}
gate_pass: bucket_stats(slot_utilization, bucket).posterior_mean > 0.45
         ∧ active < M
```

**학술**: bandit with budget (Auer et al. 2002 UCB1, 변형 — limited slot exploration).

### A7. Position Sizing (Fractional Kelly + Vol-Target)

**Kelly fraction** (Kelly 1956, Thorp 2006):
```
f* = (bp − q) / b
   where b = avg_win / avg_loss (from bucket_stats),
         p = posterior_mean(tp_rate),
         q = 1 − p
fractional_kelly = clip(0.25 × f*, 0, 0.05)  # 25% Kelly cap
```

**Vol-targeting** (Moreira & Muir 2017):
```
size_usd = equity × fractional_kelly × (target_vol / realized_strategy_vol_30d)
         × capped_at(max_risk_per_trade)
```

**학술**: Kelly 1956 (정보이론 → 도박 사이징), Thorp 1962 ("Beat the Dealer"), Moreira-Muir 2017 (vol-managed portfolios).

### A8. Deflated Sharpe Ratio (Bailey & López de Prado 2014)

**문제**: Workshop 에서 N개 strategy 백테스트 → best Sharpe 는 multiple-testing 으로 inflated.

**보정**:
```
PSR(SR | T, γ₃, γ₄, SR_benchmark) = Φ((SR − SR_benchmark) · √(T-1) /
                                     √(1 − γ₃·SR + (γ₄−1)/4 · SR²))
DSR = PSR adjusted for N_trials (Bailey-LDP 2014 eq. 7)
```

**우리 매핑**:
- engine: `engine/scoring/deflated_sharpe.py`
- Workshop 우측 통계: 기존 Sharpe 옆에 DSR + "이 결과가 우연일 확률 X%" 표시
- N_trials = simulationStore 의 backtest_count (세션 내 누적)

### A9. Online Learning Loop (Contextual Bandit, delayed feedback)

**원리**: Li et al. (2010) LinUCB 의 delayed-feedback 버전.

```
context = (signal_tier, signal_name, regime_id, slot_utilization_bucket, ...)
action  = trade / skip
reward  = triple_barrier_label · pnl_normalized
```

**구현 단순화**: full LinUCB 미구현, 대신 bucket_stats 의 Bayesian update 가 동등 효과 (각 bucket 이 독립 arm).

### A10. Execution Cost Modeling (Almgren-Chriss 2000, Perold 1988)

**원리**: 실거래 도입 전, paper 단계에서도 fee + spread + slippage + funding 을 모델링.

**우리 매핑** (kieran 의 `execution_costs` 객체 직접 채택):
```
estimated_round_trip_fee_usd = 2 × maker_or_taker_fee × notional
estimated_spread_cost_usd = (top_ask − top_bid) / 2 × size
estimated_slippage_usd = sqrt(size / depth) × σ × notional  # square-root law
estimated_funding_8h = funding_rate × notional · sign(direction)
```

**학술**: Almgren-Chriss 2000 (impact = σ·√(size/V)), Kyle 1985 (lambda·order_flow).

### A11. Probabilistic Guarantee (PSR for go/no-go)

**원리**: López de Prado 2014 — strategy 가 production 갈 자격 = `PSR(SR=0) > 0.95`.

**Production gate**:
- backtest 통과만으로 부족
- DSR > 0.95 + 최소 trade count > 100 + max_drawdown < 20% + ledger 30d forward-walk pass

---

## B. 우리 구조 매핑 (Architecture)

### B1. 모듈 배치

```
engine/
├── labeling/
│   └── triple_barrier.py         # A2
├── attribution/
│   ├── bucket_stats.py           # A3
│   └── deflated_sharpe.py        # A8
├── regime/
│   └── detector.py               # A4
├── gating/
│   ├── regime_penalty.py         # A5
│   ├── portfolio_capacity.py     # A6
│   ├── position_sizing.py        # A7
│   ├── tier_score.py             # composite
│   └── gate_stack.py             # 4-gate orchestrator
├── runner/
│   └── paper_runner.py           # A9 + A10
└── api/routes/
    ├── meta_gates.py             # POST /api/gates/evaluate
    ├── meta_attribution.py       # GET /api/research/bucket-attribution
    └── meta_runner.py            # POST /api/runner/{start,stop,status}

app/src/
├── lib/contracts/metaGates.ts    # gate response 타입
└── (W-0409) routes/patterns/_tabs/
    ├── Workshop.svelte → 우측 패널 위에 PreTradeGatesPanel
    ├── Research.svelte → BucketAttributionSection
    └── Live.svelte → PaperRunnerControl
```

### B2. 데이터 흐름 (single-trade lifecycle)

```
1. signal emitter (engine/jobs/signal_emitter.py 가정 — 없으면 신규)
   → emit({ticker, signal_name, tier, conf, bias, ts})
2. paper_runner.on_signal(signal):
   2a. context = build_context(ticker, ts)  # regime, slot_util, equity, vol
   2b. gate_result = gate_stack.evaluate(signal, context)
       → { pass: bool, score: float, gate_details: {...}, suggested_size_usd }
   2c. if not gate_result.pass: log skip + return
   2d. position = paper_account.enter(ticker, side, size, price)
   2e. attach barriers: triple_barrier(entry_price, atr, horizon)
3. exit (next bar evaluation OR async):
   3a. barrier_hit = check_barriers(position, current_price, current_ts)
   3b. close → outcome_label ∈ {TP, SL, TIMEOUT}
   3c. attribution.update_all_buckets(context, outcome)
4. nightly cron (engine/jobs/attribution_refresh.py):
   4a. recompute bucket statuses
   4b. update gate weights / ban-list
```

### B3. DB schema (신규)

```sql
-- 기존 patterns/captures/verdict 와 별개
CREATE TABLE meta_outcomes (
  id BIGSERIAL PRIMARY KEY,
  position_id UUID NOT NULL,
  signal_name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  entry_ts TIMESTAMPTZ NOT NULL,
  exit_ts TIMESTAMPTZ NOT NULL,
  barrier_label TEXT NOT NULL CHECK (barrier_label IN ('TP','SL','TIMEOUT')),
  pnl_pct NUMERIC NOT NULL,
  context JSONB NOT NULL,  -- regime, slot_util, vol, etc.
  verdict_label TEXT,       -- nullable, 사용자 verdict (이중 소스)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE meta_bucket_stats (
  id BIGSERIAL PRIMARY KEY,
  variable TEXT NOT NULL,
  bucket TEXT NOT NULL,
  signal_name TEXT,         -- nullable, signal-conditional bucket
  alpha NUMERIC NOT NULL DEFAULT 1,
  beta NUMERIC NOT NULL DEFAULT 1,
  n INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'low_sample',
  posterior_mean NUMERIC GENERATED ALWAYS AS (alpha / (alpha + beta)) STORED,
  last_update TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (variable, bucket, signal_name)
);

CREATE TABLE meta_regime_history (
  ticker TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  regime_id INT NOT NULL,
  trend SMALLINT NOT NULL,
  vol_bucket SMALLINT NOT NULL,
  momentum SMALLINT NOT NULL,
  features JSONB,
  PRIMARY KEY (ticker, ts)
);

CREATE TABLE meta_runner_state (
  id INT PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'stopped',  -- running|stopped|circuit_breaker
  started_at TIMESTAMPTZ,
  daily_loss_usd NUMERIC DEFAULT 0,
  max_daily_loss_usd NUMERIC NOT NULL DEFAULT 200,
  CHECK (id = 1)
);
```

### B4. 기존 시스템과의 통합

| 기존 | 통합 방식 |
|---|---|
| `runMultiCycleBacktest` (W-0409) | meta_outcomes 시뮬 데이터 공급원 (백테스트 시 triple_barrier 라벨 자동 생성) |
| `verdict` 시스템 (W-0397/0401) | dual-source label — meta_outcomes.verdict_label 에 link |
| `engine/scoring/hill_climbing.py` | gate_stack 의 weight optimizer 로 재사용 (gate threshold 자동 튜닝) |
| `engine/api/routes/counterfactual.py` | bucket_stats 의 baseline 비교용 |
| W-PF-100 propfirm evaluation | max_daily_loss circuit breaker 와 같은 인프라 — 코드 공유 |
| W-0399 indicator catalog | gate context feature 소스 (RSI/MACD 등을 bucket 변수로 사용 가능) |
| W-0404 AI Agent | directives `--gate-strict` 등으로 gate threshold 조작 가능 |
| `MARKET_CYCLES` 10 사이클 | regime_id labeled — 각 cycle 별 gate 성능 비교 |

---

## C. PR 분기 (8 PR)

### PR1 — Triple-barrier labeling + meta_outcomes 테이블
- `engine/labeling/triple_barrier.py` — 동적 ATR-based barriers
- migration: `meta_outcomes` 테이블 + `meta_bucket_stats` 빈 스켈레톤
- backfill: 기존 `pattern_outcomes` (있다면) → triple_barrier label 재계산
- AC: backtest 1회 실행 → meta_outcomes 행 생성, label 분포 (TP/SL/TIMEOUT) 검증

### PR2 — Bayesian bucket attribution
- `engine/attribution/bucket_stats.py` — Beta posterior + status 룰
- API: `GET /api/research/bucket-attribution`
- nightly job: `engine/jobs/attribution_refresh.py`
- AC: 변수×버킷 30+ 조합에서 status 분포 정상, posterior_mean / 95% CI 노출

### PR3 — Regime detector (rule-based v1)
- `engine/regime/detector.py` — 3-axis binning (8 regime)
- `meta_regime_history` daily snapshot job
- API: `GET /api/regime/current?ticker=&ts=`
- AC: BTC 90일 backfill → regime 전환 시점 시각화 가능

### PR4 — 4-gate stack + evaluator API
- `engine/gating/{regime_penalty, portfolio_capacity, position_sizing, tier_score, gate_stack}.py`
- API: `POST /api/gates/evaluate` (signal + context → gate_result)
- AC: 각 gate 단독 통과 + 4-gate 합성 점수, kieran-style breakdown 응답

### PR5 — Workshop UI: PreTradeGatesPanel + DSR
- W-0409 Workshop 우측 통계 위에 `PreTradeGatesPanel.svelte`
- 4-gate 임계값 슬라이더 (debounce 300ms → re-evaluate)
- `engine/scoring/deflated_sharpe.py` + Workshop 통계에 DSR + "우연성 확률" 표시
- AC: 슬라이더 조정 → gate 통과율 실시간 갱신, DSR 표시 정상

### PR6 — Research 탭: BucketAttributionSection
- `hubs/patterns/research/BucketAttributionSection.svelte`
- 변수×버킷 표 + posterior_mean + status chip + sparkline
- 변수 select (slot_util / risk_pct / regime_dist / signal_tier ...)
- AC: kieran `/api/formula-attribution` 동등 정보 노출

### PR7 — Paper runner v2 (signal listener + auto-entry + safe-stop)
- `engine/runner/paper_runner.py`
- `meta_runner_state` 테이블 + circuit breaker (max_daily_loss / max_drawdown)
- API: `POST /api/runner/{start,stop,status}`
- W-0409 Live 탭에 `PaperRunnerControl.svelte` (start/stop + status chip + daily PnL bar)
- Settings 에 kill-switch + max_daily_loss config
- AC: signal stream 1시간 가동 → meta_outcomes 행 누적, circuit breaker 동작 확인

### PR8 — Online learning loop wiring (gate weight 자동 갱신)
- 매 trade close → bucket_stats.update → 다음 entry 게이트에 자동 반영
- gate threshold 자동 튜닝 (hill_climbing 재사용, 일 1회)
- "ban list" 표시 (Research 탭): 자동 차단된 (변수, bucket) 목록
- AC: 7일 가동 후 ban list 1개+ 발생, gate threshold 변동 로그 확인

---

## D. 결정 락 (D1~D20)

| # | 결정 | 락 | 이유 |
|---|------|---|------|
| D1 | Verdict vs triple_barrier 라벨 우위 | **dual-source 저장, attribution 은 triple_barrier 우선** | 객관성 + verdict 는 사용자 직관 시그널로 별도 분석 |
| D2 | Regime detection 1차 구현 | **rule-based 3-axis binning**, HMM 은 PR 추가 | 시작 단순성, 인터페이스 동일하게 유지 |
| D3 | Bayesian prior | **uniform Beta(1,1)** | 데이터 적은 초기에는 informative prior 가 위험, 점차 데이터 누적 |
| D4 | Status 임계값 | **(low_sample<30 / watch<0.40 / learning<0.55 / promising≥0.55+50 / ok≥0.55+200+CI)** | López de Prado 가이드 + 우리 trade 빈도 (월 ~50개 가정) |
| D5 | Kelly fraction cap | **default 25%, toggle 5%~75%** (Settings) | full Kelly = 이론 최적이지만 DD 50%+ 일상. 25% = Thorp 권장. 사용자 토글 |
| D6 | Vol target | **default 15%/yr, toggle 5%~40%** (Settings) | Moreira-Muir 기준값. BTC vol ~80% → 15% = 1/5 사이즈 |
| D7 | Triple-barrier ATR multiplier | **default TP=2·ATR / SL=1·ATR / T=avg_holding×2, 각각 슬라이더 0.5~5x** | RR 비율 사용자 선호 |
| D8 | Paper runner trigger | **signal stream 푸시 (이벤트 기반), polling fallback** | PR7 audit 후 인프라 결정 |
| **D9** | **Circuit breaker — 핵심 안전장치** | **max_daily_loss = balance × 2% (잔고 비례, default), max_drawdown_30d = 20%, 둘 다 Settings 토글 0.5~5%** | **사용자 명시: "잔고대비 2%씩만". balance 가 변하면 자동 추종** |
| D10 | LIVE (실거래) 모드 | **default = paper only (잠금). Settings 에서 LIVE 토글 — 활성화 시 2단계 confirm + Turnstile** | 사용자가 직접 켤 수 있되 실수 방지 |
| D11 | DSR 계산 시점 | **매 backtest 직후** | 즉시 피드백 |
| D12 | Online learning 빈도 | **default = per-trade + nightly 둘 다, Settings 토글 (per-trade only / nightly only / both / off)** | 사용자 선호 |
| D13 | Bucket 정의 | **(variable, bucket_value, signal_name)** 3-tuple, signal-conditional | kieran 동등 |
| D14 | Gate weight optimizer | **hill_climbing.py 재사용** | PR1 audit 후 확정 |
| D15 | gate_stack 평가 순서 | **regime → capacity → tier → sizing** (조기 reject 우선) | 비싼 sizing 계산은 마지막 |
| D16 | meta_outcomes 보관 기간 | **무기한** (분석 가치) | 디스크 비용 미미 |
| D17 | Workshop 슬라이더 → live runner 적용 | **default = "Apply to runner" 버튼 명시, Settings 토글 (instant / explicit / disabled)** | 사용자 선호 |
| D18 | Verdict ↔ barrier label 충돌 | **default = barrier 우선 (객관성), Settings 토글 (barrier / verdict / both-disagree-flagged)** | 사용자 선호 |
| D19 | Regime 8 vs HMM N-state | **default = 8 (rule-based v1), Settings 토글 (rule-v1 / hmm-2 / hmm-4) — hmm은 PR 추가 후 활성** | 점진 도입 |
| D20 | DSR vs PSR 표시 | **DSR default, Settings 토글 (DSR / PSR / both)** | Workshop 사용자 선호 |
| **D21** | **모든 파라미터 user-tunable** (사용자 명시) | **§J 신규 — 모든 D5~D20 항목을 Settings UI 슬라이더/토글로 노출, DB 영속화, profile 저장 가능** | 사용자 명시 — "모든걸 선택하거나 조절할수있게" |
| **D22** | **Paper account 시작 잔고** | **default $10,000, Settings 직접 입력. balance × 2% 가 daily loss cap 자동 계산** | D9 의 비례 계산 baseline |
| **D23** | **Profile / Preset 시스템** | **3 preset 기본 제공: 보수(Conservative) / 표준(Balanced) / 공격(Aggressive). 사용자 custom profile 저장/공유** | 토글 편의 |
| **D24** | **Min RR (손익비) gate** | **default 1.5, Settings 슬라이더 1.0~3.0. entry 직전 (TP_dist - cost) / (SL_dist + cost) < threshold → skip** | Kelly `f* = (p·b−q)/b` 에서 RR=1.5면 BE 승률 40%. cost = fees + slippage + funding |
| **D25** | **거래소 + Leverage** | **Hyperliquid 고정. asset별 max leverage 자동 조회 (`info.meta`). 사용자 cap default 5x, Settings 1x~20x** | 멀티 거래소는 별도 W item |
| **D26** | **Margin mode + 한도** | **default = cross + balance × 20% margin cap. Settings 토글 (cross/isolated) + 5%~50%** | cross = 자본 효율, isolated = 종목별 격리 |
| **D27** | **Liquidation buffer** | **SL 가격이 청산가보다 **2·ATR 안쪽**에 있어야 entry 허용. Settings 1·ATR ~ 5·ATR** | flash wick 보호 |
| **D28** | **Funding rate 처리 (Hyperliquid 1h interval)** | **(a) 진입 시 expected funding cost 차감 (b) 보유 중 1h마다 누적 PnL 반영. paper runner 도 `info.fundingHistory` 실측 사용 (사용자 yes 확정)** | live ↔ paper 결과 일치성 |
| **D29** | **Long/Short 매핑 (one-way mode)** | vwap_reclaim/oi_surge/breakout/volume_spike → **Long**, vwap_rejection/oi_div_bearish → **Short**, range_resistance_touch/oi_div_bullish → 양방향. signal별 Settings 토글 | Hyperliquid one-way only — hedge mode 옵션 없음 |
| **D30** | **거래소 lock-in** | **Hyperliquid 단일. 멀티 거래소 (Binance/Bybit/dYdX 등) = 별도 W item** | 인터페이스는 추상화하되 구현은 Hyperliquid 만 |

---

## E. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | `engine/labeling/triple_barrier.py` 단위 테스트 — TP/SL/TIMEOUT 분류 정확 |
| AC2 | `meta_outcomes` 테이블 backfill 후 행 수 ≥ 기존 verdict 수 |
| AC3 | bucket_stats Beta posterior 정확 (단위 테스트: alpha=11, beta=21 → posterior_mean=0.34375) |
| AC4 | `GET /api/research/bucket-attribution` 응답에 ≥30 bucket 표시 + status 분포 정상 |
| AC5 | Regime detector BTC 90일 backfill — regime 전환 일자 ≥3건 |
| AC6 | 4-gate evaluator: signal 100건 입력 → gate 통과율 정상 분포 (예: 20-40%) |
| AC7 | Workshop PreTradeGatesPanel 슬라이더 조정 → 300ms debounce → gate 통과율 실시간 갱신 |
| AC8 | Workshop 통계에 DSR 표시 + "우연성 확률" tooltip |
| AC9 | Research 탭 BucketAttribution: kieran-equivalent 정보 (variable × bucket × n × tp_rate × accepted_rate × status) |
| AC10 | Paper runner 1시간 가동 → meta_outcomes 행 누적, position 라이프사이클 정상 (entry → barrier_hit → close) |
| AC11 | Circuit breaker — daily_loss > $200 시 runner status='circuit_breaker' 자동 전환 |
| AC12 | 7일 가동 후 ban list 1개+ 발생 (online loop 동작 증거) |
| AC13 | Settings 에 kill-switch + max_daily_loss 노출, 변경 즉시 반영 |
| AC14 | DSR 단위 테스트: 알려진 시나리오 (Bailey-LDP 2014 Table 2) 와 일치 |
| AC15 | Contract CI 통과 (memkraft:protocol 12 sections) |

---

## F. 위험 + 완화

| Risk | 완화 |
|------|------|
| Triple-barrier label 이 verdict 와 너무 다르면 사용자 혼란 | dual-source 표시 + Research 탭에 "label disagreement rate" 메트릭 |
| Bayesian prior(1,1) 가 초기 n<10 에서 노이즈 | status='low_sample' gate 로 자동 차단 (D4) |
| Regime rule-based 가 실제 regime 과 mismatch | HMM 으로 점진 교체 가능한 인터페이스 (D2/D19) |
| Kelly fraction 이 backtest 과적합 시 과대평가 | DSR < 0.95 면 sizing 보수적 적용 (multiplier 0.5x) |
| Paper runner 가 signal stream 폭주 시 OOM | rate limit + queue depth 모니터링 (W-0404 quota 인프라 재사용) |
| Circuit breaker 가 정상적 drawdown 에 과민 반응 | trailing 30d max_drawdown 기준, 하드 stop 은 $200 daily 만 |
| online loop 가 ban list 폭증 → 거래 0 | weekly review + manual override (Research 탭 "Unban" 버튼) |
| LIVE 실거래로 잘못 흘러감 | code-level guard: `paper_account` only path, LIVE 는 별도 W |
| Multiple-testing 으로 DSR 계산 비용 | session 내 N_trials 누적, 캐시 |
| `engine/jobs/signal_emitter.py` 가 없으면 PR7 막힘 | PR7 시작 전 audit, 없으면 PR7 스코프에 emitter 신규 포함 |
| W-0409 Workshop 머지 전이면 PR5 UI 의존 | W-0409 PR5 머지 후 PR5 (W-0414) 발급 |

---

## G. 다음 단계

1. ~~설계 락~~ ✅ (이 문서)
2. **사용자 검토 + D1~D20 수정 결정**
3. PR1 (triple_barrier + 테이블) — 가장 작고 독립적, 시작점
4. W-0409 PR5 (Workshop) 머지 진행 → W-0414 PR5 (UI) 의존 해제
5. 7일 paper run dogfooding → ban list / DSR 동작 검증
6. 검증 통과 시 LIVE 실거래 W item 분기 결정

---

## J. User-tunable Parameters (사용자 명시 — D21 락)

> **원칙**: 모든 학술 파라미터를 Settings UI 에서 슬라이더/토글로 조작 가능. DB 영속화. Preset (보수/표준/공격) + 사용자 custom profile.

### J1. 파라미터 인벤토리 (Settings → "Meta-rule Trading" 섹션)

#### Risk (잔고 보호)
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `paper_starting_balance_usd` | 10000 | 1000 ~ 1000000 | 숫자 입력 |
| **`max_daily_loss_pct`** | **2.0%** | 0.5% ~ 5% | **슬라이더 (사용자 명시)** |
| `max_drawdown_30d_pct` | 20% | 5% ~ 50% | 슬라이더 |
| `max_open_positions` | 5 | 1 ~ 20 | 정수 |
| `kill_switch` | off | toggle | 큰 빨간 버튼 |
| `daily_loss_cap_usd` (계산값) | balance × 2% | 자동 계산 | readonly 표시 |

#### Position Sizing (Kelly + Vol-target)
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `kelly_fraction_cap_pct` | 25% | 5% ~ 75% | 슬라이더 (D5) |
| `kelly_max_per_trade_pct` | 5% | 0.5% ~ 20% | 슬라이더 |
| `vol_target_annualized_pct` | 15% | 5% ~ 40% | 슬라이더 (D6) |
| `vol_lookback_days` | 30 | 7 ~ 90 | 정수 |

#### Triple-barrier (TP/SL/Time)
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `tp_atr_multiplier` | 2.0 | 0.5 ~ 5.0 | 슬라이더 (D7) |
| `sl_atr_multiplier` | 1.0 | 0.5 ~ 5.0 | 슬라이더 (D7) |
| `horizon_multiplier` | 2.0 | 0.5 ~ 5.0 | 슬라이더 (D7) |
| `min_holding_bars` | 4 | 1 ~ 100 | 정수 |
| `atr_lookback` | 14 | 7 ~ 50 | 정수 |

#### Gates (4-게이트)
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `regime_penalty_strength` | 0.5 | 0 ~ 1 | 슬라이더 |
| `counter_multiplier_floor` | 0.5 | 0.3 ~ 1.0 | 슬라이더 |
| `tier1_weight` | 1.0 | 0 ~ 2 | 슬라이더 |
| `tier2_weight` | 0.7 | 0 ~ 2 | 슬라이더 |
| `min_signal_confidence` | 0.5 | 0 ~ 1 | 슬라이더 |
| `gate_score_threshold` | 0.6 | 0 ~ 1 | 슬라이더 |
| `regime_classifier_mode` | rule-v1 | enum (rule-v1 / hmm-2 / hmm-4) | dropdown (D19) |

#### Online Learning
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `attribution_update_mode` | both | enum (per-trade / nightly / both / off) | dropdown (D12) |
| `bayesian_prior_strength` | uniform | enum (uniform / weak / medium) | dropdown |
| `status_low_sample_n` | 30 | 10 ~ 500 | 정수 (D4) |
| `status_watch_threshold` | 0.40 | 0.2 ~ 0.5 | 슬라이더 |
| `status_promising_threshold` | 0.55 | 0.5 ~ 0.7 | 슬라이더 |
| `status_promising_min_n` | 50 | 30 ~ 500 | 정수 |
| `status_ok_min_n` | 200 | 100 ~ 2000 | 정수 |
| `auto_ban_enabled` | on | toggle | 토글 |

#### Backtest 우연성 보정
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `dsr_metric_display` | DSR | enum (DSR / PSR / both) | dropdown (D20) |
| `dsr_benchmark_sharpe` | 0 | -1 ~ 3 | 슬라이더 |
| `min_dsr_for_production` | 0.95 | 0.5 ~ 0.99 | 슬라이더 |

#### Live Runner 정책
| Key | Default | Range | UI |
|-----|---------|-------|----|
| `runner_mode` | paper | enum (paper / live-opt-in) | dropdown (D10) — live 선택 시 2단계 confirm + Turnstile |
| `runner_workshop_apply_mode` | explicit | enum (instant / explicit / disabled) | dropdown (D17) |
| `verdict_attribution_priority` | barrier | enum (barrier / verdict / both-disagree-flagged) | dropdown (D18) |
| `signal_stream_source` | event | enum (event / polling-30s) | dropdown (D8) |

#### Profile (D23)
| Key | Default | UI |
|-----|---------|----|
| `active_profile` | balanced | dropdown (conservative / balanced / aggressive / custom_*) |
| `save_as_custom_profile` | — | "Save current as profile" 버튼 |

### J2. Preset (3 기본)

| Preset | Kelly | Vol | TP/SL | Daily | DD30 | Leverage | Min RR | Margin | Liq buf | Margin mode |
|--------|-------|-----|-------|-------|------|----------|--------|--------|---------|-------------|
| **Conservative** | 10% | 10% | 1.5/1·ATR | 1% | 10% | 2x | 2.0 | 10% | 3·ATR | isolated |
| **Balanced** (default) | 25% | 15% | 2/1·ATR | **2%** | 20% | 5x | 1.5 | 20% | 2·ATR | cross |
| **Aggressive** | 50% | 25% | 3/1·ATR | 3% | 30% | 10x | 1.2 | 35% | 1·ATR | cross |

→ Preset 클릭 → 모든 J1 파라미터 일괄 적용. 사용자가 손대면 자동으로 `custom_*` profile 로 분기.

### J3. DB schema (영속화)

```sql
CREATE TABLE meta_user_config (
  user_id UUID NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  profile_name TEXT NOT NULL DEFAULT 'balanced',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, profile_name, config_key)
);

CREATE TABLE meta_user_profiles (
  user_id UUID NOT NULL,
  profile_name TEXT NOT NULL,
  is_preset BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, profile_name)
);

-- 3 preset seed
INSERT INTO meta_user_profiles (user_id, profile_name, is_preset, description) VALUES
  ('00000000-0000-0000-0000-000000000000', 'conservative', TRUE, '잔고 보호 우선'),
  ('00000000-0000-0000-0000-000000000000', 'balanced', TRUE, '표준 (Thorp + Moreira-Muir)'),
  ('00000000-0000-0000-0000-000000000000', 'aggressive', TRUE, '공격');
```

### J4. API

```
GET    /api/settings/meta-rule           → 활성 profile 의 모든 config 반환
PATCH  /api/settings/meta-rule           → 단일 또는 batch key 갱신
POST   /api/settings/meta-rule/profile   → 새 profile 저장 (현 config snapshot)
PUT    /api/settings/meta-rule/profile/:name/activate → profile 전환
GET    /api/settings/meta-rule/presets   → 3 preset 정의 반환
```

### J5. Hot-reload 정책

- 파라미터 변경 → DB write → 다음 signal evaluation 시 자동 적용 (engine 측 cache TTL 5초)
- runner 가동 중 변경 시: D17 `runner_workshop_apply_mode` 에 따라
  - `instant`: 즉시 반영
  - `explicit`: "Apply" 버튼 클릭 전까지 보류
  - `disabled`: runner 중 변경 차단 (sticky lock)

### J6. PR 추가 — PR9 신규

기존 PR1~PR8 외에 **PR9 (Settings UI + DB + Preset) 추가** — W-0411 (Settings 재설계) PR2~PR4 머지 후 발급:

- DB migration: `meta_user_config` + `meta_user_profiles`
- API: `/api/settings/meta-rule/*` 5 endpoint
- Settings 페이지에 "Meta-rule Trading" 섹션 추가 (W-0411 의 8섹션 사이드바에 신규 1개)
- 4 sub-section: Risk / Sizing / Triple-barrier / Gates / Online / Live
- 3 preset 버튼 + custom profile save/load
- engine 측 `engine/config/user_config.py` 신규 — DB lookup + 5초 cache + hot-reload

### J7. Workshop 와의 관계

- Workshop 슬라이더 = **로컬 실험용** (이번 backtest 한 번만 적용)
- Settings 슬라이더 = **글로벌 영속** (runner + 모든 future backtest)
- Workshop 슬라이더 우상단 "Save to Settings" 버튼 → 현 슬라이더값을 Settings 로 promote

### J8. AC 추가

| AC | 검증 |
|----|------|
| AC16 | Settings 에서 모든 J1 파라미터 슬라이더/토글로 조작 가능 |
| AC17 | preset 클릭 → 모든 J1 값 일괄 변경 + DB 저장 |
| AC18 | balance 변경 → daily_loss_cap_usd readonly 자동 재계산 (예: $10000 → $200, $50000 → $1000) |
| AC19 | runner 가동 중 Settings 변경 → D17 mode 따라 정확히 동작 (instant/explicit/disabled) |
| AC20 | LIVE 토글 → 2단계 confirm + Turnstile 통과 후에만 활성, 새로고침해도 유지 |
| AC21 | custom profile 저장/불러오기 정상, preset 은 read-only |
| AC22 | engine 측 hot-reload — config DB 변경 후 5초 내 next signal evaluation 에 반영 |
| AC23 | min RR gate — RR < 1.5 (default) 인 entry 100% skip, log 에 reason="rr_below_threshold" |
| AC24 | Hyperliquid leverage cap — asset별 max leverage 초과 요청 시 거부, 사용자 cap 도 동시 적용 (둘 중 작은 값) |
| AC25 | Liquidation buffer — entry 직전 |entry - liq_price| < 2·ATR 이면 size 축소 또는 skip |
| AC26 | Funding cost — paper runner 의 hold 중 PnL 이 `info.fundingHistory` 실측치와 1h 단위로 정확 차감 |
| AC27 | Long/Short 매핑 — D29 매핑표 외 방향으로 entry 시 거부, signal별 토글 끄면 해당 signal 무시 |
| AC28 | Hyperliquid wallet 서명 — 기존 wallet-auth 세션 재사용, 별도 API key 발급 없음 |

---

## K. Hyperliquid Futures + RR (D24~D30 상세)

### K1. Hyperliquid 통합

| 항목 | 값 / 결정 |
|------|----------|
| API base | `https://api.hyperliquid.xyz` |
| Auth | EVM wallet 서명 (기존 `wallet_sessions` 재사용, PR #1154 인프라) |
| SDK | `hyperliquid-python-sdk` (공식) — engine venv 추가 |
| Settlement | USDC |
| Funding interval | **1h** (Binance 8h 와 다름) |
| Position mode | **one-way only** (hedge 옵션 없음) |
| Margin mode | cross / isolated 둘 다 지원 (D26 토글) |
| 수수료 | 0.045% taker / 0.015% maker (volume tier 별 인하 가능) |
| Asset 별 max leverage | `info.meta` endpoint 자동 조회 (BTC 50x, alt 보통 10x~20x) |

### K2. Position sizing 재계산 (선물용)

```python
def size_position(balance_usdc: float, signal: Signal, cfg: MetaConfig) -> Position:
    risk_usdc = balance_usdc * cfg.risk_pct          # default 2%
    sl_distance = signal.atr * cfg.sl_atr_mult       # ATR 기반 SL
    sl_pct = sl_distance / signal.entry_price

    notional = risk_usdc / sl_pct                     # SL 도달 시 risk_usdc 손실
    leverage = min(cfg.user_leverage_cap, hl_meta.max_lev[signal.asset])
    margin = notional / leverage

    # D26 margin cap
    if margin > balance_usdc * cfg.max_margin_pct:
        notional = balance_usdc * cfg.max_margin_pct * leverage
        # → 사이즈 축소

    # D27 liquidation buffer
    liq_price = compute_liq_price(entry, leverage, side, hl_maintenance_margin)
    if abs(signal.entry_price - liq_price) < 2 * signal.atr * cfg.liq_buffer_atr:
        return Position.skip(reason="liquidation_too_close")

    # D24 RR gate
    expected_funding = estimate_funding(signal.asset, cfg.expected_hold_hours)
    cost = notional * (cfg.fee_taker + cfg.slippage_pct) + expected_funding
    eff_rr = (signal.tp_distance * notional - cost) / (sl_distance * notional + cost)
    if eff_rr < cfg.min_rr:
        return Position.skip(reason="rr_below_threshold", rr=eff_rr)

    return Position(notional=notional, leverage=leverage, margin=margin, eff_rr=eff_rr)
```

### K3. Funding cost (1h 누적, paper ↔ live 일치)

- paper runner: 매 1h tick 마다 `info.fundingHistory(asset, start, end)` 조회 → 보유 포지션 PnL 에서 `notional × funding_rate` 차감/가산 (long 음수 funding = 수령, 양수 = 지불)
- live runner: Hyperliquid 가 자동 정산 → `userState.funding` 으로 검증
- AC26 검증: paper 와 live 의 누적 funding 차이 < 0.5% (rounding 외)

### K4. Long/Short signal 매핑 (D29)

| Signal | 방향 default | Settings 토글 | 비고 |
|--------|-------------|--------------|------|
| vwap_reclaim | Long | on/off | 추세 회복 |
| vwap_rejection | Short | on/off | 추세 거부 |
| oi_surge | Long | on/off | 신규 매수 OI |
| oi_divergence_bullish | 양방향 | direction toggle | 가격 vs OI 디버전스 |
| oi_divergence_bearish | Short | on/off | |
| breakout | Long | on/off | range 상단 돌파 |
| range_resistance_touch | 양방향 | direction toggle | mean-reversion 후보 |
| volume_spike | Long | on/off | 거래량 급등 |

### K5. Wallet 서명 / 주문 흐름

```
1. user → /agent runner 활성 토글
2. server 가 wallet_sessions 에서 signing key 조회 (PR #1154)
3. engine 가 Hyperliquid SDK 로 EIP-712 typed-data 서명
4. POST /exchange (action=order) 전송
5. 응답 oid 를 meta_outcomes.exchange_order_id 에 저장
6. fill 완료 시 WS subscription 으로 fill 이벤트 수신 → triple_barrier 추적 시작
```

### K6. 신규 PR 영향

- **PR7 (paper runner)**: Hyperliquid `info.fundingHistory` + `info.meta` 통합 (read-only)
- **PR10 신규**: Hyperliquid live runner — wallet 서명 + 주문 + fill 추적 (PR7 머지 후, D10 LIVE 토글 활성 조건)
- **PR9 (Settings UI)**: leverage cap / margin mode / liq buffer / signal 방향 토글 추가

### K7. 위험

| Risk | 완화 |
|------|------|
| Hyperliquid downtime | order timeout 30s + retry 1회 + 그 이후 alert |
| Funding spike (1h ±0.1%) | expected funding 계산 시 최근 24h max 기준 conservative |
| Liquidation cascade | D27 buffer + 매 1m 마다 liq distance 재계산 |
| Wallet 서명 키 노출 | engine 측은 signing key 직접 보관 X — wallet_sessions 의 signed permit 만 사용 (PR #1154 모델) |

---

## L. Auto-cycle Pipeline + Concrete UI Spec (kieran 등가 표기)

> **목적**: pattern 자동 발견 → gate 평가 → 자동 진입 → triple-barrier 라벨 → bucket 갱신 → 다음 signal 게이트 반영, **continuous closed loop**. 모든 결정 단계는 kieran.ai 처럼 **숫자로 노출** (왜 진입/스킵했는지, 어떤 bucket 이 작동중인지, 백테스트 결과는 무엇인지).

### L1. 자동 cycle 데이터 흐름 (확장 다이어그램)

```
[패턴 발견기 (W-0409 Live)]
     │ emit signal { ticker, signal_name, tier, conf, ts, atr, entry_px }
     ▼
[engine/jobs/signal_bus.py]  ── pubsub (Redis or Postgres LISTEN/NOTIFY)
     │
     ├──▶ [paper_runner.py]           ── auto-trade (default ON)
     │         │
     │         ├─ context = build_context(ticker, ts)
     │         │     · regime (rule v1)
     │         │     · slot_util, free_slots
     │         │     · equity_usdc, daily_pnl
     │         │     · vol (realized 7d)
     │         │
     │         ├─ gate_result = gate_stack.evaluate(signal, context, user_cfg)
     │         │     ├─ regime_penalty   → score, penalty
     │         │     ├─ portfolio_capacity → pass/block, slots_left
     │         │     ├─ tier_score       → composite, threshold
     │         │     ├─ position_sizing  → notional, leverage, margin, liq_dist
     │         │     └─ rr_gate (D24)    → effective_rr, cost_breakdown
     │         │
     │         ├─ DECISION TRACE 저장 (meta_decisions 테이블, L4 참조)
     │         │     · 진입/스킵 무관 모든 signal 의 gate-by-gate 평가 기록
     │         │
     │         ├─ if pass:
     │         │     ├─ Hyperliquid SDK → place order (paper or live, D10)
     │         │     ├─ open position 등록 (meta_positions, L4)
     │         │     └─ attach triple_barrier (TP/SL/TIMEOUT, ATR-based)
     │         │
     │         └─ else: log skip with reason (L5 trade log "skipped" 표시)
     │
     ├──▶ [position_monitor.py]   ── 매 1m
     │         · 보유 포지션 가격 추적 → barrier_hit 검출
     │         · funding rate 1h 누적 (D28)
     │         · liquidation distance 재계산
     │         · TP/SL/TIMEOUT 도달 시 close → meta_outcomes 행 생성
     │
     ├──▶ [attribution.update_all_buckets(context, outcome)]
     │         · alpha+=TP / beta+=SL → posterior_mean 갱신
     │         · status 재계산 (watch / learning / promising / ok / bad)
     │
     └──▶ [backtest_runner.py]      ── nightly + on-demand
               · 동일 gate_stack 으로 과거 N일 재실행
               · DSR + equity curve + drawdown 계산
               · meta_backtest_runs 행 생성

[Workshop (W-0409) + Research 탭 + Live 탭]
     · 위 모든 데이터를 SSE / WebSocket 으로 실시간 표기
```

### L2. UI 페이지 인벤토리 (kieran 등가)

| kieran.ai 페이지 | 우리 등가 | 위치 | PR |
|-----------------|----------|------|----|
| Live signals stream | **LiveSignalsStream.svelte** | Patterns Live 탭 좌측 | PR5 (W-0409 PR5 통합) |
| Open positions (`/api/positions`) | **OpenPositionsPanel.svelte** | Patterns Live 탭 중앙 | PR7 |
| Formula attribution (`/api/formula-attribution`) | **BucketAttributionSection.svelte** | Patterns Research 탭 | PR6 |
| Decision tree (signal 별) | **DecisionTraceModal.svelte** (신규) | LiveSignalsStream 클릭 시 | PR4+PR5 |
| Backtest equity + drawdown | **BacktestResultPanel.svelte** (신규) | Patterns Workshop 우측 | **PR11 신규** |
| Recent trades log | **TradeLogTable.svelte** | Patterns Live 탭 하단 | PR7 |
| Settings (slider 전체) | **MetaRuleSettings.svelte** | Settings → Meta-rule Trading | PR9 |

### L3. Decision transparency — kieran-style breakdown

**모든 signal 에 대해 다음 4개 패널을 노출** (DecisionTraceModal):

```
┌─────────────────────────────────────────────────┐
│ Signal: vwap_reclaim · BTC · 2026-05-05 14:32  │
│ Tier 2 · Confidence 0.78 · Direction: Long      │
├─────────────────────────────────────────────────┤
│ [1] Regime Gate                          ✅ PASS │
│   trend=up vol=mid mom=positive → regime_id=3   │
│   penalty_multiplier = 1.00 (counter-trend X)   │
│   bucket_status (regime=3, signal=vwap_reclaim) │
│     posterior_mean = 0.62 ± 0.05 (n=87)         │
├─────────────────────────────────────────────────┤
│ [2] Capacity Gate                        ✅ PASS │
│   open_slots = 2 / 5 (max_positions = 5)        │
│   slot_util = 0.40 → bucket "low_util" promising│
├─────────────────────────────────────────────────┤
│ [3] Tier-2 Gate                          ✅ PASS │
│   tier_score = 0.74 (threshold = 0.55)          │
│   contributors: oi_surge_co=+0.18, vol_z=+0.12  │
├─────────────────────────────────────────────────┤
│ [4] Position Sizing + RR Gate            ✅ PASS │
│   risk_usd = $200.00 (balance $10,000 × 2%)     │
│   notional = $5,714 / leverage 5x / margin $1143│
│   liq_distance = 4.2·ATR (buffer 2·ATR ✓)       │
│   effective_RR = 1.83 (cost: fee $2.6 + funding │
│                        $1.1 + slippage 0.05%)   │
├─────────────────────────────────────────────────┤
│ → ENTRY EXECUTED                                 │
│   order_id: hl_oid_4a8e... · TP $103,420 (2·ATR)│
│   SL $101,710 (1·ATR) · Timeout 240min          │
└─────────────────────────────────────────────────┘
```

**스킵 케이스 동일 포맷, 실패 게이트만 ❌ 표시 + reason field.**

### L4. DB schema 추가 (B3 보완)

```sql
-- 모든 signal 의 gate-by-gate 평가 기록 (진입/스킵 무관)
CREATE TABLE meta_decisions (
  id BIGSERIAL PRIMARY KEY,
  signal_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  signal_name TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('entered','skipped','error')),
  skip_reason TEXT,                    -- 'regime_block','capacity_full','tier_low','rr_below','liq_close',...
  gate_trace JSONB NOT NULL,           -- 4-gate 별 score/threshold/pass/numbers (L3 모달 원본)
  context JSONB NOT NULL,              -- regime, slot_util, equity, vol 등
  position_id UUID,                    -- entered 인 경우만
  user_cfg JSONB NOT NULL,             -- 그 시점 active profile snapshot
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON meta_decisions(ts DESC);
CREATE INDEX ON meta_decisions(signal_name, decision);

-- 보유 포지션 (paper + live 동일 schema)
CREATE TABLE meta_positions (
  id UUID PRIMARY KEY,
  account_mode TEXT NOT NULL CHECK (account_mode IN ('paper','live')),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  entry_ts TIMESTAMPTZ NOT NULL,
  entry_px NUMERIC NOT NULL,
  size_usdc NUMERIC NOT NULL,
  leverage NUMERIC NOT NULL,
  margin_usdc NUMERIC NOT NULL,
  tp_px NUMERIC NOT NULL,
  sl_px NUMERIC NOT NULL,
  timeout_ts TIMESTAMPTZ NOT NULL,
  liq_px NUMERIC NOT NULL,
  exchange_order_id TEXT,
  funding_paid_usdc NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open|closed|liquidated
  exit_ts TIMESTAMPTZ,
  exit_px NUMERIC,
  pnl_usdc NUMERIC,
  outcome_label TEXT                    -- TP|SL|TIMEOUT|MANUAL|LIQ
);

-- 백테스트 실행 기록
CREATE TABLE meta_backtest_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_snapshot JSONB NOT NULL,      -- 그 시점 모든 user_cfg
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  ticker_set TEXT[] NOT NULL,
  total_signals INT NOT NULL,
  entered INT NOT NULL,
  skipped INT NOT NULL,
  win_rate NUMERIC,
  avg_rr NUMERIC,
  cum_pnl_pct NUMERIC,
  max_dd_pct NUMERIC,
  sharpe NUMERIC,
  dsr NUMERIC,                          -- Bailey-LdP deflated
  equity_curve JSONB NOT NULL,          -- [{ts, equity}]
  per_bucket_stats JSONB NOT NULL,      -- bucket → win/loss
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### L5. API 추가

| Method | Endpoint | 응답 | PR |
|--------|----------|------|----|
| GET | `/api/runner/signals?limit=50` | 최근 signal feed (LiveSignalsStream용) | PR7 |
| GET | `/api/runner/positions?mode=paper\|live` | 보유 포지션 (OpenPositionsPanel용) | PR7 |
| GET | `/api/runner/decisions/{signal_id}` | 단일 signal 의 full gate trace (DecisionTraceModal) | PR4 |
| GET | `/api/runner/decisions?since=&decision=` | 최근 결정 목록 (TradeLog) | PR4 |
| GET | `/api/research/bucket-attribution?variable=` | bucket 표 (kieran formula-attribution 등가) | PR6 |
| GET | `/api/runner/equity-curve?range=7d\|30d\|90d` | equity + dd 시계열 | PR7 |
| POST | `/api/backtest/run` | profile snapshot + range → backtest 실행 | PR11 |
| GET | `/api/backtest/runs?limit=20` | 과거 백테스트 목록 | PR11 |
| GET | `/api/backtest/runs/{id}` | equity curve + per-bucket + DSR | PR11 |
| **WS** | `/ws/runner` | signal / position / decision live push (SSE 대안 가능) | PR7 |

### L6. Backtest harness (PR11 신규)

**왜 별도 PR**: paper runner (PR7) 가 forward, backtest 는 backward 재생. 같은 `gate_stack.evaluate()` 재사용하되 시간축 모킹 필요.

**구현 핵심**:
```python
def run_backtest(profile: MetaConfig, range_: DateRange, tickers: list[str]) -> BacktestRun:
    signals = load_historical_signals(tickers, range_)  # 과거 signal_emitter 출력
    equity = profile.starting_balance_usdc            # default 10000 (D22)
    curve = []
    decisions = []
    for sig in signals:
        ctx = build_historical_context(sig.ticker, sig.ts)  # regime, vol 등 t-시점
        gr = gate_stack.evaluate(sig, ctx, profile)
        decisions.append({**gr, "signal_id": sig.id})
        if gr.pass_:
            outcome = simulate_triple_barrier(sig, profile, ctx)  # TP/SL/TIMEOUT 결정
            equity += outcome.pnl_usdc
            curve.append({"ts": outcome.exit_ts, "equity": equity})
    metrics = compute_metrics(decisions, curve, profile)  # win_rate, sharpe, dsr, dd
    bucket_stats = aggregate_per_bucket(decisions)
    return persist(metrics, curve, bucket_stats)
```

**UI** (BacktestResultPanel.svelte, Workshop 우측):
- 상단: range picker (7d/30d/90d/custom) + ticker_set + "Run Backtest" 버튼
- 결과 카드 4개: total signals · win rate · avg RR · DSR
- equity curve (sparkline + 확대 가능)
- drawdown chart (underwater)
- per-bucket 표 (변수×버킷 → win/loss/EV) — kieran formula-attribution 등가
- "이 결과로 profile 저장" 버튼 → meta_user_profiles 신규 row

### L7. Trade log + 실시간 transparency (TradeLogTable)

| Time | Signal | Ticker | Decision | Reason | Entry | Exit | PnL | Bucket Hit |
|------|--------|--------|----------|--------|-------|------|-----|------------|
| 14:32 | vwap_reclaim | BTC | ENTERED | — | 102.5K | TP 103.4K | +$182 | regime=3, low_util |
| 14:18 | oi_surge | ETH | SKIPPED | rr_below | — | — | — | — |
| 13:55 | breakout | SOL | SKIPPED | regime_block | — | — | — | counter-trend |
| 13:42 | vwap_rejection | BTC | ENTERED | — | 101.9K | SL 102.1K | -$120 | regime=2 |

· 클릭 시 DecisionTraceModal 오픈 (L3)
· filter: decision (all/entered/skipped) · ticker · signal_name · reason
· export CSV

### L8. 자동 cycle scheduler (D31~D33 추가)

| # | 결정 | default | Settings 토글 |
|---|------|---------|--------------|
| **D31** | signal_bus 트리거 | **Postgres LISTEN/NOTIFY** (의존 없음) | Redis 옵션 (인프라 추가 시) |
| **D32** | position_monitor 주기 | **1m tick + funding 1h tick** | 토글 30s~5m |
| **D33** | nightly job 시각 (UTC) | **02:00 UTC** (KST 11:00) | Settings 시각 입력 |

### L9. AC 추가 (kieran 등가 검증)

| AC | 검증 |
|----|------|
| AC29 | `meta_decisions` 행 — 1시간 가동 후 모든 signal 의 gate trace 100% 기록 (entered + skipped) |
| AC30 | DecisionTraceModal — 임의 signal 클릭 시 4-gate breakdown + 숫자 + bucket posterior 1초 내 표시 |
| AC31 | LiveSignalsStream — WS push 200ms 내 UI 반영, 재접속 시 마지막 50 signal replay |
| AC32 | BacktestResultPanel — 90일 BTC 1티커 backtest < 30초 완료, equity curve 부드럽게 렌더 |
| AC33 | TradeLogTable — 1000행 가상 스크롤 60fps, CSV export 정상 |
| AC34 | per-bucket 표 — kieran `/api/formula-attribution` 응답과 동등 정보 (변수, bucket, posterior, n, status) |
| AC35 | backtest profile snapshot — 과거 실행 결과를 그 시점 user_cfg 그대로 재현 가능 (deterministic) |

### L10. PR 추가 / 변경

- **PR4 확장**: `meta_decisions` 테이블 + `/api/runner/decisions` 추가 (gate trace 영속화)
- **PR5 확장**: DecisionTraceModal 통합 (LiveSignalsStream 에서 클릭)
- **PR7 확장**: WS endpoint `/ws/runner` + LiveSignalsStream + OpenPositionsPanel + TradeLogTable 통합
- **PR11 신규**: Backtest harness — `/api/backtest/*` + BacktestResultPanel.svelte + DSR 표시
- 총 PR: 10 → **11 PR**

---

## H. References (학술)

- López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley. (Ch 3 triple-barrier, Ch 3.6 meta-labeling)
- Bailey, D. H., & López de Prado, M. (2014). "The Deflated Sharpe Ratio". *Journal of Portfolio Management* 40(5).
- Hamilton, J. D. (1989). "A New Approach to the Economic Analysis of Nonstationary Time Series". *Econometrica* 57(2).
- Ang, A., & Bekaert, G. (2002). "International Asset Allocation With Regime Shifts". *Review of Financial Studies* 15(4).
- Moskowitz, T., Ooi, Y. H., & Pedersen, L. H. (2012). "Time series momentum". *Journal of Financial Economics* 104(2).
- Moreira, A., & Muir, T. (2017). "Volatility-Managed Portfolios". *Journal of Finance* 72(4).
- Kelly, J. L. (1956). "A New Interpretation of Information Rate". *Bell System Technical Journal* 35(4).
- Thorp, E. O. (2006). "The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market". *Handbook of Asset and Liability Management*.
- Almgren, R., & Chriss, N. (2000). "Optimal execution of portfolio transactions". *Journal of Risk* 3(2).
- Li, L., Chu, W., Langford, J., & Schapire, R. E. (2010). "A contextual-bandit approach to personalized news article recommendation". *WWW '10*.
- Auer, P., Cesa-Bianchi, N., & Fischer, P. (2002). "Finite-time analysis of the multiarmed bandit problem". *Machine Learning* 47.

---

## I. References (우리 시스템)

- W-0409 §B Workshop UI — UI 노출 지점
- W-0404 AI Agent — directives 호환
- W-0399 indicator catalog — gate context features
- W-PF-100 — circuit breaker 코드 공유
- `engine/scoring/hill_climbing.py` — gate weight optimizer 재사용

---

## Goal

위 §Why / §Goals 본문 참조.

## Owner

위 §Status 의 Owner 필드 (ej).

## Scope

위 §A 학술 매핑 + §B 모듈 배치 + §C PR 분기 본문.

## Non-Goals

위 §Non-Goals 명시 4항목.

## Canonical Files

§B1 모듈 트리 + §B3 DB schema 참조.

## Facts

§A 학술 출처 + §B4 기존 시스템 통합 표 + §H References.

## Assumptions

- W-0409 Workshop UI (PR5) 가 본 W PR5 시작 시점에 머지되어 있음
- `engine/jobs/signal_emitter.py` 가 존재하거나 PR7 에서 신규 작성
- DB migration 권한 보유 (Supabase prod)
- INTERNAL_RUN paper account 기존 인프라 활용 가능

## Open Questions

- §D D2 — HMM 도입 시점 임계값 (10k trade vs 1y 가동 vs DSR 0.7+)
- §D D8 — signal stream 실측 인프라 (kafka/redis/polling) 미확인 — PR7 audit 필요
- §D D9 — circuit breaker 기본값 $200 의 적정성 — paper 잔고 규모 의존
- 학술 모델 (Kelly, vol-target) 의 우리 데이터 적용 시 fit 정도 — PR2 후 검증

## Decisions

위 §D 결정표 D1~D20 락.

## Next Steps

위 §G 본문 참조.

## Exit Criteria

위 §E AC1~AC15 본문 참조.

## Handoff Checklist

- [ ] 사용자 D1~D20 검토 완료
- [ ] PR1 (triple_barrier) 발급 → 머지
- [ ] W-0409 PR5 (Workshop) 머지 확인 → 본 W PR5 발급 가능
- [ ] 7일 paper run dogfooding 성공
- [ ] CURRENT.md main SHA 갱신
- [ ] 머지 후 본 work item 파일 archive 이동
