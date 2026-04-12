# STOCKCLAW — FlowSpec v2.0

> **기능 플로우 설계서 · Agent Engine v3 통합**
> 각 기능 ID별 Before → Action → After · 상태전이 · 에러 처리
> 2026-02-22 | Holo Studio Co., Ltd. | INTERNAL

---

## 목차

- **CHAPTER 1.** 인증/지갑 플로우 (F-AUTH)
- **CHAPTER 2.** 터미널/시그널 액션 플로우 (F-TERM)
- **CHAPTER 3.** 아레나 매치 플로우 (F-ARENA) — v3 전면 재설계
- **CHAPTER 4.** 패스포트 플로우 (F-PASS) — v3 6대 메트릭 + 에이전트 경험
- **CHAPTER 5.** 오라클 / 챌린지 / LIVE 플로우 (F-ENGAGE) — v3 신규
- **CHAPTER 6.** LP / 티어 플로우 (F-LP) — v3 신규
- **CHAPTER 7.** RAG 기억 시스템 플로우 (F-RAG) — v3 신규
- **CHAPTER 8.** Spec 해금 플로우 (F-SPEC) — v3 신규
- **CHAPTER 9.** 전체 상태 저장 / 동기화 패턴

---

## CHAPTER 1. 인증/지갑 플로우 (F-AUTH)

> v1.0과 동일. 지갑+이메일 인증 구조 유지.

### F-AUTH-001 지갑 연결 플로우

**Before (사전 조건)**

| 항목 | 값 / 조건 |
|------|----------|
| 세션 상태 | 미인증 (`stockclaw_session` 쿠키 없음 또는 만료) |
| 사용자 티어 | guest |
| UI 상태 | `WalletModal.svelte` 오픈 상태 |
| 기기 조건 | 브라우저에 MetaMask 확장 또는 지원 provider 설치됨 |

**Action — 단계별 흐름**

1. 사용자가 provider 목록에서 MetaMask(또는 WalletConnect 등) 선택
2. 클라이언트: `eth_requestAccounts` 호출 → MetaMask 팝업 → 계정 주소 반환
3. 클라이언트: `POST /api/auth/nonce { address }` 호출
4. 서버: nonce 생성(UUID), DB 저장(만료 5분), `{ nonce, message, expiresAt }` 반환
5. 클라이언트: `personal_sign(message, account)` 호출 → MetaMask 서명 팝업
6. 사용자 서명 승인 → signature 반환
7. 클라이언트: `POST /api/auth/verify-wallet { address, message, signature, provider }` 호출
8. 서버: `ecrecover`로 서명 검증 → nonce 사용 처리(재사용 방지) → 세션 쿠키 발급
9. 서버: `{ verified: true, linkedToUser, wallet }` 반환
10. 클라이언트: `stockclaw_wallet` store 갱신, 사용자 티어 `connected`/`verified` 업데이트, 모달 닫힘

**After (사후 조건)**

| 항목 | 기대 값 |
|------|--------|
| 세션 쿠키 | `stockclaw_session` 발급됨 (HttpOnly) |
| 사용자 티어 | `connected` (지갑만) 또는 `verified` (이메일+지갑) |
| `stockclaw_wallet` store | `{ address, provider, connected: true }` 저장 |
| WalletModal | 닫힘 |
| 보호 API 접근 | 정상 200 응답 |

**예외 분기 / 에러 처리**

| 상황 | 트리거 | 처리 |
|------|--------|------|
| provider 없음 | MetaMask 미설치 | '지갑 미감지' 안내 + 설치 링크 |
| 사용자 서명 거부 | MetaMask 취소 | 에러 toast, 모달 유지 |
| nonce 만료 | `expiresAt` 경과 | 401 반환 → '다시 시도' 버튼 노출 |
| nonce 이미 사용됨 | 동일 nonce 2회 제출 | 401 반환 → 새 nonce 발급 재시도 |
| 서명 검증 실패 | address 불일치 | 401 반환 → '서명 불일치' 에러 |
| 네트워크 오류 | API 타임아웃 | toast 에러, 모달 유지 |

**상태전이**

| From 상태 | 트리거 이벤트 | To 상태 | 가드 조건 |
|----------|-------------|---------|----------|
| guest (미연결) | provider 선택 + `eth_requestAccounts` 성공 | 서명 대기 중 | — |
| 서명 대기 중 | `personal_sign` 승인 | 검증 중 | — |
| 서명 대기 중 | MetaMask 취소 | guest (미연결) | 에러 toast |
| 검증 중 | verify-wallet 200 | connected/verified | — |
| 검증 중 | verify-wallet 401 | guest (미연결) | 에러 안내 |

---

### F-AUTH-002 이메일 회원가입 플로우

**Before**

| 항목 | 값 / 조건 |
|------|----------|
| 세션 상태 | 미인증 |
| UI 상태 | 회원가입 모달 오픈 |

**Action**

11. 사용자: email, nickname 입력 (walletAddress/walletSignature 선택적)
12. 클라이언트: 입력 유효성 검사 (이메일 형식, 닉네임 1~20자)
13. `POST /api/auth/register { email, nickname, walletAddress?, walletSignature? }`
14. 서버: 이메일/닉네임 중복 확인 → DB에 사용자 생성 → 세션 쿠키 발급
15. 서버: **v3 추가** — `user_passports` 신규 row 생성 (LP=0, tier=BRONZE)
16. 서버: **v3 추가** — 8개 에이전트에 대한 `user_agent_progress` 초기 row 생성 (base Spec만 해금)
17. 서버: `{ success: true, user, passport }` 반환
18. 클라이언트: `stockclaw_profile` store 초기화, `passportStore` 초기화, 모달 닫힘

**After**

| 항목 | 기대 값 |
|------|--------|
| 사용자 생성 | `users` 테이블에 신규 row |
| Passport 생성 | `user_passports` row (LP=0, tier=BRONZE) |
| 에이전트 진행도 | `user_agent_progress` × 8 rows (각 Base Spec만 해금) |
| 세션 쿠키 | 발급됨 |
| 사용자 티어 | registered (Bronze) |

**예외 분기**

| 조건 | HTTP 코드 | 메시지 |
|------|----------|--------|
| 이메일 중복 | 409 | 이미 사용 중인 이메일 |
| 닉네임 중복 | 409 | 이미 사용 중인 닉네임 |
| 형식 오류 | 400 | 유효성 오류 항목 명시 |
| DB 미설정 | 500 | Server database is not configured |

---

## CHAPTER 2. 터미널/시그널 액션 플로우 (F-TERM)

> v1.0과 동일. 차트/시그널/퀵트레이드 기본 구조 유지.

### F-TERM-001 차트 Pair/Timeframe 전환

**Before**

| 항목 | 값 |
|------|---|
| 현재 pair | BTC/USDT (기본값) |
| 현재 timeframe | 1h (사용자 설정 기준) |
| WebSocket 상태 | 현재 pair 구독 중 |

**Action**

19. 사용자가 pair/timeframe 드롭다운 선택
20. Svelte store: `currentPair` / `currentTimeframe` 갱신
21. 기존 WebSocket 구독 해제
22. Binance Kline API: `GET /api/binance/klines?symbol=...&interval=...` 호출
23. 새 캔들 데이터 차트 렌더링
24. WebSocket: 신규 pair Kline 스트림 구독 시작
25. `PUT /api/preferences { timeframe }` 서버 저장 (디바운스 250ms)

**After**

| 항목 | 기대 값 |
|------|--------|
| 차트 | 신규 pair 캔들 표시 |
| WarRoom 시그널 | 해당 pair 시그널 필터링 |
| preferences.timeframe | 서버에 저장됨 |
| WS 구독 | 신규 pair 스트림으로 교체됨 |

---

### F-TERM-002 시그널 Track

**Action**

26. 사용자가 시그널 카드의 'Track' 버튼 클릭
27. `POST /api/signals/track { pair, dir, confidence, entryPrice, currentPrice, source, note, ttlHours? }`
28. 서버: `tracked_signals` 테이블에 신규 row 생성, 만료 시각 설정
29. 클라이언트: `stockclaw_tracked` store 낙관적 업데이트 → 서버 ID로 교체
30. Signals/Community 피드에 tracked 항목 추가됨

---

### F-TERM-003 퀵트레이드 오픈/종료

**오픈 Action**

31. 사용자가 WarRoom에서 Long 또는 Short 버튼 클릭
32. `POST /api/quick-trades/open { pair, dir, entry, tp?, sl?, source?, note? }`
33. 서버: `quick_trades` 테이블에 신규 row (status=open)
34. PnL 계산 시작 (실시간 30초 주기)

**종료 Action**

35. 사용자가 Passport > Positions에서 종료 버튼 클릭 (또는 TP/SL 자동)
36. `POST /api/quick-trades/{id}/close { closePrice, status? }`
37. 서버: status=closed/stopped, PnL 계산 저장
38. 클라이언트: `stockclaw_quicktrades` 상태 갱신

**상태전이: 퀵트레이드**

| 상태 | 전이 이벤트 | 다음 상태 | 조건 |
|------|-----------|----------|------|
| open | close (수동) | closed | 정상 종료 |
| open | TP 도달 | closed | status=closed |
| open | SL 도달 | stopped | status=stopped |
| closed/stopped | 재진입 불가 | (터미널) | 409 Conflict |

---

### F-TERM-004 카피트레이드 발행

39. 사용자: 복수 시그널 선택 후 'Copy Trade' 클릭
40. `POST /api/copy-trades/publish { selectedSignalIds[], draft, confidence? }`
41. 서버: copy-trade run + quick_trade + signal converted 동시 처리
42. 클라이언트: `stockclaw_signals`, `stockclaw_quicktrades` 동시 갱신

---

### F-TERM-005 시그널 Track → Trade 전환

43. `POST /api/signals/{id}/convert { entry?, tp?, sl?, note? }`
44. 서버: `tracked_signal` → converted + `quick_trade` 생성
45. 클라이언트: 양쪽 store 갱신

> ⚠ 중복 전환 방지: converted/expired signal에 convert 요청 시 409.

---

## CHAPTER 3. 아레나 매치 플로우 (F-ARENA)

> **v3 전면 재설계** — 8 Agent Pool × 3 Draft × Spec × RAG × 5 Phase

### F-ARENA-001 매치 생성 + 매칭

**Before**

| 항목 | 값 |
|------|---|
| 페이지 | `/arena/lobby` 진입 |
| 사용자 상태 | registered 이상 |
| 매칭 상태 | 대기 중 (queue 없음) |
| pair | 유저 선택 또는 자동 (BTC/USDT 기본) |

**Action**

46. 사용자가 Lobby에서 '매치 시작' 버튼 클릭
47. 클라이언트: `POST /api/arena/match/create { pair, timeframe }`
48. 서버: `arena_matches` 신규 row 생성 (`status='DRAFT'`, `user_a_id` 세팅)
49. 서버: 매칭 — 대기 중인 다른 유저 or AI 대전 (`user_b_id = null` → AI)
50. 서버: `{ matchId, paired, opponent }` 반환
51. 클라이언트: `matchStore` 초기화, `/arena/draft/{matchId}` 라우트 이동

**After**

| 항목 | 기대 값 |
|------|--------|
| `arena_matches` | 신규 row, status=DRAFT |
| 매칭 | user_a + user_b (또는 AI) 결정 |
| 화면 | Draft 화면으로 전환 |

**예외 분기**

| 조건 | 처리 |
|------|------|
| 이미 진행 중인 매치 존재 | 409 — "진행 중인 매치를 먼저 완료하세요" |
| 서버 에러 | 500 — toast, lobby 유지 |
| 매칭 상대 없음 (30초) | AI 대전으로 자동 전환 |

---

### F-ARENA-002 드래프트 Phase (60초)

**Before**

| 항목 | 값 |
|------|---|
| 현재 Phase | DRAFT |
| 타이머 | 60초 |
| 에이전트 풀 | 8개 표시 (해금 상태 포함) |
| Spec 정보 | 유저별 `user_agent_progress` 기반 해금 Spec 표시 |
| 상대 드래프트 | **비공개** |

**Action**

52. 화면: 8개 에이전트 풀 그리드 표시
    ```
    ⚔️ OFFENSE        🛡️ DEFENSE        🌐 CONTEXT
    📊 STRUCTURE ★★   💰 DERIV ★★★     🧠 SENTI ★
    📈 VPA ★          💎 VALUATION ★    🌍 MACRO ★★
    ⚡ ICT ★          🐋 FLOW ★★

    ★ = Base만 | ★★ = Spec A/B | ★★★ = Spec C
    ```

53. 사용자가 에이전트 3개를 선택 (클릭 → 선택됨 표시)
54. 선택된 각 에이전트에 대해:
    - Spec 선택 (해금된 것 중 드롭다운)
    - 가중치 슬라이더 조정
55. 가중치 합산 = 100% 강제 (슬라이더 자동 보정)
56. 60초 타이머 종료 전 '드래프트 제출' 클릭
57. 클라이언트: `POST /api/arena/match/{id}/draft`
    ```json
    {
      "draft": [
        { "agentId": "DERIV", "specId": "squeeze_hunter", "weight": 40 },
        { "agentId": "STRUCTURE", "specId": "trend_rider", "weight": 35 },
        { "agentId": "MACRO", "specId": "base", "weight": 25 }
      ]
    }
    ```
58. 서버: `arena_matches.user_a_draft` JSONB 저장
59. 서버: 양측 드래프트 완료 확인 → status='ANALYSIS'
60. 클라이언트: VS 스크린 애니메이션 (2초)

**After**

| 항목 | 기대 값 |
|------|--------|
| `arena_matches.user_a_draft` | 3 에이전트 + Spec + 가중치 JSONB |
| 가중치 합산 | 정확히 100 |
| Phase | ANALYSIS로 전환 |
| VS 스크린 | 양측 닉네임 + 선택 에이전트 아이콘 표시 |

**예외 분기**

| 조건 | 처리 |
|------|------|
| 60초 타이머 만료 (미제출) | 자동 드래프트: 최근 사용 조합 또는 STRUCTURE+DERIV+SENTI Base 기본 |
| 에이전트 3개 미만 선택 | 제출 버튼 비활성화 |
| 가중치 합산 ≠ 100 | 자동 보정 (마지막 에이전트에 나머지 배분) |
| 해금 안 된 Spec 선택 시도 | 해금 안 된 Spec은 목록에 표시되나 선택 불가 (자물쇠 아이콘) |
| 서버 에러 | 재시도 + toast |

**상태전이: 드래프트**

| From | 트리거 | To | 가드 |
|------|--------|-----|------|
| DRAFT | 양측 드래프트 제출 완료 | ANALYSIS | 가중치 합산=100, 에이전트 3개, 유효 Spec |
| DRAFT | 60초 타임아웃 | ANALYSIS | 자동 드래프트 적용 후 진행 |

---

### F-ARENA-003 분석 Phase (자동, ~5초)

**Before**

| 항목 | 값 |
|------|---|
| Phase | ANALYSIS |
| 입력 | 양측 드래프트 확정 |
| ⚠️ Oracle 접근 | **차단** (독립 판단 원칙) |

**Action — 에이전트 파이프라인 (각 에이전트별 병렬 실행)**

61. 서버: 매치의 양측 드래프트에서 사용된 에이전트 목록 추출
62. **각 에이전트에 대해 (병렬):**

    **Layer 1: Code — 팩터 계산 (결정론적)**

    63. `indicator_series` 테이블에서 해당 pair의 시계열 + 추세 데이터 읽기
    64. 에이전트별 6개 팩터 계산:
        ```
        STRUCTURE: EMA_TREND, RSI_TREND, RSI_DIVERGENCE, MTF_ALIGNMENT, PRICE_STRUCTURE, VOL_TREND
        VPA:       CVD_TREND, BUY_SELL_RATIO, VOL_PROFILE, ABSORPTION, VOL_DIVERGENCE, CLIMAX_SIGNAL
        ICT:       LIQUIDITY_POOL, FVG, ORDER_BLOCK, BOS_CHOCH, DISPLACEMENT, PREMIUM_DISCOUNT
        DERIV:     OI_PRICE_CONV, FR_TREND, LIQUIDATION_TREND, LS_RATIO_TREND, OI_DIVERGENCE, SQUEEZE_SIGNAL
        VALUATION: MVRV_ZONE, NUPL_TREND, SOPR_SIGNAL, CYCLE_POSITION, REALIZED_CAP_TREND, SUPPLY_PROFIT
        FLOW:      EXCHANGE_FLOW, WHALE_ACTIVITY, MINER_FLOW, STABLECOIN_FLOW, ACTIVE_ADDRESSES, ETF_FLOW
        SENTI:     FG_TREND, SOCIAL_VOLUME, SOCIAL_SENTIMENT, NEWS_IMPACT, SEARCH_TREND, CONTRARIAN_SIGNAL
        MACRO:     DXY_TREND, EQUITY_TREND, YIELD_TREND, BTC_DOMINANCE, STABLECOIN_MCAP, EVENT_PROXIMITY
        ```
    65. 추세 분석 실행: `analyzeTrend()` → direction, slope, acceleration, strength
    66. 다이버전스 감지: `detectDivergence()` → BULLISH_DIV / BEARISH_DIV / HIDDEN_*
    67. 멀티 타임프레임 정렬: `analyzeMultiTF()` → ALIGNED_BULL / ALIGNED_BEAR / CONFLICTING

    **Layer 1.5: RAG — 기억 검색**

    68. 현재 시장 상태를 임베딩 벡터로 변환 (`createMarketEmbedding()`)
    69. `search_memories(embedding, userId, agentId, limit=5)` — pgvector 코사인 유사도 검색
    70. 반환된 기억에서 패턴 추출: 승리 패턴, 실패 패턴, 제안

    **Layer 2: LLM — Spec별 해석 (비결정론적)**

    71. 선택된 Spec의 시스템 프롬프트 로드 (`getSpecPrompt(agentId, specId)`)
    72. 팩터 + 추세 + 다이버전스 + RAG 기억을 LLM 컨텍스트로 포맷
    73. LLM 호출 (Claude/GPT): direction + confidence + thesis 반환

    **Layer 3: Code — 가중치 합산 (결정론적)**

    74. Spec별 팩터 가중치 테이블 적용 (`getSpecWeights(agentId, specId)`)
    75. bullScore / bearScore 계산
    76. Code 스코어 + LLM 해석 블렌딩 → 최종 direction + confidence

77. **3 에이전트 가중 합산:**
    ```
    totalBull = Σ (agent.bullScore × draft.weight / 100)
    totalBear = Σ (agent.bearScore × draft.weight / 100)
    finalDirection = totalBull > totalBear ? 'LONG' : 'SHORT'
    finalConfidence = min(99, |totalBull - totalBear|)
    ```

78. 서버: `agent_analysis_results` 테이블에 에이전트별 분석 결과 INSERT
79. 서버: `arena_matches` status → 'HYPOTHESIS'
80. 클라이언트: 분석 결과 수신 (에이전트별 direction + confidence + thesis)

**After**

| 항목 | 기대 값 |
|------|--------|
| `agent_analysis_results` | 유저당 3 rows (에이전트별) |
| 에이전트 합산 결과 | direction + confidence 산출 |
| 화면 표시 | 에이전트별 분석 카드 + RAG 기억 요약 |
| Phase | HYPOTHESIS로 전환 |

**에이전트 분석 카드 표시 예시:**

```
💰 DERIV [Squeeze Hunter] .......... SHORT 78%
   "OI 13.2B↑ + FR 0.041% 과열 + 롱 청산 임박"
   [경험] 유사 5건 중 3건 SHORT 성공

📊 STRUCTURE [Trend Rider] .......... LONG 65%
   "EMA 정배열 + RSI 상승 추세 + MTF 정렬"
   [경험] 이 패턴에서 2/3 추세 지속

🌍 MACRO [Risk On/Off] .............. LONG 55%
   "DXY 하락 + S&P 강세 + Risk On 환경"
   [경험] 기억 없음 (신규)

━━ 가중 합산: LONG 52% (2/3 LONG, 1/3 SHORT) ━━
```

**예외 분기**

| 조건 | 처리 |
|------|------|
| indicator_series 데이터 부족 | 해당 팩터 NEUTRAL 처리, confidence 감소 |
| LLM 호출 실패 (타임아웃) | Code 스코어만으로 판단 (LLM thesis = "분석 불가") |
| LLM 호출 실패 (429 rate limit) | 큐 재시도 (최대 2회), 최종 실패 시 Code만 사용 |
| RAG 기억 0건 (신규 유저) | 기억 보강 스킵, 기본 분석만 |
| pgvector 검색 실패 | 기억 보강 스킵, 로그 기록 |

---

### F-ARENA-004 가설 Phase — Hypothesis (30초)

**Before**

| 항목 | 값 |
|------|---|
| Phase | HYPOTHESIS |
| 타이머 | 30초 |
| 에이전트 분석 결과 | 화면에 표시됨 |
| ⚠️ Oracle 접근 | **차단** (독립 판단 원칙) |
| Exit Optimizer | 추천 SL/TP 표시됨 |

**Action**

81. 유저에게 에이전트 분석 결과 전체 노출
82. Exit Optimizer 결과 표시:
    ```
    Conservative: SL $95,200 / TP $97,800 (R:R 1.5:1, EV +0.8%)
    Balanced:     SL $94,800 / TP $98,500 (R:R 2.0:1, EV +1.2%)
    Aggressive:   SL $94,000 / TP $99,500 (R:R 2.5:1, EV +1.5%)
    → 추천: Balanced
    ```
83. 사용자: 최종 방향 선택 — LONG / SHORT / '에이전트 판단 그대로'
84. 사용자: 신뢰도 입력 (1~5)
85. 사용자: 근거 태그 선택 (STRUCTURE / VPA / ICT / DERIVATIVES / VALUATION / FLOW / SENTIMENT / MACRO)
86. ⚠️ **에이전트 합의와 반대 방향 선택 시** → Override 경고 표시:
    ```
    ⚡ DISSENT — 에이전트 합의(LONG)와 다릅니다.
    맞으면: IDS 상승 + DISSENT WIN 보너스 LP
    틀리면: 일반 패배
    계속하시겠습니까? [확인] [취소]
    ```
87. SUBMIT 클릭
88. 클라이언트: `POST /api/arena/match/{id}/hypothesis`
    ```json
    {
      "direction": "SHORT",
      "confidence": 3,
      "reasonTags": ["DERIVATIVES", "LIQUIDATION"],
      "isOverride": true,
      "exitStrategy": "balanced",
      "slPrice": 94800,
      "tpPrice": 98500
    }
    ```
89. 서버: `arena_matches.user_a_prediction` 저장
90. **Passport 즉시 기록:**
    - `total_hypotheses` +1
    - `direction_total` +1 (LONG/SHORT인 경우)
    - `confidence_sum` += 입력값
    - isOverride=true면: `override_count` +1
    - 에이전트 합의 vs 유저 방향 비교 → DISSENT면 `dissent_count` +1
91. Phase → BATTLE

**After**

| 항목 | 기대 값 |
|------|--------|
| `user_a_prediction` | direction + confidence + override + exitStrategy |
| `user_passports` | total_hypotheses +1, direction_total +1 |
| override 기록 | isOverride → `override_count` +1 |
| DISSENT 기록 | 에이전트 합의 ≠ 유저 방향 → `dissent_count` +1 |
| Phase | BATTLE |

**예외 분기**

| 조건 | 처리 |
|------|------|
| 30초 타임아웃 (미입력) | 에이전트 합의 방향 자동 채택, confidence=1, override=false |
| SL/TP 미입력 | Exit Optimizer 추천값 자동 적용 |
| 방향 미선택 | SUBMIT 비활성화 |

---

### F-ARENA-005 배틀 Phase — Battle (실시간)

**Before**

| 항목 | 값 |
|------|---|
| Phase | BATTLE |
| entry_price | 매치 시작 시 현재가 |
| SL/TP | 유저 설정 또는 자동 |

**Action**

92. 실시간 가격 추적 시작 (WebSocket)
93. 10초 Decision Window × 6회:
    ```
    Window 1 (0~10초):  [BUY] [SELL] [HOLD] 선택
    Window 2 (10~20초): [BUY] [SELL] [HOLD] 선택
    ...
    Window 6 (50~60초): [BUY] [SELL] [HOLD] 선택
    ```
94. 각 Window에서:
    - DS (Decision Score) 실시간 계산: 방향 정확도 + 타이밍
    - RE (Risk/Execution) 실시간 계산: SL/TP 준수 여부
    - CI (Confidence Index) 계산: 유저 신뢰도 vs 실제 결과 캘리브레이션
95. FBS 바 실시간 표시: `FBS = 0.5×DS + 0.3×RE + 0.2×CI`
96. 60초 배틀 완료 → 24시간 추적 모드 전환
    ```
    실시간 PnL 표시
    SL/TP 도달 시 자동 종료
    수동 종료 가능
    ```
97. 24시간 후 (또는 SL/TP 도달 시) 최종 결과 확정

**After**

| 항목 | 기대 값 |
|------|--------|
| `arena_matches.entry_price` | 기록됨 |
| `arena_matches.exit_price` | 24시간 후 또는 SL/TP 도달가 |
| Decision Window 기록 | 6회 판단 이력 |
| Phase | RESULT |

---

### F-ARENA-006 결과 Phase — Result

**Before**

| 항목 | 값 |
|------|---|
| Phase | RESULT |
| 가격 변동 | entry → exit 확정 |
| 양측 예측 | 방향 + confidence 확정 |

**Action — FBS 계산 + 승패 결정**

98. DS 최종 계산:
    ```
    direction_correct: 방향 맞음 → base 60
    agent_alignment: 드래프트 조합이 시장 레짐에 맞음 → +10~20
    override_bonus: 유저 DISSENT가 맞음 → +15
    ```
99. RE 최종 계산:
    ```
    sl_compliance: SL 준수 → base 50
    tp_reached: TP 도달 → +20
    timing: Decision Window 최적 타이밍 → +30
    ```
100. CI 최종 계산:
     ```
     calibration: |confidence - actual_accuracy| 작을수록 높음
     consistency: 최근 10판 신뢰도 분산 작을수록 높음
     ```
101. FBS = 0.5×DS + 0.3×RE + 0.2×CI
102. 승패 결정: 양측 FBS 비교 → 높은 쪽 승리
103. 결과 타입 결정:
     ```
     normal_win:  일반 승리
     clutch_win:  FBS 80+ 또는 역전승
     draw:        FBS 차이 < 2
     ```

**Action — LP 보상**

104. LP 계산:
     ```
     승리 (normal)     → +11 LP
     승리 (clutch)     → +18 LP
     패배              → -8 LP
     무승부            → +2 LP

     보너스:
     Perfect Read (3/3 에이전트 정확)  → +3 LP
     DISSENT WIN (override + 맞음)     → +5 LP
     ```
105. `POST` lp_transactions: `{ userId, matchId, amount, reason, balance_after }`
106. `user_passports.lp_total` += LP변동

**Action — Passport 갱신 (포지션 종료 시점)**

107. 승패에 따라:
     ```
     win=true:  win_count +1, current_streak +1 (또는 리셋 후 +1)
     win=false: loss_count +1, current_streak = -1 (또는 리셋 후 -1)
     ```
108. 방향 정확 (H값 기준): `direction_correct` +1
109. DISSENT + WIN: `dissent_win_count` +1
110. GUARDIAN Override 수용/무시:
     ```
     override_offered +1 (GUARDIAN이 Override 제안한 경우)
     override_accepted +1 (유저가 수용한 경우)
     ```

**Action — 에이전트 통계 갱신**

111. 유저의 각 드래프트 에이전트에 대해:
     - `user_agent_progress.total_matches` +1
     - `user_agent_progress.wins` += (에이전트 방향이 맞았으면 1)
     - `user_agent_progress.last_10_results` 배열 업데이트
112. **Spec 해금 체크:** (→ F-SPEC-001 참조)
     - `total_matches >= 10` → Spec A/B 해금
     - `total_matches >= 30` → Spec C 해금
113. 글로벌 `agent_accuracy_stats` 갱신:
     - 각 에이전트+Spec의 `total_calls` +1
     - 방향 맞으면 `correct_calls` +1
     - `regime_stats` JSONB 업데이트

**Action — RAG 기억 저장** (→ F-RAG-001 참조)

114. 각 에이전트에 대해 `match_memories` INSERT
115. 임베딩 생성 + 시장 상태 + 판단 + 결과 + lesson (LLM 생성)

**Action — 화면 표시**

116. 결과 화면:
     ```
     🏆 YOU WIN!  BTC -2.3% in 24h

     에이전트 breakdown:
     💰 DERIV [Squeeze Hunter]: SHORT ✅ (맞음!)
     📊 STRUCTURE [Trend Rider]: LONG ❌ (틀림)
     🌍 MACRO [Risk On/Off]: LONG ❌ (틀림)

     당신: SHORT ✅  |  에이전트 합의: LONG ❌
     → ⚡ DISSENT WIN! 독립 판단 성공!

     FBS: 78 (DS:82 RE:71 CI:80)
     LP: +11 (승리) +5 (DISSENT) = +16 LP

     DERIV [Squeeze Hunter] 49전 29승 (59%)
     💡 Spec C [Contrarian] 해금까지 1전!
     ```
117. 결과 확인 후 Lobby로 복귀 또는 리플레이

**After**

| 항목 | 기대 값 |
|------|--------|
| `arena_matches` | winner_id, result_type, FBS, LP delta 기록 |
| `user_passports` | win/loss, LP, streak 갱신 |
| `user_agent_progress` | 각 에이전트 matches/wins 갱신 |
| `agent_accuracy_stats` | 글로벌 통계 갱신 |
| `match_memories` | RAG 기억 3건 (에이전트당 1건) 저장 |
| `lp_transactions` | LP 변동 이력 기록 |
| Spec 해금 | 조건 충족 시 `unlocked_specs` 배열 갱신 + 알림 |

**상태전이: 전체 매치 라이프사이클**

| Phase | 상태 | 진입 조건 | 지속 시간 | 다음 상태 |
|-------|------|----------|----------|----------|
| 1 | DRAFT | 매치 생성 | 60초 | ANALYSIS |
| 2 | ANALYSIS | 양측 드래프트 완료 | ~5초 (자동) | HYPOTHESIS |
| 3 | HYPOTHESIS | 분석 완료 | 30초 | BATTLE |
| 4 | BATTLE | 예측 제출 완료 | 60초 + 24h 추적 | RESULT |
| 5 | RESULT | 결과 확정 | 표시 후 종료 | (완료) |

---

### F-ARENA-007 리플레이

**Before**

| 항목 | 값 |
|------|---|
| 조건 | 과거 매치 record 존재 |
| 입력 | matchId 선택 |

**Action**

118. `GET /api/arena/match/{id}/result` — 전체 매치 데이터 로드
119. 드래프트 → 분석 → 결과 순서대로 재생
120. 에이전트 투표, thesis, 결과 UI 동일 재현

> ✓ 리플레이는 Passport/LP/RAG를 갱신하지 않음. 읽기 전용.

---

## CHAPTER 4. 패스포트 플로우 (F-PASS)

> **v3 전면 개편** — 6대 메트릭 + 에이전트 경험 섹션 + LP/티어

### F-PASS-001 통합 프로필 카드 (v3)

**데이터 로딩 흐름**

121. 페이지 진입: `GET /api/passport/me`
122. 서버: 집계 쿼리 실행
     - `user_passports`: 6대 메트릭 + LP + 티어 + 배지
     - `user_agent_progress`: 에이전트별 전적 + Spec 해금 상태
     - `match_memories`: 에이전트별 RAG 기억 건수
     - `arena_matches`: 최근 매치 히스토리
123. 서버: 전체 Passport 데이터 반환
124. 클라이언트: `passportStore` 갱신 → 프로필 카드 렌더

**표시 레이아웃:**

```
┌────────────────── TRADING PASSPORT ──────────────────────┐
│                                                           │
│  ◆ DIAMOND II          @CryptoKim                        │
│  Passport #0042 · 147판 · 2024-11-12 발급                │
│                                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  68%    │  │  72%    │  │  61%    │                  │
│  │  승률   │  │ 방향정확 │  │  IDS   │                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  -4.2   │  │  78%    │  │  65%    │                  │
│  │ 캘리브  │  │ GUARDIAN │  │Challenge│                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
│                                                           │
│  ┌─── 에이전트 경험 ───────────────────────────────────┐  │
│  │ DERIV: 48전 28승(58%) · Spec C 해금 · RAG 48건     │  │
│  │ STRUCTURE: 35전 22승(63%) · Spec A/B 해금 · RAG 35건│  │
│  │ MACRO: 12전 7승(58%) · Base만 · RAG 12건            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─── 배지 캐비닛 ──────────────────────────────────────┐  │
│  │ 🏆 SEASON 2 TOP10  🎯 PERFECT READ ×4              │  │
│  │ ⚡ DISSENT WIN ×12  🌙 NIGHT OWL                    │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

### F-PASS-002 6대 메트릭 계산

| 메트릭 | 공식 | 최소 표본 | 갱신 시점 |
|--------|------|----------|----------|
| **승률** | `win_count / (win+loss) × 100` | 10판 | 포지션 종료 |
| **방향 정확도** | `direction_correct / direction_total × 100` | 10판 | 결과 확정 |
| **IDS (독립 판단)** | `dissent_win / dissent_total × 100` | DISSENT 5판 | 포지션 종료 |
| **캘리브레이션** | `confidence_avg − direction_accuracy` | 10판 | 결과 확정 |
| **GUARDIAN 순종** | `override_accepted / override_offered × 100` | Override 3회 | APPROVE/REJECT |
| **Challenge 승률** | `challenge_win / challenge_total × 100` | Challenge 3회 | Challenge 판정 |

> 최소 표본 미달 시: 해당 메트릭 대신 "🔒 n/m판" 표시 (예: "🔒 2/10판")

---

### F-PASS-003 에이전트 경험 섹션

**데이터 구조:**

```typescript
interface PassportAgentStats {
  agentId: string;              // 'DERIV'
  totalMatches: number;         // 48
  wins: number;                 // 28
  winRate: number;              // 58.3
  unlockedSpecs: string[];      // ['base', 'squeeze_hunter', 'position_reader', 'contrarian']
  mostUsedSpec: string;         // 'squeeze_hunter'
  ragMemoryCount: number;       // 48
  bestComboWith: string[];      // ['STRUCTURE', 'MACRO']
  avgDraftWeight: number;       // 38.5
}
```

**Action**

125. `GET /api/passport/me/agents`
126. 서버: `user_agent_progress` + `match_memories` COUNT GROUP BY agent_id
127. 에이전트 경험 리스트 렌더: 매치 수, 승률, 해금 Spec, RAG 건수, 최고 콤보

---

### F-PASS-004 탭 전환 + 상태 영속화

**탭 목록 (v3)**

| 탭 | 표시 내용 | 저장 키 |
|---|---------|--------|
| overview | 프로필 카드 + 6대 메트릭 + 에이전트 경험 | `passportActiveTab: 'overview'` |
| agents | 에이전트별 상세 (전적, Spec, RAG 기억 목록) | `passportActiveTab: 'agents'` |
| history | 매치 히스토리 (드래프트, 결과, LP 변동) | `passportActiveTab: 'history'` |
| positions | 오픈 퀵트레이드 + 추적 시그널 | `passportActiveTab: 'positions'` |
| badges | 배지 캐비닛 + 해금 조건 | `passportActiveTab: 'badges'` |
| settings | 프로필 편집, 공개 범위 설정 | `passportActiveTab: 'settings'` |

128. 탭 클릭 → `passportStore.activeTab` 갱신
129. 디바운스 500ms 후 `PUT /api/ui-state { passportActiveTab }`
130. 재진입 시 `GET /api/ui-state` → 탭 복원

---

### F-PASS-005 공개 범위

**Action — 타인 Passport 열람**

131. `GET /api/passport/{userId}` — 공개 범위 적용
132. 서버: 요청자와 대상의 관계 확인 (본인/팔로워/Creator/외부인)

| 뷰 | 공개 항목 |
|----|---------|
| 본인 | 전체 (모든 메트릭 + 에이전트 경험 + 히스토리 + worst_pnl) |
| 팔로워 | 승률 + 방향 정확도 + IDS만 |
| Creator | 위 + 캘리브레이션 추가 |
| 비공개 | worst_pnl, 연속 손실 최고, GUARDIAN 무시 후 손실률 |

---

### F-PASS-006 프로필 편집

133. 아바타 이미지 선택
134. 닉네임 입력 (1~20자)
135. `PATCH /api/profile { nickname?, avatarUrl? }`
136. 서버: `users` 테이블 갱신
137. 클라이언트: `passportStore.profile` 즉시 반영

---

### F-PASS-007 기록 트리거 타이밍 정리

#### SUBMIT 시점 (가설 제출 즉시)

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| 방향 제출 | `total_hypotheses` | +1 |
| LONG 또는 SHORT | `direction_total` | +1 |
| 신뢰도 입력 | `confidence_sum` | += 입력값 |
| 드래프트 정보 | `draft_history` | JSONB append |

#### APPROVE / REJECT 시점

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| APPROVE 선택 | `total_approved` | +1 |
| REJECT 선택 | `total_rejected` | +1 (이후 갱신 없음) |
| 합의 (3/3) | `consensus_count` | +1 |
| 이견 (2/3 이하) | `dissent_count` | +1 |
| 유저 Override | `override_count` | +1 |

#### 포지션 종료 시점

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| 수익 마감 | `win_count` + `total_pnl_bps` | +1 / 누적 |
| 손실 마감 | `loss_count` + `total_pnl_bps` | +1 / 누적 |
| 방향 정확 | `direction_correct` | +1 |
| DISSENT + WIN | `dissent_win_count` | +1 |
| 에이전트별 | `user_agent_progress.wins` | +1 |
| Spec 해금 체크 | `unlocked_specs` | 조건 시 추가 |
| RAG 기억 | `match_memories` | INSERT |
| LP 변동 | `lp_transactions` | INSERT |

#### 일배치 (00:05 UTC)

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| Oracle 갱신 | `agent_accuracy_stats` | 전체 재계산 |
| Passport 파생 지표 | `win_rate`, `calibration` 등 | 파생 재계산 |
| 글로벌 스냅샷 | `agent_performance_snapshots` | 스냅샷 |

---

## CHAPTER 5. 오라클 / 챌린지 / LIVE 플로우 (F-ENGAGE)

> **v3 신규** — Oracle 8×4 리더보드 + Challenge + LIVE 관전

### F-ENGAGE-001 Oracle 리더보드

**Before**

| 항목 | 값 |
|------|---|
| 데이터 소스 | `agent_accuracy_stats` (00:05 UTC 배치 기준) |
| 기본 필터 | 30d / accuracy 정렬 |
| ⚠️ 접근 제한 | **hypothesis Phase 중 접근 차단** |

**Action**

138. `GET /api/oracle/leaderboard?period=30d&sort=accuracy`
139. 서버: `agent_accuracy_stats` 조회 → Wilson Score 보정 → 정렬
140. 리더보드 렌더 (8 에이전트 × 4 Spec = 최대 32행):
     ```
     Oracle 리더보드 (30일):
     1. FLOW [Smart Money]      — 74% (289건) — BTC 최강
     2. DERIV [Squeeze Hunter]  — 72% (341건) — ALT 최강
     3. STRUCTURE [Trend Rider] — 71% (312건) — BTC 최강
     ...
     ```
141. 필터 변경: 기간 (7d/30d/all), 정렬 (accuracy/sample/confidence)
142. 에이전트 Row 클릭 → 상세 화면

**에이전트 상세:**

143. `GET /api/oracle/agents/{id}/profile?specId=squeeze_hunter`
144. 표시:
     - 코인별 적중률
     - 최근 판단 이력 (날짜/코인/방향/Confidence/결과)
     - 시장 레짐별 성과 (trending_up, trending_down, ranging, volatile)
     - 30일 추이 스파크라인
145. 'Challenge' 버튼 활성화 (Gold+ 유저만)

**상태전이: Oracle 접근**

| From | 트리거 | To | 가드 |
|------|--------|-----|------|
| hypothesis Phase 중 | Oracle 탭 클릭 | **접근 차단 (비활성)** | 독립 판단 원칙 |
| hypothesis Phase 외 | Oracle 탭 클릭 | Oracle 화면 표시 | — |

---

### F-ENGAGE-002 Challenge 제출

**Before**

| 항목 | 값 |
|------|---|
| 유저 티어 | Gold 이상 (P3+) |
| 해당 에이전트 사용 경험 | 10전 이상 |
| Challenge 대상 | 에이전트+Spec의 최근 활성 판단 |

**Action**

146. Oracle 상세에서 'Challenge' 버튼 클릭
147. Challenge 폼:
     - 에이전트 최근 판단 표시: "DERIV [Squeeze Hunter]: SHORT 72%"
     - 유저 반박 방향: LONG (에이전트의 반대)
     - 근거 태그: 1개 이상 선택
     - 근거 텍스트: 선택 (최대 280자)
148. `POST /api/agents/{id}/challenge`
     ```json
     {
       "agentId": "DERIV",
       "specId": "squeeze_hunter",
       "pair": "BTCUSDT",
       "userDirection": "LONG",
       "agentDirection": "SHORT",
       "reasonTags": ["FLOW", "WHALE"],
       "reasonText": "고래 매수세가 파생 압력 압도"
     }
     ```
149. 서버: `agent_challenges` INSERT
150. 서버: 활성 매치와 연결 (해당 pair의 가장 최근 매치)
151. 결과: 매치 결과 확정 시 자동 판정
     ```
     실제 가격이 LONG 방향 → 유저 WIN
     실제 가격이 SHORT 방향 → 에이전트 WIN
     ```

**After — Challenge 판정 시**

152. Challenge WIN:
     - `lp_transactions`: +7 LP
     - `user_passports.challenge_win` +1
     - `user_passports.challenge_total` +1
153. Challenge LOSS:
     - `lp_transactions`: -4 LP
     - `user_passports.challenge_total` +1

**예외 분기**

| 조건 | 처리 |
|------|------|
| Gold 미달 | Challenge 버튼 비활성 ("Gold 이상에서 가능") |
| 해당 에이전트 10전 미만 | Challenge 버튼 비활성 ("10전 이상 필요") |
| 같은 판단에 이미 Challenge | 409 — "이미 도전 중" |

---

### F-ENGAGE-003 LIVE 관전 시작 (Creator 시점)

**Before**

| 항목 | 값 |
|------|---|
| 유저 티어 | Diamond+ (LP 1200+) |
| 매치 수 | 50전 이상 |
| 공개 설정 | `live_enabled = true` |

**Action — LIVE 세션 생성**

154. 매치 HYPOTHESIS Phase 진입 시 LIVE 토글 활성화
155. 유저가 LIVE 토글 ON
156. `POST /api/live/sessions/{matchId}/start`
157. 서버: `live_sessions` INSERT (`stage='HYPOTHESIS_SUBMITTED'`)
158. SSE 스트림 개시 (`GET /api/live/sessions/{id}/stream`)

**Action — LIVE 타임라인 이벤트 전송**

159. 각 Phase 전환 시 SSE 이벤트 발행:
     ```
     HYPOTHESIS_SUBMITTED → 가설 방향 + 신뢰도
     ANALYSIS_RUNNING     → "에이전트 분석 중..." + 완료 에이전트 목록
     ANALYSIS_COMPLETE    → Entry Score (confidence)
     POSITION_OPEN        → 오픈 가격
     PNL_UPDATE           → 현재 PnL (10초 주기)
     RESULT_SHOWN         → 승패 + LP + 에이전트 방향 공개
     ```
160. ⚠️ **에이전트 방향은 RESULT_SHOWN 단계에서만 공개** (독립 판단 보호)

**After**

| 항목 | 기대 값 |
|------|--------|
| `live_sessions` | stage 순서대로 업데이트 |
| SSE 스트림 | 팔로워에게 실시간 전송 |
| 에이전트 방향 | 결과 확정 후에만 노출 |

---

### F-ENGAGE-004 LIVE 관전 (팔로워 시점)

**Action**

161. `GET /api/live/sessions/active` — 진행 중 세션 목록
162. 세션 선택 → `GET /api/live/sessions/{id}/stream` SSE 연결
163. 타임라인 읽기 전용 표시:
     ```
     14:32 📊 가설 제출: ▲ LONG — 신뢰도 4/5
     14:32 🤖 에이전트 분석 시작 (DERIV 완료, STRUCTURE 진행 중...)
     14:33 ✅ 전체 분석 완료: Entry Score 74
     14:33 📋 ✓ APPROVE
     14:35 📈 포지션 오픈: $96,420
     14:48 ⚡ 중간 업데이트: +1.2%
     15:10 🏁 종료: +2.3% WIN
     ```
164. 리액션 전송: `POST /api/live/sessions/{id}/react { emoji }`
     - 허용 이모지: 🔥🧊🤔⚡💀
165. ⚠️ 팔로워 = 읽기 전용:
     - Creator에게 영향 주는 행동 금지
     - 댓글: 판 종료 후에만 활성화

---

## CHAPTER 6. LP / 티어 플로우 (F-LP)

> **v3 신규** — LP 적립/차감 + 티어 자동 전환

### F-LP-001 LP 변동

**LP 보상 테이블:**

| 이벤트 | LP 변동 |
|--------|--------|
| 승리 (일반, normal_win) | +11 |
| 승리 (클러치, clutch_win) | +18 |
| 패배 (일반) | -8 |
| 패배 (연패 완화, 7연패+) | -5 |
| 무승부 | +2 |
| Perfect Read (3/3 정확) | +3 보너스 |
| DISSENT WIN | +5 보너스 |
| Challenge WIN | +7 |
| Challenge LOSS | -4 |

**Action — LP 적립/차감**

166. 매치 결과 확정 시 (F-ARENA-006 참조):
     - LP 계산: `base_lp + bonus_lp`
     - `INSERT INTO lp_transactions (user_id, match_id, amount, reason, balance_after)`
     - `UPDATE user_passports SET lp_total = lp_total + amount`
167. Challenge 판정 시:
     - `INSERT INTO lp_transactions (user_id, match_id, amount, reason, balance_after)`

---

### F-LP-002 티어 자동 전환

**티어 테이블:**

| 티어 | LP 범위 | 해금 기능 |
|------|--------|----------|
| **Bronze** | 0-199 | 8 에이전트 풀 (Base), Loop B |
| **Silver** | 200-599 | 멀티 포지션, Loop D |
| **Gold** | 600-1,199 | Oracle, Challenge, Spec C 가능 |
| **Diamond I** | 1,200-1,599 | LIVE, Season 랭킹, 팀 매치 |
| **Diamond II** | 1,600-1,999 | Creator 프로필 |
| **Diamond III** | 2,000-2,199 | Coach Review |
| **Master** | 2,200+ | Strategy NFT, RAG 리뷰, 전체 해금 |

**Action — 티어 체크**

168. LP 변동 후 티어 재계산:
     ```typescript
     function calculateTier(lp: number): { tier: string; level: number } {
       if (lp >= 2200) return { tier: 'MASTER', level: 1 };
       if (lp >= 2000) return { tier: 'DIAMOND', level: 3 };
       if (lp >= 1600) return { tier: 'DIAMOND', level: 2 };
       if (lp >= 1200) return { tier: 'DIAMOND', level: 1 };
       if (lp >= 600)  return { tier: 'GOLD', level: 1 };
       if (lp >= 200)  return { tier: 'SILVER', level: 1 };
       return { tier: 'BRONZE', level: 1 };
     }
     ```
169. 티어 변경 시:
     - `user_passports.tier` + `tier_level` 갱신
     - 승급: 축하 팝업 + 해금 기능 안내
     - 강등: 알림 ("LP가 부족하여 Silver로 변경됩니다")

**상태전이: 티어**

| From | 조건 | To | 효과 |
|------|------|-----|------|
| Bronze | LP >= 200 | Silver | 멀티 포지션 + Loop D 해금 |
| Silver | LP >= 600 | Gold | Oracle + Challenge 해금 |
| Gold | LP >= 1200 | Diamond I | LIVE 해금 |
| Diamond I | LP < 1200 | Gold | LIVE 비활성화 |
| 모든 티어 | LP 감소 | 하위 티어 | 해당 기능 잠금 |

> ⚠️ 강등 보호: LP가 정확히 티어 경계에서 -8 패배 시, 3판 유예기간 (경계 LP까지만 감소)

---

### F-LP-003 LP 히스토리 조회

170. `GET /api/lp/me` → LP 잔액 + 최근 50건 이력
171. `GET /api/lp/ladder` → 전체 티어별 LP 기준

---

## CHAPTER 7. RAG 기억 시스템 플로우 (F-RAG)

> **v3 신규** — 유저별 에이전트 기억 저장/검색/보강/삭제

### F-RAG-001 기억 저장 (매 매치 종료 시)

**Before**

| 항목 | 값 |
|------|---|
| 매치 | RESULT Phase 완료 |
| 에이전트 분석 결과 | `agent_analysis_results`에 기록됨 |
| 시장 상태 | `indicator_series` 현재 스냅샷 |

**Action**

172. 매치 종료 시 각 드래프트 에이전트에 대해:
173. 현재 시장 상태를 임베딩 벡터로 변환:
     ```typescript
     // 옵션 1: 수치 정규화 (비용 0)
     const embedding = createMarketEmbedding(indicators);
     // [rsi_value_norm, rsi_slope_norm, rsi_accel_norm, oi_value_norm, ...]
     // → 256d 벡터 (패딩)

     // 옵션 2: LLM 임베딩 (더 정확)
     const embedding = await createLLMEmbedding(marketStateText);
     // text-embedding-3-small → 256d
     ```
174. LLM으로 "교훈 (lesson)" 자동 생성:
     ```
     "OI 과열 + FR 극단 → 청산 캐스케이드 발생, SHORT 성공.
      단, FLOW 신호(고래 매수)와 충돌 시 실패 위험."
     ```
175. `INSERT INTO match_memories`:
     ```json
     {
       "user_id": "user123",
       "agent_id": "DERIV",
       "spec_id": "squeeze_hunter",
       "pair": "BTCUSDT",
       "match_id": "match456",
       "market_state": { "rsi": {"value": 72, "trend": "RISING"}, ... },
       "market_regime": "trending_up",
       "direction": "SHORT",
       "confidence": 78,
       "factors": [...],
       "thesis": "OI 과열 + FR 극단 → 청산 캐스케이드 예상",
       "outcome": true,
       "price_change": -2.3,
       "lesson": "OI+FR 과열 패턴 = SHORT 유효. 고래 매수 동반 시 주의.",
       "embedding": [0.12, -0.34, ...],  // 256d
       "is_active": true
     }
     ```

**After**

| 항목 | 기대 값 |
|------|--------|
| `match_memories` | 에이전트당 1건 INSERT (총 3건/매치) |
| `embedding` | 256d pgvector 저장 |
| `is_active` | true (유저가 삭제 전까지) |

---

### F-RAG-002 기억 검색 (매 매치 ANALYSIS 시)

**Action** (F-ARENA-003 Step 68-70에서 호출)

176. 현재 시장 상태 임베딩 생성
177. pgvector 코사인 유사도 검색:
     ```sql
     SELECT * FROM match_memories
     WHERE user_id = $1
       AND agent_id = $2
       AND is_active = true
     ORDER BY embedding <=> $current_embedding
     LIMIT 5;
     ```
178. 반환된 기억 분석:
     - 승리 패턴 추출: `wins.filter(m => m.outcome)`
     - 실패 패턴 추출: `losses.filter(m => !m.outcome)`
     - 제안 생성: "FLOW와 함께 쓰면 이 실패 방지 가능"
179. 기억을 에이전트 분석에 주입:
     ```
     thesis += "\n[경험] 유사 5건 중 3건 성공. 실패 패턴: 고래 매수 동반"
     ```

---

### F-RAG-003 기억 리뷰 + 삭제 (P5 Master)

**Before**

| 항목 | 값 |
|------|---|
| 유저 티어 | Master (LP 2200+) |
| 접근 | Passport > Agents > RAG 기억 탭 |

**Action**

180. `GET /api/arena/agents/{id}/memories?limit=50`
181. 기억 목록 표시: 날짜, 시장 상태, 판단, 결과, 교훈
182. 유저가 개별 기억에서 '삭제' 클릭
183. `DELETE /api/arena/agents/{id}/memories/{memoryId}`
184. 서버: `match_memories.is_active = false` (soft delete)
185. 삭제된 기억은 이후 검색에서 제외

> ⚠️ P5 Master만 삭제 가능. 삭제 = "이건 더 이상 유효하지 않다" 판단.
> 잘못된 기억 삭제 = 메타 전략의 일부.

---

## CHAPTER 8. Spec 해금 플로우 (F-SPEC)

> **v3 신규** — 에이전트별 Spec 해금 + 선택 + 가중치 변경

### F-SPEC-001 Spec 해금 체크

**해금 조건:**

| Spec | 해금 조건 | 타입 |
|------|----------|------|
| Base | 처음부터 사용 가능 | 균형형 |
| Spec A | 해당 에이전트 10전 | 사이드그레이드 |
| Spec B | 해당 에이전트 10전 (A와 동시) | 사이드그레이드 |
| Spec C | 해당 에이전트 30전 | 사이드그레이드 |

> ⚠️ Spec C > Spec A가 **아님**. 시장 상황에 따라 유불리 다름.

**Action — 매치 종료 시 해금 체크**

186. F-ARENA-006 Step 112에서:
     ```typescript
     async function checkSpecUnlock(userId: string, agentId: string) {
       const progress = await getAgentProgress(userId, agentId);
       const newSpecs: string[] = [];

       if (progress.total_matches >= 10) {
         if (!progress.unlocked_specs.includes('a')) {
           newSpecs.push('a', 'b');  // A와 B 동시 해금
         }
       }
       if (progress.total_matches >= 30) {
         if (!progress.unlocked_specs.includes('c')) {
           newSpecs.push('c');
         }
       }

       if (newSpecs.length > 0) {
         await updateUnlockedSpecs(userId, agentId, newSpecs);
         return { unlocked: true, newSpecs };
       }
       return { unlocked: false };
     }
     ```
187. 해금 발생 시:
     - `user_agent_progress.unlocked_specs` 배열 업데이트
     - Result 화면에 해금 알림 팝업:
       ```
       🎉 새로운 Spec 해금!
       DERIV [Squeeze Hunter] + [Position Reader] 사용 가능!

       Squeeze Hunter: 청산 캐스케이드 전문가
       → FR 과열 + OI 집중 상황에서 강점
       → 추세 지속 상황에서 약점

       Position Reader: 포지션 구조 분석가
       → 포지션 축적/해소 감지에 강점
       → 급변 상황에서 약점
       ```

---

### F-SPEC-002 Spec 선택 (드래프트 시)

**Action** (F-ARENA-002 Step 54에서)

188. 에이전트 선택 후 Spec 드롭다운 표시:
     ```
     DERIV Spec 선택:
     ☑ Base (균형 파생 분석)
     ☑ Squeeze Hunter (청산 캐스케이드) — 10전 해금됨
     ☑ Position Reader (OI 구조) — 10전 해금됨
     ☑ Contrarian (과열 역이용) — 30전 해금됨
     ```
189. 해금 안 된 Spec: 자물쇠 아이콘 + "n전 더 필요" 표시
190. Spec 선택 시 → 해당 Spec의 팩터 가중치 프리뷰 표시:
     ```
     Squeeze Hunter 가중치:
     ████████░░ FR_TREND (30%)
     █████████░ SQUEEZE_SIGNAL (35%)
     ███░░░░░░░ OI_PRICE_CONV (10%)
     ...
     ```

---

### F-SPEC-003 전체 Spec 맵

| Agent | Base | Spec A (10전) | Spec B (10전) | Spec C (30전) |
|-------|------|---------------|---------------|---------------|
| **STRUCTURE** | 균형 차트 분석 | Trend Rider (기울기+MTF) | Structure Mapper (HH/HL 구조) | Reversal Catcher (다이버전스 역전) |
| **VPA** | 균형 볼륨 분석 | Volume Surge (이상 거래량) | Absorption Reader (흡수 패턴) | Climax Detector (볼륨 클라이맥스) |
| **ICT** | 균형 ICT 분석 | Liquidity Raider (스탑헌팅) | Fair Value Sniper (FVG 되돌림) | Market Maker Model (축적/분배) |
| **DERIV** | 균형 파생 분석 | Squeeze Hunter (청산 캐스케이드) | Position Reader (OI 구조) | Contrarian (과열 역이용) |
| **VALUATION** | 균형 밸류 분석 | Cycle Timer (대주기 고/저점) | Profit Tracker (실현손익 흐름) | Fair Value Band (적정가 이탈) |
| **FLOW** | 균형 온체인 분석 | Whale Follower (고래 추종) | Exchange Flow (거래소 유출입) | Smart Money (고수익 지갑) |
| **SENTI** | 균형 센티먼트 | Crowd Reader (소셜 추종) | Fear Buyer (공포 역발상) | Narrative Tracker (뉴스 모멘텀) |
| **MACRO** | 균형 매크로 | Risk On/Off (위험선호도) | Liquidity Cycle (글로벌 유동성) | Event Trader (FOMC/CPI 이벤트) |

---

## CHAPTER 9. 전체 상태 저장 / 동기화 패턴

> v1.0 패턴 유지 + v3 신규 Store/키 추가

### 9.1 localStorage 키 역할 정의 (v3)

| localStorage 키 | 저장 내용 | 갱신 트리거 |
|-----------------|---------|-----------|
| `stockclaw_state` | 앱 전역 상태 (pair, phase 등) | store 변경 시 |
| `stockclaw_wallet` | 지갑 주소/연결 상태 | 인증 성공/로그아웃 |
| `stockclaw_profile` | 사용자 프로필 캐시 | 로그인/프로필 수정 |
| `stockclaw_match_history` | 과거 Arena 매치 기록 | result Phase 완료 |
| `stockclaw_quicktrades` | 퀵트레이드 목록/상태 | open/close 액션 |
| `stockclaw_tracked` | 추적 시그널 목록 | Track/convert 액션 |
| `stockclaw_pnl` | 누적 PnL 데이터 | 포지션 종료 시 |
| `stockclaw_signals` | 시그널 허브 데이터 | signals 페이지 진입 |
| `stockclaw_community` | 커뮤니티 포스트 캐시 | posts API 응답 |
| **`stockclaw_passport`** | Passport 메트릭 캐시 (v3) | 매치 결과/일배치 |
| **`stockclaw_agents`** | 에이전트 진행도 + Spec 해금 (v3) | 매치 결과/Spec 해금 |
| **`stockclaw_draft`** | 최근 드래프트 조합 캐시 (v3) | 드래프트 제출 시 |
| **`stockclaw_lp`** | LP 잔액 + 티어 캐시 (v3) | LP 변동 시 |

---

### 9.2 Svelte Store 목록 (v3)

| Store | 파일 | 역할 |
|-------|------|------|
| `matchStore` | `src/lib/stores/matchStore.ts` | 현재 매치 상태, Phase, 드래프트 |
| `passportStore` | `src/lib/stores/passportStore.ts` | 6대 메트릭, LP, 티어, 배지 |
| `agentStore` | `src/lib/stores/agentStore.ts` | 에이전트 풀, 해금 상태, Spec |
| `draftStore` | `src/lib/stores/draftStore.ts` | 현재 드래프트 선택/가중치 |
| `liveStore` | `src/lib/stores/liveStore.ts` | LIVE 세션 상태, SSE 연결 |
| `oracleStore` | `src/lib/stores/oracleStore.ts` | 리더보드 캐시, 필터 상태 |
| (기존 stores) | | currentPair, quicktrades, tracked 등 유지 |

---

### 9.3 낙관적 업데이트 + 서버 동기화 패턴

**원칙: 로컬 즉시 반영 → API 호출 → 성공 시 ID 교체, 실패 시 롤백**

| 단계 | 동작 | 타이밍 |
|------|------|--------|
| 1. 로컬 반영 | store에 임시 ID로 새 항목 추가 | 즉시 (<1ms) |
| 2. API 호출 | POST/PUT 요청 전송 | 즉시 비동기 |
| 3. ID 교체 | 서버 응답의 실제 ID로 교체 | 응답 수신 후 |
| 4. 실패 롤백 | 임시 항목 삭제 + 에러 toast | API 오류 시 |

**v3 추가 패턴 — 매치 상태 동기화:**

```
matchStore 갱신 흐름:
1. Draft 제출 → matchStore.phase = 'ANALYSIS' (즉시)
2. 서버 분석 완료 → SSE로 결과 수신 → matchStore.analysis 갱신
3. Hypothesis 제출 → matchStore.phase = 'BATTLE' (즉시)
4. 가격 업데이트 → WebSocket → matchStore.currentPrice (실시간)
5. 결과 확정 → matchStore.result 갱신 → passportStore + agentStore 연쇄 갱신
```

---

### 9.4 가격 업데이트 주기

| 컴포넌트 | 방식 | 주기 |
|---------|------|------|
| Header mini ticker | WebSocket + 1초 배치 | 실시간 (1초) |
| Terminal 시장가 | `updateAllPrices` 폴링 | 30초 |
| LivePanel 가격 | 주기 폴링 | 3초 |
| Binance Kline WS | WebSocket 구독 | 캔들 생성 즉시 |
| **Arena Battle 가격** | WebSocket 실시간 | 1초 (배틀 중) |
| **LIVE 관전 PnL** | SSE 스트림 | 10초 |

---

### 9.5 데이터 수집 주기 (Snapshot Collector)

| 지표 | 수집 주기 | 시계열 길이 | TF | 에이전트 |
|------|----------|-----------|-----|---------|
| Klines (OHLCV) | 30초 | 200봉 | 1h, 4h, 1d | STRUCTURE, VPA, ICT |
| EMA 7/25/99 | kline 갱신 | 200 | 1h, 4h, 1d | STRUCTURE |
| RSI 14 | kline 갱신 | 200 | 1h, 4h, 1d | STRUCTURE |
| ATR 14 | kline 갱신 | 200 | 4h | Exit Optimizer |
| MACD | kline 갱신 | 200 | 4h | STRUCTURE |
| OBV / CVD | kline 갱신 | 200 | 4h | VPA |
| OI | 1분 | 200 | 5m | DERIV |
| Funding Rate | 8시간 | 100 | 8h | DERIV |
| LS Ratio | 1분 | 200 | 5m | DERIV |
| Liquidations | 1분 | 200 | 5m | DERIV |
| Fear & Greed | 1시간 | 30일 | 1d | SENTI |
| BTC Dominance | 5분 | 200 | 4h | MACRO |
| DXY | 5분 | 200 | 4h | MACRO |
| S&P500 | 5분 (장중) | 200 | 4h | MACRO |
| US10Y | 5분 (장중) | 200 | 4h | MACRO |
| Stablecoin Mcap | 1시간 | 200 | 1d | MACRO |
| MVRV / NUPL | 1시간 | 200 | 1d | VALUATION |
| Exchange Flows | 5분 | 200 | 4h | FLOW |
| Whale Txns | 1분 | 200 | 1h | FLOW |
| Social Volume | 1시간 | 200 | 4h | SENTI |

---

### 9.6 설정 동기화

| 설정 키 | 설명 | 기본값 |
|--------|------|--------|
| timeframe | 차트 시간봉 | 1h |
| source | 데이터 소스 | binance |
| speed | Arena Phase 속도 | 1 |
| chartTheme | 차트 테마 | dark |
| language | 언어 | ko |
| signals | 시그널 알림 | true |
| sfx | 사운드 효과 | true |
| **liveEnabled** | LIVE 관전 공개 (v3) | false |
| **defaultDraft** | 기본 드래프트 조합 (v3) | null |
| **notificationLevel** | 알림 등급 필터 (v3) | 'HIGH' |

191. 설정 변경 → Svelte store 즉시 반영
192. 디바운스 250~500ms 후 `PUT /api/preferences { key: value }`
193. 재진입 시 `GET /api/preferences` → store 초기화

---

### 9.7 전체 데이터 초기화

194. 사용자: 설정 > '전체 초기화' 버튼
195. 클라이언트: 모든 `stockclaw_*` localStorage 키 삭제
196. `window.location.reload()` 실행
197. 앱이 기본값 상태로 재시작
198. 서버 DB 데이터(matches, passports, memories, lp 등) 유지됨
199. 다음 접속 시 `GET /api/passport/me` + `GET /api/arena/match/history`로 서버 데이터 재 hydrate

---

## 부록 A. 알림 UX (Direction 4 원칙)

### 4등급 알림 체계

| 등급 | 표시 방식 | 트리거 |
|------|---------|--------|
| **CRITICAL** | 풀스크린 오버레이 (닫기 버튼) | 캐스케이드 청산 $50M+, RSI 90+, 포지션 SL 5% 이내 |
| **HIGH** | Tray + 아이콘 빨간 점 | SCANNER A-Grade, MSS 감지, 고래 $10M+ |
| **MEDIUM** | Tray만 (아이콘 변화 없음) | Condition 충족, B~C급 |
| **LOW** | /scanner 피드에만 | 정기 보고, Light Score 갱신 |

### ⚠️ 절대 원칙 (Direction 4)

```
1. 알림 텍스트에 LONG/SHORT 포함 금지
2. 가설 입력 전 에이전트 방향 노출 금지
3. 가설 입력 중 Oracle 접근 차단
4. LIVE 관전에서 에이전트 방향은 Creator 결과 확인 후에만 노출
```

### Intent Modal 흐름

```
Tray [분석 시작] 클릭
→ Step 1: 코인명 + 강도 (방향 절대 노출 안 함)
→ Step 2: 에이전트 3개 드래프트 (60초)
→ Step 3: 가설 입력 (방향 + 신뢰도 + 태그)
→ SUBMIT (에이전트 분석 시작)
→ Step 4: 분석 결과 공개 — 이 시점부터 방향 공개
→ APPROVE / REJECT
→ Passport 기록 갱신
```

---

## 부록 B. API 엔드포인트 전체 목록

### 인증
- `POST /api/auth/nonce` — nonce 발급
- `POST /api/auth/verify-wallet` — 지갑 서명 검증
- `POST /api/auth/register` — 이메일 회원가입 (v3: Passport+Agent 초기화 포함)

### 터미널
- `GET /api/binance/klines` — Kline 데이터
- `POST /api/signals/track` — 시그널 Track
- `POST /api/signals/{id}/convert` — Track → Trade
- `POST /api/quick-trades/open` — 퀵트레이드 오픈
- `POST /api/quick-trades/{id}/close` — 퀵트레이드 종료
- `POST /api/copy-trades/publish` — 카피트레이드

### 데이터 수집
- `POST /api/market/snapshot` — cron, 시계열 append + 추세 계산

### 매치
- `POST /api/arena/match/create` — 매치 생성
- `POST /api/arena/match/{id}/draft` — 드래프트 제출
- `POST /api/arena/match/{id}/analyze` — 에이전트 분석 실행
- `POST /api/arena/match/{id}/hypothesis` — 가설 제출
- `GET /api/arena/match/{id}/battle` — 배틀 상태 (SSE)
- `GET /api/arena/match/{id}/result` — 매치 결과

### 에이전트
- `GET /api/arena/agents` — 에이전트 풀 + 해금 상태
- `GET /api/arena/agents/{id}/specs` — Spec 목록 + 해금
- `GET /api/arena/agents/{id}/stats` — 글로벌 통계
- `GET /api/arena/agents/{id}/memories` — RAG 기억 목록
- `DELETE /api/arena/agents/{id}/memories/{memId}` — 기억 삭제 (Master)

### Oracle
- `GET /api/oracle/leaderboard` — 에이전트+Spec 리더보드
- `GET /api/oracle/agents/{id}/profile` — 에이전트 상세

### Challenge
- `POST /api/agents/{id}/challenge` — Challenge 제출
- `GET /api/challenges/me` — 내 Challenge 히스토리

### Passport
- `GET /api/passport/me` — 내 Passport 전체
- `GET /api/passport/{userId}` — 타인 Passport (공개 범위)
- `GET /api/passport/me/agents` — 에이전트별 경험 통계
- `GET /api/passport/me/history` — 매치 히스토리

### LIVE
- `POST /api/live/sessions/{matchId}/start` — LIVE 시작
- `GET /api/live/sessions/{id}/stream` — SSE 스트림
- `POST /api/live/sessions/{id}/react` — 리액션
- `GET /api/live/sessions/active` — 활성 세션 목록

### LP
- `GET /api/lp/me` — LP 잔액 + 히스토리
- `GET /api/lp/ladder` — 티어별 LP 기준

### 프록시
- `GET /api/feargreed` — F&G 프록시
- `GET /api/coingecko/global` — CoinGecko 프록시
- `GET /api/yahoo/{symbol}` — Yahoo Finance 프록시

### 설정
- `PUT /api/preferences` — 설정 저장
- `GET /api/preferences` — 설정 로드
- `PUT /api/ui-state` — UI 상태 저장
- `GET /api/ui-state` — UI 상태 로드
- `PATCH /api/profile` — 프로필 편집

---

## 부록 C. v1.0 → v2.0 변경 사항 요약

| 항목 | v1.0 | v2.0 |
|------|------|------|
| 에이전트 수 | 7개 고정 팀 (STRUCTURE, FLOW, DERIVE, SOCIAL, NETWORK, MACRO, WILD) | 8개 풀에서 3개 드래프트 (STRUCTURE, VPA, ICT, DERIV, VALUATION, FLOW, SENTI, MACRO) |
| 에이전트 선택 | 없음 (전원 투표) | 드래프트 3개 + 가중치 배분 + Spec 선택 |
| Spec 시스템 | 없음 (XP 기반 레벨업) | LLM Spec (Base/A/B/C) — 사이드그레이드 |
| 성장 시스템 | XP 레벨업 (P2W) | RAG 기억 (경험) + Spec 해금 (옵션) |
| 매치 Phase | 12단계 (standby→config→deploy→hypothesis→scout→gather→council→verdict→compare→battle→result→cooldown) | 5단계 (DRAFT→ANALYSIS→HYPOTHESIS→BATTLE→RESULT) |
| 스코어링 | LP 직접 계산 | FBS = 0.5×DS + 0.3×RE + 0.2×CI |
| Passport 메트릭 | 기본 (win/loss 통계) | 6대 메트릭 (승률, 방향, IDS, 캘리브, GUARDIAN, Challenge) |
| Oracle | 에이전트 적중률 (Wilson Score) | 에이전트 × Spec 적중률 (32행) |
| Challenge | 미구현 | Gold+ 에이전트에 도전, LP ±7/4 |
| LIVE | 미구현 | Diamond+ Creator, SSE 스트림 |
| LP/티어 | 미구현 | Bronze(0)→Silver(200)→Gold(600)→Diamond(1200)→Master(2200) |
| RAG 기억 | 없음 | pgvector 256d, 유사도 검색, 기억 보강 |
| Exit Optimizer | 없음 | ATR 기반 SL/TP, R:R, EV, Kelly |
| 독립 판단 원칙 | Oracle 차단만 | 4원칙 (알림, 가설, Oracle, LIVE) |
| 데이터베이스 | 로컬 + 기본 테이블 | indicator_series, match_memories, user_passports, agent_accuracy_stats 등 11개 신규 |

---

## 부록 D. 미확정 사항

| 항목 | 현황 | 결정 필요 시점 |
|------|------|-------------|
| H값 정의 | 방향 정확도/IDS/캘리브레이션 지연 평가 기준. 24h candle close 예정. | Phase 3 시작 전 |
| hypothesis 타임아웃 기본 처리 | 에이전트 합의 방향 자동 채택, confidence=1 예정 | Phase 5 구현 시 |
| LLM 비용 최적화 | Spec당 LLM 호출 = 매치당 최대 6회. 캐싱/배치 전략 | Phase 3 테스트 시 |
| 임베딩 방식 확정 | 옵션 1(수치) vs 옵션 2(LLM). 비용 vs 정확도 트레이드오프 | Phase 4 시작 전 |
| 팀 매치 구조 | 1 Captain + 2 Support 드래프트 분담 상세 | Phase 6 |
| Strategy NFT 표준 | ERC-721 on which chain? 메타데이터 구조? | P5 구현 시 |
| 연패 LP 완화 기준 | 7연패부터 -8 → -5. 더 세분화 필요? | Phase 5 |
| 강등 보호 유예기간 | 3판 유예 vs 즉시 강등 | Phase 5 |
| Track 만료 자동 처리 | ttlHours 만료 시 서버 cron 자동 expired | Phase 2 |

---

> **End of FlowSpec v2.0**
> 총 199 Action Steps · 9 Chapters · 4 Appendices
> 다음 단계: Phase 1 코어 엔진 구현 시작 (DB 마이그레이션 → trend.ts → specs.ts)
