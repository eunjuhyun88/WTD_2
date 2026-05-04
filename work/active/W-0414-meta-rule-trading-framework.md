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
