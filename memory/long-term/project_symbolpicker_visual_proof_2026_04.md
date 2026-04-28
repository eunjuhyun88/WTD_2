# PR #18 — SymbolPicker + 17-Layer Visual Proof Charts (2026-04-13)

## 완료 작업

### 1. PR #17 머지
- `+page.svelte` 충돌 해결 (loadAlerts + gPair + analysisData null + untrack 모두 유지)
- main에 push 완료

### 2. SymbolPicker 드롭다운
- `app/src/components/terminal/workspace/SymbolPicker.svelte` — 신규
- CMC token universe (`/api/engine/universe`) 활용
- 검색 (심볼/이름), 섹터 필터 8종, 정렬 4종 (rank/vol/hot/%chg)
- 24h 미니 스파크라인 (Binance Futures klines, 상위 20 토큰)
- 섹터 배지 (violet), Volume + MCap 표시
- Escape + 백드롭 닫기, 모바일 반응형

### 3. 17-Layer 증빙 미니차트
- `MiniIndicatorChart.svelte` — 레이어 키에 따라 다른 차트 렌더링
- `/api/market/ohlcv` — Binance Futures klines + taker buy volume → CVD 자동 계산
- 분석 시 OHLCV 병렬 fetch → bars를 VerdictCard → EvidenceGrid → EvidenceCard로 전달

**레이어별 차트 타입:**
- candles: wyckoff, mtf, breakout
- cvd line: cvd (제로라인 포함)
- volume delta bars: vsurge, onchain, flow, liq_est, real_liq
- price+volume overlay: oi
- sparkline: bb14, bb16 (violet), atr (amber)
- gauge arc: fear/greed
- spread line: basis, kimchi (제로라인)
- none: sector

### 4. API 엔드포인트 (신규)
- `/api/market/sparklines` — 배치 Binance 24h klines (max 20 symbols, 5min cache)
- `/api/market/ohlcv` — OHLCV + buy/sell delta + CVD (1min cache)

## 알려진 제한사항
- MiniIndicatorChart는 단일 OHLCV 데이터를 공유 — 레이어별 전용 데이터(OI 히스토리, 펀딩레이트 등) 미구현
- 모바일 EvidenceCard에 bars 미전달 (desktop만 증빙차트 표시)
- sector 레이어 항상 0점 (compute_sector_scores 미연결)

## 기술 패턴
- Svelte 5: `$derived.by()` 로 SVG path 계산, `$effect`로 sort/sector 변경 시 refetch
- 백드롭 클릭: `onclick={onClose}` + 패널에 `e.stopPropagation()` (e.target 체크보다 안정적)
- Binance klines 인덱스: [0]=openTime, [4]=close, [5]=volume, [9]=takerBuyBaseVol
  - delta = buyVol - sellVol, CVD = cumulative sum of deltas

## 유저 피드백
- "단순 리스트만 보여주면 의미없다" → 스파크라인 + 증빙차트 추가
- "실제 트레이더가 쓰는 차트 방법론" → CVD, 볼륨 델타, Material Indicators 스타일 원함
- "각 지표에 대해 데이터를 증빙할 수 있게 시각적으로 보여줘야" → EvidenceCard별 미니차트
