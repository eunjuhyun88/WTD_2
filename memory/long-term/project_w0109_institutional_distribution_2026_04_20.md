---
name: W-0109 Institutional Distribution
description: W-0109 Slice 1 (PR #108 merged) + Slice 2 (PR #110): cvd_cumulative 피처 + 12번째 패턴
type: project
originSessionId: 2da3cf7c-0b06-4a81-b3bb-82e292972d35
---
W-0109 Slice 1 완료 + 머지 (2026-04-20). PR #108 → main.
W-0109 Slice 2 완료 (2026-04-20). PR #110 open.

**Why:** ETF 이후 기관 분배 구간 포착 — CVD 상승 중 가격 하락 (absorption/distribution M1 패턴)

**How to apply:** Slice 2 브랜치 `claude/w-0109-slice2-cvd-cumulative`, 1065 pass (CBR 제외)

## Slice 1 구현 내용 (PR #108, merged)

### 새 Disqualifier 블록 (2개)

| 블록 | 로직 | 특이사항 |
|------|------|---------|
| `cvd_spot_price_divergence_bear` | tbv_ratio rolling avg > net_buy_threshold AND price pct_change(lookback) < -min_price_drop | cvd_cumulative 우선, fallback tbv_ratio |
| `coinbase_premium_weak` | coinbase_premium <= max_premium for min_bars consecutive bars | 피처 없으면 all-False graceful fallback |

### 패턴: institutional-distribution-v1 (12번째, 3번째 SHORT)

```
CVD_DECOUPLING → LIQUIDITY_WEAKENING → SHORT_ENTRY
```

## Slice 2 구현 내용 (PR #110, open)

- `cvd_cumulative` = cumsum(2*taker_buy - volume) — net buy volume per bar의 누적합
- `scanner/feature_calc.py` 벡터화 경로 + `features/registry.py` ORDER_FLOW 등록
- `cvd_spot_price_divergence_bear` 업그레이드: ctx.features["cvd_cumulative"] 우선 사용, 없으면 fallback
- 신규 테스트 5개 추가

## 다음 할 일 (W-0109 미구현)

- Slice 3: Glassnode LTH/MVRV (W-0110 이관)
- W-0103 Terminal UI Dedup (PR #102)
- Benchmark run: institutional-distribution-v1 score 측정
- test_compression_breakout_reversal.py::test_cbr_promotion_gate — ALTUSDT 캐시 미존재로 기존 실패 (pre-existing)
