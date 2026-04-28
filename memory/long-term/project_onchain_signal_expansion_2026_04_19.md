---
name: On-chain Signal Expansion + CTO Refactor (2026-04-19)
description: Telegram 분석가 툴킷 역공학 → 3개 신규 데이터소스 + 4개 블록 구현 + CTO 리팩토링 패스. 815 tests pass. PR #85 + #88 머지.
type: project
originSessionId: 45567dac-e993-4913-8e5b-6b93837dad95
---
## 세션 결과 (2026-04-19, branch: claude/dazzling-jepsen)

**Why:** Telegram 채널("나혼자매매-차트&온체인") 분석가의 2026 툴킷을 엔진에 이식.
분석가가 쓰는 툴: CryptoQuant(Coinbase Premium), Nansen(스마트머니), TradingView(OI), Velo(CME OI)

### PR #85 — 4 블록 구현 (머지 완료)

**1. coinbase_premium_positive** (CONFIRMATION + BULLISH)
- `fetch_coinbase.py`: Coinbase Exchange 공개 API → BTC-USD daily candles + Binance BTCUSDT
- `coinbase_premium` = (coinbase_close - binance_close) / binance_close
- `coinbase_premium_norm` = 30d rolling z-score, 0.5 이상 = 유의미한 기관 프리미엄
- Registry: global macro source, `src_coinbase_premium.csv`

**2. smart_money_accumulation** (CONFIRMATION + BULLISH)
- `fetch_okx_smart_money.py`: OKX Onchain OS Signal API (POST /api/v6/dex/market/signal/list)
- 실시간 피드 → TTL 5min 캐시 → 블록이 직접 호출 (registry 아님)
- walletType: 1=Smart Money, 2=KOL, 3=Whale
- OKX API key: `engine/.env` (OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE=Hyun880814!)
- Cloudflare 우회: Mozilla User-Agent 필요, POST endpoint

**3. fetch_exchange_oi** (per_symbol registry source)
- `fetch_exchange_oi.py`: Binance + Bybit + OKX 합산 OI
- Bybit OI는 BTC 단위 → 현재가 곱해서 USD 변환
- `cme_oi` 컬럼은 0으로 placeholder (Coinglass $29/월 필요)
- `oi_exchange_conc` = 특정 거래소 점유율 (>0.75 = 단일 거래소 주도)

**4. total_oi_spike** + **5. oi_exchange_divergence** (CONFIRMATION)
- `total_oi_change_1h/24h` 기반. 기존 `oi_change`(Binance only) 대체.
- `low_concentration` mode: 여러 거래소 동시 OI 변화 → 신뢰도 높은 시그널

### PR #88 — CTO 리팩토링 패스 (머지 완료)

**수정 항목:**
- `_fetch_binance_oi`: dead code(`rows[]` + 잘못된 공식) 제거 → `sumOpenInterestValue` 직접 사용
- 캐시 키에 `max_age_hours` 누락 버그 수정 (다른 age filter가 같은 캐시 히트)
- 캐시 무한 증가 방지: `_CACHE_MAX=64` + oldest-entry 퇴출
- bare `except` → `log.exception` 추가 (fetch_coinbase)
- `datetime` import 모듈 레벨로 이동, 미사용 `subprocess` 제거
- OKX snapshot >4h stale 시 debug log 추가
- 모든 confirmation 블록의 `hasattr(x, "fillna")` guard 제거
- `smart_money_accumulation` 타임스탬프: int64/1e6 → `.to_pydatetime().timestamp()`

### 분석가 툴킷 커버리지

| 분석가 툴 | 엔진 상태 |
|---|---|
| Coinbase Premium (기관 매수세) | ✅ coinbase_premium_positive |
| Nansen 스마트머니 | ✅ smart_money_accumulation (OKX 근사) |
| TradingView OI | ✅ total_oi_spike + oi_exchange_divergence |
| CME OI (Velo) | ❌ cme_oi placeholder (Coinglass 유료) |

### 남은 갭
- CME OI: Coinglass API $29/월 or COT 주간 리포트 파싱
- SYMBOL_CHAIN_MAP 확장 필요 (현재 FARTCOIN/WIF/BONK/PEPE/SHIB/FLOKI/JUP/RAY)

**Test count:** 815 passing (815 pass, 4 skip)
