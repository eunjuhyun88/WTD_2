# Terminal UIUX + Refactor Design v3 (CLAUDE.md 준수)

Date: 2026-03-06  
Scope: `/terminal` 전면 UIUX 최적화 + 구조 리팩토링 (Design-First)

## 0) 기준 문서
- Root guide: `/Users/ej/Downloads/maxidoge-clones/CLAUDE.md`
- Active codebase guide: `/Users/ej/Downloads/maxidoge-clones/frontend/CLAUDE.md`
- Local authority:
  - `docs/product-specs/terminal.md`
  - `docs/FRONTEND.md`
  - `docs/DESIGN.md`
- Arena/learning semantics when needed:
  - `docs/design-docs/arena-domain-model.md`
  - `docs/design-docs/learning-loop.md`
- External fallback only for edge-case semantics:
  - `STOCKCLAW_UNIFIED_DESIGN.md`

---

## 1) 문제 정의 (1~3문장)
- Terminal은 실사용 핵심 페이지인데, 정보 계층이 혼합되어 첫 3초 내 “무엇을 해야 하는지”가 약하다.
- 레이아웃/상태/액션이 대형 파일(`+page.svelte`, `IntelPanel.svelte`)에 집중되어 UI 변경 리스크와 회귀 가능성이 높다.
- 모바일/태블릿에서 패널 간격과 밀도 일관성이 떨어져, 트레이딩뷰 수준의 빠른 의사결정 UX를 방해한다.

---

## 2) UX 플로우 정의

### A. First-scan 플로우
1. 시작: Terminal 진입 (`/terminal`)
2. 중간: WarRoom 또는 Chart에서 `RUN FIRST SCAN`
3. 종료(성공): Consensus + Top signal + Trade CTA 노출
4. 종료(실패): 네트워크/LLM 실패 메시지 + fallback 안내 + 재시도 액션

### B. Trade 실행 플로우
1. 시작: WarRoom 요약칩/신호카드 또는 Intel 챗에서 방향 확보
2. 중간: Chart 오버레이로 entry/tp/sl 확인
3. 종료(성공): `TRADE THIS SIGNAL`/`EXECUTE`로 포지션 생성
4. 종료(실패): 차트 미준비/데이터 누락 시 차단 + 복구 가이드

### C. Positions 확인 플로우
1. 시작: Intel > Positions
2. 중간: sync 상태 확인 + live/demo 구분
3. 종료(성공): 현재 포지션/마켓 전환
4. 종료(실패): 에러를 hard red로만 표시하지 않고 demo fallback + retry 제시

---

## 3) 데이터 플로우

### 입력 (Store/API)
- Stores: `gameState`, `livePrices`, `openTradeCount`, `activeSignalCount`, `copyTradeStore`, `trackedSignalStore`
- APIs:
  - `/api/terminal/scan*`
  - `/api/chat/messages`
  - `/api/market/news`, `/api/market/trending`, `/api/market/alerts/onchain`
  - `/api/positions/*`, `/api/gmx/*`, `/api/polymarket/*`

### 처리 (ViewModel/Helper)
- Shell state: viewport 분기, consensus/cta 계산, auto tab switch, gtm payload
- Domain state:
  - WarRoom: scan lifecycle + signal summary + actionability ranking
  - Intel: tab별 feed/positions/chat 상태
  - Chart: overlay/execute gating

### 출력 (UI/API)
- UI: 3-lane 패널, CTA, badge, empty/error/demo states
- API write:
  - signal track, copy trade, community post, quick trade open/close
- Analytics:
  - `terminal_*` GTM 이벤트 유지 (payload 표준화)

---

## 4) 경계 조건 (필수)
- 인증 없음: 기능 read-only fallback, write 액션은 명확히 차단/가이드
- 데이터 없음:
  - scan 없음: 단일 primary CTA
  - positions 없음: 액션형 empty state
  - trending/onchain 없음: skeleton + “last good data” 문구
- 네트워크 실패:
  - chat 실패 시 offline fallback 유지
  - positions 실패 시 demo fallback + retry
  - 외부 링크는 sanitizer 통과값만 렌더

---

## 5) 정보구조(IA) 재설계

### L0 (항상 보임: 결정을 위한 최소 정보)
- Pair / TF / Consensus / Confidence / Primary CTA / Density toggle

### L1 (행동 레이어)
- WarRoom: 신호 요약 + 즉시 액션
- Chart: 실행 및 검증
- Intel: 근거/질문/포지션

### L2 (확장 레이어)
- Feed 상세, On-chain, Community, Markets

원칙:
- Essential = 결정 우선
- Pro = 근거 확장
- 모든 실패 상태는 “다음 행동”을 포함

---

## 6) IA 기반 레이아웃 규칙 (TradingView UX 기준)

### Desktop (>=1024)
- 3-lane: WarRoom / Chart / Intel
- 패널 폭 기본값:
  - WarRoom: 300~340px
  - Intel: 320~360px
  - Center는 남는 공간
- 내부 패널 리사이즈 금지, lane 분할만 허용

### Tablet (768~1023)
- Top: WarRoom | Chart
- Bottom: Intel (고정 최소높이 확보)
- split bar 2개만 유지 (x/y)

### Mobile (<768)
- Bottom nav 3탭 유지
- 상단 컨트롤바 + 탭 컨텐츠 1개만 집중 노출
- 가로 스크롤 영역 최소화, 행 높이 40~44px 일관

---

## 7) 리팩토링 실행 순서 (어디부터 고칠지)

## Phase 1 — Shell 안정화 (최우선)
- 대상: `src/routes/terminal/+page.svelte`
- 작업:
  - 레이아웃/스타일 스코프 정리
  - viewport 분기 로직과 도메인 액션 분리 준비
  - 공통 UI(티커/컨트롤바) 분리 완료
- 목적: 회귀 위험이 큰 진입점 안정화

## Phase 2 — Intel 분해 (두 번째)
- 대상: `src/components/terminal/IntelPanel.svelte`
- 분리:
  - `IntelChatTab.svelte`
  - `IntelFeedTab.svelte`
  - `IntelPositionsTab.svelte`
- 목적: U4/U5/U6(에러/온체인/트렌딩 밀도) 개선을 독립적으로 진행 가능하게

## Phase 3 — Chart 액션 레이어 분해 (세 번째)
- 대상: `src/components/arena/ChartPanel.svelte`
- 분리:
  - first-scan/execute CTA overlay
  - trade setup overlay renderer
  - pattern scan trigger module
- 목적: 실행 UX와 차트 렌더 로직을 분리해 버그 격리

## Phase 4 — WarRoom CTA/요약 최적화
- 대상: `warroom/*`
- 작업:
  - snapshot 영역 규격화
  - CTA 카피/상태 기준 통일
  - 통계 footer를 행동 중심으로 재배치

## Phase 5 — ViewModel 계층 도입
- 대상: `src/components/terminal/terminalViewModel.ts` (신규)
- 작업:
  - decision rail 계산식, chat trade readiness, auto tab switch 조건 이동
  - `+page`는 orchestration 전용으로 축소

---

## 8) 영향 파일 (1차)
- `src/routes/terminal/+page.svelte`
- `src/components/terminal/IntelPanel.svelte`
- `src/components/terminal/WarRoom.svelte`
- `src/components/terminal/warroom/*`
- `src/components/arena/ChartPanel.svelte`
- `src/components/terminal/terminalHelpers.ts`

---

## 9) 수용 기준 (DoD)
- 기능/품질
  - `npm run check` 0 errors
  - `npm run build` success
  - warning 총량 증가 금지 (`check:budget` 기준)
- UX
  - first-scan 경로에서 1 primary CTA만 노출
  - positions 오류 시 fallback/demo + retry 동시 제공
  - mobile/tablet/desktop에서 패널 간격/행 높이 일관
- 구조
  - `+page.svelte`는 layout orchestration 중심
  - Intel/Chart 대형 파일 분해 시작 또는 완료
- 보안
  - 외부 URL 렌더는 sanitizer 경유만 허용

---

## 10) 즉시 착수 순서 (실행 지시)
1. `+page.svelte` 남은 레이아웃/스타일 스코프 정리 완료
2. `IntelPanel` 탭 분리 스캐폴드 생성
3. 각 탭을 기존 기능 1:1 이관 후 check/build
4. ChartPanel CTA 레이어 분리
