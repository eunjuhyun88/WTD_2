---
name: W-0104 Full Historical Backtest 완료 (2026-04-19)
description: 패턴 state machine을 과거 전체 데이터에 돌려 실제 통계 측정. FFR만 positive edge 확인.
type: project
---

## W-0104 Full Historical Backtest

**브랜치:** `claude/w-0103-alert-system` (commit 8f1a84d)
**테스트:** 981 passed

### 구현

`engine/research/backtest.py`:
- Bar-by-bar state machine replay across full kline history
- ALL entry_phase transitions 수집 (수작업 케이스 아님)
- Forward return 24h/48h/72h + peak + target_hit 측정
- `run_pattern_backtest(slug, universe, since=...)` → `BacktestResult`

CLI:
```bash
python -m research.cli backtest --pattern all --since 2024-01-01
python -m research.cli backtest --pattern tradoor-oi-reversal-v1 --days 365
```

### 첫 실제 통계 (30 symbols, since 2024-01-01)

| 패턴 | n_signals | win_rate | avg_72h | hit_rate | 진단 |
|------|-----------|----------|---------|----------|------|
| FFR | 27 | 40% | **+5.3%** | 7.4% | **유일한 positive edge** |
| WHALE | 304 | 45% | +2.2% | 5.9% | 마지널 |
| TRADOOR | 6 | 20% | -0.0% | 16.7% | 너무 희소 |
| WSR | 10,947 | 45% | -0.2% | 12.7% | **너무 느슨 — 노이즈** |
| VAR | 8,212 | 45% | -0.1% | 10.7% | **너무 느슨 — 노이즈** |

### 핵심 인사이트

- **WSR + VAR**: 30심볼에서 10K+ 신호 = 거의 매 시간 발화 = 랜덤 노이즈
  → 패턴 조건을 강화해야 hit_rate와 avg_return이 의미있어짐
- **FFR**: 가장 tight하고 유일하게 positive avg return
  → 현재 가장 신뢰할 수 있는 패턴
- **TRADOOR**: 6개 신호 / 1년 = 너무 희소. hit_rate 16.7%이지만 avg_peak +27%
  → 발화하면 큰 움직임이나, 너무 드물어서 실용성 의문

### 다음 액션

- **WSR 조건 강화**: n_signals를 100 이하로 줄여야 edge 의미있음
- **VAR 조건 강화**: entry_phase BASE_FORMATION 조건 tight하게
- **FFR 기준**: win_rate 50%, avg_72h +10%가 목표
- backtest를 PR 기준에 포함: `n_signals < 500 AND avg_72h > 0` 조건

**Why:** 수작업 케이스 4개 → score=0.925는 과거 피팅. 실제 edge는 backtest로만 증명 가능.
**How to apply:** 패턴 promote 기준에 backtest 통과 추가. WSR/VAR 조건 강화 작업 필요.
