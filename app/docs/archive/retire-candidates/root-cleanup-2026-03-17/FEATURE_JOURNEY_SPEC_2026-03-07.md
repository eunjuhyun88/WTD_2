# STOCKCLAW Feature Journey Design Spec

작성일: 2026-03-07  
범위: `frontend/` target-state 기능 단위 UX / PM / GTM 설계  
문서 목적: 각 기능별로 `왜 존재하는지`, `사용자가 어떻게 진입하고 완료하는지`, `무엇을 보여줘야 하는지`, `무엇이 성공인지`를 고정한다.

## 1. 문서 사용법

이 문서는 페이지 설명서가 아니다.  
각 기능마다 아래 템플릿으로 읽는다.

- 기능 목표
- 사용자 목표
- 주요 사용자
- 진입 지점
- 선행 조건
- 핵심 유저저니
- 추천 화면 배치
- 상태 전이
- 성공 상태
- 실패/예외 상태
- KPI
- GTM 이벤트
- UX 개선안
- Acceptance Criteria
- 우선순위

## 2. Feature Inventory

| ID | 기능 | 1차 목표 | 우선순위 |
| --- | --- | --- | --- |
| F1 | Home Acquisition | 첫 가치 체험 시작 | P0 |
| F2 | Wallet Identity & Auth | 신뢰 가능한 web3 인증 | P0 |
| F3 | Market Data Trust Layer | 데이터 출처 신뢰 확보 | P0 |
| F4 | Terminal Scan | 첫 AI 인사이트 생성 | P0 |
| F5 | Pair/Timeframe Control | 차트와 스캔 의미 일치 | P0 |
| F6 | Pattern Intelligence | 구조적 패턴 해석 | P1 |
| F7 | AI Chat Copilot | 질문에서 판단으로 전환 | P1 |
| F8 | Trade Plan Builder | 실행 가능한 계획 생성 | P1 |
| F9 | Community Share | 분석을 배포로 전환 | P1 |
| F10 | Signals Consumption | 시그널 소비와 선별 | P1 |
| F11 | Copy Trade Handoff | 소비를 액션으로 전환 | P1 |
| F12 | Passport Loop | 리텐션 재시동 | P1 |
| F13 | Arena Evaluation | 판단 실력 검증 | P2 |
| F14 | Settings & Personalization | 동작 규칙 개인화 | P2 |

## 3. F1. Home Acquisition

### 기능 목표

- 사용자를 가장 빠르게 첫 가치 지점으로 보낸다.
- 제품을 설명하는 것이 아니라 `첫 scan`까지 도달시키는 것이 목적이다.

### 사용자 목표

- "이게 뭔지 빨리 이해하고 바로 써보고 싶다."

### 주요 사용자

- 신규 방문자
- 광고/공유 링크 유입
- wallet 미연결 사용자

### 진입 지점

- `/`

### 선행 조건

- 없음

### 핵심 유저저니

1. 사용자가 홈에 들어온다.
2. 3초 안에 제품 가치 문장을 본다.
3. 제품이 무엇을 해주는지 live terminal preview로 이해한다.
4. primary CTA `Start Free Scan`을 누른다.
5. `/terminal`로 이동한다.
6. terminal에서 first scan을 실행한다.

### 추천 화면 배치

- Hero 상단: 한 문장 value proposition
- Hero 중앙: 실제 terminal preview 또는 canned live demo
- Hero 하단:
  - Primary: `Start Free Scan`
  - Secondary: `Connect Wallet`
  - Tertiary: `See Signals`
- Feature grid는 보조 정보로만 유지

### 상태 전이

- `landing`
- `value_understood`
- `terminal_handoff`

### 성공 상태

- 사용자가 1 클릭 안에 `/terminal`로 진입한다.

### 실패/예외 상태

- feature 분기가 너무 많아 primary CTA를 놓침
- wallet connect가 primary처럼 보여 first value 이전에 이탈

### KPI

- home -> terminal CTR
- home -> first scan completion rate
- time to first scan

### GTM 이벤트

- `home_view`
- `home_primary_cta_click`
- `home_secondary_wallet_click`
- `home_terminal_arrival`
- `home_first_scan_completed`

### UX 개선안

- `/oracle`처럼 실제 독립 surface가 아닌 항목은 hero 핵심 feature에서 내린다.
- "ENTER WAR ROOM"보다 "Start Free Scan"이 onboarding 목적에 더 직접적이다.

### Acceptance Criteria

- 사용자는 홈에서 로그인/가입 없이 terminal 진입이 가능해야 한다.
- primary CTA 카피만 보고도 다음 행동이 분명해야 한다.
- home 진입 후 2번 이상 클릭하지 않고 first scan까지 갈 수 있어야 한다.

### 우선순위

- P0

## 4. F2. Wallet Identity & Auth

### 기능 목표

- wallet ownership을 증명하고, 서버가 계정 상태를 해석해 올바른 auth path를 제시한다.

### 사용자 목표

- "내 wallet으로 들어가고 싶다."
- "신규면 만들고, 기존이면 바로 들어가고 싶다."

### 주요 사용자

- wallet 연결 신규 사용자
- 기존 계정 복귀 사용자
- session은 있지만 wallet link가 안 된 사용자

### 진입 지점

- Home secondary CTA
- Header connect CTA
- Passport wallet CTA
- gated action 진입점

### 선행 조건

- 지원 wallet provider 접근 가능

### 핵심 유저저니

1. 사용자가 `Connect Wallet` 클릭
2. provider 선택
3. wallet signature
4. 서버가 resolution 실행
   - existing account
   - new account
   - wallet conflict
   - email conflict
5. 결과에 맞는 화면 분기
   - existing -> sign in complete
   - new -> create profile
   - conflict -> resolve
6. destination 선택
   - Terminal
   - Passport
   - Arena

### 추천 화면 배치

- Step 1: wallet ownership verify
- Step 2: account resolution result
- Step 3: success destination

모달보다 full-screen sheet 권장.

### 상태 전이

- `idle`
- `wallet_connecting`
- `signature_required`
- `signature_verified`
- `resolution_existing`
- `resolution_new`
- `resolution_conflict`
- `profile_create`
- `authenticated`

### 성공 상태

- 기존 사용자는 wallet signature 뒤 추가 입력 없이 로그인 완료
- 신규 사용자는 nickname 입력만으로 profile 생성 완료

### 실패/예외 상태

- wallet reject
- nonce timeout
- wallet conflict
- email conflict
- unsupported chain

### KPI

- wallet connect success rate
- signature completion rate
- auth resolution breakdown
- auth completion rate
- auth -> first meaningful action conversion

### GTM 이벤트

- `auth_wallet_connect_click`
- `auth_wallet_connect_success`
- `auth_signature_requested`
- `auth_signature_success`
- `auth_resolution_result`
- `auth_profile_create_submit`
- `auth_login_complete`
- `auth_conflict_shown`

### UX 개선안

- 사용자에게 먼저 `회원가입 / 로그인`을 고르게 하지 않는다.
- login factor에서 `nickname`을 제거한다.
- `이미 있음` 같은 generic error를 금지한다.

### Acceptance Criteria

- 로그인은 `signed wallet -> linked account lookup`으로 완료돼야 한다.
- signup/login 선택을 사용자가 먼저 할 필요가 없어야 한다.
- conflict는 wallet/email/nickname 단위로 분리된 메시지와 CTA를 가져야 한다.

### 우선순위

- P0

## 5. F3. Market Data Trust Layer

### 기능 목표

- 사용자에게 보이는 숫자의 출처와 의미를 분리해 제품 신뢰를 높인다.

### 사용자 목표

- "이 숫자가 어디서 왔는지 알고 싶다."
- "거래소 차트와 왜 다를 수 있는지 이해하고 싶다."

### 주요 사용자

- 차트 중심 사용자
- 고급 사용자
- 트레이딩뷰 경험 사용자

### 진입 지점

- Terminal chart
- Pattern panel
- Verdict strip

### 선행 조건

- chart loaded

### 핵심 유저저니

1. 사용자가 chart와 수치를 본다.
2. 각 숫자가 어느 레이어인지 즉시 구분된다.
3. source badge를 통해 출처와 갱신 시간을 확인한다.
4. AI scan은 별도 snapshot으로 읽는다.

### 추천 화면 배치

- Chart top strip:
  - `Feed Source`
  - `Timeframe`
  - `Last Update`
- Right rail data blocks:
  - `Market`
  - `Indicators`
  - `AI`

### 상태 전이

- `feed_connected`
- `indicators_ready`
- `scan_absent`
- `scan_fresh`
- `scan_stale`

### 성공 상태

- 사용자가 market data, indicator, AI confidence를 서로 다른 값으로 인지한다.

### 실패/예외 상태

- source hidden
- stale scan이 fresh처럼 보임
- TradingView와 값이 다르지만 이유 설명이 없음

### KPI

- data source tooltip open rate
- stale scan rescan rate
- trust-related support issue 감소

### GTM 이벤트

- `market_source_badge_viewed`
- `market_source_detail_opened`
- `terminal_scan_marked_stale`

### UX 개선안

- `24H change (Binance)`
- `RSI 14 (local calc)`
- `AI confidence (scan snapshot)`

이 세 가지 형식을 모든 숫자 라벨링 규칙으로 통일한다.

### Acceptance Criteria

- 모든 핵심 숫자는 최소한 source 또는 data type label을 가져야 한다.
- AI 관련 수치는 timeframe, freshness가 함께 표시되어야 한다.

### 우선순위

- P0

## 6. F4. Terminal Scan

### 기능 목표

- 사용자가 첫 AI 시장 판단을 얻도록 만든다.

### 사용자 목표

- "지금 이 코인/타임프레임에서 AI가 어떻게 보는지 알고 싶다."

### 주요 사용자

- 신규 terminal 사용자
- 반복 방문 사용자

### 진입 지점

- Terminal primary CTA
- Chart scan CTA
- mobile auto-handoff

### 선행 조건

- pair/timeframe 선택됨

### 핵심 유저저니

1. pair/timeframe 확인
2. `Run Scan`
3. loading state
4. scan result card 생성
5. consensus/confidence/highlights 확인
6. next CTA로 이동

### 추천 화면 배치

- Center top: verdict strip
- Left/top secondary: scan history tabs
- Right rail: scan summary card

### 상태 전이

- `unscanned`
- `scanning`
- `scan_completed`
- `scan_failed`
- `scan_stale`

### 성공 상태

- 사용자가 현재 pair/timeframe 기준 AI snapshot을 확보

### 실패/예외 상태

- server timeout
- capacity reached
- malformed result

### KPI

- terminal arrival -> scan start
- scan start -> scan complete
- first scan completion
- scan -> next action rate

### GTM 이벤트

- `terminal_scan_started`
- `terminal_scan_completed`
- `terminal_scan_failed`
- `terminal_scan_result_viewed`

### UX 개선안

- scan result는 chat feed 안으로 묻히지 말고 별도 scan card로 유지
- `consensus / confidence / timeframe / freshness`를 한 카드에 고정

### Acceptance Criteria

- scan 완료 후 사용자는 해당 결과의 pair/timeframe/freshness를 즉시 인지할 수 있어야 한다.
- scan 실패 시 재시도 CTA가 있어야 한다.

### 우선순위

- P0

## 7. F5. Pair/Timeframe Control

### 기능 목표

- 차트, 지표, AI scan의 기준 축을 사용자가 명확히 이해하게 한다.

### 사용자 목표

- "다른 timeframe으로 보면 어떤지 보고 싶다."

### 주요 사용자

- 차트 분석 사용자
- power user

### 진입 지점

- chart header pair/timeframe controls

### 선행 조건

- terminal 또는 chart surface opened

### 핵심 유저저니

1. 사용자가 timeframe 변경
2. chart candles reload
3. indicators recalc
4. old scan becomes stale
5. CTA changes to `Rescan Current TF`
6. user runs fresh scan

### 추천 화면 배치

- Pair selector: top-left
- Timeframe selector: top-center
- Stale scan warning: verdict strip directly below

### 상태 전이

- `chart_syncing`
- `chart_ready`
- `scan_stale_due_to_tf_change`
- `scan_refreshed`

### 성공 상태

- 차트 timeframe과 AI scan timeframe이 다를 때 사용자가 이를 즉시 알아챈다.

### 실패/예외 상태

- timeframe changed but scan still appears valid
- pair changed and old trade plan remains active without warning

### KPI

- timeframe change -> rescan rate
- stale scan confusion report 감소

### GTM 이벤트

- `terminal_pair_changed`
- `terminal_timeframe_changed`
- `terminal_scan_marked_stale`
- `terminal_rescan_started`

### UX 개선안

- stale badge를 hide하지 말고 명시
- timeframe 전환 시 verdict strip background/state를 바꿔 시각적으로 구분

### Acceptance Criteria

- timeframe 변경 후 fresh scan처럼 보이는 구버전 verdict는 없어야 한다.
- primary CTA는 stale 상태에서 반드시 `Rescan` 계열로 바뀌어야 한다.

### 우선순위

- P0

## 8. F6. Pattern Intelligence

### 기능 목표

- 패턴이 "우연히 보이는 그림"이 아니라 검출된 구조임을 전달한다.

### 사용자 목표

- "무슨 패턴인지, 왜 그렇게 보이는지, 지금 화면이 전체 구조를 다 보여주는지 알고 싶다."

### 주요 사용자

- 차트 고급 사용자
- pattern seekers

### 진입 지점

- chart overlay
- pattern panel
- AI evidence panel

### 선행 조건

- enough candle history

### 핵심 유저저니

1. user opens pattern mode
2. system shows detected pattern cards
3. card displays timeframe/scope/status/confidence
4. user clicks `Focus full pattern`
5. chart centers full structure

### 추천 화면 배치

- Right-side collapsible pattern inspector
- Each card includes:
  - kind
  - direction
  - confidence
  - status
  - detection timeframe
  - scope

### 상태 전이

- `no_pattern`
- `forming_pattern`
- `confirmed_pattern`
- `partial_visible`
- `offscreen_partial`

### 성공 상태

- 사용자가 visible viewport와 actual detection scope를 구분한다.

### 실패/예외 상태

- pattern changed but reason unknown
- viewport clipping causes trust loss
- not enough candles

### KPI

- pattern focus click rate
- pattern -> share or scan assist conversion
- pattern confusion feedback 감소

### GTM 이벤트

- `pattern_panel_opened`
- `pattern_card_viewed`
- `pattern_focus_clicked`
- `pattern_scope_switched`

### UX 개선안

- pattern mode를 `Locked / Visible / Auto`로 제공
- `Pattern extends beyond viewport` 메시지 추가

### Acceptance Criteria

- 모든 패턴 카드에는 timeframe, scope, status, confidence가 보여야 한다.
- 패턴이 바뀌면 이유가 `timeframe / new candle / mode change` 중 하나로 설명돼야 한다.

### 우선순위

- P1

## 9. F7. AI Chat Copilot

### 기능 목표

- 질문을 답변으로 끝내지 않고, 다음 행동으로 연결한다.

### 사용자 목표

- "왜 이런 verdict가 나왔는지 묻고 싶다."
- "이제 무엇을 해야 하는지 알고 싶다."

### 주요 사용자

- scan 완료 사용자
- plan building 직전 사용자

### 진입 지점

- intel panel
- chart CTA `Ask AI`

### 선행 조건

- preferably latest scan exists

### 핵심 유저저니

1. user asks question
2. assistant answers
3. answer updates recommended next action
4. user chooses `Build Trade Plan`

### 추천 화면 배치

- Chat thread above
- Suggested next action chip below latest answer
- `Build Trade Plan` CTA pinned to latest actionable answer

### 상태 전이

- `idle`
- `question_sent`
- `answer_received`
- `fallback_answer`
- `trade_ready`

### 성공 상태

- answer가 actionable next step을 만든다.

### 실패/예외 상태

- timeout
- fallback answer
- answer generic and non-actionable

### KPI

- question -> answer
- answer -> trade plan open
- fallback ratio

### GTM 이벤트

- `terminal_ai_question_sent`
- `terminal_ai_answer_received`
- `terminal_ai_answer_fallback`
- `terminal_ai_answer_to_trade_plan`

### UX 개선안

- `OPEN CHAT PLAN` 같은 모호한 CTA를 제거
- answer 밑에 `Next best action`을 명시

### Acceptance Criteria

- latest answer는 가능하면 next action type을 포함해야 한다.
- fallback answer도 최소 one next step CTA를 제시해야 한다.

### 우선순위

- P1

## 10. F8. Trade Plan Builder

### 기능 목표

- AI verdict를 실제 entry/TP/SL 액션 플랜으로 전환한다.

### 사용자 목표

- "지금 바로 실행할 수 있는 계획을 보고 싶다."

### 주요 사용자

- scan + chat 완료 사용자

### 진입 지점

- terminal primary CTA
- chart action CTA
- intel panel CTA

### 선행 조건

- fresh scan or explicit user override

### 핵심 유저저니

1. user clicks `Build Trade Plan`
2. chart enters planning mode
3. entry/TP/SL preview shown
4. risk summary shown
5. user chooses `Track`, `Share`, `Quick Trade`

### 추천 화면 배치

- Center: chart overlay with lines
- Right: plan card
- Bottom: action row

### 상태 전이

- `plan_absent`
- `plan_preview`
- `plan_adjusting`
- `plan_confirmed`

### 성공 상태

- user understands direction, risk, and next action

### 실패/예외 상태

- chart unavailable
- stale scan
- invalid tp/sl

### KPI

- trade plan open rate
- trade plan -> quick trade
- trade plan -> share

### GTM 이벤트

- `terminal_trade_plan_opened`
- `terminal_trade_plan_adjusted`
- `terminal_trade_plan_confirmed`
- `terminal_trade_plan_failed`

### UX 개선안

- `direction / RR / entry / TP / SL / reason`를 한 카드로 요약
- stale 상태면 열리기 전에 rescan 유도

### Acceptance Criteria

- trade plan은 plan source timeframe을 보여줘야 한다.
- user는 plan 화면에서 바로 share/track/trade로 이동할 수 있어야 한다.

### 우선순위

- P1

## 11. F9. Community Share

### 기능 목표

- terminal insight를 friction 낮게 커뮤니티 포스트로 바꾼다.

### 사용자 목표

- "내 분석을 올리고 반응을 보고 싶다."

### 주요 사용자

- signal generator
- advanced users

### 진입 지점

- chart share CTA
- war room signal row share CTA

### 선행 조건

- pair/timeframe context exists

### 핵심 유저저니

1. user clicks share
2. modal opens with prefilled evidence
3. user confirms direction/levels/confidence
4. user writes short note
5. submit
6. redirected to signals feed

### 추천 화면 배치

- Step 1 evidence
- Step 2 signal config
- Step 3 post preview

### 상태 전이

- `share_open`
- `evidence_reviewed`
- `config_ready`
- `submit_pending`
- `submit_success`
- `submit_failed`

### 성공 상태

- post created with clear provenance and copy setting

### 실패/예외 상태

- evidence missing
- invalid level config
- post submit failure

### KPI

- share open -> submit
- prefilled share completion rate
- shared post engagement

### GTM 이벤트

- `terminal_share_opened`
- `terminal_share_step_completed`
- `terminal_share_submitted`
- `terminal_share_failed`

### UX 개선안

- share 후 바로 `/signals`로 이동하되, success toast로 post created identity를 보여준다.

### Acceptance Criteria

- share modal은 pair, timeframe, direction, confidence를 항상 포함해야 한다.
- copy allowed 여부가 제출 전에 명확히 보여야 한다.

### 우선순위

- P1

## 12. F10. Signals Consumption

### 기능 목표

- 사용자에게 어떤 signal을 볼지, 어떤 것을 채택할지 빠르게 판단하게 한다.

### 사용자 목표

- "무슨 시그널이 가치 있는지 빨리 보고 싶다."

### 주요 사용자

- repeat users
- community readers
- copy-trade users

### 진입 지점

- `/signals`

### 선행 조건

- none

### 핵심 유저저니

1. user chooses tab
2. scans cards
3. filters by direction or source
4. opens high-signal card
5. tracks or copy-trades

### 추천 화면 배치

- Top: intent tabs
  - Feed
  - Trending
  - AI Leaderboard
- Middle: filter chips
- Main: cards

### 상태 전이

- `tab_feed`
- `tab_trending`
- `tab_ai`
- `card_view`
- `track_success`
- `copy_handoff`

### 성공 상태

- user can decide in seconds whether to track/copy/ignore

### 실패/예외 상태

- no trust metadata
- no timeframe
- card content too dense

### KPI

- tab engagement
- track rate
- copy-trade start rate

### GTM 이벤트

- `signals_tab_viewed`
- `signal_filter_applied`
- `signal_card_opened`
- `signal_tracked`
- `signal_copytrade_started`

### UX 개선안

- 카드 메타데이터 필수:
  - origin
  - timeframe
  - freshness
  - risk summary

### Acceptance Criteria

- 모든 signal card는 최소 timeframe/freshness/origin을 표시해야 한다.
- track/copy CTA는 스크롤 없이 카드에서 바로 접근 가능해야 한다.

### 우선순위

- P1

## 13. F11. Copy Trade Handoff

### 기능 목표

- signal consumption을 실행 가능한 draft로 자연스럽게 넘긴다.

### 사용자 목표

- "이 시그널을 바로 따라 하고 싶다."

### 주요 사용자

- signals readers
- community copy users

### 진입 지점

- signal card copy CTA

### 선행 조건

- signal contains trade attachment

### 핵심 유저저니

1. user clicks copy trade
2. terminal opens with context preserved
3. draft modal auto-opens
4. user reviews evidence
5. configures order
6. publishes

### 추천 화면 배치

- Step 1 evidence
- Step 2 config
- Step 3 review/publish

### 상태 전이

- `handoff_started`
- `draft_loaded`
- `config_changed`
- `publish_pending`
- `publish_success`
- `publish_failed`

### 성공 상태

- user sees exactly what will be created before publishing

### 실패/예외 상태

- malformed signal payload
- session required
- publish rollback

### KPI

- copy click -> draft open
- draft open -> publish
- publish success rate

### GTM 이벤트

- `signal_copytrade_started`
- `copytrade_draft_loaded`
- `copytrade_step_completed`
- `copytrade_published`
- `copytrade_publish_failed`

### UX 개선안

- handoff banner:
  - `Copied from Community`
  - source author
  - pair/timeframe

### Acceptance Criteria

- user는 terminal에서 "어디서 넘어왔는지"를 잃지 않아야 한다.
- publish 실패 시 optimistic state rollback이 사용자에게도 설명되어야 한다.

### 우선순위

- P1

## 14. F12. Passport Loop

### 기능 목표

- 누적 기록을 보여주고 다음 행동을 추천한다.

### 사용자 목표

- "지난번 이후 뭐가 달라졌는지 보고 다음 행동을 고르고 싶다."

### 주요 사용자

- signed-in user
- repeat user

### 진입 지점

- header
- auth success destination
- post-action follow-up

### 선행 조건

- authenticated or partially profiled user

### 핵심 유저저니

1. user opens passport
2. sees identity + status
3. sees performance change since last visit
4. sees recommended next action
5. re-enters terminal or arena

### 추천 화면 배치

- Header: identity + tier + wallet status
- Section 1: snapshot
- Section 2: deltas
- Section 3: next best action
- Section 4: details/history

### 상태 전이

- `snapshot_loaded`
- `holdings_syncing`
- `holdings_synced`
- `next_action_ready`

### 성공 상태

- passport가 기록 소비에서 끝나지 않고 재진입을 만든다.

### 실패/예외 상태

- no recommendations
- holdings fallback unclear

### KPI

- passport -> terminal return
- passport -> arena return
- holdings sync success

### GTM 이벤트

- `passport_opened`
- `passport_next_action_clicked`
- `passport_holdings_sync_started`
- `passport_holdings_sync_completed`

### UX 개선안

- `What changed since last visit`
- `Best next action`
- `Why this is recommended`

### Acceptance Criteria

- passport 첫 화면에서 사용자는 현재 상태와 다음 행동을 모두 이해할 수 있어야 한다.

### 우선순위

- P1

## 15. F13. Arena Evaluation

### 기능 목표

- decision support와 decision evaluation을 분리해 skill loop를 만든다.

### 사용자 목표

- "내 판단이 맞는지 시험하고 싶다."

### 주요 사용자

- engaged repeat users
- gamified progression users

### 진입 지점

- home secondary path
- passport quick action
- header nav

### 선행 조건

- none, but signed-in user가 더 큰 value

### 핵심 유저저니

1. choose mode
2. understand stakes
3. draft
4. submit hypothesis
5. battle
6. result
7. passport handoff

### 추천 화면 배치

- Lobby: mode selection only
- Draft: squad and stakes only
- Battle: one primary view + optional alternates
- Result: learnings + next CTA

### 상태 전이

- `mode_select`
- `draft`
- `analysis`
- `hypothesis`
- `battle`
- `result`

### 성공 상태

- user understands what was tested and what they learned

### 실패/예외 상태

- offline mode not obvious
- too many visual modes
- result not tied back to passport

### KPI

- arena start rate
- arena complete rate
- result -> play again
- result -> passport

### GTM 이벤트

- `arena_mode_selected`
- `arena_draft_submitted`
- `arena_hypothesis_submitted`
- `arena_result_viewed`
- `arena_play_again_clicked`
- `arena_to_passport_clicked`

### UX 개선안

- result screen에서 `Send to Passport` 또는 `View in Passport`를 강한 primary CTA로 제공

### Acceptance Criteria

- Arena는 Terminal과 목적이 다르다는 점이 첫 화면부터 명확해야 한다.

### 우선순위

- P2

## 16. F14. Settings & Personalization

### 기능 목표

- cosmetic settings이 아니라 행동 규칙을 바꾸는 설정을 제공한다.

### 사용자 목표

- "내 스타일에 맞게 터미널 행동을 바꾸고 싶다."

### 주요 사용자

- repeat users
- power users

### 진입 지점

- settings page

### 선행 조건

- none

### 핵심 유저저니

1. open settings
2. understand each setting's behavioral effect
3. change preference
4. next session behavior updates

### 추천 화면 배치

- each setting block must include:
  - label
  - effect description
  - current state

### 상태 전이

- `local_only`
- `saving`
- `synced`

### 성공 상태

- user knows what will actually change in terminal behavior

### 실패/예외 상태

- setting names are abstract
- no visible effect after saving

### KPI

- settings adoption
- auto-rescan opt-in rate
- pattern mode adoption

### GTM 이벤트

- `settings_opened`
- `settings_changed`
- `settings_saved`

### UX 개선안

- 우선 설정:
  - default timeframe
  - auto-rescan on timeframe change
  - pattern detection mode
  - density
  - language

### Acceptance Criteria

- settings는 반드시 runtime behavior change를 동반해야 한다.

### 우선순위

- P2

## 17. Implementation Order

### Batch 1

- F2 Wallet Identity & Auth
- F3 Market Data Trust Layer
- F4 Terminal Scan
- F5 Pair/Timeframe Control

### Batch 2

- F7 AI Chat Copilot
- F8 Trade Plan Builder
- F9 Community Share
- F10 Signals Consumption
- F11 Copy Trade Handoff

### Batch 3

- F12 Passport Loop
- F6 Pattern Intelligence
- F13 Arena Evaluation
- F14 Settings & Personalization

## 18. Final Design Standard

이 문서 기준으로 모든 기능은 아래 5가지 질문에 답해야 한다.

1. 이 기능은 제품 루프에서 무엇을 달성하는가?
2. 사용자는 어디서 들어와 무엇을 눌러야 하는가?
3. 눌렀을 때 무엇이 화면에 보여야 하는가?
4. 성공과 실패를 어떻게 구분하는가?
5. GTM은 무엇을 기록해야 하는가?

이 질문에 답하지 못하면 기능은 구현돼 있어도 설계된 것이 아니다.
