---
name: W-0108 Signal Radar GOLDEN 패턴 완료 체크포인트
description: W-0108 Slice 1+2 완료 — 3개 신규 블록 + radar-golden-entry-v1 패턴 + 아카 전체 로직 분해 700줄 문서
type: project
---

W-0108 Slice 1+2 완료 (2026-04-19, PR #107, branch: claude/w-0108-signal-radar).

**신규 블록 3개:**
- `relative_velocity_bull` (confirmations): Signal Radar GOLDEN 필터 D — `velocity/btcVelocity ≥ 1.2`. `alt_btc_accel_ratio` semantic alias. 3 tests.
- `cvd_price_divergence` (confirmations/disqualifiers): Fakeout 감지 — `price ≥ maxPrice×0.999 AND cvd < maxCvd×0.8`. CVD peak≤0 guard 포함. 5 tests.
- `orderbook_imbalance_ratio` (confirmations): OB bid$/ask$ ≥ 3.0. `ob_bid_usd`/`ob_ask_usd` 피처 absent → all-False graceful fallback (historical backtest). 7 tests.

**Why (ob_bid_usd 없음):** Binance historical REST에 OB depth 시계열 없음 — 라이브 스냅샷만 가능. 피처 파이프라인 추가 = Slice 3 별도 W.

**신규 패턴 1개:**
- `radar-golden-entry-v1` (10번째 패턴): Signal Radar 4-filter GOLDEN 2-phase
  - MOMENTUM_BASE: required=volume_surge_bull, required_any=[relative_velocity_bull|alt_btc_accel_ratio]
  - SIGNAL_ENTRY: required_any=[delta_flip_positive|absorption_signal], soft=[orderbook_imbalance_ratio, higher_lows_sequence, bollinger_expansion], disqualifier=cvd_price_divergence

**아카 Alpha Terminal v3.0 분해:**
- `work/active/AKA-ALPHA-TERMINAL-LOGIC-DECOMP.md` (700줄)
- 15개 레이어 전체 JS 수식/임계값 추출 (L1 Wyckoff ~ L15 ATR)
- Alpha score: -100~+100, 판정: ≥60/25/-25/-60
- UI vs 코드 불일치: STRONG BULL UI=≥55, 코드=≥60

**테스트:** 1047 passed, 4 skipped.

**Slice 3 (미구현, 별도 W):**
- ob_bid_usd/ob_ask_usd 피처 파이프라인 추가 (Binance /depth REST)
- 실시간 aggTrade WebSocket → WHALE 단건 감지
- RSI 피처 추가 (필터 1 완전 구현용)

**How to apply:** radar-golden-entry-v1은 backtest에서 orderbook_imbalance_ratio=0 (soft block만). 라이브 스캐너에서 ob 피처 주입 시 풀 동작.
