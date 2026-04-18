# W-0097 — Pattern Signal Deepening (텔레그램 분석 기반)

## Goal

텔레그램 채널(나혼자매매-차트&온체인, ALPHA TERMINAL) 분석에서 도출한 3개 빌딩블록을 구현해 패턴 탐지 정확도를 높인다.

## Owner

research / engine

## Why

W-0091에서 `cvd_buying`(단일 빌딩블록)만 추가했지만, 텔레그램 분석에서 더 정교한 신호 3개가 추가로 식별됨:
1. **Absorption Signal**: CVD 대량 매수인데 가격 미반응 → 매도벽 흡수 중 = 조용한 매집
2. **Alt-BTC Acceleration Ratio**: 알트 가속도 ÷ BTC 가속도 → 진성 알트 상승 필터
3. **Dynamic CVD Threshold**: 코인별 유동성에 비례하는 CVD 임계값 (현재는 categorical)

## Five-Phase Impact

| 빌딩블록 | 적용 phase | 역할 |
|---------|-----------|------|
| `absorption_signal` | COMPRESSION, ENTRY_ZONE | 조기 매집 감지 — 가격 안 움직이는데 CVD 매수 누적 |
| `alt_btc_accel_ratio` | ENTRY_ZONE, SQUEEZE | BTC 약세장 가짜 알트 펌핑 차단 |
| 동적 CVD | cvd_buying 파라미터화 | 유동성 낮은 코인도 CVD 신호 작동 |

## Scope

### Slice 1 — absorption_signal 빌딩블록

파일: `engine/building_blocks/confirmations/absorption_signal.py`

```
absorption_signal(ctx, *, cvd_window=5, price_move_threshold=0.0001) → bool Series
조건:
  - 최근 cvd_window 바의 rolling CVD delta 합 > 임계값 (대량 순매수)
  - 동 기간 가격 변화 < price_move_threshold (가격 미반응)
해석: 매도벽이 CVD 매수를 흡수 중 → 벽이 소진되면 급등 예상
```

적용: FUNDING_FLIP_REVERSAL COMPRESSION phase soft_block + TRADOOR ARCH_ZONE soft_block

### Slice 2 — alt_btc_accel_ratio 빌딩블록

파일: `engine/building_blocks/confirmations/alt_btc_accel_ratio.py`

```
alt_btc_accel_ratio(ctx, *, ratio_threshold=1.2, window=5) → bool Series
조건: alt_volume_acceleration / btc_volume_acceleration ≥ ratio_threshold
BTC 데이터: 공유 캐시에서 BTCUSDT_1h 로드 (scanner에서 사전 계산)
```

적용: FUNDING_FLIP_REVERSAL ENTRY_ZONE + TRADOOR ACCUMULATION soft_block

### Slice 3 — 벤치마크 재검증

- absorption_signal이 추가된 FUNDING_FLIP_REVERSAL로 benchmark-search 재실행
- 기존 4케이스 (DYM/ORDI/STRK/KOMA) 기준
- 목표: overall_score ≥ 0.85 (현재 0.816)

## Non-Goals

- 오더북 호가창 데이터 (L2 데이터 필요 — 별도 이슈)
- 스푸핑 감지 (L2 필요)
- Multi-exchange CVD (Binance 외 거래소 API 연동 별도)

## Canonical Files

- `engine/building_blocks/confirmations/absorption_signal.py` (신규)
- `engine/building_blocks/confirmations/alt_btc_accel_ratio.py` (신규)
- `engine/building_blocks/confirmations/__init__.py` (등록)
- `engine/scoring/block_evaluator.py` (alias 추가)
- `engine/scoring/ensemble.py` (category 추가)
- `engine/patterns/library.py` (FUNDING_FLIP_REVERSAL + TRADOOR 적용)

## Facts

- absorption_signal 개념: ALPHA TERMINAL "흡수(Absorption)" 로직 (2026-04-10)
  "순매수는 엄청난데 가격이 오르지 않으면, 누군가 지정가 매도벽으로 물량 받아먹는 중"
- alt_btc_accel_ratio: ALPHA TERMINAL "골든 신호 조건 D" (2026-04-10)
  "알트코인 가속도가 BTC 가속도 대비 1.2배 이상 (비트 하락장 가짜 펌핑 차단)"

## Open Questions

- alt_btc_accel_ratio에서 BTC 데이터를 어떻게 공급하나?
  → scanner에서 BTC features를 Context에 주입하거나, 공유 캐시에서 직접 로드
- absorption_signal의 CVD window 최적값: 5 vs 10 바?

## Next Steps

1. Slice 1: absorption_signal 구현 + 테스트
2. Slice 1: FUNDING_FLIP_REVERSAL COMPRESSION/ENTRY_ZONE에 soft_block 추가
3. Slice 2: alt_btc_accel_ratio 구현 (BTC 데이터 주입 방식 결정 필요)
4. Slice 3: benchmark-search 재실행 → overall ≥ 0.85 목표

## Exit Criteria

- [x] `absorption_signal` 빌딩블록 구현 + 단위 테스트 (11 tests)
- [x] `alt_btc_accel_ratio` 빌딩블록 구현 + 단위 테스트 (6 tests)
- [x] FUNDING_FLIP_REVERSAL COMPRESSION + ENTRY_ZONE에 absorption_signal soft_block 적용
- [x] 전체 테스트 통과 (832 pass, 0 regressions)
- [ ] benchmark-search overall_score ≥ 0.85 → **현재 0.816 (promote_candidate ✅ 유지)**

## Completed (2026-04-19, main 7b99ee9+72f4057)

absorption_signal + alt_btc_accel_ratio 구현 + FFR 패턴 적용 완료.
overall_score 0.816 유지: soft_block은 라이브 스코어링에만 영향.
≥0.85 달성은 W-0099 BenchmarkPackBuilder로 신규 케이스 추가 후 별도 슬라이스.
