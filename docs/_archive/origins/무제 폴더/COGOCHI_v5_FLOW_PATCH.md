# Cogochi v5 — 플로우 갭 보충 (12개 전부)

**2026-04-05 | v5.0 설계문서 보충. 이 문서의 내용은 v5 본문에 병합 대상.**

---

## 갭 1: 온보딩 플로우 (/create → 첫 패턴)

### 전체 흐름 (5분 이내)

```
랜딩(/) → [시작하기] → 지갑 연결 → /create
                                      ↓
                               Step 1: DOUNI 이름 (15초)
                               Step 2: 아키타입 선택 (30초)
                               Step 3: 첫 대화 유도 (2분)
                               Step 4: 첫 패턴 저장 (1분)
                               Step 5: Scanner 확인 (30초)
                                      ↓
                               /scanner (패턴 활성 상태)
```

### Step 1: DOUNI 이름 짓기 (15초)

```
┌─────────────────────────────────────────────┐
│                                             │
│         🐦 (EGG 스프라이트 흔들림)           │
│                                             │
│   이 부엉이의 이름을 지어줘                  │
│                                             │
│   [_______________]   [다음 →]              │
│                                             │
│   추천: Hoot, Navi, Scout, 이름 없이 시작   │
│                                             │
└─────────────────────────────────────────────┘

입력 없이 [다음] → 기본명 "DOUNI"
최대 12자, 특수문자 제한
```

### Step 2: 아키타입 선택 (30초)

```
┌─────────────────────────────────────────────┐
│                                             │
│   {이름}의 성격을 골라줘                     │
│                                             │
│   ┌──────────┐  ┌──────────┐               │
│   │ 🗡 공격형  │  │ 🏄 추세형  │               │
│   │ CRUSHER   │  │ RIDER    │               │
│   │ 숏 편향   │  │ 추세 추종 │               │
│   │ CVD 중시  │  │ 구조 확인 │               │
│   └──────────┘  └──────────┘               │
│   ┌──────────┐  ┌──────────┐               │
│   │ 🔮 역추세  │  │ 🛡 수비형  │               │
│   │ ORACLE   │  │ GUARDIAN  │               │
│   │ 다이버전스│  │ 리스크 관리│               │
│   │ 반전 포착 │  │ 청산 감시 │               │
│   └──────────┘  └──────────┘               │
│                                             │
│   잘 모르겠으면 추세형(RIDER)이 무난해!      │
│                                             │
└─────────────────────────────────────────────┘

선택 → DOUNI Excited 애니메이션
"좋아! 나 {이름}이야. 같이 시작하자!"
```

### Step 3: 첫 대화 유도 (2분)

```
/create 완료 → /terminal 자동 이동

DOUNI: "안녕! {이름}이야. 🐦
       BTC 지금 어떤지 같이 볼까?
       아래에 'BTC 4H' 입력해봐!"

프롬프트 placeholder:
  "BTC 4H 라고 입력해봐! →"

유저: "BTC 4H"
→ 차트 로드 + DOUNI 자동 분석
→ 분석 스택 2~3개 자동 생성

DOUNI: "봤어! CVD가 좀 이상해. 여기 봐.
       맞는 것 같으면 ✓, 아니면 ✗ 눌러봐!"
```

### Step 4: 첫 패턴 저장 (1분)

```
유저가 ✓ 1개 이상 → [📌 패턴으로 저장] 활성화

DOUNI: "좋아! 이 패턴 저장하면 내가 24시간 찾아줄게.
       [📌 패턴으로 저장] 눌러봐!"

→ 확인 모달 (패턴명 자동 생성)
→ 저장

DOUNI: "저장 완료! 🎉 이제 Scanner가 BTC말고
       다른 종목에서도 이 패턴 찾을게.
       Scanner 확인하러 가자!"

[Scanner 보러 가기 →]
```

### Step 5: Scanner 확인 (30초)

```
/scanner 이동
→ [내 패턴] 탭에 방금 저장한 패턴 1개 활성

DOUNI: "여기야! 네 패턴으로 스캔 시작했어.
       패턴 감지되면 바로 알려줄게.
       Telegram 연결하면 앱 밖에서도 알림 받을 수 있어!"

[Telegram 연결하기]  [나중에]
```

### 온보딩 성공 지표

```
첫 패턴 저장까지 완료율: 60%+ (M3 목표)
온보딩 소요 시간: 중앙값 5분 이내
Kill: 완료율 < 30% → 플로우 재설계
```

---

## 갭 2: Soft Gates / Journey State

### Journey State 정의

```typescript
type JourneyState =
  | 'no-agent'     // DOUNI 미생성
  | 'no-pattern'   // DOUNI 있지만 패턴 0개
  | 'scanning'     // 패턴 1개+ 있지만 피드백 0개
  | 'active'       // 피드백 1개+ (핵심 루프 진입)

// 계산
function getJourneyState(agent, patterns, feedbacks): JourneyState {
  if (!agent) return 'no-agent'
  if (patterns.length === 0) return 'no-pattern'
  if (feedbacks.length === 0) return 'scanning'
  return 'active'
}
```

### 페이지별 게이트

| 페이지 | no-agent | no-pattern | scanning | active |
|--------|----------|------------|----------|--------|
| **Home** | CTA "시작" → /create | CTA "첫 패턴" → /terminal | CTA "Scanner 확인" → /scanner | 대시보드 |
| **Terminal** | 🔒 → /create 모달 | ✅ 가이드 오버레이 | ✅ | ✅ |
| **Scanner** | 🔒 → /create | 🔒 "패턴 먼저!" → /terminal | ✅ (알림 대기) | ✅ |
| **Lab** | 🔒 → /create | 🔒 → /terminal | 🔒 "데이터 부족" | ✅ |
| **Market** | 🔒 | 🔒 | 🔒 | Phase 2 |

### 차단 모달 UX

```
공통 구조:
┌────────────────────────────────────────┐
│  🐦 DOUNI: "{메시지}"                  │
│                                        │
│  {설명}                                │
│                                        │
│  [{CTA 버튼}]           [나중에]       │
└────────────────────────────────────────┘

no-agent → Scanner:
  "아직 DOUNI가 없어! 먼저 만들러 가자."
  [DOUNI 만들기 →]

no-pattern → Scanner:
  "스캔할 패턴이 없어. Terminal에서 하나 만들어봐!"
  [Terminal로 →]

no-pattern → Lab:
  "아직 데이터가 없어. 패턴 만들고 피드백이 쌓이면 여기서 볼 수 있어!"
  [Terminal로 →]
```

---

## 갭 3: Home 페이지

### 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│  NAVBAR                                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🐦 {DOUNI 이름}                  Stage: CHICK           │
│  "좋은 아침! 어젯밤 BTC +2.3% 올랐어"                   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Energy   │ │ Mood     │ │ Focus    │ │ Trust    │   │
│  │ ████░░ 72│ │ ███░░ 58 │ │ ████░ 81 │ │ ██░░░ 35 │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  놓친 알림 3개                              [전체 보기 →]│
│  🔔 BTC 1H  볼밴수축+CVD강세  LONG   방금                │
│  🔔 ETH 4H  CVD다이버전스    SHORT  2시간 전             │
│  🔔 SOL 4H  CVD다이버전스    SHORT  5시간 전             │
├─────────────────────────────────────────────────────────┤
│  오늘 요약                                               │
│  패턴 감지: 3회  /  피드백 완료: 1회  /  적중: 1/1       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [journeyState 기반 CTA]                                │
│                                                          │
│  no-pattern:  [ 첫 패턴 만들러 가기 → /terminal ]       │
│  scanning:    [ Scanner 확인하기 → /scanner ]            │
│  active:      [ 분석 시작 → /terminal ]                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### DOUNI 인사 규칙

```
시간대:
  06~11: "좋은 아침! {어젯밤 주요 변동}"
  12~17: "오후야! {오늘 패턴 감지 요약}"
  18~23: "오늘 수고했어. {오늘 적중률}"
  00~05: "아직 안 자?"

특수:
  놓친 알림 5개+: "자는 동안 많이 움직였어!"
  패턴 적중 3연속: "요즘 잘 맞추네! 🎉"
  7일 미접속 후: "...응? 왔어? 오랜만이다!"
```

---

## 갭 4: Stage 진화 연출

### 트리거 시점

```
패턴 저장 직후 (Terminal) → 서버가 조건 체크
Scanner 피드백 직후 (Scanner) → 서버가 조건 체크
→ 조건 충족 → SSE event: "stage_evolution"
```

### 연출 시퀀스 (3초)

```
1. 화면 약간 어두워짐 (overlay 0.3 opacity)    0.0초
2. DOUNI 스프라이트 중앙 이동                    0.3초
3. 빛 파티클 감싸임                              0.5초
4. 크기 변화 (32→48 or 48→64...)                1.0초
5. 새 스프라이트 등장                            1.5초
6. Stage 뱃지 팝업 "CHICK 달성!"                2.0초
7. 해금 목록 슬라이드 인                         2.5초
   "스캔 10종목 해금!"
   "인디케이터 15개 해금!"
8. DOUNI: "성장했어! 더 많이 볼 수 있어!"       3.0초
```

### 해금 알림 내용 (Stage별)

```
EGG → CHICK:
  "🎉 CHICK 달성! 이제 10종목 스캔 + 인디케이터 15개"

CHICK → FLEDGLING:
  "🎉 FLEDGLING! 전체 마켓 스캔 해금 + 인디 40개"

FLEDGLING → DOUNI:
  "🎉 완전한 DOUNI! 학습방법 선택 + LoRA Rank 조정"

DOUNI → ELDER:
  "🎉 ELDER! Market 임대 가능 + 모델 Export"
```

---

## 갭 5: Telegram 봇 연결

### 연결 플로우

```
Scanner 상단 배너:
  "📱 Telegram으로도 알림 받기"  [연결하기]

또는 설정 > 알림 > Telegram:
  [연결하기]

클릭 →
  1. @CogochiBOT 텔레그램 링크 오픈
  2. 유저가 /start 입력
  3. 봇: "인증 코드를 입력해주세요: ______"
  4. 앱에서 6자리 코드 표시 (60초 유효)
  5. 유저가 텔레그램에 코드 입력
  6. 봇: "✅ 연결 완료! 패턴 감지 시 여기로 알림 올게."
  7. 앱: "Telegram 연결됨 ✅"  [연결 해제]
```

### 텔레그램 피드백

```
알림 메시지에 인라인 버튼:
  [✓ 맞아]  [✗ 아니야]  [차트 보기]

✓/✗ 클릭 → 서버에 피드백 전송 → 봇 응답:
  ✓: "👍 기록했어! 적중률 73% (12/16)"
  ✗: "📝 기록했어. 다음엔 더 정확해질게."
```

---

## 갭 6: Scanner → Terminal 딥링크

### URL 스키마

```
/terminal?from=scanner&symbol=BTCUSDT&tf=1h&alertId=xxx&patternId=yyy
```

### Terminal 진입 시 동작

```
1. 차트 자동 로드: BTCUSDT 1H
2. 알림 시점 수직선 마킹 (빨간 점선)
3. 감지된 패턴 조건을 분석 스택에 프리로드:
   [1] L11: CVD BEARISH_DIVERGENCE  ●●●●○  (패턴 조건)
   [2] L2: Funding OVERHEAT_LONG   ●●●○○  (패턴 조건)
   → 각 항목에 "Scanner 감지" 뱃지

4. DOUNI 컨텍스트 메시지:
   "Scanner에서 네 'CVD다이버전스+펀딩과열' 패턴이 감지됐어.
    BTC 1H에서 같이 확인해보자!"
   방향: 3-Quarter (차트 가리키며)

5. 추가 분석 가능:
   유저가 프롬프트로 "OI도 봐줘" → 추가 분석
   → 패턴 업데이트 가능 ("OI도 조건에 추가할까?")
```

---

## 갭 7: Scanner 딥다이브 → 패턴 저장

### 딥다이브 패널 하단

```
┌─ 딥다이브: BTC ─────────────────────────────────────┐
│  Alpha Score: -72 (STRONG BEAR)                      │
│                                                      │
│  L1  와이코프: DISTRIBUTION Phase C    ●●●●●  -30  │
│  L2  수급: FR 0.12% + OI ↑ 8.2%      ●●●●○  -15  │
│  L11 CVD: BEARISH DIVERGENCE          ●●●●○  -25  │
│  ...                                                 │
│                                                      │
│  ── 패턴 만들기 ─────────────────────────────────── │
│                                                      │
│  ☑ L1  와이코프 DISTRIBUTION                        │
│  ☑ L2  FR > 0.001                                   │
│  ☑ L11 CVD BEARISH_DIVERGENCE                       │
│  ☐ L3  V-Surge                                      │
│  ☐ L5  청산존                                        │
│                                                      │
│  방향: [SHORT ▼]                                     │
│                                                      │
│  [📌 이 조건으로 패턴 저장]  [Terminal에서 분석하기]  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 저장 흐름

```
유저가 레이어 체크박스 선택 (최소 2개)
→ 방향 선택 (LONG/SHORT)
→ [📌 이 조건으로 패턴 저장]
→ 저장 확인 모달:
   패턴명: "와이코프분배+CVD다이버전스+FR과열"  (자동 생성, 수정 가능)
   방향: SHORT
   조건: 3개 (체크한 레이어)
→ 저장 → Scanner [내 패턴] 탭에 즉시 활성화

또는:
[Terminal에서 분석하기]
→ /terminal?symbol=BTCUSDT&tf=4h
→ Terminal에서 대화로 패턴 저장 (기존 플로우)
```

---

## 갭 8: Lab → Terminal/Scanner 역방향 링크

### 패턴 상세에서

```
┌─ CVD다이버전스+펀딩과열 상세 ────────────────────┐
│                                                   │
│  적중률: 73% (11/15)   이번 주: 80% ↑            │
│                                                   │
│  조건:                                            │
│  l11.cvdState = BEARISH_DIVERGENCE                │
│  l2.fundingRate > 0.0010                          │
│  l1.phase = DISTRIBUTION                          │
│                                                   │
│  최근 5개:                                        │
│  ETH 4H ✓ +3.2%  2시간 전  [차트 보기]           │
│  BTC 4H ✓ +2.1%  어제      [차트 보기]           │
│  SOL 4H ✗ -1.8%  이틀 전   [차트 보기]           │
│                                                   │
│  [패턴 조건 수정 → Terminal]                       │
│  [Scanner에서 ON/OFF]                              │
│  [패턴 삭제]                                       │
│                                                   │
└───────────────────────────────────────────────────┘

[차트 보기] → /terminal?symbol=ETH&tf=4h&time=1712345678
  해당 시점 차트 자동 로드 + 알림 시점 마킹

[패턴 조건 수정] → /terminal?editPattern=xxx
  Terminal에서 해당 패턴 조건을 분석 스택에 로드
  수정 후 저장 → Doctrine 업데이트

[Scanner에서 ON/OFF] → Scanner API 직접 호출 (페이지 이동 없음)
```

---

## 갭 9: Free → Pro 업그레이드 UX

### 차단 모달 3종

**패턴 한도 (Terminal):**
```
┌────────────────────────────────────────┐
│  🐦 패턴 3개를 다 썼어!               │
│                                        │
│  Pro면:                                │
│  ✅ 무제한 패턴                        │
│  ✅ 전체 종목 스캔                     │
│  ✅ 주간 AutoResearch                  │
│                                        │
│  $19/월  ($190/년 — 16% 할인)          │
│                                        │
│  [Pro 시작하기]       [나중에]          │
└────────────────────────────────────────┘
```

**세션 한도 (Terminal):**
```
┌────────────────────────────────────────┐
│  🐦 오늘 분석 3회를 다 썼어.           │
│                                        │
│  Pro면 무제한 분석이야.                │
│  내일까지 기다릴래, Pro 할래?          │
│                                        │
│  [Pro 시작하기]       [내일 보자]       │
└────────────────────────────────────────┘
→ DOUNI Sleep 애니메이션 (감정적 아쉬움)
```

**AutoResearch 한도 (Lab):**
```
┌────────────────────────────────────────┐
│  🐦 이번 달 AutoResearch를 이미 썼어.  │
│                                        │
│  피드백 30개가 쌓여있는데...            │
│  Pro면 주 1회 자동 + 수동 실행 가능!   │
│                                        │
│  [Pro 시작하기]       [다음 달에]       │
└────────────────────────────────────────┘
```

### 결제 플로우

```
[Pro 시작하기] 클릭
→ 결제 모달 (Stripe Checkout):
  ┌────────────────────────────────────┐
  │  Cogochi Pro                       │
  │                                    │
  │  ○ 월 결제  $19/월                 │
  │  ● 연 결제  $190/년  (16% 할인)    │
  │                                    │
  │  [카드 결제]  [Crypto 결제]        │
  └────────────────────────────────────┘

완료 → 즉시 Pro 활성화
→ DOUNI: "Pro가 됐어! 🎉 이제 무제한이야!"
→ 제한 즉시 해제 (패턴/세션/종목/AutoResearch)
```

### 접근 경로

```
차단 시: 자동 차단 모달
설정: 메뉴 > 요금제 > [Pro 업그레이드]
Home: Stage 옆에 "Pro 뱃지" (Pro 유저)
```

---

## 갭 10: SignalSnapshot 통일

### 결정: Terminal도 15레이어를 내부적으로 계산

```
통일된 SignalSnapshot:

{
  // 15레이어 (내부 필드)
  l1:  { phase: "DISTRIBUTION", score: -30 },
  l2:  { fr: 0.0012, oi_change: 0.184, ls_ratio: 1.8, score: -15 },
  l3:  { v_surge: false, score: 0 },
  l4:  { bid_ask_ratio: 0.6, score: -5 },
  l5:  { basis_pct: 0.08, score: -3 },
  l6:  { exchange_netflow: -1200, score: -5 },
  l7:  { fear_greed: 28, score: -8 },
  l8:  { kimchi: 1.2, score: 0 },
  l9:  { liq_1h: 4200000, score: -5 },
  l10: { mtf_confluence: "BEAR_ALIGNED", score: -20 },
  l11: { cvd_state: "BEARISH_DIVERGENCE", cvd_raw: -1500, score: -25 },
  l12: { sector_flow: "NEUTRAL", score: 0 },
  l13: { breakout: false, score: 0 },
  l14: { bb_squeeze: true, bb_width: 0.012, score: -5 },
  l15: { atr_pct: 3.2 },

  // 종합
  alphaScore:     -72,
  regime:         "VOLATILE",

  // 호환 필드 (Terminal 표시용)
  primaryZone:    "DISTRIBUTION",
  cvdState:       "BEARISH_DIVERGENCE",
  fundingLabel:   "OVERHEAT_LONG",
  htfStructure:   "BEARISH",
  compositeScore: 0.87,

  // 메타
  symbol:    "BTCUSDT",
  timeframe: "4h",
  timestamp: 1712345678,
  hmac:      "abc123..."
}
```

### Terminal에서의 표시

```
Terminal은 유저에게 15레이어를 다 보여주지 않음.
자연어로 핵심만 표시:

DOUNI: "CVD가 베어리시 다이버전스야. 펀딩비도 0.12%로 과열이고.
       와이코프로 보면 분배 단계 같아."

내부적으로는 l1, l2, l11 필드를 참조.
패턴 저장 시 Condition은 l1.phase, l2.fr, l11.cvd_state 등으로 생성.
→ Scanner에서 동일한 SignalSnapshot으로 매칭 가능.
```

### Condition 필드 목록 (Pattern에서 사용 가능한 것)

```
l1.phase:         "ACCUMULATION" | "MARKUP" | "DISTRIBUTION" | "MARKDOWN" | "REACCUM" | "REDIST"
l2.fr:            number (0.0001 ~ 0.003)
l2.oi_change:     number (-1.0 ~ 1.0)
l2.ls_ratio:      number (0.5 ~ 3.0)
l3.v_surge:       boolean
l4.bid_ask_ratio: number (0 ~ 2.0)
l5.basis_pct:     number
l7.fear_greed:    number (0 ~ 100)
l9.liq_1h:        number (USD volume)
l10.mtf_confluence: "BULL_ALIGNED" | "BEAR_ALIGNED" | "MIXED"
l11.cvd_state:    "BULLISH" | "BEARISH" | "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NEUTRAL"
l13.breakout:     boolean
l14.bb_squeeze:   boolean
l15.atr_pct:      number
alphaScore:       number (-100 ~ 100)
regime:           "UPTREND" | "DOWNTREND" | "VOLATILE" | "RANGE" | "BREAKOUT"
```

---

## 갭 11: 패턴 편집/삭제

### Scanner [내 패턴] → 패턴 카드 [설정] 메뉴

```
[설정] 클릭 → 드롭다운:
  ├── 이름 변경
  ├── 조건 편집
  ├── 방향 변경 (LONG ↔ SHORT)
  ├── 복제
  └── 삭제
```

### 조건 편집

```
┌─ 패턴 조건 편집 ──────────────────────────────────┐
│                                                    │
│  패턴명: CVD다이버전스+펀딩과열  [✏️]              │
│  방향: SHORT [▼]                                   │
│                                                    │
│  조건:                                             │
│  [l11.cvd_state] [eq] [BEARISH_DIVERGENCE]  [🗑]  │
│  [l2.fr]         [gt] [0.0010]              [🗑]  │
│  [l1.phase]      [eq] [DISTRIBUTION]        [🗑]  │
│                                                    │
│  [+ 조건 추가]                                     │
│                                                    │
│  [저장]  [취소]                                    │
└────────────────────────────────────────────────────┘

조건 추가:
  필드 드롭다운 (l1~l15 + alpha + regime)
  연산자 드롭다운 (eq/gt/lt/gte/lte/contains)
  값 입력

저장 → Doctrine 업데이트
→ Scanner 다음 스캔부터 새 조건 적용
→ 기존 알림 히스토리는 유지 (조건 변경 전 알림으로 표시)
```

### 삭제

```
[삭제] 클릭:
┌────────────────────────────────────┐
│  이 패턴을 삭제할까요?             │
│                                    │
│  "CVD다이버전스+펀딩과열"          │
│  알림 15회 / 적중률 73%            │
│                                    │
│  ⚠ 패턴은 삭제되지만              │
│  알림 히스토리와 피드백은 유지됩니다│
│                                    │
│  [삭제]  [취소]                    │
└────────────────────────────────────┘

삭제 → pattern.active = false, deleted_at = now()
알림 히스토리(alert_logs)는 보존 (Lab 적중률 데이터)
파인튜닝 데이터(chosen/rejected)도 보존
```

---

## 갭 12: 자동 적중 판정 엣지케이스

### 결정: 1H 후 종가 기준

```
판정 기준:
  알림 시점 가격 = P0
  알림 + 1시간 후 종가 = P1
  변화율 = (P1 - P0) / P0

  SHORT 패턴:
    변화율 ≤ -1%  → 적중 (HIT)
    변화율 ≥ +1%  → 미적중 (MISS)
    -1% < 변화율 < +1% → 무효 (VOID, 적중률 미반영)

  LONG 패턴:
    변화율 ≥ +1%  → 적중 (HIT)
    변화율 ≤ -1%  → 미적중 (MISS)
    -1% < 변화율 < +1% → 무효 (VOID)
```

### 왜 종가 기준인가

```
옵션 A: 먼저 닿은 방향 → 구현 복잡 (틱 데이터 필요)
옵션 B: 1H 종가 기준 → 단순, 재현 가능, kline 1개면 됨 ✅
옵션 C: MFE/MAE → 정확하지만 구현 과다

종가 기준 장점:
  - Binance klines API 1회 호출로 판정
  - 재현 가능 (같은 데이터 → 같은 결과)
  - 위변조 불가 (서버 판정, kline은 public)
```

### 수동 피드백과의 우선순위

```
유저 수동 피드백 > 자동 판정

우선순위:
  1. 유저가 ✓/✗ 누름 → 즉시 확정 (auto_feedback = false)
  2. 24시간 내 유저 피드백 없음 → 자동 판정 (auto_feedback = true)
  3. 자동 판정 후에도 유저가 수정 가능 (수동 > 자동 덮어쓰기)
```

### DB 컬럼

```sql
ALTER TABLE alert_logs ADD COLUMN
  p0_price      FLOAT,        -- 알림 시점 가격
  p1_price      FLOAT,        -- 1H 후 종가
  p1_change_pct FLOAT,        -- 변화율
  auto_verdict  VARCHAR(4),   -- 'HIT' | 'MISS' | 'VOID'
  final_verdict VARCHAR(4);   -- 수동 있으면 수동, 없으면 auto
```

---

## 전체 갭 해결 요약

| # | 갭 | 해결 | 구현 시점 |
|---|-----|------|----------|
| 1 | 온보딩 | 5단계 플로우 (/create → 첫 패턴 → Scanner) | Week 3~4 |
| 2 | Soft Gates | 4단계 journeyState + 페이지별 차단 모달 | Week 3~4 |
| 3 | Home | DOUNI 인사 + 놓친 알림 + CTA 대시보드 | Week 9~10 |
| 4 | Stage 진화 | 3초 연출 시퀀스 + 해금 알림 | Week 11~12 |
| 5 | Telegram | 6단계 연결 플로우 + 인라인 피드백 | Week 5~6 |
| 6 | Scanner→Terminal | 딥링크 URL + 알림 시점 마킹 + DOUNI 컨텍스트 | Week 5~6 |
| 7 | 딥다이브→패턴 | 레이어 체크박스 → Condition 매핑 | Week 5~6 |
| 8 | Lab 역방향 | 패턴 상세에서 [차트 보기] [조건 수정] [ON/OFF] | Week 9~10 |
| 9 | Free→Pro | 차단 모달 3종 + Stripe Checkout | Week 9~10 |
| 10 | SignalSnapshot | 통일 구조 (15레이어 + 호환 필드) | Week 1~2 |
| 11 | 패턴 편집 | 조건 빌더 + 삭제 (히스토리 보존) | Week 5~6 |
| 12 | 자동 적중 | 1H 종가 기준 + 수동 > 자동 우선순위 | Week 5~6 |
