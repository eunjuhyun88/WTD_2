# STOCKCLAW 기능명세서 (현재 구현 기준)

Date: 2026-02-21  
Workspace: `/Users/ej/Downloads/stockclaw-unified`

## 1) 문서 목적

본 문서는 현재 코드에 구현된 기능을 기준으로, 화면/동작/API/상태 저장 규칙을 명세한다.  
리팩토링 계획이나 목표 구조가 아니라, "지금 사용자에게 제공되는 기능"을 정의하는 문서다.

## 2) 시스템 개요

- 제품 성격: AI 에이전트 기반 트레이딩 시뮬레이션 웹앱
- 핵심 도메인: `Arena`, `Terminal`, `Signals/Community`, `Passport`, `Oracle`, `Settings`
- 런타임
  - 클라이언트: Svelte store + localStorage + 주기/실시간 업데이트
  - 서버: SvelteKit API (`/api/*`)
  - DB: PostgreSQL (`users`, `sessions`, `matches`, `quick_trades`, `tracked_signals`, `user_preferences`, `user_ui_state` 등)

### 2.1 한눈에 보는 유저저니
1. 홈(`/`)에서 서비스 탐색 후 주요 모드 진입(`TERMINAL`, `ARENA`, `SIGNALS`)
2. 지갑 연결/서명 검증 또는 이메일 가입으로 계정/세션 생성
3. 터미널(`/terminal`)에서 차트/워룸/인텔 확인 후 시그널 액션 수행
4. 시그널 액션(Track, Quick Trade, Copy Trade)으로 포지션/추적 데이터 생성
5. 아레나(`/arena`)에서 가설 입력 후 배틀 진행, 결과(승패/LP/기록) 저장
6. 시그널 허브(`/signals`)에서 커뮤니티 아이디어 탐색 및 트레이드 전환
7. 패스포트(`/passport`)에서 프로필/포지션/성과/배지 확인
8. 오라클(`/oracle`)에서 에이전트 정확도 랭킹 확인
9. 설정(`/settings`)에서 기본 환경(시간봉/속도/알림/UI 상태) 저장

### 2.2 핵심 기능 그룹
- 인증/세션: 가입, 세션 조회, 로그아웃, 지갑 nonce-서명 검증
- 시장/차트: Binance 시세/캔들/WS 반영, timeframe/pair 전환
- 트레이딩: 퀵트레이드 오픈/종료, PnL 계산
- 시그널: 추적, 만료, 트레이드 전환, 카피트레이드 발행
- 아레나: phase 기반 배틀, 합의/결과 계산, 리플레이
- 커뮤니티/라이브: 포스트, 반응, 활동 피드
- 사용자 데이터: 프로필, 패스포트 통계, 설정/패널 상태 영속화

## 3) 사용자 등급/권한

### 3.1 사용자 티어
- `guest`
- `registered`
- `connected`
- `verified`

### 3.2 인증 기준
- 세션 쿠키(`stockclaw_session`)가 유효해야 보호 API 접근 가능
- 보호 API 미인증 시 `401 Authentication required`

## 4) 화면 기능 명세

## 4.1 홈 (`/`)

### F-HOME-001 랜딩/히어로 노출
- 위치: `/src/routes/+page.svelte`
- 설명: 서비스 가치 제안, 주요 모드(TERMINAL/ARENA/SIGNALS/COMMUNITY) 진입점 제공
- 입력: 페이지 진입
- 출력: 섹션 렌더(히어로/플로우/스쿼드/피드/CTA)

### F-HOME-002 Feature 카드 상세 토글
- 설명: 우측 Feature 카드 클릭 시 좌측 상세 패널 토글
- 입력: Feature 카드 클릭
- 처리: `selectedFeature` 인덱스 변경
- 출력: 상세 설명/스탯/CTA 표시

### F-HOME-003 빠른 이동 CTA
- 설명: 홈에서 주요 화면으로 즉시 이동
- 입력: CTA 버튼 클릭
- 출력: `/terminal`, `/arena`, `/signals`, `/passport`, `/oracle` 이동

## 4.2 지갑/가입 모달 (Global)

### F-AUTH-001 지갑 연결 플로우
- 위치: `/src/components/modals/WalletModal.svelte`
- 사전조건: 모달 오픈
- 흐름:
  1. provider 선택
  2. MetaMask 계정 요청(`eth_requestAccounts`)
  3. nonce 발급(`/api/auth/nonce`)
  4. 서명(`personal_sign`)
  5. 검증(`/api/auth/verify-wallet`)
- 출력: 연결 상태(`connected/verified`) 업데이트
- 예외: provider 없음, 서명 실패, nonce 만료/사용됨

### F-AUTH-002 이메일 회원가입
- 입력: `email`, `nickname` (+ optional wallet)
- 처리: `/api/auth/register`
- 출력: 세션 쿠키 발급 + 사용자 생성
- 실패: 이메일/닉네임 중복(409), 유효성 오류(400)

## 4.3 터미널 (`/terminal`)

### F-TERM-001 반응형 레이아웃
- 위치: `/src/routes/terminal/+page.svelte`
- 모드:
  - Mobile(`<768`): 탭 기반(`warroom/chart/intel`)
  - Tablet(`768~1023`): 상단 2패널 + 하단 Intel
  - Desktop(`>=1024`): 3패널 + 좌우 리사이즈/collapse
- 상태: 패널 폭/탭 상태는 `ui-state` API로 저장 가능

### F-TERM-002 War Room 시그널 액션
- 위치: `/src/components/terminal/WarRoom.svelte`
- 기능:
  - 시그널 추적(Track)
  - 퀵트레이드 오픈(Long/Short)
  - 복수 시그널 선택 후 Copy Trade 실행
- 데이터: Coinalyze 파생지표(OI, Funding, L/S, Liq)

### F-TERM-003 차트 패널
- 위치: `/src/components/arena/ChartPanel.svelte`
- 기능:
  - Binance Kline 조회/WS 구독
  - timeframe/pair 전환
  - MA/RSI 지표 표시
  - Agent mode / TradingView mode 전환
  - 간단 드로잉(hline/trendline)

### F-TERM-004 Intel/Community/Positions 패널
- 위치: `/src/components/terminal/IntelPanel.svelte`
- 기능:
  - 인텔 탭(headlines/events/flow)
  - 커뮤니티 피드/반응
  - 포지션(예측 시장 요약 + 오픈 포지션)
  - 채팅 전송(`sendchat` 이벤트)

### F-TERM-005 시그널에서 CopyTrade deep-link
- 입력: `/terminal?copyTrade=1&pair=...`
- 처리: URL 파라미터 파싱 후 CopyTrade 모달 오픈
- 출력: 파라미터 제거(`history.replaceState`)

## 4.4 아레나 (`/arena`)

### F-ARENA-001 배틀 매치 라이프사이클
- 위치: `/src/routes/arena/+page.svelte`
- 단계: `standby -> config -> deploy -> hypothesis -> ... -> result`
- 기능: squad 구성, phase 전개, consensus 계산, 승패/LP 반영

### F-ARENA-002 가설 입력/검증
- 기능: 방향/TP/SL/RR 설정 후 AI 에이전트 투표와 비교
- 출력: 비교 UI, verdict, battle 결과

### F-ARENA-003 결과 저장
- 저장 대상:
  - match history
  - PnL entry
  - agent XP/stat
  - feed
- 서버 동기화: `/api/matches` POST

### F-ARENA-004 리플레이
- 기능: 과거 매치 record 기반 단계별 재생
- 제어: 시작/자동 진행/종료

## 4.5 시그널/커뮤니티 (`/signals`)

### F-SIGNAL-001 View 스위치
- 위치: `/src/routes/signals/+page.svelte`
- 모드: `community` / `signals`
- URL 동기화: `?view=signals`

### F-SIGNAL-002 신호 집계/필터
- 집계 소스:
  - arena 기록
  - open trade
  - tracked signal
  - agent 기본 시그널
- 필터: `all`, `active`, `arena`, `trade`, `tracked`, `priority`

### F-SIGNAL-003 액션
- Track: tracked signal 생성
- Trade: terminal로 deep-link 이동(copyTrade 파라미터)

### F-SIGNAL-004 Live 패널 통합
- `LivePanel` 임베드로 세션/활동 피드 동시 제공
- `/live` 진입 시 `/signals`로 redirect

## 4.6 라이브 (`/live`)

### F-LIVE-001 라우트 리다이렉트
- 위치: `/src/routes/live/+page.ts`
- 동작: `307 /signals` 리다이렉트

### F-LIVE-002 실시간 활동 패널 컴포넌트
- 위치: `/src/components/live/LivePanel.svelte`
- 기능:
  - 가격 티커(3초 주기)
  - arena/trade/signal/agent activity feed
  - reaction 버튼

## 4.7 패스포트 (`/passport`)

### F-PASS-001 통합 프로필 카드
- 위치: `/src/routes/passport/+page.svelte`
- 정보: 사용자명/아바타/tier/지갑/포트폴리오/핵심 지표

### F-PASS-002 탭 기능
- 탭: `profile`, `wallet`, `positions`, `arena`
- 탭 상태 저장: `/api/ui-state`의 `passportActiveTab`

### F-PASS-003 프로필 편집
- 기능: 아바타 변경, 닉네임 변경
- API: `/api/profile` PATCH

### F-PASS-004 포지션/기록 집계
- 오픈 트레이드, tracked signals, match history, badge 상태 반영

## 4.8 오라클 (`/oracle`)

### F-ORACLE-001 에이전트 정확도 랭킹
- 위치: `/src/routes/oracle/+page.svelte`
- 입력: agent stats + match history
- 필터: 기간(`7d/30d/all`), 정렬(`accuracy/level/sample/conf`)
- 출력: 랭킹 테이블 + agent detail

## 4.9 설정 (`/settings`)

### F-SET-001 사용자 설정 조회/저장
- 위치: `/src/routes/settings/+page.svelte`
- 항목: timeframe, source, speed, chartTheme, language, signals, sfx
- API: `/api/preferences` GET/PUT

### F-SET-002 전체 데이터 초기화
- 기능: resettable storage key 삭제 후 reload
- 주의: 로컬 데이터 전부 삭제

## 5) 서버 API 기능 명세 (핵심)

## 5.1 인증/세션

### A-AUTH-001 `POST /api/auth/register`
- 인증: 불필요
- Request: `email`, `nickname`, `walletAddress?`, `walletSignature?`
- Success: `success`, `user`, 세션 쿠키 설정
- Errors: `400`, `409`, `500`

### A-AUTH-002 `GET /api/auth/session`
- 인증: 쿠키 기반
- Success: `authenticated`, `user`
- Error/비정상 쿠키: `authenticated=false`, 쿠키 삭제

### A-AUTH-003 `POST /api/auth/nonce`
- Request: `address`, `provider?`
- Success: `nonce`, `message`, `expiresAt`

### A-AUTH-004 `POST /api/auth/verify-wallet`
- Request: `address`, `message`, `signature`, `provider?`
- Success: `verified`, `linkedToUser`, `wallet`
- Error: nonce invalid/expired/used(401)

### A-AUTH-005 `POST /api/auth/logout`
- Success: 세션 revoke + 쿠키 삭제

## 5.2 트레이딩/시그널

### A-TRADE-001 `POST /api/quick-trades/open`
- 인증: 필요
- Request: `pair`, `dir`, `entry`, `tp?`, `sl?`, `currentPrice?`, `source?`, `note?`
- Success: `trade`

### A-TRADE-002 `POST /api/quick-trades/{id}/close`
- 인증: 필요
- Request: `closePrice`, `status?`
- Success: `trade`(closed/stopped)

### A-SIG-001 `POST /api/signals/track`
- 인증: 필요
- Request: `pair`, `dir`, `confidence`, `entryPrice`, `currentPrice`, `source`, `note`, `ttlHours?`
- Success: `signal`

### A-SIG-002 `POST /api/signals/{id}/convert`
- 인증: 필요
- Request: `entry?`, `tp?`, `sl?`, `note?`
- Success: `trade` 생성 + signal 상태 converted

### A-COPY-001 `POST /api/copy-trades/publish`
- 인증: 필요
- Request: `selectedSignalIds[]`, `draft`, `confidence?`
- Success: `run`, `trade`, `signal` 동시 반환

## 5.3 매치/프로필/설정

### A-MATCH-001 `GET /api/matches`
- 인증: 필요
- Query: `limit`, `offset`
- Success: `records`, `pagination`

### A-MATCH-002 `POST /api/matches`
- 인증: 필요
- Request: `matchN`, `win`, `lp`, `score`, `streak`, ...
- Success: `record`

### A-PROFILE-001 `GET /api/profile/passport`
- 인증: 필요
- Success: tier/총전적/open trade/tracked signal/agent summary

### A-PREF-001 `GET|PUT /api/preferences`
- 인증: 필요
- 기능: 사용자 기본 설정 조회/수정

### A-UISTATE-001 `GET|PUT /api/ui-state`
- 인증: 필요
- 기능: 터미널 패널 폭/탭/오라클 정렬/패스포트 탭 상태 저장

## 5.4 커뮤니티/알림/채팅

### A-COMM-001 `GET|POST /api/community/posts`
- GET: 목록/필터
- POST: 글 작성

### A-NOTI-001 `GET|POST /api/notifications`
- GET: 알림 목록
- POST: 알림 생성

### A-NOTI-002 `POST /api/notifications/read`
- 기능: 특정/전체 읽음 처리

### A-CHAT-001 `GET|POST /api/chat/messages`
- GET: 채널별 메시지 목록
- POST: 메시지 등록

## 6) 상태 저장 명세

## 6.1 localStorage 키
- `stockclaw_state`
- `stockclaw_agents`
- `stockclaw_wallet`
- `stockclaw_match_history`
- `stockclaw_quicktrades`
- `stockclaw_tracked`
- `stockclaw_predict_positions`
- `stockclaw_community`
- `stockclaw_profile`
- `stockclaw_pnl`
- `stockclaw_users`
- `stockclaw_matches`
- `stockclaw_signals`
- `stockclaw_predictions`

## 6.2 동기화 패턴
- 원칙: 로컬 optimistic update 후 서버 동기화
- hydrate: 앱 시작/페이지 진입 시 서버 데이터 merge
- ID 치환: 로컬 임시 ID를 서버 ID로 교체

## 7) 비기능 요구(현재 구현 동작)

- 가격 반영
  - Header mini ticker: WS + 1초 배치 반영
  - Terminal 가격 동기화: 30초 주기 (`updateAllPrices`, `updateTrackedPrices`)
  - LivePanel ticker: 3초 주기
- 저장 성능
  - 대부분 store 저장은 250~1000ms debounce
- 반응형
  - 주요 분기: 768px, 1024px

## 8) 예외/실패 공통 처리

- 보호 API 미인증: `401`
- 입력 유효성 오류: `400`
- 리소스 없음: `404`
- 상태 충돌(이미 종료/변환 등): `409`
- DB 미설정: `500` + `Server database is not configured`

## 9) 수용 기준 (기능 검수 체크리스트)

- 홈에서 `TERMINAL/ARENA/SIGNALS` 정상 이동
- Wallet 모달에서 nonce->서명->검증 플로우 완료 가능
- Terminal에서
  - pair 변경이 차트/WarRoom 상태와 동기화됨
  - Track/QuickTrade/CopyTrade가 반영됨
- Arena 매치 종료 후 match history/pnl/agent stat이 증가함
- Signals에서 필터와 view 전환이 동작함
- Passport 탭 상태가 재진입 시 복원됨
- Settings 변경이 서버(`preferences`)와 동기화됨
- 알림 읽음 처리/채팅 저장 API가 정상 응답

---

본 명세서는 "현재 코드 구현"을 기준으로 작성되었으며, 요구사항 변경 시 기능 ID 단위로 갱신한다.
