---
name: W-0100 Wyckoff Spring Reversal Pattern
description: W-0100 완료 — WYCKOFF_SPRING_REVERSAL 3번째 패턴 구현 (2026-04-19, main 6c1285e). 4-pattern system 완성.
type: project
---

W-0100 WYCKOFF_SPRING_REVERSAL 구현 완료 (2026-04-19, commit 6c1285e).

**Why:** 단일 메커니즘 의존 탈피. TRADOOR(OI기반)/FFR(펀딩기반)와 완전 구별되는 price-action-driven 패턴 추가.

**How to apply:** 4-pattern system 완성 기준. 다음 패턴은 5번째부터.

## 완료 내역

- `engine/patterns/library.py`: WYCKOFF_SPRING_REVERSAL 정의 + PATTERN_LIBRARY에 등록 (4개: TRADOOR/FFR/WSR/WHALE)
- `engine/research/pattern_search/benchmark_packs/wyckoff-spring-reversal-v1__wsr-v1.json`: 4케이스 (ENA ref + FARTCOIN/STRK/KAITO holdout)
- `engine/research/live_monitor.py`: PHASE_ORDER에 Wyckoff 5개 phase 추가
- `engine/tests/test_whale_accumulation_reversal.py`: library_count 3→4로 업데이트

## 5-Phase 구조

| Phase | 핵심 블록 |
|-------|-----------|
| COMPRESSION_ZONE | required_any[sideways_compression\|bollinger_squeeze\|volume_dryup] + soft:absorption_signal |
| SPRING | required:post_dump_compression, optional:reclaim_after_dump |
| SIGN_OF_STRENGTH | required:higher_lows_sequence, optional:breakout_volume_confirm/cvd_buying/absorption_signal |
| LAST_POINT_OF_SUPPORT | required:reclaim_after_dump+higher_lows_sequence (entry_phase) |
| MARKUP | required:breakout_above_high (target_phase) |

## benchmark-search 결과

- overall_score: **0.864**, promote_candidate: **true**
- reference_recall: 1.0, holdout_passed: true
- entry_profitable_rate: 0.75, false_discovery_rate: 0.25

## 실증 (2026-04-19)

ENA +20.3% (reference), FARTCOIN +14.2%, STRK +13.7%, KAITO +11.8%

## Full Universe Scan (W-0099, 43 symbols)

- funding_extreme: 40 events → 4 predictive (≥8%): TRADOORUSDT ×3 (41.9%/29.2%/23.4%), ALTUSDT (+9.3%)
- compression scan: 과다 발화 (ENA만 507 events) — 기간 단위 dedup 필요. 현재 미해결.

## 4-Pattern System 완성

| 패턴 | 트리거 | 필수 데이터 |
|------|--------|-------------|
| TRADOOR | OI 급등 + 이중 급락 | perp (OI) |
| FFR | 펀딩 극단 음수 | perp (Funding) |
| WYCKOFF_SPRING | 지지선 압축 + 거짓 이탈 | 1h OHLCV만 |
| WHALE | OI급등 + 스마트머니 + Coinbase 프리미엄 | perp + onchain |

## 테스트

935 passed, 4 skipped (test_capture_routes.py 제외 시 0 failed)
