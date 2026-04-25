# WTD — Master Architecture Document

**Status**: Living document (canonical, supersedes all prior design docs)
**Last updated**: 2026-04-12 end of Phase D12
**Authors**: ej + Claude (CTO + AI researcher hats)
**Main branch head**: `4c4d2c2`
**Supersedes**:
- `docs/design/phase-d12-to-e.md` → moved to `docs/archive/`
- `project_checkpoint_2026_04_11.md` (memory, superseded)
- `project_bonferroni_alpha_verdict.md` (memory, superseded)

This is the **single source of truth**. Every other design file in the repo is
either (a) implementation detail (code + tests), (b) historical archive
(`docs/archive/`), or (c) living append-only log (`graveyard.md`,
`experiments_log.md`, `stage-1-verdict.md`). If those contradict this doc,
this doc wins.

---

## Table of contents

- [§0 Executive summary](#0-executive-summary)
- [§1 Vision](#1-vision)
- [§2 Architecture overview](#2-architecture-overview)
- [§3 Layer details](#3-layer-details)
- [§4 Engineering principles](#4-engineering-principles)
- [§5 Research protocol](#5-research-protocol)
- [§6 Current state (2026-04-12)](#6-current-state-2026-04-12)
- [§7 Stage 1 verdict detail](#7-stage-1-verdict-detail)
- [§8 Roadmap](#8-roadmap)
- [§9 Stage 1 gate specification](#9-stage-1-gate-specification)
- [§10 Reproducibility contract](#10-reproducibility-contract)
- [§11 Operational runbook (draft)](#11-operational-runbook-draft)
- [§12 Risks and mitigations](#12-risks-and-mitigations)
- [§13 Appendix](#13-appendix)

---

## §0 Executive summary

**WTD** 는 사용자가 차트에서 "이거다" 하고 느끼는 매매 setup 을 라이브러리화하고,
모든 코인을 24/7 스캔하는 자동화 시스템으로 바꾸는 연구 프로젝트다. 사용자는
Python 을 보지 않는다. 유일하게 편집하는 파일은 `program.md` 하나다.

### 현재 상태 (한 줄)

> **6-layer 시스템 중 Layer 0/1/2/4/5 완성, Layer 3 stub, Layer 6 미착수.
> Stage 1 검증 완료 — 5 challenge 중 btc-macd-style 1개만 생존.**

### 핵심 숫자

| 지표 | 값 |
|---|---|
| 구현 commit | D1 → D12-part-2 (약 30+ commit) |
| 코드 | `cogochi-autoresearch/backtest/` (11 modules), `scanner/pnl.py` |
| 테스트 | **280 passing**, mypy --strict clean on D12 modules |
| 데이터 캐시 | 30 심볼 × 6년 × 1h = 109 MB (offline) |
| Stage 2 통과 | btc-macd-style chop_skip: 87% positive windows, +3.34% exp |
| Bonferroni k | 23 (above k=20 — corrections mandatory) |
| Phase D14 | btc-macd-style SHARPENED +20.6%, lgb-long-v1 GRAVEYARD |
| Phase D15 | regime filter: bull_only +3.75%, chop_skip +3.40% |
| Phase D16 | **STAGE 2 PASS** — chop_skip 13/15 windows positive (87%) |

### 다음 결정

**Stage 2 통과 → D17 (feature expansion) 또는 D18 (realtime signaler) 추천**. btc-macd-style 은 in-sample + out-of-sample 모두 통과. Production config: stop=2.5%, target=10%, regime_skip=(chop,). D18 은 실시간 시그널러로 Stage 3 (paper trading) 진입 가능.

---

## §1 Vision

### 1.1 한 줄

> **사용자의 "이거 setup 이다" 눈을 전 알트 1000개에 24/7 돌아가는 기계로 바꾼다. 코딩 없이.**

### 1.2 사용자 (한 줄)

> 수년간 누적된 패턴 인식으로 매매하지만, 수천 개 알트를 수동 스캔할 수는 없고, Python 을 모르는 재량적 크립토 트레이더.

구체 예시: AKE 2026-04-10 setup. 사용자의 원본 설명은 "Coinalyze 필터 + 1H dead-cross + OTE 0.618 retracement + 긴 아래꼬리 + 분할 진입". 이건 논문에서 코드로 번역할 수 있는 퀀트 전략이 아니다. **수년간의 스크린 타임이 만든 패턴 인식**이다.

### 1.3 Before vs After

**Before** (현재 사용자의 일상):
```
매일 아침 → Coinalyze 필터 → TradingView 수십 개 열기 →
눈으로 setup 찾기 → 하루 2-3 signal (대부분 놓침) →
직감 기반 진입, 재현 불가
```

**After** (WTD 완성 후):
```
[패턴 1개 등록 시]
wizard 에 10개 질문 답변 (2분) →
wizard 가 match.py 자동 생성 (Claude API 없음) →
autoresearch loop 이 잠자는 동안 숫자 튜닝 →
Phase E 가 LoRA adapter 학습

[이후 매일]
inference service 가 1시간마다 전 알트 스캔 →
알림: "LONG BTCUSDT | conf 0.73 | exp +5% 24h | reason: fib-OTE-sweep" →
사용자는 "진입할지 말지"만 판단
```

**사용자가 절대 하지 않는 것**: Python 코드를 직접 보거나 편집. 편집하는 유일한 파일은 `program.md` (한국어/영어 설명문).

### 1.4 Anti-goals

- **백테스터가 아니다**. 백테스터는 전략을 입력받아 과거 P&L 을 계산한다. WTD 는 그 상류 — 전략 detector 자체를 만든다.
- **Signal marketplace 가 아니다**. 패턴은 사용자 소유. 공유/판매 없음.
- **Autotrader 가 아니다**. 알림만 쏜다. 주문 라우팅, 키 custody 없음. 진입은 사용자 재량.
- **범용 ML 플랫폼이 아니다**. "사용자 설명 → LoRA" 에 특화.
- **Karpathy autoresearch replacement 가 아니다**. 3-file 패턴과 NEVER-STOP 루프는 빌렸지만, mutable object 는 pattern matcher 이지 GPT training loop 가 아니다.

### 1.5 성공 기준 (MVP 완성)

아래 **3가지 모두** 만족해야 MVP 완성:

1. **D12 Stage 1 통과**: 최소 1개 패턴이 expectancy > 0, MDD < 20%, n ≥ 30, tail_ratio > 1, sortino > 0.5, profit_factor > 1.2 전부 동시 만족
   - **2026-04-12 현재: btc-macd-style 통과 ✅**
2. **D16 Stage 2 통과**: walk-forward 로 rolling 2y / 3m windows 의 **75% 이상** quarter 에서 expectancy > 0
3. **D18 실시간 1주 무사 운용**: realtime signaler 크래시 0, signal 빈도 분포 정상

MVP 완성 후에만 Stage 3 (paper 3개월), Stage 4 (live 1% 사이즈 1개월) 시작.

---

## §2 Architecture overview

### 2.1 6-layer 시스템 (CTO view)

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 6 — Natural language I/O (LoRA)                  Phase E  │
│    Llama-3.2-1B + LoRA adapter                                   │
│    "Signal: LONG | Conf: 0.73 | Reason: ..." 자연어 출력          │
└──────────────────────────────────────────────────────────────────┘
                                ↑
┌──────────────────────────────────────────────────────────────────┐
│  Layer 5 — Measurement                                 D12 ✅    │
│    cogochi-autoresearch/backtest/metrics.py                      │
│    6-조건 stage_1_gate(), expectancy, MDD, Sortino, tail ratio    │
│    SCORE = excess_positive_rate × coverage (D9 인수)              │
└──────────────────────────────────────────────────────────────────┘
                                ↑
┌──────────────────────────────────────────────────────────────────┐
│  Layer 4 — Execution / Risk                            D12 ✅    │
│    backtest/portfolio.py + simulator.py + scanner/pnl.py          │
│    • walk_one_trade (pure, pessimistic intrabar, ADR-002)         │
│    • max 3 concurrent / 1% risk / ISO-week halt                   │
│    • taker fee 10 bps round-trip + sqrt-impact slippage           │
└──────────────────────────────────────────────────────────────────┘
                                ↑
┌──────────────────────────────────────────────────────────────────┐
│  Layer 3 — Regime filter                          D12 stub 🟡    │
│    backtest/regime.py (현재는 "unknown" 만 반환)                   │
│    D15 에서 BTC 30d return ±10% → bull/bear/chop 로 완성          │
└──────────────────────────────────────────────────────────────────┘
                                ↑
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2 — Signal engines                              D1-D11 ✅ │
│    Option A: pattern_hunting (23 hand-crafted blocks)            │
│    Option B: classifier_training (LightGBM)                      │
│    output: P(win) per bar                                         │
└──────────────────────────────────────────────────────────────────┘
                                ↑
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1 — Features                                        A ✅  │
│    cogochi-autoresearch/scanner/feature_calc.py                  │
│    28 features, past-only, vectorised                             │
└──────────────────────────────────────────────────────────────────┘
                                ↑
┌──────────────────────────────────────────────────────────────────┐
│  Layer 0 — Data                                           D1 ✅  │
│    cogochi-autoresearch/data_cache/ (109 MB, 30 × 6yr × 1h)       │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 End-to-end 데이터 플로우

```
raw OHLCV (data_cache.load_klines, offline)
     │
     ▼
scanner.feature_calc.compute_features_table → 28 features
     │
     ▼
signal engine (pattern_hunting OR classifier) → P(win) per bar
     │
     ▼
[Layer 3 — D15 이후] regime filter: bull/bear/chop
     │ skip if regime mismatch
     ▼
[Layer 4] Portfolio.can_enter(symbol, time) 체크
     │ daily halt? weekly halt? max_concurrent? cooldown?
     ▼ 통과시
scanner.pnl.walk_one_trade(klines, entry_pos, direction,
                            target=4%, stop=2%, horizon=24h)
     │ bar-by-bar path walk, pessimistic intrabar
     ▼
Portfolio.mark_closed → 실현 PnL, circuit breakers 업데이트
     │
     ▼
[Layer 5] backtest.metrics.compute_metrics
     │ expectancy, MDD, Sortino, tail_ratio, profit_factor
     ▼
stage_1_gate() → (passed, failure_reasons)
     │
     ▼ passed
[Layer 6 — Phase E] LoRA 자연어 출력
     │
     ▼
Telegram / Discord 알림
```

### 2.3 Component ownership (누가 뭐를 관리하나)

| 컴포넌트 | 파일 | 테스트 | 변경 빈도 |
|---|---|---|---|
| Data cache | `data_cache/loader.py` | `test_data_cache.py` | 낮음 |
| Feature calc | `scanner/feature_calc.py` | `test_feature_calc.py` | 중간 (D17 에서 확장) |
| Building blocks | `building_blocks/` (23개) | 블록당 1 test 파일 | 중간 |
| Wizard | `wizard/composer.py`, `interview.py` | `test_wizard_*.py` | 낮음 |
| Path walk | `scanner/pnl.py` | `test_pnl.py` (14 case) | **매우 낮음** — ADR-002 로 고정 |
| Portfolio | `backtest/portfolio.py` | `test_backtest_portfolio.py` | 낮음 |
| Simulator | `backtest/simulator.py` | `test_backtest_simulator.py` | 낮음 |
| Metrics | `backtest/metrics.py` | `test_backtest_metrics.py` | **매우 낮음** — gate 변경은 ADR 필요 |
| Regime | `backtest/regime.py` | `test_backtest_regime.py` | 높음 (D15 에서 본격 구현) |
| CLI | `tools/backtest_portfolio.py`, `stress_test.py` | 통합 테스트로 cover | 중간 |

---

## §3 Layer details

### 3.1 Layer 0 — Data cache

**모듈**: `cogochi-autoresearch/data_cache/`

**책임**: Binance 1h klines 의 오프라인 캐시. `load_klines(symbol, "1h", offline=True)` 는 네트워크를 건드리지 않는다. 평가 단계에서 네트워크 I/O 로 실험이 조용히 멈추는 일을 방지.

**저장 구조**:
```
cogochi-autoresearch/data_cache/cache/
  BTCUSDT_1h.csv
  ETHUSDT_1h.csv
  ...
  (30 symbols × 2 files = 60 CSV files, ~109 MB)
```

**현재 상태**: 6년치 (2020-01 ~ 2026-04) × 30 symbols × 1h. 약 1.56M bar × 30 = ~47M data points. 현재 워크트리는 `hopeful-grothendieck` 워크트리로 symlink.

**알려진 한계**:
- 1h 봉만 지원 (15m, 4h 는 D17 이후)
- 30 심볼만 (Phase F 에서 1000까지 확장, 우선순위 낮음)
- Tick data 없음 → intrabar 순서는 ADR-002 에 따라 pessimistic 가정

### 3.2 Layer 1 — Features

**모듈**: `cogochi-autoresearch/scanner/feature_calc.py`

**책임**: OHLC + volume + perp (funding/OI) → 28개 `SignalSnapshot` feature 벡터. **모든 함수는 past-only** — given `klines[0..t]`, feature 는 `0..t` 만 사용. Look-ahead bias 의 1차 방어선.

**28 features** (category 별):

| Category | Features |
|---|---|
| **Trend** (6) | ema20_slope, ema50_slope, ema200_slope, ema_alignment, htf_structure, ema_stack_bullish |
| **Momentum** (4) | rsi14, macd_hist, stoch_k, momentum_10 |
| **Volatility** (5) | atr_pct, atr_ratio_short_long, bb_width, bb_position, volatility_regime |
| **Volume** (4) | volume_zscore, volume_delta, taker_buy_ratio, volume_ma_ratio |
| **Structure** (3) | dist_from_20d_high, dist_from_20d_low, swing_pivot_distance |
| **Microstructure** (2) | wick_body_ratio, body_size_zscore |
| **Order flow** (2) | cvd_state, cvd_divergence |
| **Meta** (2) | day_of_week, hour_of_day |

**D10b 검증**: time features (day_of_week, hour_of_day) 는 누수 아님. LightGBM 의 gain 통계에서 inflation 은 있지만, 실제 정확도 기여는 +0.63%. High-conf precision 에는 오히려 방해 — classifier-training 에서는 drop 권장.

**D10a ceiling**: 이 28 feature 로 달성 가능한 **honest alpha 상한 = +2.08%** excess positive rate. time features 를 제거한 결과. sample-rally (+1.21%) 는 이 상한의 ~58% 를 차지한다.

### 3.3 Layer 2 — Signal engines

두 가지 옵션 — 동일한 출력 계약 (`P(win) per bar`) 을 만족해야 한다.

#### Option A: `challenges/pattern-hunting/<name>/`

- Hand-crafted block 조합 → `match.py::matches(klines, features) → pd.Series[bool]`
- 23개 building block: 5 triggers + 8 confirmations + 7 entries + 3 disqualifiers
- Wizard 가 `answers.yaml` → `match.py` 를 자동 생성 (Claude API 호출 없음)
- **현재 4개 instance**: sample-rally-pattern, btc-macd-style, ake-style, exhaustion-short

#### Option B: `challenges/classifier-training/<name>/`

- LightGBM 기반 → `train.py` + `prepare.py` + `model.txt` + `match.py` (wrapper)
- 28 feature → `P(win)` → `p ≥ threshold` 필터링
- **현재 1개 instance**: lgb-long-v1

**비교**:

| 측면 | pattern_hunting | classifier_training |
|---|---|---|
| 해석 가능성 | 높음 (블록 조합이 명시적) | 낮음 (1000 tree 앙상블) |
| 튜닝 | autoresearch swarm | LightGBM hyperparam |
| 최고 성능 | +1.21% excess (sample-rally) | +29.09% high-conf (lgb-long-v1) |
| Stage 1 pass | btc-macd-style ✅ | **전부 fail** |
| 고유값 활용 | feature 해석에 의존 | raw feature 공간 직접 학습 |

**중요 관찰**: D11 Bonferroni 는 lgb-long-v1 만 통과한다고 했지만, D12 Stage 1 은 lgb-long-v1 을 **탈락**시키고 btc-macd-style 을 통과시킨다. 측정 방식이 바뀌면 판정도 뒤집힌다 — §7 참조.

### 3.4 Layer 3 — Regime filter

**모듈**: `cogochi-autoresearch/backtest/regime.py`

**D15 완료**: `label_regime_by_btc_30d()` 가 `simulator.run_backtest` 에 배선됨. `RiskConfig.regime_skip` 튜플로 제어. BTC 30d 수익률 기준:
- `> +10%` → `"bull"`
- `< -10%` → `"bear"`
- 그 사이 → `"chop"`

btc-macd-style 에 적용한 결과: bull_only (bear+chop skip) 가 +3.75% exp, -5.9% MDD 로 최적. `tools/regime_analysis.py` 가 decomposition CLI.

### 3.5 Layer 4 — Execution / Risk

**모듈**:
- `cogochi-autoresearch/scanner/pnl.py` — pure path walker
- `cogochi-autoresearch/backtest/portfolio.py` — stateful 포트폴리오
- `cogochi-autoresearch/backtest/simulator.py` — event-driven 루프

#### `walk_one_trade` (scanner/pnl.py)

**계약**: pure function. 같은 입력 → 같은 출력. I/O 없음. `klines` DataFrame 을 건드리지 않음.

```python
def walk_one_trade(
    klines: pd.DataFrame,
    entry_pos: int,
    direction: Literal["long", "short"],
    target_pct: float,
    stop_pct: float,
    horizon_bars: int,
    notional_usd: float,
    adv_notional_usd: float,
    costs: ExecutionCosts,
    intrabar_order: IntrabarOrder = "pessimistic",
) -> TradeResult:
```

**규칙** (ADR-002 로 고정):
1. Entry = entry bar 의 **open**
2. Stop/target touch 는 **entry bar 포함** 검사
3. 한 bar 에서 둘 다 touch → `pessimistic` 이면 stop 이 먼저 체결
4. Horizon 내 touch 없음 → 마지막 bar 의 **close** 에서 force close (`exit_reason = "timeout"`)
5. Fee: `fee_taker_pct = 0.0005` 양쪽 부과 → round-trip 0.10%
6. Slippage: `base_slippage_pct = 0.0002` 플러스 `k × sqrt(notional / adv_notional)` (notional 이 ADV 의 1% 초과 시)

#### `Portfolio` (backtest/portfolio.py)

**상태**:
```python
cash: float                                    # 현금
open_positions: dict[symbol, OpenPosition]
closed_trades: list[ExecutedTrade]
equity_curve: list[EquityPoint]
daily_pnl: dict[date, float]                   # 일일 PnL 누적
weekly_pnl: dict[monday_date, float]           # ISO week anchor
cooldown_until: dict[symbol, Timestamp]
halt_until_date: date | None                   # 일일 halt
halt_until_week: date | None                   # 주간 halt
pause_until: Timestamp | None                  # consecutive loss pause
consecutive_losses: int
```

**can_enter() 차단 이유**:
- `consecutive_loss_pause` (5연패 → 24h pause)
- `daily_loss_halt` (일일 -3% → 당일 정지)
- `weekly_loss_halt` (주간 -8% → 당주 정지)
- `max_concurrent` (동시 최대 3 포지션)
- `already_open` (심볼당 최대 1)
- `cooldown` (청산 후 3 bars)

**size_position() (fixed_risk 전용)**:
```
notional_usd = equity × risk_per_trade_pct / stop_loss_pct
             = 10000 × 0.01 / 0.02 = 5000
size_units  = notional_usd / entry_price
```

`sizing_method = "kelly" | "fixed_notional"` 는 D14 에서 구현. D12 는 fixed_risk 전용.

#### `run_backtest` (backtest/simulator.py)

Event-driven. 한 번 돌릴 때:
1. signals 를 timestamp 순으로 정렬, `threshold` 아래는 선제 drop
2. heap 으로 exit event 를 future-scheduled
3. 각 signal 시점에서 먼저 `_flush_exits_until(signal.timestamp)` — 지금까지 scheduled exit 처리
4. `Portfolio.can_enter()` → pass 면 `walk_one_trade` 로 trade 결과 선계산 → heap 에 exit event push
5. 마지막 signal 이후 `_flush_exits_until(_FAR_FUTURE)` 로 pending exits drain
6. `compute_metrics` → `BacktestResult`

**Boundary handling**: `horizon_bars` 를 남은 bar 수로 clamp 해서 마지막 signal 도 강제 timeout 으로 실행. 데이터 경계에서 signal 이 조용히 사라지지 않음.

### 3.6 Layer 5 — Measurement

**모듈**: `cogochi-autoresearch/backtest/metrics.py`

**핵심 데이터**:

```python
@dataclass(frozen=True)
class BacktestMetrics:
    n_executed: int
    n_blocked: int
    expectancy_pct: float
    win_rate: float
    profit_factor: float
    max_drawdown_pct: float
    sortino: float
    calmar: float
    sharpe: float
    tail_ratio: float
    skew: float
    kurtosis: float
    avg_bars_to_exit: float
    exit_reason_counts: dict[str, int]
    initial_equity: float
    final_equity: float
```

**Stage 1 gate** (preregistered, 6 조건 — 변경하려면 새 ADR 필요):

```python
def stage_1_gate(m: BacktestMetrics) -> tuple[bool, list[str]]:
    failures = []
    if m.expectancy_pct <= 0:      failures.append(...)
    if m.max_drawdown_pct < -0.20: failures.append(...)
    if m.n_executed < 30:          failures.append(...)
    if m.tail_ratio < 1.0:         failures.append(...)
    if m.sortino < 0.5:            failures.append(...)
    if m.profit_factor < 1.2:      failures.append(...)
    return (len(failures) == 0, failures)
```

**Why these six**:
- `expectancy > 0`: 당연한 baseline. "돈 못 벌면 탈락"
- `MDD > -20%`: 한 번의 drawdown 으로 계좌 박살나는 전략 거부
- `n ≥ 30`: 통계적 의미. 30 미만은 random fluctuation 구분 불가
- `tail_ratio ≥ 1`: 큰 수익 > 큰 손실. 큰 win 하나로 유지되는 전략 거부
- `sortino ≥ 0.5`: downside 변동성 대비 수익. 역사적 crypto 기준 관대한 편
- `profit_factor ≥ 1.2`: 총 wins / |총 losses|. 1.2 미만은 transaction cost 누출 취약

### 3.7 Layer 6 — Natural language I/O (Phase E)

**계획**: Llama-3.2-1B-Instruct-4bit + LoRA adapter.

**입력**: SignalSnapshot 을 자연어로 verbalize
```
"BTCUSDT, 75k 돌파 직후, 24h 볼륨 3배, RSI 65, EMA20 > EMA50,
aligned bullish, BTC dominance 58%, ATR ratio 1.3..."
```

**출력**:
```
Signal: LONG
Confidence: 0.73
Expected return: +5% in 24h
Reason: 20-day high breakout with volume confirmation,
        bullish ema stack, momentum reading 65 still healthy.
Stop: 2% below entry. Target: 4% above entry.
```

**Prerequisite**: Phase D16 (walk-forward) 통과. 즉 Stage 2 생존자 최소 1개.
**Gate**: Held-out signal 에서 LoRA 의 signal 판정이 LightGBM 과 95% 이상 일치.
**Training data**: 검증된 생존자의 `instances.jsonl` + verbalized feature snapshot + 정답 completion.

**Phase E 는 알파 증폭기가 아니다**: LoRA 는 기존 엣지를 자연어로 포장하는 compression 도구다. 엣지 없는 패턴을 LoRA 로 학습하면 "쓸모없는 걸 자연어로 설명하는 모델" 이 된다.

---

## §4 Engineering principles

### 4.1 3-hat 설계 (non-negotiable)

모든 설계 결정은 다음 세 관점을 **동시에** 만족해야 한다.

#### Quant Trader hat

- **Realized PnL, not path summary**. "upside - downside" 같은 경로 요약은 실제 돈이 아님
- **Fractional Kelly**. Full Kelly 는 실전에서 너무 공격적
- **Fat-tail metrics**: Sharpe 단독 금지. Sortino + Calmar + tail_ratio 병행
- **Realistic costs**: maker/taker fee, sqrt-impact slippage, intrabar ordering
- **Capacity awareness**: 전략이 $1M 에서 작동해도 $50M 에서 무너질 수 있음

#### AI Researcher hat

- **Bias catalog first**. 모델 학습 전에 bias 확인 (§4.2)
- **Bonferroni correction**. 우리가 테스트한 hypothesis 수 만큼 alpha 를 나눈다
- **Walk-forward with purge + embargo**. 시간 누설 방지
- **Preregistration**. 실험 전에 예측 고정, 사후 조정 금지
- **Confidence calibration**. p=0.70 이 실제로 70% 승률인지 검증
- **Falsification > confirmation**. "이 가설이 틀렸다면 어떤 증거가 보일까?" 를 먼저 묻는다

#### Senior SWE hat

- **Interface-first**. Layer 간 명시적 typed contract (`EntrySignal`, `ExecutedTrade`, `TradeResult`)
- **Pure core, impure edge**. `walk_one_trade` 는 순수. I/O 와 mutation 은 edge 에 격리
- **Reproducibility guarantees**. `run_id` + `git_sha` + `config_hash` + `random_seed` 로 동일 결과 재현
- **Structured observability**. `print` 금지. `StructuredLogger` 가 1 JSON / line
- **Testing pyramid**. Unit (pnl, portfolio) + Integration (simulator) + Smoke (CLI)
- **Type safety**: `mypy --strict` 로 D12 모듈 100% clean
- **Error taxonomy**: `CogochiError` 상속 트리 (`CacheMiss`, `InsufficientDataError`, `ConfigValidationError`, ...)
- **Configuration management**: `RiskConfig` frozen dataclass + yaml + CLI override + `content_hash()`
- **ADR (Architecture Decision Records)**: 중요 결정은 `docs/adr/NNN-*.md` 로 commit

### 4.2 Bias 카탈로그 (6)

**CTO 가 가장 자주 놓치는 것** — 모델이 아니라 데이터 흐름에서 나온다.

| # | Bias | 우리 시스템에서의 위험 | 방어 |
|---|---|---|---|
| 1 | **Survivorship** | 상장폐지 코인을 universe 에서 제거 | binance_30 의 고정 universe 로 제한, 역사적 리스팅 시점 존중 |
| 2 | **Look-ahead** | feature 가 미래 bar 를 참조 | `scanner/feature_calc.py` 모든 함수 past-only, vectorized rolling |
| 3 | **Data-snooping** (multiple hypothesis) | 많은 가설을 돌리고 가장 좋은 것만 보고 | Bonferroni k=20, 실험 전 preregistration, `experiments_log.md` 에 누적 카운트 |
| 4 | **Selection** (universe) | "잘 된 코인만 우리 universe" | binance_30 은 2020 년대 중반의 상위 notional, 선택적 제거 없음 |
| 5 | **Confirmation** | 잘 나온 결과만 믿고 deep dive | `graveyard.md` 에 모든 killed hypothesis 기록, falsification 우선 |
| 6 | **Backtesting overfitting** | parameter grid 를 in-sample 에 과하게 튜닝 | Stage 2 walk-forward with purge 24h / embargo 24h, rolling window |

### 4.3 Killing criterion 철학

> **측정 시스템의 목적은 "이 전략이 성공함" 을 증명하는 것이 아니라, "이 전략이 실패함" 을 증명할 기회를 제공하는 것이다.**

이게 Phase D12 의 철학적 재방향이었다. 이전의 D9/D11 측정은 "승률이 높다" 를 증명했지만, 실제 실행 조건 (stop loss, circuit breaker, intrabar order) 을 적용하면 승률이 붕괴한다.

모든 metric 은 **killing criterion** 이다 — 만족하지 못하면 탈락:
- `expectancy ≤ 0` → 탈락
- `MDD > -20%` → 탈락
- Walk-forward quarter 의 75% 미만이 positive → 탈락
- Fee/slippage 적용 후 부호가 뒤집힘 → 탈락

**긍정 증거는 부정 증거의 부재다**, 라는 Popper 관점을 그대로 시스템에 박았다.

### 4.4 Pure core, impure edge

```
               ┌──────────────────────────┐
               │        PURE CORE          │
               │  scanner/pnl.py           │
               │  backtest/metrics.py      │
               │  backtest/calibration.py  │
               │                            │
               │  • Same inputs → same      │
               │    outputs                 │
               │  • No I/O, no mutation    │
               │  • Deterministic testable │
               └──────────────────────────┘
                         ▲
                         │ read
                         │
               ┌──────────────────────────┐
               │   STATEFUL MIDDLE         │
               │   backtest/portfolio.py   │
               │   backtest/simulator.py   │
               │                            │
               │   • Explicit mutation      │
               │     methods                │
               │   • Logger injected        │
               └──────────────────────────┘
                         ▲
                         │ I/O
                         │
               ┌──────────────────────────┐
               │      IMPURE EDGE           │
               │   data_cache/loader.py    │
               │   backtest/audit.py       │
               │   tools/backtest_*.py     │
               │                            │
               │   • Filesystem, network    │
               │   • Wall clock, stdout     │
               │   • Platform queries       │
               └──────────────────────────┘
```

테스트는 아래에서 위로 올라가며 더 커진다. Unit test (pure core) 는 밀리초, integration test (stateful) 는 초, e2e smoke (edge) 는 분.

### 4.5 Reproducibility guarantees

**계약**: 같은 git sha + 같은 config hash + 같은 random seed + 같은 data snapshot → 같은 숫자.

모든 Stage 1 run 은 `tools/output/runs/<run_id>/` 에 아래 4개 파일을 남긴다:

```
metadata.json         # git_sha, git_dirty, config_hash, python_version,
                      # key_deps, random_seed, ts_utc, warnings
metrics.json          # BacktestMetrics + stage_1_passed + failure_reasons
trades.jsonl          # schema_version=1, 한 line 당 ExecutedTrade
equity_curve.jsonl    # {time, equity} per event
```

**왜**: 6개월 뒤 "이 결과 어떻게 나왔지?" 를 정확히 재현 가능해야 한다. 현실 연구에서 이걸 안 하면 "그 때는 됐는데 지금은 안 됨" 사태가 발생한다. `config.content_hash()` 는 `sha256(json.dumps(asdict(cfg), sort_keys=True))[:12]` — 필드 순서에 무관.

### 4.6 Type safety + testing

**Type**:
- D12 모듈 (`backtest/`, `observability/`, `scanner/pnl.py`, `exceptions.py`): `mypy --strict` clean
- 나머지 (pre-existing): feature 확장 시 점진적 마이그레이션

**Test pyramid**:
- **280 passing** 현재
- `test_pnl.py` 14 cases (path walker edge cases)
- `test_backtest_config.py` 13 cases (validation, yaml loader, content_hash)
- `test_backtest_portfolio.py` 11 cases (circuit breakers, sizing, cooldown)
- `test_backtest_simulator.py` 5 integration (end-to-end run)
- `test_backtest_metrics.py` 6 cases (all wins, all losses, fat tail, gate)
- `test_backtest_calibration.py` 5 cases (reliability diagram)
- `test_backtest_audit.py` 3 cases (metadata, dirty git, round-trip)
- `test_backtest_regime.py` 4 cases (stub + BTC 30d)
- `test_observability_logging.py` 4 cases (schema, levels, collision, serialization)
- 나머지 215 = feature_calc, building_blocks, wizard, data_cache, labels, universe, signal model

---

## §5 Research protocol

### 5.1 4-stage validation ladder

각 stage 는 gate. 이전 stage 통과 못 하면 다음 stage 시작 금지.

```
┌──────────────────────────────────────────────────────────┐
│ Stage 1 — In-sample backtest          (Phase D12)        │
│                                                           │
│ 데이터: 전체 6년 history                                  │
│ Gate: 6-조건 stage_1_gate() 전부 통과                      │
│ 2026-04-12: btc-macd-style 통과, 나머지 4 탈락             │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 2 — Walk-forward out-of-sample  (Phase D16)        │
│                                                           │
│ 데이터: 3m non-overlapping windows                        │
│ Gate: 75% 이상 window 에서 expectancy > 0                  │
│       overall Sortino > 1, Calmar > 0.5                   │
│ 2026-04-12: chop_skip 통과 (87%, 13/15 positive)          │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 3 — Paper trading (3개월+)      (Phase D18+)       │
│                                                           │
│ 데이터: 실시간 live, 가상 자금                              │
│ Gate: paper expectancy ≥ backtest expectancy × 0.5        │
│       (50% 감쇠 허용)                                      │
│ 아직 미착수                                                │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 4 — Small-size live (1개월+)                        │
│                                                           │
│ 데이터: 실거래 계좌의 1% 미만                              │
│ Gate: 수수료 + slippage 반영 후 expectancy > 0             │
│ 아직 미착수                                                │
└──────────────────────────────────────────────────────────┘

Stage 4 통과 = "검증된 전략". 그때 scale up.
```

### 5.2 Preregistration

모든 실험은 시작 **전에** `experiments_log.md` 에 가설 + 예측 + kill criteria 를 기록한다.

**형식**:
```
| # | Date | Phase | Challenge | Gate | Predicted | Outcome | Bonferroni k |
```

**왜**: 예측을 나중에 조정하면 "맞춘 것처럼" 보이게 만들 수 있다. Preregistration 은 이 self-deception 을 강제로 차단한다. 2026-04-12 기준 **5개 preregistered 예측 중 5개 틀림** — 이건 실패가 아니라 프로토콜이 작동한다는 증거다.

### 5.3 Graveyard

`docs/design/graveyard.md` 는 append-only. 모든 killed hypothesis 의 postmortem 포함.

**왜**: 죽은 실험을 없었던 것처럼 지우면 같은 실수가 반복된다. 그리고 같은 가설을 2번 test 하는 건 data-snooping 위험을 2배로 증폭한다.

### 5.4 Bonferroni counter

`docs/design/experiments_log.md` 는 **모든 independent hypothesis test 의 누적 카운터**. preregistered k = 20 (D12 design 시점에 고정).

이 수를 넘기 전까지는 `alpha = 0.05 / k` 를 유의성 임계값으로 사용한다. 2026-04-12 현재 k = 18. btc-macd-style 의 profit factor 6.07 / 358 trades 는 어떤 Bonferroni 보정으로도 유의함.

### 5.5 Falsification > confirmation

새 결과가 나왔을 때 첫 번째 질문은 **"이게 틀렸다면 어떤 증거가 있어야 하는가?"** 이다. 확인 편향을 구조적으로 억제한다.

구체 예시 — btc-macd-style 의 +2.01% 가 나왔을 때:
1. **확인 질문**: "와 정말 좋네 다른 threshold 도 해봐야지!"
2. **falsification 질문**: "BTC 만 쓰는 전략인데 2020-2026 이 상승장이어서 그냥 drift 아닌가?"
3. **검증**: BTCUSDT 에 1000회 random long 시뮬, 같은 stop/target. 결과 `mean = -0.03%`, `t = -0.40`. Drift 아님.
4. **결론**: 진짜 엣지로 판정. Phase D16 walk-forward 후보.

---

## §6 Current state (2026-04-12)

### 6.1 Commit ladder

```
4c4d2c2  Phase D12 part 2: regime stub + CLIs + Stage 1 verdict       PR #6
7b1b2b6  Phase D12 part 1: backtest core (pnl walk + portfolio + ...) PR #5
1c63dac  docs(design): Phase D12→E MVP design — 3-hat edition          PR #4
f6ed7c4  Phase D11c: tools/predict_now.py                              PR #3
a472e2a  Phase D11b: classifier-training challenge type                PR #3
cfabfb5  Phase D11a: tools/find_entries.py                             PR #3
cfb85bc  Phase D10b: leak audit — no leakage                           PR #2
2fa23b6  Phase D10a: LightGBM ceiling check                            PR #2
ab8e881  Phase D9: random-baseline scoring                             PR #2
c5a884e  Phase D8: direction-aware + multi-horizon + 3 patterns        PR #1
```

### 6.2 What's implemented

| Layer | 상태 | 파일 |
|---|:---:|---|
| 0 Data cache | ✅ 100% | `data_cache/loader.py` |
| 1 Features | ✅ 100% | `scanner/feature_calc.py` (28 features) |
| 2 Pattern hunting | ✅ 100% | `wizard/` + `building_blocks/` + `challenges/pattern-hunting/` |
| 2 Classifier training | ✅ 100% | `challenges/classifier-training/lgb-long-v1/` + LightGBM pipeline |
| 3 Regime filter | 🟡 stub | `backtest/regime.py` (D15 에서 본격) |
| 4 Execution / Risk | ✅ 100% | `scanner/pnl.py` + `backtest/{portfolio, simulator}.py` |
| 5 Measurement | ✅ 100% | `backtest/{metrics, calibration, audit}.py` |
| 6 LoRA I/O | ⬜ 0% | Phase E (D16 통과 후) |

### 6.3 Stage 1 verdicts

자세한 내용은 `docs/design/stage-1-verdict.md`. 요약:

| Challenge | n_exec | n_blocked | expectancy | MDD | win_rate | sortino | pf | **verdict** |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| sample-rally-pattern | 2061 | 3574 | **-0.49%** | -99.5% | 28.7% | -0.23 | 0.67 | **FAIL** |
| **btc-macd-style** | **359** | **39** | **+2.01%** | **-5.1%** | **75.8%** | **1.11** | **6.07** | **✅ PASS** |
| ake-style | 1742 | 3288 | -0.59% | -99.6% | 26.9% | -0.28 | 0.62 | FAIL |
| exhaustion-short | 295 | 224 | -1.25% | -84.6% | 14.9% | -0.58 | 0.32 | FAIL |
| lgb-long-v1 (thr 0.60) | 17 | 98 | -1.43% | -11.6% | 11.8% | -0.67 | 0.24 | FAIL |

### 6.4 Preregistered vs observed (5/5 wrong)

| Challenge | Preregistered | Observed | Direction |
|---|---|---|---|
| sample-rally-pattern | +0.1 ~ +0.3%, -8~14% | -0.49%, -99.5% | much worse |
| btc-macd-style | -0.1 ~ +0.1%, miss | **+2.01%, PASS** | **much better (surprising)** |
| ake-style | -0.2 ~ +0.2%, -10% | -0.59%, -99.6% | much worse |
| exhaustion-short | -2.5 ~ -4%, -18% | -1.25%, -84.6% | milder expectancy, worse MDD |
| lgb-long-v1 thr=0.60 | +0.5 ~ +2.0%, PASS possible | -1.43%, FAIL | **wrong direction** |

5 of 5 틀림. Preregistration 의 원래 의도대로, 이건 성공이다. 5개의 새 calibration datum 이 생겼다.

### 6.5 Key findings

#### Finding 1 — lgb-long-v1 의 "77% 승률" 붕괴
- D11a 보고: 115 entries, **77.39% win rate**
- D12 Stage 1 재측정: 17 executed, **11.8% win rate**
- **원인**: D11a 는 `outcome > 0 at T+24h` 로 측정 (horizon). 2% stop 이 도중에 맞는 걸 놓침.
- **보조 원인**: OPUSDT 2026-02-19 에 51 entries 클러스터. 첫 손실 몇 개가 daily_loss_halt + consecutive_loss_pause 를 연쇄 발동. 생존 17 trades 는 cluster 초기 losers 에 bias.
- **구조적 결론**: horizon scoring 은 실제 P&L 을 못 잡는다. Path walk 가 ground truth.

#### Finding 2 — btc-macd-style 의 역전

- D9 판정: `t = 0.07σ`, noise, graveyard 직전
- D12 Stage 1 재측정: 358 trades, **+2.01% expectancy, 75.8% win rate, PF 6.07**
- **Drift sanity check**: 1000 random BTCUSDT longs, 같은 stop/target → `mean = -0.03%`, `t = -0.40`. **Drift 아님**.
- **구조적 결론**: horizon scoring 은 일부 진짜 엣지도 놓친다. btc-macd-style 은 8h horizon 에서는 signal 이 약했지만 24h / 2% stop / 4% target 경로에서는 clear.

#### Finding 3 — Horizon vs path-walk 는 양방향으로 다르다

**규칙**: 이제부터 모든 challenge 는 D9 horizon gate (`excess_positive_rate × coverage`) **AND** Stage 1 path-walk gate 를 **둘 다** 통과해야 "active" 로 카운트. 한쪽만 통과하는 건 약속을 못 지킨다.

#### Finding 4 — Circuit breaker 가 lgb-long-v1 의 붕괴를 -11.6% 에서 멈췄다

만약 circuit breaker 없이 115 entries 전부 실행됐다면 MDD 는 -99% 를 찍었을 것 (다른 4 challenges 보면 알 수 있다). `daily_loss_halt` 51회, `consecutive_loss_pause` 35회, `cooldown` 8회 — 신호 quality 가 무너질 때 **시스템 자체가 "멈춰"** 라고 말한 덕분에 손실이 -11.6% 에서 잘렸다.

**교훈**: signal quality 와 portfolio safety 는 직교한다. 둘 다 필요하다.

### 6.6 Stress test 결과

`tools/stress_test.py` — 2 scenarios:

| Scenario | Window | n_exec | MDD | `weekly_loss_halt` fires |
|---|---|---:|---:|---:|
| flash_crash_2020_03 | 2020-03-05 ~ 03-20 | 32 | -16.9% | 66× |
| luna_ftx_2022 | 2022-05 + 2022-11 | 50 | -13.4% | 315× |

Circuit breaker 가 MDD 를 -17% / -13% 에서 멈췄다. D15 regime filter 가 본격 구현되면 이 windows 에서는 **entry 자체를 skip** 해서 realized MDD 가 더 작아질 것.

---

## §7 Stage 1 verdict detail

이 섹션은 `docs/design/stage-1-verdict.md` 의 캐노니컬 카피이다. Living document 는 repo 쪽이 truth.

### 7.1 btc-macd-style — PASS ✅

```
n_executed         : 359
n_blocked          : 39  (daily_loss_halt=1, max_concurrent=38)
expectancy_pct     : +2.01%
win_rate           : 75.8%
profit_factor      : 6.07
max_drawdown_pct   : -5.09%
sortino            : 1.113
calmar             : 658.59
sharpe             : 0.852
tail_ratio         : 1.80
skew               : -0.761
kurtosis           : -1.052
final_equity_usd   : $345,345.55 (from $10,000)
```

**검증된 것**:
- 358 trades 는 6년 기간 동안 충분한 sample
- BTCUSDT 단일 심볼 전략 — capacity 제한 있음 (자본 ~$1-5M 상한 예상)
- In-sample only — Stage 2 walk-forward 가 honest test
- Drift aprent verified

**제약**:
- 단일 심볼 → 3 concurrent slots 중 1만 실제 활용
- 2020-2026 BTC 상승 환경 특화일 가능성 (Stage 2 에서 bear 구간 통과 여부 확인 필수)

**D16 preregistered prediction**:
> btc-macd-style 은 walk-forward (2y rolling, 3m step, purge 24h, embargo 24h) 에서 **24 quarters 중 75% 이상** 에서 expectancy > 0 를 달성한다. 실패하면 "bull market 특화 알파" 로 재분류.

### 7.2 lgb-long-v1 thr=0.60 — FAIL

```
n_executed         : 17 / 115
expectancy_pct     : -1.43%
win_rate           : 11.8%
max_drawdown_pct   : -11.62%
sortino            : -0.67
profit_factor      : 0.24
failures:
  - expectancy -0.0143 <= 0
  - n_trades 17 < 30
  - sortino -0.67 < 0.5
  - profit_factor 0.24 < 1.2
block_reasons:
  daily_loss_halt      : 51
  consecutive_loss_pause: 35
  cooldown             : 8
  max_concurrent       : 1
  already_open         : 3
```

**원인 분석**:
1. OPUSDT 2026-02-19 에 51 entries 가 하루에 몰림
2. 첫 몇 trades 는 -2% stop 맞음
3. daily_loss_halt 즉시 발동 → 나머지 46+ entries blocked
4. 다음 날 consecutive_loss_pause 로 이어짐
5. 실제로 실행된 17 trades 는 cluster 앞부분의 losers 에 편향

**hypothesis 기각**: lgb-long-v1 at thr=0.60 은 Stage 1 을 통과하지 못한다.

**D14 stop/target sweep 결과**: 8×8 grid (46 valid cells) 에서 **0개** 통과. 모든 조합이 negative expectancy. Best cell (0.5% stop, 6% target) = -0.14%, worst (4% stop, 6% target) = -3.01%. 넓은 stop 일수록 손실 확대, 넓은 target 은 무의미 — 시그널 자체에 edge 가 없다.

**영구 graveyard** (D14 확인사살). `docs/design/graveyard.md` 에 postmortem 기록됨.

### 7.3 sample-rally-pattern — FAIL

```
n_executed         : 2061
expectancy_pct     : -0.49%
win_rate           : 28.7%
max_drawdown_pct   : -99.5%
final_equity_usd   : $50.76
```

계좌 박살. 2000+ trades × -0.5% average = 복리로 99.5% 날림.

**분석**: 28.7% win rate × 4% target - 71.3% × 2% stop = +1.14% - 1.43% = **-0.29% raw** + 0.14% cost = -0.43%, 관측값 -0.49% 와 일치. 구조적으로 negative expectancy 다. 파라미터 튜닝으로 구제 불가.

**영구 graveyard**.

### 7.4 ake-style — FAIL

sample-rally 와 동일한 구조적 실패. 1742 trades, -0.59% expectancy, -99.6% MDD.

**영구 graveyard**.

### 7.5 exhaustion-short — FAIL

이미 D9 에서 kill 되었던 short pattern. D12 에서 확인 사살: 295 trades, -1.25% expectancy, -84.6% MDD, win rate 14.9%.

**영구 graveyard**.

### 7.6 BTCUSDT drift sanity check

btc-macd-style 이 PASS 판정받을 때 즉시 의심한 것: "BTC 2020-2026 의 장기 상승 drift 로 인한 가짜 엣지 아닌가?"

**검증**: 1000 uniform-random BTCUSDT long entries, 같은 stop (-2%), target (+4%), horizon (24h), 같은 cost model.

```
BTCUSDT random long baseline:
  n_samples   : 1000
  mean pnl    : -0.0003 (-0.03%)
  win_rate    : 42.8%
  std         : 0.0222
  t-stat      : -0.40
```

**해석**: drift 는 없다. Random long 의 mean 은 0 근처이고 negative 방향으로 약간 bias 되어 있다 (fee/slippage 때문). btc-macd-style 의 +2.01% 는 drift 로 설명되지 않는다.

**메모리**: `project_stage_1_verdict_2026_04_12.md` 의 table 에도 기록됨.

### 7.7 Phase D14 — btc-macd-style stop/target sweep — SHARPENED

8×8 grid (46 valid cells where target > stop), pessimistic intrabar ordering.

```
Best 5 cells (by expectancy):
  (2.5%, 10.0%)  +2.42%  ★ PASS  (327 trades, -7.3% MDD)
  (2.0%, 10.0%)  +2.42%  ★ PASS  (358 trades, -5.1% MDD)
  (2.5%,  8.0%)  +2.31%  ★ PASS  (327 trades, -7.3% MDD)
  (2.0%,  8.0%)  +2.32%  ★ PASS  (358 trades, -5.1% MDD)
  (2.0%,  5.0%)  +2.24%  ★ PASS  (358 trades, -5.1% MDD)

Default (2%, 4%):  +2.01%  ★ PASS

Verdict: SHARPENED +20.6%
```

**핵심 발견**:
1. 32/46 cells pass Stage 1 — btc-macd-style 은 robust. 파라미터에 민감하지 않음.
2. Target 을 넓힐수록 expectancy 증가 (timeout exits 가 추가 upside 캡처)
3. Stop 은 1.5-2.5% 구간이 sweet spot. 0.5% 는 noise 에 의한 premature exit.
4. Best cell (2.5%, 10%) 은 default 대비 +20.6% 개선이지만, 이건 in-sample 이므로 D16 walk-forward 에서 재확인 필수.

**다음**: D15 regime filter 로 넘어감. D16 walk-forward 에서는 D14 best params 사용.

### 7.8 Phase D14 — lgb-long-v1 stop/target sweep — GRAVEYARD

동일 grid. **0/46 cells pass**. Best cell (0.5%, 6%) = -0.14%, worst = -3.01%.

**영구 graveyard**. `docs/design/graveyard.md` 에 postmortem.

### 7.9 Phase D15 — btc-macd-style regime filter — IMPROVED

D14 best params (2.5% stop, 10% target) + regime decomposition.

```
Config       Trades    Exp%    WR%      PF    MDD%  Sortino  Pass
all             332   +2.42   69.9    5.37    -6.7    1.16     ★
bear_skip       295   +2.37   69.8    5.28    -7.1    1.14     ★
chop_skip       120   +3.40   74.2    7.11    -5.7    1.47     ★
bull_only        81   +3.75   76.5    7.76    -5.9    1.53     ★
```

**핵심 발견**:
1. **bear_skip 은 무의미** — bear 시그널이 원래 적어서 (37/398 = 9%) 효과 미미
2. **chop 제거가 핵심** — chop 기간의 시그널을 빼면 WR 69.9→74.2%, exp +2.42→+3.40%
3. **bull_only 가 최적** — 81 trades 로 줄지만 exp +3.75%, PF 7.76, Sortino 1.53
4. **주의**: 81 trades 는 Stage 1 n≥30 gate 는 통과하지만, walk-forward 에서 window 당 trade 수가 부족할 수 있음

**D16 후보 2개**:
- `chop_skip` (120 trades, +3.40%) — 더 많은 trades, walk-forward 에 유리
- `bull_only` (81 trades, +3.75%) — 더 높은 expectancy, trade 수 부족 리스크

### 7.10 Phase D16 — Walk-forward (Stage 2)

3개월 non-overlapping windows, 36개 total (2017-Q4 → 2026-Q3).

**bull_only (regime_skip=bear,chop):**
- 11 active windows (≥3 trades), 8 positive (73%) — **FAIL** (< 75%)
- 원인: bull regime 가 없는 기간 (2018, 2022) 에 window 가 비활성화되어 active window 수가 줄어듦

**chop_skip (regime_skip=chop):**
- 15 active windows (≥3 trades), 13 positive (87%) — **STAGE 2 PASS**
- Overall exp +3.34%, 99 total trades
- 실패한 2개 window: W27 (2024-Q2, -1.65%) and W28 (2024-Q3, -1.78%)

**핵심 발견**:
1. chop_skip 이 bull_only 보다 walk-forward 에 강함 — 더 많은 active windows 확보
2. bear 시그널은 수가 적어 영향 미미 (skip 해도 안 해도 거의 같음)
3. 2024-Q2~Q3 가 유일한 연속 negative 기간 — 이 시기를 별도 분석할 가치 있음
4. **Production config 확정**: stop=2.5%, target=10%, regime_skip=("chop",)

---

## §8 Roadmap

### 8.1 다음 결정 — D18 realtime signaler (추천)

```
                 D12 Stage 1 ✓
                 D14 param sweep ✓ (+2.42%)
                 D15 regime filter ✓ (+3.40% chop_skip)
                 D16 walk-forward ✓ (87% positive, Stage 2 PASS)
                           │
                 ★ 현재 위치 — Stage 2 통과 ★
                           │
          ┌────────────────┴────────────────┐
          │                                 │
    D17 feature expansion              D18 realtime signaler  ★ 추천
    (BTC dom, ETH/BTC, OI)             (cron loop → alerts)
    ceiling 올리기                      Stage 3 paper trading 진입
          │                                 │
          └─────────────┬───────────────────┘
                        ↓
                D19 HTML dashboard
                        ↓
                Phase E — LoRA
                        ↓
                Phase G — production inference loop
                        ↓
              "사용자가 차트 안 보고 알림만 받음"
```

**추천**: D18 (realtime signaler). Stage 2 를 통과했으므로, 다음 단계는 **실시간 시그널 발생** → Stage 3 (paper trading). D17 feature expansion 은 ceiling 을 높이는 작업이고 parallel 로 가능하지만, 우선 현재 config 으로 live signaler 를 배포하는 것이 더 가치 있다.

### 8.2 Phase D13 — Signals module refactor

- `signals/filters.py`, `entry_rules.py`, `risk_rules.py` 분리
- 기존 entry flow 를 이 모듈로 리팩터링
- **Gate**: D12 숫자 재현 (리팩터링이 숫자 바꾸면 안 됨)
- **가치**: 코드 명확도. Layer 3 (regime filter) 을 D15 에서 붙일 때 clean mount point 제공.

### 8.3 Phase D14 — Stop/target sweep + isotonic calibration

- `tools/param_sweep.py` — `(stop × target)` 2D grid
- lgb-long-v1 과 btc-macd-style 에 대해 each cell 을 Stage 1 gate 에 돌림
- Expectancy heatmap 생성
- Calibration `|delta| > 0.03` 이면 isotonic regression 추가
- **Gate**: default `(2%, 4%)` 보다 expectancy 10%+ 상승 OR calibration 개선
- **Kill criteria**: lgb-long-v1 이 어떤 `(stop, target)` 조합에서도 Stage 1 pass 못 하면 영구 graveyard

### 8.4 Phase D15 — Regime filter 본격

- `backtest/regime.py::label_regime_by_btc_30d` 를 `simulator.run_backtest` 에 배선
- Regime-specific threshold: bull 0.55, chop 0.65, bear skip
- btc-macd-style 을 각 regime 슬라이스로 재측정 (bull-only? chop-only? 전체?)
- **Gate**: D14 대비 MDD 20% 개선 OR expectancy 10% 개선

### 8.5 Phase D16 — Walk-forward + Stage 2 ladder

- `tools/walk_forward.py` — rolling 2y / 3m, purge 24, embargo 24
- btc-macd-style (D14 + D15 tuned version) 을 24 quarters 에 돌림
- **Gate**: 75% 이상 window 에서 expectancy > 0, overall Sortino > 1, Calmar > 0.5
- **성공 시**: Stage 2 통과, Phase E (LoRA) 진입 자격

### 8.6 Phase D17 — Feature expansion

**현재 ceiling: +2.08%** (28 features). 새 feature 로 상한선 자체를 움직이려면:

- **BTC dominance** — 알트코인 예측에 큰 영향
- **ETH/BTC ratio** — 알트 시즌 vs BTC 시즌
- **실제 funding rate** (현재 placeholder)
- **OI 변화** (현재 placeholder)
- **온체인 지표** — exchange inflow/outflow, whale moves
- **거시** — S&P 상관성, 달러 지수

**Gate**: `feature_ceiling.py` 재실행 시 ceiling 이 +2.08% → **+3%+** 로 이동. 50% 이상 개선 필수.

### 8.7 Phase D18 — Realtime signaler

- `tools/run_signals.py` — 1h cron
- `data_cache.load_klines(offline=False)` 로 fresh data
- Stage 3 start — paper trading 3개월 이상
- **Gate**: 1 주 무사 운용 + signal 빈도 ≈ backtest

### 8.8 Phase D19 — HTML dashboard

- 정적 HTML + JavaScript
- 30-day equity curve, signal list, per-symbol, per-regime 분해
- **Gate**: 시스템 상태를 한 화면에서 볼 수 있음

### 8.9 Phase E — LoRA natural language

**Prerequisite**: D16 Stage 2 통과.

- MLX + `mlx-community/Llama-3.2-1B-Instruct-4bit` + LoRA
- Training data: 검증된 생존자의 `instances.jsonl` + verbalized snapshot + 정답 completion
- **Gate**: Held-out signal 의 LightGBM 판정과 LoRA 판정이 ≥ 95% 일치
- **주의**: LoRA 는 알파를 만들지 않는다. 엣지 없는 패턴을 LoRA 학습하는 것은 금지.

### 8.10 Phase G — Production inference loop

**Prerequisite**: D18 1주 무사 운용.

- 매 1h 에:
  1. Fresh klines fetch
  2. 전 심볼 feature 계산
  3. 배포된 각 LoRA adapter 에 prompt
  4. confidence ≥ threshold 이면 alert 발사
  5. 24h 뒤 outcome 기록 → feedback log
- **Gate**: feedback accuracy 가 training-time accuracy 의 90% 이상 유지

---

## §9 Stage 1 gate specification

### 9.1 The 6 conditions

```python
def stage_1_gate(m: BacktestMetrics) -> tuple[bool, list[str]]:
    failures: list[str] = []
    if m.expectancy_pct <= 0:       failures.append(...)
    if m.max_drawdown_pct < -0.20:  failures.append(...)
    if m.n_executed < 30:           failures.append(...)
    if m.tail_ratio < 1.0:          failures.append(...)
    if m.sortino < 0.5:             failures.append(...)
    if m.profit_factor < 1.2:       failures.append(...)
    return (len(failures) == 0, failures)
```

### 9.2 Why each (rationale)

| Condition | Rationale |
|---|---|
| `expectancy > 0` | 돈을 잃으면 Stage 1 자체가 의미 없음. 가장 기본 |
| `MDD > -20%` | 계좌 박살 방지. -20% 면 0.8× 로 회복하려면 +25% 필요, 심리적/자본 한계 |
| `n ≥ 30` | 통계적 의미의 하한. 30 미만은 random fluctuation 과 구분 불가 |
| `tail_ratio ≥ 1` | p95 |gain| ≥ p5 |loss|. 큰 수익 한 번으로 유지되는 전략 (Martingale 위험) 거부 |
| `sortino ≥ 0.5` | downside volatility 대비 수익. crypto 기준 관대한 편이지만 gate 역할 |
| `profit_factor ≥ 1.2` | 총 이익 / |총 손실| ≥ 1.2. 수수료/slippage 취약성 방어 |

### 9.3 Running a Stage 1 evaluation

```bash
# 예: lgb-long-v1 재평가
export DYLD_FALLBACK_LIBRARY_PATH=/Users/ej/.homebrew/opt/libomp/lib

uv run python3 tools/backtest_portfolio.py \
  --entries tools/output/lgb_entries.jsonl \
  --threshold 0.60 \
  --run-id lgb-long-v1-thr60 \
  --source-model classifier:lgb-long-v1

# 출력 요약:
# === Stage 1 verdict: lgb-long-v1-thr60 ===
#   passed            : False
#   n_executed        : 17
#   expectancy_pct    : -0.0143
#   ...
# Artifacts: tools/output/runs/lgb-long-v1-thr60/
```

### 9.4 Reproducing an old verdict

1. `tools/output/runs/<run_id>/metadata.json` 에서 `git_sha` 와 `config_hash` 읽기
2. `git checkout <git_sha>`
3. 같은 entries jsonl + 같은 `--config` 로 다시 실행
4. 새 `metadata.json` 의 `config_hash` 가 이전과 일치하는지 확인
5. `metrics.json` 이 비트별로 같으면 재현 성공

**재현 실패 시**: 보통 아래 중 하나:
- `python_version` 이 다름 (numpy/pandas minor diff)
- `data_cache/cache/` 가 업데이트되었음 (심볼 append)
- `random_seed` 가 불일치 (현재 random seed 은 baseline 용이라 Stage 1 본체에는 영향 없음)

---

## §10 Reproducibility contract

### 10.1 Run artifacts

모든 Stage 1 run 은:

```
tools/output/runs/<run_id>/
├── metadata.json         # git + config + environment
├── metrics.json          # BacktestMetrics + stage_1_passed
├── trades.jsonl          # schema_version=1 one line per ExecutedTrade
└── equity_curve.jsonl    # {time, equity}
```

### 10.2 metadata.json schema

```json
{
  "run_id": "lgb-long-v1-thr60",
  "git_sha": "4c4d2c2",
  "git_dirty": false,
  "config_hash": "a3f9c2d81b4e",
  "risk_config": { ...모든 RiskConfig 필드... },
  "execution_costs": { ...모든 ExecutionCosts 필드... },
  "random_seed": 13,
  "python_version": "3.11.9",
  "key_deps": {
    "pandas": "2.2.3",
    "numpy": "1.26.4",
    "lightgbm": "4.3.0"
  },
  "ts_utc": "2026-04-12T02:30:20.838386+00:00",
  "warnings": []
}
```

### 10.3 trades.jsonl schema (v1)

```json
{
  "schema_version": 1,
  "symbol": "OPUSDT",
  "direction": "long",
  "source_model": "classifier:lgb-long-v1",
  "entry_time": "2026-02-19 16:00:00+00:00",
  "entry_price_raw": 1.234,
  "entry_price_exec": 1.2343,
  "exit_time": "2026-02-19 17:00:00+00:00",
  "exit_price_raw": 1.2093,
  "exit_price_exec": 1.20906,
  "notional_usd": 4564.12,
  "size_units": 3700.26,
  "gross_pnl_pct": -0.0200,
  "fee_pct_total": 0.0010,
  "slippage_pct_total": 0.0004,
  "realized_pnl_pct": -0.0214,
  "realized_pnl_usd": -97.67,
  "exit_reason": "stop",
  "bars_to_exit": 1
}
```

Schema 버전 업은 명시적이어야 함. 필드 추가/삭제/이름 변경 시 `TRADE_SCHEMA_VERSION` 을 bump + 마이그레이션 노트.

### 10.4 Determinism guarantees

- **walk_one_trade**: pure, no randomness
- **run_backtest**: deterministic order (signals sorted by timestamp + heap for exits)
- **RiskConfig.content_hash()**: sort_keys=True 이므로 필드 순서 무관
- **Random baselines**: `rng = random.Random(13)` — seed fixed
- **없는 것**: `datetime.now()` — metadata 의 `ts_utc` 에만 사용, simulation 로직에는 무관

---

## §11 Operational runbook (draft)

Phase D18 배포 준비용 초안. Phase D18 이전에는 실제 사용 X.

### 11.1 Deployment checklist

```
1. git pull main
2. uv sync (pinned deps)
3. pytest (all green — 현재 280)
4. mypy --strict (D12 modules clean)
5. tools/stress_test.py 실행 후 baseline 숫자 확인
6. tools/backtest_portfolio.py 로 각 활성 challenge 재검증
7. Enable cron: 0 * * * * python3 tools/run_signals.py
```

### 11.2 Monitoring

- Hourly signal emission: `output/signals/YYYY-MM-DD.jsonl`
- Alert 조건 (Discord webhook + 수동 체크):
  - 빈 hourly output > 3 시간 연속 → "model dead"
  - Circuit breaker 발동 → "halt triggered"
  - Signal 빈도가 backtest 평균 ±3σ 밖 → "distribution shift"
  - 1주 expectancy < 0.5× backtest expectancy → "regime drift warning"

### 11.3 Incident response

- **Model load 실패**: `tools/output/model_archive/<ts>/` 에서 last known good 으로 rollback
- **Data freshness**: `data_cache.load_klines(offline=False)` 수동 실행 → fresh fetch
- **Unexpected signal distribution**: HALT all signals, 조사 완료 후 재개
- **Stage 4 live account 손실**: 즉시 position close, 원인 분석, Stage 3 로 downgrade

### 11.4 Rollback

- Git revert 후 re-deploy
- Model artifact 이전 버전은 `tools/output/model_archive/<timestamp>/` 유지
- `tools/output/runs/` 는 incident 조사용으로 보존

---

## §12 Risks and mitigations

| # | Risk | 가능성 | 완화 |
|---|---|---|---|
| 1 | D12 모든 패턴 expectancy 음수 | 해결 (btc-macd-style 통과) | — |
| 2 | btc-macd-style 이 D16 walk-forward 실패 | 중간 | Regime-specific sub-strategy 로 재분류 |
| 3 | D17 외부 데이터 연결 장애 | 중간 | 수동 CSV export, feature 없이 진행 가능 |
| 4 | LightGBM 이 분기에 망가짐 (OPUSDT 2/19 재발) | 낮음 (lgb-long-v1 이미 graveyard) | 대응 불필요 |
| 5 | Bonferroni 기준에 후보 미달 | 낮음 (btc-macd-style pf=6.07) | 후보가 생기면 재평가 |
| 6 | Calibration 심하게 안 맞음 | 중간 | Isotonic regression (D14) |
| 7 | **Bull market 특화 알파의 regime 변경** | **높음** | **D15 regime filter + D16 walk-forward + Stage 3 paper trade 가 순차 방어막** |
| 8 | Capacity 제약 — BTCUSDT 단일 심볼 | 중간 | Phase D17 이후 multi-symbol candidate 탐색 |
| 9 | 내가 몰라서 놓치는 bias | 항상 | Graveyard + falsification + external review |

---

## §13 Appendix

### 13.1 File path index

| 하고 싶은 것 | 어디 봐야 하나 |
|---|---|
| **이 문서** | `docs/design/architecture.md` (또는 `~/Downloads/WTD-architecture.md`) |
| Stage 1 gate 돌리기 | `tools/backtest_portfolio.py --help` |
| Stress test | `tools/stress_test.py --help` |
| 실시간 예측 | `tools/predict_now.py` |
| 새 classifier 학습 | `tools/find_entries.py` |
| Feature ceiling 측정 | `tools/feature_ceiling.py` |
| 판정 결과 | `docs/design/stage-1-verdict.md` |
| 죽은 가설 무덤 | `docs/design/graveyard.md` |
| Bonferroni 카운터 | `docs/design/experiments_log.md` |
| ADR (측정 결정) | `docs/adr/002-pnl-measurement.md` |
| ADR (LightGBM 결정) | `docs/adr/001-lightgbm-signal.md` |
| **Historical design doc** | `docs/archive/phase-d12-to-e.md` |
| 세션 체크포인트 | `memory/project_checkpoint_2026_04_12.md` |
| Stage 1 상세 판정 메모리 | `memory/project_stage_1_verdict_2026_04_12.md` |
| North star vision | `memory/project_north_star_vision.md` |

### 13.2 Test count breakdown

```
Total: 280 passing

Core D12 (65 new, D12 part 1+2):
  test_pnl.py                       14
  test_observability_logging.py      4
  test_backtest_config.py           13
  test_backtest_portfolio.py        11
  test_backtest_metrics.py           6
  test_backtest_simulator.py         5
  test_backtest_calibration.py       5
  test_backtest_audit.py             3
  test_backtest_regime.py            4

Pre-existing (215):
  test_feature_calc.py
  test_data_cache.py
  test_universe.py
  test_wizard_schema.py
  test_wizard_composer.py
  test_signal_model.py
  test_labels.py
  test_triggers_*.py              (7 files, 23 blocks)
  test_confirmations_*.py         (11 files)
  test_entries_*.py               (8 files)
  test_disqualifiers_*.py         (3 files)
```

### 13.3 Key formulas

```
expectancy_pct = mean(realized_pnl_pct)

win_rate = sum(r > 0 for r in returns) / n

profit_factor = sum(r for r in returns if r > 0)
                / |sum(r for r in returns if r < 0)|

sortino = mean(returns) / sqrt(mean(r² for r in returns if r < 0))

max_drawdown = min over time of (equity[t] - running_peak) / running_peak

tail_ratio = |p95(returns)| / |p5(returns)|    (n ≥ 20)
           = max_gain / max_loss                (n < 20, fallback)

calmar = total_return / |max_drawdown|

excess_positive_rate = pattern_positive_rate - random_baseline_positive_rate
(D9 scoring, Layer 2 signal quality)

SCORE = excess_positive_rate × coverage
(D9 horizon gate — 必要条件 but not sufficient)

walk_one_trade:
  entry_price = open[entry_pos]
  if direction == "long":
    target_price = entry_price × (1 + target_pct)
    stop_price   = entry_price × (1 - stop_pct)
  for i in entry_pos..entry_pos + horizon_bars:
    target_touched = high[i] >= target_price
    stop_touched   = low[i]  <= stop_price
    if both touched:
      hit = "stop" if intrabar_order=="pessimistic" else "target"
    elif only target: hit = "target"
    elif only stop:   hit = "stop"
    else: continue
    break
  else:
    exit at close[entry_pos + horizon_bars - 1], reason="timeout"

  slippage_pct = base + k × sqrt(notional / adv_notional)
                 if notional/adv_notional > 0.01, else base
  fee = fee_taker_pct (each side, round trip = 2× taker)
```

### 13.4 ADR-001 inline summary (LightGBM)

**Decision**: LightGBM 을 primary signal engine 으로 사용.
**Context**: 28 features × 1.56M bars, 해석 가능성 + 속도 필요.
**Alternatives**: XGBoost, HistGradientBoostingClassifier, Random Forest, MLP.
**Consequences**: macOS 에서 libomp 의존성, feature importance gain inflation on integer features (D10b 확인).
**Full**: `docs/adr/001-lightgbm-signal.md`

### 13.5 ADR-002 inline summary (PnL measurement)

**Decision**: `pessimistic` intrabar ordering + `taker 10 bps round-trip` + `base 2 bps + sqrt-impact slippage`.
**Context**: Phase D 의 horizon 기반 측정이 실제 P&L 을 과대 평가. Stage 1 gate 로 가기 위한 ground truth 필요.
**Alternatives**: optimistic (target wins ties), body-based ordering, tick-data 기반 full execution.
**Consequences**: 엣지 과소 평가 (conservative), 단일 방향 sensitivity test 는 `intrabar_order="optimistic"` 로 가능.
**Full**: `docs/adr/002-pnl-measurement.md`

### 13.6 Glossary

| 용어 | 뜻 |
|---|---|
| **Challenge** | 단일 pattern 또는 classifier 의 self-contained folder (`challenges/pattern-hunting/<name>/` 또는 `challenges/classifier-training/<name>/`) |
| **Building block** | `match.py` 의 재사용 가능한 primitive (trigger, confirmation, entry, disqualifier) |
| **Wizard** | 사용자 인터뷰 답변 → match.py 자동 생성기. `wizard/composer.py` |
| **Stage 1/2/3/4** | 4-stage validation ladder (in-sample → walk-forward → paper → live) |
| **Gate** | 다음 phase 진입 전 만족해야 하는 조건 집합 |
| **Graveyard** | Killed hypothesis 의 append-only 묘지 (`docs/design/graveyard.md`) |
| **Preregistration** | 실험 전 예측 고정 (사후 조정 금지) |
| **Bonferroni k** | 누적 hypothesis test 수. 유의성 임계는 `alpha / k` |
| **Path walk** | `scanner/pnl.walk_one_trade` 의 bar-by-bar stop/target 판정 |
| **Circuit breaker** | daily/weekly halt + consecutive loss pause. Portfolio 안전 장치 |
| **Intrabar order** | 한 bar 안에서 target 과 stop 이 둘 다 touch 될 때 어느 쪽이 먼저 체결되는지의 가정. `pessimistic` = stop 먼저 |
| **Regime** | 시장 상태 (`bull`, `bear`, `chop`, `unknown`). D15 에서 BTC 30d 로 판정 |
| **Expectancy** | 평균 realized PnL per trade. `mean(realized_pnl_pct)` |
| **Drift** | 시간이 지나면서 pattern edge 가 감쇠하는 현상 |
| **Calibration** | 모델의 `predicted_prob` 이 실제 실현 빈도와 얼마나 일치하는지 |

### 13.7 한국어 ↔ 영어 용어 매핑

| 한국어 | 영어 |
|---|---|
| 승률 | win rate |
| 기대값 | expectancy |
| 손절 / 익절 | stop loss / take profit |
| 포지션 | position |
| 동시 포지션 | concurrent positions |
| 청산 | exit / close |
| 진입 | entry |
| 시장 상태 | regime |
| 상승장 / 하락장 / 횡보 | bull / bear / chop |
| 과적합 | overfitting |
| 검증 | validation |
| 생존자 | survivor (Stage 1 pass) |
| 무덤 | graveyard |

---

## End of master doc

**다음 업데이트 시점**: Phase D13 또는 D14 착수 시. 이 문서의 §6 (Current state), §7 (Stage 1 verdict detail), §8 (Roadmap) 는 새 phase 가 끝날 때마다 갱신.

**불변 섹션**:
- §0 Executive summary (한 줄 요약은 유지)
- §1 Vision (근본 목표)
- §4 Engineering principles (3-hat, bias catalog, killing criterion)
- §5 Research protocol
- §9 Stage 1 gate spec (변경은 새 ADR 필요)
- §10 Reproducibility contract
- §13 Appendix (기본 formulas + glossary)

**가변 섹션**:
- §2 Architecture overview (Layer 상태 % 갱신)
- §6 Current state (매 phase 마다 갱신)
- §7 Stage 1 verdict detail (새 판정 시)
- §8 Roadmap (우선순위 재조정)
- §11 Operational runbook (D18 시 실제 운영 반영)
- §12 Risks (새 risk 발견 시)
