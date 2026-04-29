# Cogochi 통합 개편 플랜 — 설계 다이어그램 기반 전면 재정비

## Context

7개 SVG 다이어그램 + v3 유저저니 + UIUX 디자인 스펙 + 전체 시스템 감사(full_system_design_audit) 대비 현재 CHATBATTLE 코드를 분석한 결과:

**근본 문제 3개:**
1. **게임 루프 정의 불일치** — 설계: "월드탐험→고래인카운터→3라운드빠른배틀→reflection" / 코드: "30바 수동 순회 시뮬레이션"
2. **재미 요소 전면 부재** — DDA, Agent reactions, Reflection, 방치귀환, Era narrative, 패배의 재미 모두 없음
3. **데이터 플로우 단절** — 온보딩→에이전트 바인딩, 배틀→기록, 배틀→Lab CTA 모두 끊어짐

**요약 (41개 설계됨 / 37개 미설계):**

| 카테고리 | 있음 | 없음 | 비고 |
|---------|------|------|------|
| 데이터 플로우 연결 | 0/5 | **5/5** | G1~G5 전부 끊어짐 |
| Micro loop (30초) | 0/2 | **2/2** | 카운트다운, 신뢰도바 |
| Core loop | 부분 | **3라운드+Reflection 없음** | 30바→3라운드 재설계 필요 |
| 재미 메커닉 | 1/8 | **7/8** | DDA, 리액션, 나레이션, 커스터마이징, 방치귀환, 패배학습, 보상밀도 |
| COPIER 경로 | 0/2 | **2/2** | /market, /copy |
| Web3 경제 | 0/6 | **6/6** | Phase 2+ (NFT, 토큰, ERC-8004) |

---

## Phase 1 구현 범위 (0-12주)

설계 다이어그램의 Phase 1: **Terminal · Agent · Lab · Arena(Battle) · Market**
full_system_design_audit의 Blocker 중 Phase 1 해당: **없음** (Blockers는 전부 L1-L4 인프라)

### 우선순위: 게임 루프 먼저, 토큰노믹스 나중

---

## Sprint A: 데이터 플로우 연결 (P0 — BUILDER 루프 복구)

### A1. 온보딩 → 에이전트 바인딩
**파일:** `src/routes/onboard/+page.svelte`, `src/lib/stores/agentData.ts`
- `completeOnboarding()`에서 selectedArchetype → agentData 저장
- localStorage에 `cogochi_primary_agent` + `cogochi_onboard_complete` 저장
- Dashboard가 primary agent 기반으로 표시

### A2. 배틀 결과 → matchHistoryStore 저장
**파일:** `src/lib/stores/battleStore.ts`, `src/lib/stores/matchHistoryStore.ts`
- endBattle() → addBattleRecord() + recordAgentMatch()

### A3. 배틀 결과 화면: ERA REVEAL + Lab CTA
**파일:** `src/routes/battle/+page.svelte`
- ERA REVEAL 오버레이 (flash → ERA 이름+날짜 → 결과 → 메모리카드 → CTA)
- InlineActionButton: "Lab에서 개선하기 ›", "다음 배틀", "에이전트 확인"

### A4. 일 5판 제한
**파일:** `src/lib/stores/battleStore.ts`
- startBattle() 시 오늘 레코드 카운트 → 5판 초과 거부

### A5. 메모리 카드 생성 (WIN + LOSS 모두)
**파일:** `src/lib/stores/agentData.ts`
- WIN: 성공 메모리카드 + XP
- **LOSS: 실패 메모리카드 + 소량 XP** (패배의 재미 — fun_mechanics_map)
- "LOSS → 메모리 +1 (위안)" 메커닉 구현

---

## Sprint B: 배틀 — ChartGame 스타일 + 3라운드 + 실제 데이터

### 결정사항
- **HP 제거** → 순수 P/L만 추적 (ChartGame처럼)
- **심볼 선택** → BTC/ETH/SOL 중 유저가 선택
- **3라운드 유지** → R1(5봉) R2(5봉) R3(5봉) = 15봉
- **Next Bar** → 한 봉씩 공개
- **실제 Binance 과거 데이터** → mock 제거

### 이미 있는 것 (70% 재사용)
| 컴포넌트 | 파일 | 상태 |
|---------|------|------|
| BattleChart.svelte | `src/components/battle/BattleChart.svelte` (188줄) | ✅ lwc v5, 캔들+볼륨 |
| OrderPanel.svelte | `src/components/battle/OrderPanel.svelte` (354줄) | ✅ Limit/Stop/Market, Buy/Sell |
| PositionCard.svelte | `src/components/battle/PositionCard.svelte` (222줄) | ✅ 포지션+트레이드 히스토리 |
| AIAdvisor.svelte | `src/components/battle/AIAdvisor.svelte` (229줄) | ✅ AI 의견 + 동의/반대 |
| battleStore.ts | `src/lib/stores/battleStore.ts` (768줄) | ⚠️ 주문/포지션 로직 있음, HP 제거 필요 |
| fetchKlines | `src/lib/api/binance.ts` | ✅ 실제 Binance REST, 키 불필요 |

### B1. battleStore 수정 (768줄)
**변경:**
- `generateMockCandles()` → `fetchHistoricalCandles(symbol, interval)` 교체
  - `fetchKlines(symbol, interval, 15, randomEndTime)` 사용
  - randomEndTime: 과거 1~3년 중 랜덤 시점
- HP 관련 필드/로직 전부 제거: `playerHP`, `whaleHP`, `INITIAL_HP`, `calculateRoundHP()`
- `totalPnL` derived store 추가 (completedTrades 합산)
- 심볼 선택: `selectedSymbol: 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'` 필드
- ERA → 실제 날짜로 교체: `{ symbol, startDate, endDate }` (End Game에서 공개)
- `startBattle()` → async로 변경 (Binance fetch 대기)

### B2. 배틀 UI 레이아웃 (ChartGame 그대로)
**파일:** `src/routes/battle/+page.svelte` 전면 교체
```
┌─────────────────────────────────────────────────┐
│ [시계] 9:40 AM   R1 Bar 3/5   [⊙ End Game]     │
├────────────────────────┬────────────────────────┤
│  좌 60% — 차트          │  우 40% — 주문 패널     │
│                        │  ┌─Position───────────┐│
│  ┌──캔들+볼륨──────────┐│  │ L 1253sh $40.00   ││
│  │ lightweight-charts  ││  │ Mkt $39.88 P/L -$156││
│  │ 실제 Binance 데이터  ││  └────────────────────┘│
│  │                     ││  ┌─Orders─────────────┐│
│  └─────────────────────┘│  │ ● Limit ○ Stop ○ Mkt││
│                        │  │ ● Buy  ○ Sell      ││
│  [▶ Next Bar]           │  │ Price: $39.87      ││
│                        │  │ Shares: 1253       ││
│  ┌──AI 트렌드 (참고)──┐ │  │ Total: 49.96k     ││
│  │ SHORT ▼ 0.76       ││  │ [Next Bar][Place]  ││
│  │ "CVD diverging"    ││  └────────────────────┘│
│  └─────────────────────┘│  ┌─Order List─────────┐│
│                        │  │ L $39.66 1253 [✗]  ││
│                        │  └────────────────────┘│
│                        │  ┌─Trades──────────────┐│
│                        │  │ L/S Enter Exit Gains││
│                        │  └────────────────────┘│
├────────────────────────┴────────────────────────┤
│ P/L: $-156.63 │ Trades: 2 │ Round 1/3 │ 15:23  │
└─────────────────────────────────────────────────┘
```

**HP 바 → P/L 바로 교체:**
- 하단: 총 P/L + 트레이드 수 + 라운드 + 남은 시간

### B3. Ready 화면 (심볼 선택 추가)
```
┌─────────────────────────────────┐
│ CHART BATTLE                    │
│                                 │
│ 심볼 선택:                       │
│ [BTCUSDT] [ETHUSDT] [SOLUSDT]   │
│                                 │
│ 3라운드 × 5봉 = 15봉             │
│ 실제 과거 차트에서 트레이딩        │
│ 날짜는 End Game에서 공개!         │
│                                 │
│ 오늘 2/5                         │
│ [START BATTLE]                   │
└─────────────────────────────────┘
```

### B4. End Game 화면 (ERA REVEAL 교체)
```
┌──────────────────────────────────────┐
│ Symbol: BTCUSDT                      │
│ Date: Dec 18-26, 2024               │
│ Timeframe: 15m                       │
│                                      │
│ Total Profit: $+543.64              │
│                                      │
│ [Profit per trade 바 차트]           │
│                                      │
│ ┌──Trades────────────────────────┐  │
│ │ L $39.66→$40.12 +$576 (+1.2%) │  │
│ │ S $40.12→$40.25 -$32 (-0.3%)  │  │
│ └────────────────────────────────┘  │
│                                      │
│ 🃏 New Memory: "Dec 2024 Bull Run"   │
│                                      │
│ [Lab에서 개선 ›]  [Play Another]     │
└──────────────────────────────────────┘
```
### B5. 실제 Binance 데이터 fetch
**파일:** `src/lib/stores/battleStore.ts`
- `startBattle()` → async: `fetchKlines(symbol, '15m', 15, randomEndTime)` 호출
- randomEndTime: `Date.now() - random(30일~730일)` (1달~2년 전 중 랜덤)
- fetch 실패 시 mock fallback 유지
- 캔들 time이 UTC 초 단위 → BattleChart에서 바로 사용 가능

### B6. AI 트렌드 (정보 제공만, 투표 아님)
**파일:** `src/components/battle/AIAdvisor.svelte` 수정
- "동의/반대" 버튼 제거 → 정보 표시만
- "AI Trend: SHORT ▼ 0.76 — CVD diverging" 형태
- 라운드 시작 시 표시, 유저 주문과 독립적

### B7. HP 관련 코드 전면 제거
**파일:** `src/lib/stores/battleStore.ts`, `src/routes/battle/+page.svelte`
- `playerHP`, `whaleHP`, `INITIAL_HP`, `calculateRoundHP()` 삭제
- battle/+page.svelte의 HP 바 UI 삭제
- 하단 바 → P/L 요약 바로 교체
### B8. Reflection (End Game에 포함)
- End Game 화면 하단에 "오늘의 교훈" 텍스트 입력 (선택적, 2줄)
- 입력 시 메모리카드 `lesson` 필드에 저장, 미입력 시 자동 생성

### B9. DDA — 실제 데이터 기반
- 3연패 → 변동성 낮은 시기의 캔들 fetch (횡보장)
- 3연승 → 변동성 높은 시기의 캔들 fetch (급등/급락장)
- `computeDDAMultiplier()` 이미 있음 → randomEndTime 선택 로직에 반영

---

## Sprint C: COPIER 경로 + Market (P1)

### C1. `/market` 마켓플레이스
**파일:** `src/routes/market/+page.svelte` (신규)
- 증명된 에이전트 카드 (mock 8개)
- 필터: 승률, 낙폭, 아키타입, 가격
- 상세 모달: 백테스트 열람 + "구독하기" CTA

### C2. `/copy` 카피트레이딩
**파일:** `src/routes/copy/+page.svelte` (신규)
- 구독 에이전트 포지션 + 손익 (mock)

### C3. Nav 연결
- Header 드롭다운에 Market + Copy
- 랜딩 COPIER CTA → `/market`

---

## Sprint D: Dashboard + Agent HQ 데이터 연결 (P1)

### D1. Dashboard 실데이터
- matchHistoryStore → 오늘 배틀 수 + Activity Feed
- agentData.memoryCards → 최근 획득 카드
- Streak 계산 실데이터

### D2. Agent HQ 실데이터
- Memory 탭: agentData.memoryCards 표시
- Record 탭: matchHistoryStore 배틀 기록
- 에이전트 커스터마이징: 이름/별명 변경 기능 추가

---

## Sprint E: 보상 밀도 + 성장감 (P2)

reward_schedule + fun_mechanics_map 기반:

| 타이밍 | 보상 | 구현 |
|--------|------|------|
| 즉각 | WIN 파티클 + Bond +1 | A5에서 구현 |
| 1분 | XP + 메모리 카드 | A5에서 구현 |
| 1일 | 일일 스트릭 보너스 + PvP 결과 알림 | D1에서 구현 |
| 1주 | 7연승 Rare 카드 + Stage 진화 이벤트 | 신규 |
| 1달+ | 명예의전당 등록 + Stage 3 마스터 | Phase 2 |

### E1. 7연승 Rare 카드
- matchHistoryStore에서 연승 추적
- 7연승 달성 → 특별 메모리카드 "LEGENDARY" 등급

### E2. Stage 진화 이벤트
- agentData의 stage가 1→2 or 2→3 전환 시 풀스크린 진화 연출
- 픽셀 변신 애니메이션

### E3. AUTO 모드 + 방치 귀환
- AUTO 모드: 배틀에서 AI 판단을 자동 수용
- 방치 후 귀환 시: "AUTO 중 고래 3마리 잡았음!" 알림

---

## Phase 2+ (미구현 — 설계만)

full_system_design_audit 기반, 37개 미설계 항목:

| 레이어 | 항목 | Blocker |
|--------|------|---------|
| L1 Proof | zkTLS PPAP, Batch Merkle Root | B1: Notary Bond |
| L2 Model | ModelNFT ERC-721, AttributionSBT | B6: ContributionSplit |
| L3 ResearchJob | One-Topic Constraint, Commit-Reveal | autoresearch LLM 의존성 |
| L3 MergeJob | 8단계 수명주기, Threshold M-of-N | B3, B4, B5 |
| L4 Swarm | AutonomousLoop.sol, x402 Pool A | 스웜 실증 M5 |
| Web3 토큰 | $COGOCHI, veGOCHI, Source/Sink | Phase 1 게임 루프 완성 후 |
| DEX 실행 | GMX V2, 자동 실행 | Phase 2 |
| Tournament | 16강 PvP, 보상 | Phase 2 |

**Phase 2 Blocker 해결 순서:**
B1(Notary Bond) + B4(Domain Assign) → B2(배치 집계자) + B3(Threshold) → B5(N_min) → B6(ContribSplit) + B7(Gradient Poisoning)

---

## 수정 대상 파일 요약

| 파일 | Sprint | 작업 |
|------|--------|------|
| `src/routes/onboard/+page.svelte` | A1 | archetype → agentData 저장 |
| `src/lib/stores/agentData.ts` | A1,A5,B3,D2 | initFromOnboard, memoryCards(WIN+LOSS), reflection, 커스터마이징 |
| `src/lib/stores/battleStore.ts` | A2,A4,B1,B2,B4,B6 | 3라운드, 30초타이머, DDA, ERA narrative |
| `src/lib/stores/matchHistoryStore.ts` | A2 | addBattleRecord |
| `src/routes/battle/+page.svelte` | A3,B1,B3,B5 | ERA REVEAL, 카운트다운, Reflection UI, 리액션 |
| `src/routes/market/+page.svelte` | C1 | 신규 |
| `src/routes/copy/+page.svelte` | C2 | 신규 |
| `src/routes/dashboard/+page.svelte` | D1 | 실데이터 연결 |
| `src/routes/agent/[id]/+page.svelte` | D2 | Memory/Record 실데이터, 커스터마이징 |
| `src/components/layout/Header.svelte` | C3 | Market/Copy 드롭다운 |

---

## 검증

### BUILDER E2E 테스트
1. `/` → "AI 만들기" → `/onboard` → 아키타입 선택 → 튜토리얼 배틀(3라운드, 30초 타이머) → ERA REVEAL → `/dashboard`
2. Dashboard: 에이전트 표시 + 배틀 0/5
3. `/lab` → 벤치마크 → Run Again → "Battle로 증명"
4. `/battle` → **3라운드 배틀** (30초 카운트다운 + 신뢰도 바) → ERA REVEAL + Reflection → "Lab 돌아가기"
5. Dashboard: 배틀 1/5 + Activity Feed + 메모리카드
6. 3연패 시 → DDA: 약한 고래 배정 확인
7. LOSS 시 → 메모리카드 +1 확인

### COPIER E2E 테스트
1. `/` → "검증된 AI 구독" → `/market`
2. 에이전트 탐색 + 필터
3. `/copy` 접근 가능

### 기술 검증
- `npm run check` — 0 errors
- localStorage 초기화 후 풀 플로우 테스트
