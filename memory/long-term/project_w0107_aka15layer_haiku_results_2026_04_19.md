---
name: W-0107 아카 15레이어 통합 + Haiku 벤치마크 결과
description: W-0107 아카 Alpha Terminal 15레이어 이식 완료 + Haiku 자동 백테스트 7패턴 결과 (2026-04-19)
type: project
---

## W-0107 완료 사항 (commit da71e3d)

**신규 빌딩 블록 4개:**
- `atr_ultra_low`: ATR14/ATR50 < 0.6 (아카 L15 ULTRA_LOW)
- `volume_surge_bull`: vol_acceleration ≥ 1.8 + 상승봉 (아카 L3)
- `volume_surge_bear`: vol_acceleration ≥ 1.8 + 하락봉 (아카 L3 SHORT)
- `liq_zone_squeeze_setup`: FR > 0.05% + OI > 3% (아카 L5)

**신규 패턴 2개 (총 9개):**
- `volatility-squeeze-breakout-v1`: BB스퀴즈 + ATR극저 → 볼륨 돌파 (아카 L14+L15+L13)
- `alpha-confluence-v1`: FR+CVD+BB 멀티레이어 (아카 L2+L11+L14)

**도구:**
- `sweep_parameters.py` + CLI `sweep` 서브커맨드

**969 tests pass**

## Haiku 벤치마크 결과 (7패턴)

| 패턴 | Reference | Holdout | 상태 |
|---|---|---|---|
| whale-accumulation | 0.50 | 0.458 | Dead End |
| wyckoff-spring | 0.50 | 0.20 | Dead End |
| volume-absorption (VAR) | 0.05 | 0.931 | ⚠️ 데이터 누수 의심 |
| tradoor-oi | 0.0 | 0.0 | Dead End |
| funding-flip-reversal | — | — | 데이터 부족 |
| funding-flip-short | 0.0 | 0.0 | 데이터 없음 (신규) |
| gap-fade-short | 0.0 | 0.0 | 데이터 없음 (신규) |

**해석:**
- ML 벤치마크 신뢰도 낮음 (훈련 데이터 부족)
- 실제 edge: FFR +5.3% avg_72h (W-0104 백테스트 기준) 가장 신뢰
- VAR holdout=0.931은 데이터 누수 or 샘플 수 너무 적음 → 주의
- 신규 SHORT + 아카 패턴: 신호 accumulate 후 재평가 필요

## 아카 파일 미구현 외부 데이터 (W-0108 예정)

전부 무료 API:
- `api.alternative.me/fng` → Fear & Greed (L7)
- `api.coingecko.com` → USD/KRW 환율 (L8)
- `api.blockchain.info/stats` → BTC 온체인 Tx (L6)
- `mempool.space/api/*` → 멤풀/수수료 (L6)
- `api.upbit.com` + `api.bithumb.com` → 김치프리미엄 (L8)

**Why:** 아카 파일이 이 5개 무료 소스를 직접 fetch해서 L6/L7/L8 레이어 계산
**How to apply:** W-0108 설계 시 이 URL들 직접 사용, allorigins 프록시는 서버에서 불필요
