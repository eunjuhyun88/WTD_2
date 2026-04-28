# COGOCHI — `/terminal` Terminal 페이지

> 역할: 관찰 + 패턴 구성  
> 핵심 개념: 프롬프트 트리거형 GUI. 검색 쿼리 자체가 패턴 구성기(wizard).  
> 참조: Claude Artifacts + Spotlight/Raycast + Perplexity의 혼합

---

## 레이아웃 구조

### 데스크탑 (≥1024px) — 3-Pane 그리드

```
┌─ TERMINAL ──────────────────────────────────────────────────────┐
│ [헤더: 현재 심볼 / 모드 표시]                                      │
├─────────────────┬──────────────────────┬────────────────────────┤
│                 │                      │                        │
│  LEFT PANE      │   CENTER PANE        │   RIGHT PANE           │
│  퀵 리스트       │   피드 / 결과         │   차트 / 검사           │
│  워치 컨텍스트   │   리서치 블록         │   포커스 인스펙션        │
│                 │                      │                        │
│  (고정폭)        │   (가변폭, 주영역)    │   (고정폭)              │
│                 │                      │                        │
├─────────────────┴──────────────────────┴────────────────────────┤
│ [쿼리 입력바] → 파싱 힌트 → [Save Challenge]                       │
└─────────────────────────────────────────────────────────────────┘
```

### 태블릿 (768~1023px)
- Left Pane: 고정 노출
- Center + Right: 세로 스택 (Center 위, Right 아래)

### 모바일 (< 768px)
- 탭 전환: `[퀵리스트] [피드] [차트]`
- 하단 쿼리 입력바 고정

---

## [HEADER] — 터미널 헤더

```
[◀ COGOCHI]   TERMINAL   [심볼: BTCUSDT]  [TF: 1H ▼]   [모드: DEFAULT / WALLET]
```

| 요소 | 동작 |
|------|------|
| `◀ COGOCHI` | 홈(`/`)으로 이동 |
| `심볼` 드롭다운 | BTC / ETH / SOL / ... 빠른 전환. 자유 타이핑 검색 가능 |
| `TF` 드롭다운 | 1m / 5m / 15m / 1h / 4h / 1d 전환 |
| `모드` | DEFAULT(기본 분석) ↔ WALLET(월렛 인텔) 전환 |

---

## [LEFT PANE] — 퀵 리스트 & 워치 컨텍스트

### 퀵 액션 버튼

```
── TOKENS ──
[BTC]  [ETH]  [SOL]  [BNB]  [XRP]

── TIMEFRAMES ──
[1m]  [5m]  [15m]  [1h]  [4h]  [1d]

── INDICATORS ──
[RSI]  [OI]  [Vol]  [Fund]  [CVD]  [BB]

── ACTIONS ──
[LONG ↑]  [SHORT ↓]  [📌 저장]
```

- 버튼 클릭 → 해당 토큰/TF/인디케이터가 쿼리 입력바에 자동 삽입
- `[LONG]` / `[SHORT]` 클릭 → `direction:LONG` or `direction:SHORT` 토큰 삽입
- `[📌 저장]` 클릭 → 현재 쿼리 그대로 Save Challenge 실행

### 워치리스트 (Dashboard에서 저장한 항목)

```
── WATCHING ──
BTC 4H  rally+bb  ✅ live
ETH 1H  rsi_ob    ⏸ paused
[+ Add from current]
```

- 항목 클릭 → 해당 심볼+TF+패턴으로 쿼리 입력바 채움 + Center Pane 갱신
- `[+ Add from current]` → 현재 입력 쿼리를 워치리스트에 추가

---

## [CENTER PANE] — 피드 / 결과 / 리서치 블록

### 역할

사용자가 입력한 쿼리에 반응해 분석 블록이 쌓이는 영역.  
위에서 아래로 새 결과가 추가됨 (스크롤).

### 분석 블록 유형 (아티팩트)

| 입력 키워드 | 생성되는 블록 |
|------------|-------------|
| `BTC`, `ETH`, `SOL`, 심볼명 | 미니 TradingView 임베드 차트 |
| `RSI`, `MACD`, `BB`, `볼밴` | 차트 오버레이 인디케이터 패널 |
| `OI`, `펀딩비`, `funding`, `FR` | 파생상품 데이터 패널 |
| `CVD`, `aggTrade` | CVD 차트 패널 |
| `롱 갈까?`, `숏 어때?`, `분석해줘` | AI 의견 블록 + 포지션 셋업 카드 |
| 블록명 조합 (`recent_rally + bollinger_expansion`) | 패턴 구성 프리뷰 카드 |
| 지갑 주소 (`0x...`) | 지갑 인텔 모드 전환 |

### AI 의견 블록 상세

```
┌─ AI ANALYSIS ──────────────────────────────────────────────┐
│ 📡 BTCUSDT 4H                                               │
│                                                             │
│ [분석 내용: CVD 베어리시 다이버전스, 펀딩비 0.12% 과열...]   │
│                                                             │
│ DIRECTION:  LONG / SHORT / NEUTRAL                         │
│ CONFIDENCE: ████░░░ 62%                                     │
│                                                             │
│ Entry:  $84,200   Stop: $82,800   Target: $87,500          │
│                                                             │
│ [✓ 맞아]    [✗ 아니야]    [📌 Challenge로 저장]             │
└────────────────────────────────────────────────────────────┘
```

- AI 출력: SSE(Server-Sent Events)로 스트리밍 타이핑 효과
- `[✓ 맞아]` / `[✗ 아니야]` → feedback DB 저장 (AutoResearch 훈련 데이터)
- `[📌 Challenge로 저장]` → 현재 분석 결과를 Lab Challenge로 변환

### 패턴 구성 프리뷰 카드

```
┌─ PATTERN PREVIEW ──────────────────────────────────────────┐
│ 이름:  [btc-4h-rally-bb]  (자동 slug, 수정 가능)           │
│                                                             │
│ 파싱됨:                                                     │
│   TRIGGER:       recent_rally(pct=0.10, lookback=72)       │
│   CONFIRMATION:  bollinger_expansion(threshold=1.5)        │
│   SYMBOL:        BTC                                        │
│   TIMEFRAME:     4H                                         │
│   DIRECTION:     LONG                                       │
│                                                             │
│ [📌 Save as Challenge →]    [수정하기]                      │
└────────────────────────────────────────────────────────────┘
```

- 파싱 힌트는 입력바 아래에도 실시간으로 표시됨 (작은 텍스트)
- `[Save as Challenge]` 클릭 → answers.yaml 자동 생성 → Lab에서 확인 가능

---

## [RIGHT PANE] — 차트 / 포커스 인스펙션

### 기본 상태

- TradingView Lightweight Charts 임베드
- 현재 선택된 심볼 + TF의 캔들차트
- 오버레이: EMA20, EMA50 기본 표시
- 우측 상단: `[풀스크린 ⤢]` 버튼

### 인스펙션 모드 (Lab에서 딥링크 클릭 시)

- Lab 인스턴스 테이블에서 특정 행 클릭 → Terminal Right Pane에 해당 시점 차트 로드
- 해당 시점에 진입 마커(▲/▼) + stop/target 수평선 표시
- 상단에 인스턴스 요약: `BTC 2024-03-22 | Entry $65,200 | PnL +4.2% | target hit`

### 월렛 인텔 모드 (모드 전환 시)

```
┌─ WALLET INTEL ─────────────────────────────────────────────┐
│  주소: [0x1234...abcd 입력]  [분석]                         │
│                                                             │
│  뷰 선택: [Flow Map] [Token Bubble] [Cluster View]          │
│                                                             │
│  ─ 선택 토큰 차트 + 지갑 이벤트 마커 ─                      │
│  (마켓 오버레이: 지갑 매수/매도 타이밍을 차트에 표시)          │
└────────────────────────────────────────────────────────────┘
```

- 월렛 모드는 별도 라우트 아님, 오른쪽 패널만 교체
- 나가기: `[← 차트로 돌아가기]` 버튼

---

## [BOTTOM BAR] — 쿼리 입력바

```
┌────────────────────────────────────────────────────────────┐
│  🔍  btc 4h recent_rally 10% + bollinger_expansion______   │
│      → TRIGGER: recent_rally  CONFIRMATION: bollinger      │
│                                              [Save Challenge]│
└────────────────────────────────────────────────────────────┘
```

### 입력바 동작

| 동작 | 결과 |
|------|------|
| 타이핑 | 실시간 자동완성 드롭다운 표시 |
| 엔터 | 쿼리 실행 → Center Pane에 블록 추가 |
| `@심볼` 입력 | 심볼 필터 활성화 |
| 블록 이름 입력 | 해당 블록 파싱 힌트 표시 |
| `[Save Challenge]` 클릭 | 파싱된 패턴 → answers.yaml 생성 → Lab 이동 |

### 자동완성 카테고리

```
드롭다운 예시:
  🪙 토큰:        BTC, ETH, SOL, BNB, XRP, ...
  📊 인디케이터:  RSI, MACD, BB, EMA, ATR, OI, CVD, ...
  🔗 온체인:      whale_alert, exchange_inflow, ...
  📈 파생상품:    funding_rate, open_interest, liq_map, ...
  🧱 블록:        recent_rally, bollinger_expansion, rsi_oversold, ...
  ⚡ 액션:        [분석], [저장], [롱], [숏]
```

- 자동완성 항목 클릭 또는 방향키 + 엔터로 선택
- 선택 시 입력바에 토큰으로 삽입

### 파싱 힌트 영역 (입력바 바로 아래)

```
→ SYMBOL: BTC  |  TF: 4H  |  TRIGGER: recent_rally(pct=0.10)  |  CONFIRM: bollinger_expansion
```

- 파싱 실패 항목은 빨간 밑줄 + 툴팁 "인식할 수 없는 블록"
- 파싱 성공 항목은 초록 강조

---

## Save Challenge 플로우

1. 사용자: 쿼리 입력 → 파싱 힌트 확인
2. `[Save Challenge]` 클릭
3. 모달 표시:
   ```
   ┌─ Challenge 저장 ─────────────────────────────────────┐
   │  이름(slug):  [btc-4h-rally-bb]  ← 자동 생성, 수정 가능 │
   │  방향:        [LONG ▼]                                 │
   │  타임프레임:  [4H ▼]                                   │
   │  유니버스:    [binance_30 ▼]                           │
   │                                                       │
   │  블록 확인:                                            │
   │  ✅ TRIGGER:  recent_rally                             │
   │  ✅ CONFIRM:  bollinger_expansion                      │
   │                                                       │
   │  [저장 및 Lab에서 열기]    [취소]                       │
   └──────────────────────────────────────────────────────┘
   ```
4. 저장 완료 → `/lab?challenge=btc-4h-rally-bb` 이동

---

## Free 플랜 제한 동작

| 조건 | 동작 |
|------|------|
| Challenge 3개 초과 시도 | 저장 모달에서 업그레이드 모달로 전환 |
| 일 세션 3회 초과 | 입력바 비활성화 + "오늘 분석 3회를 다 썼어요" 토스트 |
| 5개 종목 초과 | Right Pane 차트 로드 시 "Pro 전용 종목" 안내 |

---

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `/` | 쿼리 입력바 포커스 |
| `Ctrl+S` | Save Challenge 실행 |
| `Esc` | 자동완성 닫기 / 모달 닫기 |
| `Tab` | 자동완성 첫 항목 선택 |
| `Ctrl+Enter` | 쿼리 실행 (엔터와 동일) |

---

## 상태 / 예외 처리

| 상황 | 처리 |
|------|------|
| AI 응답 스트리밍 중 새 쿼리 입력 | 현재 스트리밍 중단 + 새 쿼리 실행 |
| Binance WS 연결 끊김 | 차트에 `⚠ 데이터 지연` 배너, REST로 fallback |
| 블록 파싱 실패 | 힌트 영역에 빨간 경고, 저장 버튼 비활성화 |
| slug 중복 | 모달에서 `-2` 자동 append 또는 수정 요청 |
| 서버 에러 (SSE) | 피드에 `❌ 분석 실패. 다시 시도해주세요.` 블록 |
