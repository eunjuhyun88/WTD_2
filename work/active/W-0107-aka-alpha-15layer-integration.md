# W-0107 아카 Alpha Terminal 15-Layer 통합

## Goal

아카 Alpha Terminal v3.0의 15개 분석 레이어를 WTD 엔진 빌딩 블록 / 패턴으로 이식하여,
단일 패턴 탐지(지금)에서 멀티레이어 복합 스코어링 시스템으로 확장한다.

## Owner

engine

## Scope

- 15개 레이어 → 빌딩 블록 매핑 완성 (Gap 블록 신규 작성)
- `alpha-confluence-v1` 패턴 정의 (15레이어 동시 충족 시 진입)
- 기존 패턴(FFR/WSR/VAR/WHALE) 진입 조건에 고신뢰 레이어 추가 (선택 강화)
- 레이어별 유닛 테스트 작성

## Non-Goals

- L6 (BTC 온체인 Tx, Mempool) 실시간 파이프라인 구축 — 외부 API 의존, 별도 W
- L7 (Fear & Greed), L8 (Kimchi Premium) 실시간 수집 — 외부 API 별도 W
- UI/알림 연동 — W-0103 이후 별도 W
- 기존 패턴 구조 변경 — 기존 5패턴은 건드리지 않음

## Canonical Files

- `engine/building_blocks/` — 모든 빌딩 블록 정의
- `engine/patterns/library.py` — 패턴 등록
- `engine/patterns/types.py` — PatternObject / PhaseCondition
- `/Users/ej/Desktop/나혼자매매 Alpha Flow_by 아카.html` — 원본 15레이어 JS 로직
- `work/active/W-0107-aka-alpha-15layer-integration.md` — 이 문서

## 15-Layer 현황 분석

### 레이어별 WTD 구현 상태

| Layer | 이름 | 아카 로직 요약 | WTD 블록 현황 | 구현 난이도 |
|---|---|---|---|---|
| L1 | Wyckoff ACC/DIST | 중위값 추세 + SC/ST/Spring/SOS 채점, score ±28 | `sideways_compression`, `higher_lows_sequence`, `volume_spike_down` 부분 구현 | ✅ 대부분 있음 |
| L2 | Flow (FR+OI+L/S+Taker) | FR 극단/OI 방향/롱숏비율/테이커 비율, score ±55 | `funding_extreme`, `oi_change`, `oi_spike_with_dump`, `ls_ratio_recovery`, `delta_flip_positive` | ✅ 대부분 있음 |
| L3 | V-Surge | 최근 5봉 vs 25봉 평균 볼륨 비율, score ±15 | `volume_spike` (단방향만), `volume_spike_down` | ⚠️ 방향성 결합 없음 |
| L4 | Order Book Imbalance | 매수벽/매도벽 달러 비율, score ±12 | `absorption_signal` (간접) | ❌ OB 직접 비율 없음 |
| L5 | Liquidation Estimate | FR + OI 결합 → 청산 추정, score ±12 | `funding_extreme` + `oi_change` 조합 가능 | ⚠️ 조합 패턴 없음 |
| L6 | BTC On-chain | BTC Tx수/멤풀/수수료, score ±10 | `smart_money_accumulation` (부분) | ❌ 외부 API 필요 |
| L7 | Fear & Greed | ≤15=극단공포(+8), ≥85=극단탐욕(-8) | 없음 | ❌ 외부 API 필요 |
| L8 | Kimchi Premium | 업비트/빗썸 vs 바이낸스 괴리율, score ±10 | `coinbase_premium_positive` (유사) | ❌ KRW API 필요 |
| L9 | Real Liquidation | 1H 강제청산 실데이터 BUY/SELL, score ±12 | 없음 | ❌ Binance liq stream 필요 |
| L10 | MTF Confluence | 1H+4H+1D Wyckoff 동시 판정, score ±20 | `alt_btc_accel_ratio` (간접) | ⚠️ 다중 TF 로직 없음 |
| L11 | CVD | 가격 vs CVD 방향 divergence + Absorption, score ±12 | `delta_flip_positive`, `absorption_signal` | ✅ 대부분 있음 |
| L12 | Sector Flow | 섹터 평균 스코어, score ±8 | `sector_map.py` 있음 | ⚠️ 빌딩 블록 없음 |
| L13 | Breakout Monitor | 7일/30일 신고가 돌파 및 근접, score ±12 | `breakout_above_high`, `recent_decline` | ✅ 있음 |
| L14 | Bollinger Squeeze | BB폭 35%+ 수축, 50일 최저=대형, score ±10 | `bollinger_squeeze`, `bollinger_expansion` | ✅ 있음 |
| L15 | ATR Volatility | ATR 상대 변화 → 손절가, score ±6 | `extreme_volatility` (disqualifier 형태) | ⚠️ 스코어 형태 없음 |

**Alpha Score** = L1~L15 합산 → -100~+100
- ≥ 60: STRONG BULL
- 25~59: BULL BIAS
- -24~24: NEUTRAL
- -25~-59: BEAR BIAS
- ≤ -60: STRONG BEAR

## 설계 결정

### A. 즉시 구현 가능 레이어 (Slice 1)

**기존 블록만으로 새 패턴 구성:**

```
L14 (BB Squeeze) + L15 (ATR Ultra-Low) + L13 (7D Breakout)
→ volatility-squeeze-breakout-v1 패턴
  Phase 1 COMPRESSION: bollinger_squeeze + (extreme_volatility 반전 → atr_ultra_low 신규)
  Phase 2 BREAKOUT: breakout_above_high + breakout_volume_confirm + bollinger_expansion
  Phase 3 CONFIRM: higher_lows_sequence
```

**필요 신규 블록:**
- `atr_ultra_low` — ATR < 이전 기간 60% (L15 ULTRA_LOW 조건) ← 30분

**L11+L1 진입 신뢰도 강화 (기존 WSR에 추가):**
- WSR `SPRING` 페이즈에 `absorption_signal` optional_block 추가 (이미 존재)
- WSR `MARKUP` 페이즈에 `bollinger_expansion` soft_block 추가 (이미 존재)

### B. 중기 구현 레이어 (Slice 2)

**L3 V-Surge 방향성 블록:**
- `volume_surge_bull` — 최근 5봉 평균 볼륨 > 25봉 평균 × 1.8 AND 최근 캔들 상승
- `volume_surge_bear` — 위와 같지만 하락 방향

**L10 MTF Confluence 블록:**
- `mtf_wyckoff_accumulation` — 1H+4H 둘 다 Wyckoff Accumulation 구조 감지
  → 기존 `sideways_compression` + `higher_lows_sequence`를 두 TF에서 모두 체크

**L5 Liquidation Zone 블록:**
- `liq_zone_squeeze_setup` — FR > 0.05 AND OI > +3% = 롱 과밀 상태 (청산 트리거 근접)

### C. 외부 API 필요 레이어 (Slice 3, 별도 W)

- L6: BTC 온체인 (blockchain.info / mempool.space)
- L7: Fear & Greed (alternative.me)
- L8: 김치프리미엄 (업비트/빗썸 API)
- L9: 강제청산 실데이터 (Binance forcedOrder stream)

### D. Alpha Confluence 패턴 (Slice 2 완료 후)

```python
alpha-confluence-v1 패턴:
  Phase 1 STRUCTURAL_BASE:
    required: [sideways_compression, bollinger_squeeze]
    required_any: [[funding_extreme, ls_ratio_recovery]]  # L2 과열
    soft: [absorption_signal, atr_ultra_low]  # L11, L15
  Phase 2 SIGNAL_CLUSTER:
    required: [delta_flip_positive]  # L11 CVD
    required_any: [[breakout_above_high, recent_rally]]  # L13
    soft: [bollinger_expansion, higher_lows_sequence]
  Phase 3 ENTRY_CONFIRM:
    required_any: [[bullish_engulfing, long_lower_wick]]
    soft: [breakout_volume_confirm]
```

## 구현 순서 (Priority)

### Slice 1 — 즉시 (이번 세션)
1. `atr_ultra_low` 블록 신규 작성
2. `volatility-squeeze-breakout-v1` 패턴 등록
3. WSR에 `bollinger_expansion` soft_block 추가 (MARKUP 페이즈)
4. 유닛 테스트 작성
5. 전체 테스트 통과 확인

### Slice 2 — 다음 세션
1. `volume_surge_bull` / `volume_surge_bear` 블록
2. `liq_zone_squeeze_setup` 블록 (L5 파생)
3. `mtf_wyckoff_accumulation` 블록 (L10 파생)
4. `alpha-confluence-v1` 패턴 등록

### Slice 3 — 별도 W
- L6/L7/L8/L9 외부 API 파이프라인 (W-0108 예정)

## Facts

- 아카 파일 L1 Wyckoff: score ±28, 6가지 윈도우 조합 시도 (R=30~55, T=40~75)
- L2 Flow: score ±55 (가장 넓은 스코어 범위 → 핵심 레이어)
- Alpha Score: 15개 합산 -100~+100, 임계값 ±25/±60
- WTD 현재: `bollinger_squeeze`, `bollinger_expansion` 이미 존재
- WTD 현재: `atr_ultra_low` 없음 — `extreme_volatility`는 HIGH만 감지 (LOW 없음)
- 현재 969 tests passing (W-0106 커밋 후)

## Assumptions

- L4 (OB 비율)는 Binance REST `/depth` 이미 수집 중 → 블록 작성만 하면 됨
- MTF는 기존 `resample` 유틸 활용 가능

## Open Questions

- L10 MTF: 다중 TF 동시 평가를 빌딩 블록 안에서 어떻게 처리? Context가 단일 TF 기준 → 별도 context 생성 필요?

## Next Steps

1. Slice 1 구현: `atr_ultra_low` 블록 + `volatility-squeeze-breakout-v1` 패턴
2. Haiku 백테스트 결과 확인 후 Slice 2 우선순위 조정
3. W-0108 설계: L6/L7/L8/L9 외부 API 수집 파이프라인

## Exit Criteria

- Slice 1: `volatility-squeeze-breakout-v1` 등록 + 테스트 통과
- Slice 2: `alpha-confluence-v1` 등록 + 백테스트 신호 수 100~2000 범위
- Slice 3: 별도 W-0108 완료

## Handoff Checklist

- 아카 15레이어 전체 JS 분석 완료 (원본: `/Users/ej/Desktop/나혼자매매 Alpha Flow_by 아카.html`)
- 현재 WTD 블록 커버리지: L1/L2/L11/L13/L14 = 기존 블록으로 대부분 구현 가능
- 즉시 구현: `atr_ultra_low` 신규 블록 1개 + `volatility-squeeze-breakout-v1` 패턴
- 외부 API(L6/L7/L8/L9)는 Slice 3으로 분리 — 이번 세션 범위 아님
- W-0106 커밋(`c3447b3`): SHORT 패턴 2개 + direction 필드 추가, 969 tests pass
