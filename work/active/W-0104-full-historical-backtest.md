# W-0104 — Full Historical Pattern Backtest

## Problem

현재 패턴 검증 방식:
- 성공한 사례 4개 수작업 선정 → 패턴 피팅 → score=0.925 → "promote_candidate"
- **이건 패턴이 작동한다는 증명이 아니라, 잘된 사례를 설명하는 패턴을 만드는 것.**

## Goal

과거 전체 데이터에서 패턴 state machine을 직접 돌려, **모든 entry_phase 발화 시점**을 수집하고 forward return을 통계적으로 측정한다.

출력:
```
pattern: tradoor-oi-reversal-v1
  n_signals  : 47
  win_rate   : 68.1%  (fwd_72h > 0)
  avg_return : +14.2%
  hit_rate   : 44.7%  (목표가 도달)
  avg_loss   : -8.3%  (손절 미도달 케이스)
```

## Architecture

### Core: `engine/research/backtest.py`

```python
@dataclass
class BacktestSignal:
    symbol: str
    pattern_slug: str
    entry_time: datetime
    entry_price: float
    fwd_return_24h: float | None
    fwd_return_48h: float | None
    fwd_return_72h: float | None
    fwd_peak_bars: float | None     # 목표가까지 봉수
    target_hit: bool                # target_pct 도달?

@dataclass
class BacktestResult:
    pattern_slug: str
    timeframe: str
    universe_size: int
    since: datetime
    n_signals: int
    win_rate: float          # fwd_72h > 0
    avg_return_72h: float
    hit_rate: float          # target_pct 도달률
    avg_peak_return: float
    signals: list[BacktestSignal]

def run_pattern_backtest(
    pattern_slug: str,
    universe: list[str],
    *,
    timeframe: str = "1h",
    since: datetime | None = None,   # default: 1년 전
    forward_bars: int = 72,
    target_pct: float | None = None, # None → 패턴 기본값 사용
) -> BacktestResult
```

### Key design

**기존 benchmark_search와의 차이:**
| | benchmark_search | backtest |
|---|---|---|
| 케이스 | 수작업 4개 | 전체 자동 탐지 |
| 목적 | 패턴 피팅/튜닝 | 통계적 검증 |
| 질문 | "이 케이스에서 패턴이 발화했나?" | "패턴이 발화했을 때 얼마나 올랐나?" |

**State machine 다중 발화 처리:**
- 기존 `replay_pattern_frames`: 단일 최종 상태만 반환
- backtest: bar-by-bar 직접 구동, entry_phase 전환 시마다 기록
  - prev_phase ≠ entry_phase → curr_phase = entry_phase → signal 기록
  - state machine은 target_phase 또는 timeout 후 자동 reset → 복수 발화 자연 처리

**Forward return 측정:**
- entry bar 종가 = entry_price
- forward_bars 이내 최고가 = peak
- forward_bars 봉 후 종가 = close_exit
- fwd_return_Nh = close[entry+N] / entry_price - 1
- target_hit = peak >= entry_price * (1 + target_pct)

### CLI

```bash
python -m research.cli backtest --pattern tradoor-oi-reversal-v1 --since 2024-01-01
python -m research.cli backtest --pattern all --universe default
```

## Scope

### 구현 파일
- `engine/research/backtest.py` — core backtest runner
- `engine/tests/test_backtest.py` — smoke tests
- `engine/research/cli.py` — `backtest` subcommand 추가

### Non-Goals
- Slippage/fee 모델링 (일단 raw return)
- ML p_win 통합 (backtest 자체가 먼저)
- Sharpe/drawdown 계산 (v2에서)

## Exit Criteria

- [x] `run_pattern_backtest("tradoor-oi-reversal-v1", DEFAULT_UNIVERSE)` 실행 성공
- [x] n_signals > 10 (충분한 표본)
- [x] win_rate / avg_return 출력
- [x] CLI `backtest` 커맨드 동작
- [x] smoke tests pass
