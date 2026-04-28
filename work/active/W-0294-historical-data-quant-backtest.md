# W-0294 — Multi-Year Historical Data Pipeline + Quant-Grade Layer P Backtest

> Wave: MM/V | Priority: P0 | Effort: L
> Issue: #590
> Status: 🟡 Design → Implementation
> Created: 2026-04-29

## Goal

프로덕션 5일치(n=295, t=-7.80 SHORT)로 검증된 BREAKOUT_CLIMAX→REVERSAL_SIGNAL 신호를 **6개월~다년 과거 데이터**로 재검증해서 퀀트 트레이더 수준 수치(Sharpe/Calmar/MaxDD/walkforward)를 확정한다.

## Production Run Result (2026-04-29)

```
Signal: BREAKOUT_CLIMAX → REVERSAL_SIGNAL
Period: 2026-04-24 ~ 2026-04-28 (5 days)
n_raw=295, n_deduped=63 (1h bucket dedup), n_effective≈63
horizon=4h

Result:
  mean return = -0.34% (negative = price falls, SHORT direction correct)
  hit_rate_short = 72%
  t-stat = -7.80 (G1 PASS: |t|≥2.0)
  hit_rate ≥ 55% (G2 PASS)

Verdict: PROMOTE (short signal validated on 5-day production data)
```

**문제**: 5일은 너무 짧다. 퀀트 표준 최소 6개월 이상 필요.

## Data Constraints (현실)

| 데이터 | 소스 | 최대 기간 | 상태 |
|---|---|---|---|
| OHLCV klines | Binance Futures API | 무제한 (200bar×limit) | 쿼리 가능 |
| OI history | Binance `/futures/data/openInterestHist` | **30일** 상한 | ⚠️ 제한 |
| OI history | Coinalyze `/v1/open-interest-history` | 미확인 (유료, creds있음) | Q1 스파이크 필요 |
| Funding rate | Binance `/fapi/v1/fundingRate` | 전체 이력 가능 (1000/req) | 쿼리 가능 |
| Liquidation | Coinalyze `/v1/liquidations` | 미확인 | Q1 스파이크 |
| Local kline cache | `engine/data_cache/` CSV | 2026-04-21~23까지만 | ⚠️ 스탈레 |
| Production phase_transitions | Supabase | 2026-04-15~28 (13일) | ✅ 프로덕션 |

## Architecture

```
Phase 1: Data Backfill (이번 세션)
  engine/data_cache/backfill.py         ← multi-source backfill orchestrator
  engine/data_cache/fetch_binance_klines.py   ← OHLCV 6mo backfill
  engine/data_cache/fetch_coinalyze_oi.py     ← OI history (Coinalyze)
  engine/data_cache/fetch_binance_funding.py  ← funding rate history
  engine/scripts/backfill_historical.py       ← CLI entry point

Phase 2: Retroactive Detection
  engine/research/validation/historical_runner.py  ← klines → EntrySignal
  engine/scripts/run_quant_backtest.py             ← end-to-end CLI

Phase 3: Walk-forward + Reporting
  engine/backtest/simulator.py (기존)     ← 이미 구현됨
  engine/backtest/metrics.py (기존)      ← Sharpe/Calmar/MaxDD 이미 구현
  engine/research/validation/reporters.py (기존) ← report 출력
```

## Scope

- **포함**: 6개월 OHLCV+funding backfill, OI 최대 가능 기간, retroactive REVERSAL_SIGNAL detection, walk-forward backtest, quant 보고서
- **파일**: `engine/data_cache/`, `engine/research/validation/`, `engine/scripts/`
- **제외**: 신규 Supabase 테이블, 앱 UI 변경, 실거래 연동

## Non-Goals

- 실거래 자동매매 (CHARTER §Frozen)
- 신규 패턴 설계 (W-0290/W-0291 범위)
- Cloud Run 배포 변경

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Coinalyze OI 기간 제한 | 중 | 높음 | 가능한 기간만, 30일 Binance fallback |
| Retroactive detection 품질 | 중 | 높음 | 프로덕션 signal 패턴과 비교 검증 |
| Survivorship bias | 높음 | 중 | 전체 universe 고정, flag 추가 |
| Look-ahead bias | 중 | 높음 | PurgedKFold (24h embargo) 필수 |

### Q1 — Coinalyze OI 기간 확인 (즉시 스파이크)

```python
# 엔진 실행 환경에서:
from engine.data_cache.fetch_coinalyze_liquidations import _fetch_json
result = _fetch_json("open-interest-history", {
    "symbols": "BTCUSDT_PERP.A",
    "interval": "1hour",
    "limit": "1"
})
# 반환된 데이터 최초 타임스탬프 확인 → 최대 히스토리 범위 파악
```

## AI Researcher 관점

### Statistical Validation

- PurgedKFold with 24h embargo (López de Prado 표준)
- Walk-forward: 3개월 train + 1개월 test, 1개월 step
- DSR (Deflated Sharpe Ratio): n_trials=500 (W-0286 default)
- Hit rate bootstrap 95% CI 필수

### Failure Modes

1. OI feature 부재 기간 → OI-free detection fallback (가격+funding만)
2. n이 너무 작으면 (n<50 per fold) → fold skip + warning
3. kline fetch rate limit → exponential backoff + cache

## Implementation Plan

### Phase 1 — Data Backfill

1. **Q1 스파이크**: Coinalyze OI 기간 확인 (5분)
2. `engine/data_cache/backfill.py` 구현 (~200줄)
   - `backfill_klines(symbol, start, end, tf="15m")` — Binance pagination
   - `backfill_funding(symbol, start, end)` — Binance fundingRate
   - `backfill_oi(symbol, start, end)` — Coinalyze or Binance fallback
3. `engine/scripts/backfill_historical.py` CLI
   - `python -m engine.scripts.backfill_historical --symbols BTC ETH SOL --months 6`
4. 6mo backfill 실행 (BTC/ETH/SOL/XRP/ADA)

### Phase 2 — Retroactive Detection

5. `engine/research/validation/historical_runner.py` (~180줄)
   - 과거 klines 로드 → feature_calc → state_machine replay
   - REVERSAL_SIGNAL 시점 기록 → `EntrySignal` 생성
   - 1h dedup per (symbol, hour_bucket)
6. `engine/scripts/run_quant_backtest.py` CLI
   - Phase 1 데이터 → Phase 2 detection → backtest → 보고서

### Phase 3 — Backtest + Report

7. 기존 `engine/backtest/simulator.py::run_backtest()` 사용
8. 기존 `engine/backtest/metrics.py::BacktestMetrics` 사용
9. Walk-forward 3mo/1mo/1mo
10. 최종 보고서: Sharpe/Calmar/MaxDD/win_rate/profit_factor/DSR

## Exit Criteria

- [ ] AC1: Coinalyze OI 기간 확인 완료 (최대 가용 기간 문서화)
- [ ] AC2: 6개월 OHLCV backfill 완료 (BTC/ETH/SOL 최소)
- [ ] AC3: 6개월 funding rate backfill 완료
- [ ] AC4: Retroactive detection n_signals ≥ 200 (6개월 기준)
- [ ] AC5: Walk-forward 3개 이상 fold, 각 fold n ≥ 50
- [ ] AC6: Sharpe > 0.5 (random B0 대비) 또는 under-powered 명시
- [ ] AC7: G1 (|t| ≥ 2.0) + G2 (hit ≥ 55%) 6mo 데이터 기준 재확인
- [ ] AC8: CI green
- [ ] AC9: 보고서 `docs/live/W-0294-backtest-report.md` 생성

## Q1 Spike Result (2026-04-29 확인)

| 질문 | 결과 |
|---|---|
| Coinalyze OI 최대 기간 | **85일 (현재 플랜 한도)** — 약 2026-02-02부터 조회 가능 |
| Coinalyze OI 필드 | `c` (close of OHLC format) — `v` 아님 |
| 6mo 백필 결과 | klines 4,320행 × 3종목, funding 540행, OI 2,017행 (85일) |

## Backfill Status (2026-04-29)

```
BTCUSDT: klines 4320 (6mo), funding 540 (6mo), OI 2017 (85d)
ETHUSDT: klines 4320 (6mo), funding 540 (6mo), OI 2017 (85d)
SOLUSDT: klines 4320 (6mo), funding 540 (6mo), OI 2017 (85d)
Storage: engine/data_cache/historical/
```

## Open Questions

- [x] [Q-01] ~~Coinalyze OI 최대 기간?~~ → 85일 (CLOSED)
- [ ] [Q-02] Retroactive detection 시 phase_transitions SQLite 재생? 아니면 feature_calc 재실행?
- [ ] [Q-03] 6mo 기간 중 OI 없는 구간 처리 전략 (feature 0 imputation vs. skip → 현재는 OI 없는 구간은 패턴 미적용)
