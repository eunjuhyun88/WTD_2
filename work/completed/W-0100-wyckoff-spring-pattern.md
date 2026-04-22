# W-0100 — Third Pattern: Wyckoff Spring Reversal

## Goal

세 번째 패턴을 추가해 단일 메커니즘 의존 탈피 완성.
`wyckoff-spring-reversal-v1`: 지지선 압축 → 거짓 하방 이탈(Spring) → 즉각 회복 → 매집 완료 → 급등.

## Owner

research / engine

## Why

- TRADOOR = OI 급등 + 이중 급락 (dump-driven)
- FFR = 펀딩 극단 음수 → 플립 (funding-driven)
- **WYCKOFF_SPRING** = 순수 가격 구조 + 거래량 패턴 (price-action-driven) — 퍼프 데이터 불필요
- ENA +20.3%, FARTCOIN +14.2%, STRK +13.7%, KAITO +11.8% 실증

## Five-Phase Structure

| Phase | Name | Key Blocks | Meaning |
|---|---|---|---|
| 1 | `COMPRESSION_ZONE` | `sideways_compression` + `volume_dryup` | 지지선 근처 압축. 매집 준비. |
| 2 | `SPRING` | `post_dump_compression` | 지지선 일시 이탈 후 즉각 회복. 약손 청산. |
| 3 | `SIGN_OF_STRENGTH` | `higher_lows_sequence` + `absorption_signal` | 거래량 폭발로 레인지 상단 돌파. 강손 등장. |
| 4 | `LAST_POINT_OF_SUPPORT` | `reclaim_after_dump` + `higher_lows_sequence` | Spring 저점 위 풀백. 진입 구간. |
| 5 | `MARKUP` | `breakout_above_high` | 축적 레인지 상단 완전 이탈. |

## Real Cycle Proof (2026-04-19)

### ENA (Reference, +20.3%)
```
Phase               날짜          가격        거래량         비고
────────────────────────────────────────────────────────────
COMPRESSION_ZONE    Apr 9-12      0.086-0.097  2-5M/h        Volume dry
SPRING              Apr 13 07:00  Low 0.0907   10.2M         False breakdown
SIGN_OF_STRENGTH    Apr 13 22:00  0.0996       30.4M         SoS 거래량 폭발
LAST_POINT_OF_SUPP  Apr 14-15     0.0945-0.097 1.7-7M        Higher low 구조
MARKUP              Apr 15-16     0.1000→0.1145              +20.3%
```

### FARTCOIN (Holdout, +14.2%)
- Spring: Apr 15, 이후 48h +14.2%

### STRK (Holdout, +13.7%)
- Spring: Apr 14, 이후 48h +13.7%

### KAITO (Holdout, +11.8%)
- Spring: Apr 12, 이후 48h +11.8%

## Canonical Files

- `engine/patterns/library.py` (WYCKOFF_SPRING_REVERSAL 추가)
- `engine/research/pattern_search/benchmark_packs/wyckoff-spring-reversal-v1__wsr-v1.json`

## Key Distinction from Existing Patterns

| 구분 | TRADOOR | FFR | WYCKOFF_SPRING |
|------|---------|-----|----------------|
| 트리거 | OI 급등 + 이중 급락 | 펀딩 극단 음수 | 지지선 압축 + 거짓 이탈 |
| 필수 데이터 | 퍼프 (OI) | 퍼프 (Funding) | 1h OHLCV만 (퍼프 soft) |
| 사이클 길이 | 3-7일 | 5-14일 | 2-7일 |
| 진입 신호 | ACCUMULATION phase | ENTRY_ZONE phase | SIGN_OF_STRENGTH phase |

## Exit Criteria

- [ ] WYCKOFF_SPRING_REVERSAL 패턴 PATTERN_LIBRARY 등록
- [ ] benchmark pack 4케이스 (ENA/FARTCOIN/STRK/KAITO)
- [ ] benchmark-search promote_candidate 달성
- [ ] 전체 테스트 통과
