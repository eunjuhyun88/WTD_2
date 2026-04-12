# Terminal Refactor Master Plan (UIUX + Code) — 2026-03-06

Canonical companions:
- `docs/product-specs/terminal.md`
- `docs/FRONTEND.md`
- `docs/DESIGN.md`

## 1) 목적
- 터미널 화면을 "한 번에 이해되고 바로 행동 가능한 구조"로 재설계한다.
- 과대 컴포넌트를 분해해 유지보수성과 안정성을 높인다.
- 보안/성능/중복/불필요 코드를 함께 정리한다.

## 2) 현재 스캔 결과 (구조 진단)
- 핵심 파일 크기:
  - `src/routes/terminal/+page.svelte`: 3,512 lines
  - `src/components/arena/ChartPanel.svelte`: 4,157 lines
  - `src/components/terminal/IntelPanel.svelte`: 2,783 lines
  - `src/components/terminal/WarRoom.svelte`: 737 lines
  - `src/components/terminal/warroom/warroom.css`: 635 lines
- `+page.svelte` 기준:
  - 함수 수: 52
  - `on:*` 이벤트 바인딩: 169
  - `resize-handle` 사용 지점: 30
  - `TerminalControlBar` 동일 호출: 3회 (mobile/tablet/desktop)

## 3) 문제 정의
- 설계:
  - 라우트 파일이 레이아웃/도메인 상태/비즈니스 액션을 모두 포함하는 "God component" 상태.
  - 화면별(모바일/태블릿/데스크톱) 분기가 한 파일에서 중첩되어 배치 규칙 변경이 위험하다.
- 코드:
  - 같은 UI 패턴(컨트롤바, 리사이즈 핸들, 패널 wrapper) 반복.
  - 상태 의존성이 여러 곳으로 분산되어 버그 재현/수정 난이도가 높다.
- 잠재 버그:
  - 뷰포트 기준 브레이크포인트가 패널 실제 폭과 어긋나는 지점 존재.
  - 숨김(CSS) 처리된 기능이 DOM/핸들러는 계속 유지되는 구간 존재.
- 보안:
  - 외부 URL 렌더링(`href`, `img src`)의 프로토콜 검증 레이어가 약함.
- 성능:
  - 대형 단일 컴포넌트 + 과도한 이벤트 핸들러 + 강한 시각효과(backdrop/animation)로 저사양 기기 부담 가능.

## 4) 목표 아키텍처 (Target)
- Route Shell:
  - 레이아웃 스위칭과 상위 orchestration만 담당.
- ViewModel Layer:
  - `useTerminalViewModel`(또는 store)로 상태/액션/파생값을 집중.
- Presentation Layer:
  - 순수 렌더 컴포넌트로 분리 (`props` 중심).
- Design System Layer:
  - spacing/color/typography/motion 토큰 단일화.

## 5) 정보구조(IA) 재설계
- L0: Context Lane
  - Pair, Timeframe, Consensus, Primary CTA, Density
- L1: Action Lanes
  - WarRoom (signals/actions), Chart (execution), Intel (explain/confirm)
- L2: Detail/History
  - feed, positions, on-chain 상세
- 원칙:
  - Essential 모드: "결정에 필요한 정보만"
  - Pro 모드: "근거 확장"
  - 오류 상태: blank 금지, fallback 우선

## 6) 리팩토링 실행 단계

### Phase 0 — 안전장치 (반드시 선행)
- Terminal 스냅샷 기준선 작성 (desktop/tablet/mobile).
- 핵심 사용자 플로우 스모크 체크 정의:
  - scan -> signal -> chart apply -> trade planner
  - chat -> go trade
  - positions sync error -> fallback
- GTM 이벤트 계약 정리(이벤트명/필수 payload).

### Phase 1 — 레이아웃 분해
- `+page.svelte` 분할:
  - `TerminalDesktopLayout.svelte`
  - `TerminalTabletLayout.svelte`
  - `TerminalMobileLayout.svelte`
  - `TerminalShell.svelte` (조합만 담당)
- `TerminalControlBar` props 객체화로 중복 호출 제거.
- 모바일 리사이즈 기능은 정책 결정:
  - 유지 시: 별도 feature flag
  - 제거 시: 코드/핸들러 완전 삭제

### Phase 2 — 도메인 상태/액션 분리
- `terminalViewModel.ts`로 이동:
  - scanning, latestScan, consensus labels, trade-ready logic, CTA logic
- UI 컴포넌트는 side effect 제거:
  - API 호출/스토어 write는 VM 또는 action service로 제한

### Phase 3 — 패널 단위 리팩토링
- WarRoom:
  - header/feed/footer는 현재 분할 유지, style token 기반 재정렬
- Intel:
  - 탭별 하위 컴포넌트 분리 (`IntelChatTab`, `IntelFeedTab`, `IntelPositionsTab`)
- Chart:
  - drawing logic, indicator logic, trade planner logic를 서브 모듈로 분리

### Phase 4 — 디자인 시스템/중복 제거
- 공통 스타일 토큰:
  - spacing 4/6/8/12/16
  - semantic colors (`--color-positive`, `--color-negative`, `--color-warning`)
- 반복 패턴 공통화:
  - `PanelFrame`, `ScrollableSection`, `StatusBadge`, `EmptyStateCard`
- 불필요 CSS/미사용 상태/미사용 타입 삭제

### Phase 5 — 보안/성능 강화
- 외부 URL sanitizer 도입 (`safeExternalUrl`):
  - `http/https`만 허용
- 이미지 URL allowlist(또는 proxy) 전략 적용
- 성능 가드:
  - animation/backdrop 조건부 적용 (`prefers-reduced-motion`, mobile low-power)
  - 긴 리스트 가상화 검토 (signals, feed)

## 7) 파일 단위 목표
- `src/routes/terminal/+page.svelte`:
  - 3,512 -> 800 lines 이하
- `src/components/arena/ChartPanel.svelte`:
  - 4,157 -> 1,600 lines 이하
- `src/components/terminal/IntelPanel.svelte`:
  - 2,783 -> 1,200 lines 이하
- `src/components/terminal/warroom/warroom.css`:
  - 635 -> 300 lines 이하 (공통 토큰/컴포넌트 CSS로 이관)

## 8) 완료 기준 (Definition of Done)
- 품질:
  - `npm run check`, `npm run build` 통과
  - 신규 warning 증가 금지
- UX:
  - mobile/tablet/desktop 핵심 플로우 시각적 QA 통과
  - 오류 상태에서 빈 화면 금지
- 코드:
  - Route shell에서 비즈니스 로직 제거
  - 중복 패턴 3개 이상 공통 컴포넌트로 통합
- 보안:
  - 외부 URL 안전 처리 적용
- 성능:
  - 초기 렌더/탭 전환 체감 지연 개선 확인

## 9) 우선순위 (실행 순서)
1. Phase 0 (가드레일)
2. Phase 1 (`+page` 레이아웃 분해)
3. Phase 2 (ViewModel 분리)
4. Phase 3 (Intel/Chart 대형 분해)
5. Phase 4~5 (공통화 + 보안/성능)

## 10) 즉시 적용 가능한 Quick Wins
- `MOBILE_TAB_META` 미사용 필드 정리 (`icon`, `desc` 사용/삭제 결정).
- 숨김만 된 모바일 리사이즈 로직 삭제 여부 확정.
- `TerminalControlBar` 중복 props 묶음화.
- `IntelPanel` 외부 링크 sanitizer 적용.

## 11) 진행 현황 (2026-03-06)
- 완료:
  - `terminalHelpers.ts`로 레이아웃 상수/타입/스타일 빌더/휠 델타 유틸 분리.
  - `+page.svelte`에서 `TerminalControlBar` 3회 호출 공통 props 객체(`terminalControlBarProps`) 적용.
  - `ChartPanel` 반복 props 공통화(`sharedChartPanelProps`) + `clearActiveTradeSetup` 핸들러 단일화.
  - `IntelPanel` 반복 props 공통화(`sharedIntelPanelProps`)로 뷰포트별 전달 일관성 확보.
- 검증:
  - `npm run check` 통과 (0 errors, 기존 전역 warnings 유지)
  - `npm run build` 통과
- 다음 우선순위:
  - Phase 1 계속: 모바일/태블릿/데스크톱 레이아웃 Svelte 컴포넌트 분리 (`Terminal*Layout.svelte`).
  - Phase 2 착수: 스캔/채팅/트레이드 액션을 `terminalViewModel.ts`로 이동.

## 12) P0 재설계 — 헤더 하단 패널 제거 (2026-03-06)
- 문제:
  - 글로벌 헤더 직하단에 `TerminalControlBar` 카드형 패널이 별도 row로 존재해 시각적 중복 + 수직 공간 낭비를 유발.
  - 데스크톱 기준 상단 고정 영역이 약 `36px(전역 헤더) + ~52px(터미널 컨트롤 row)`로 커져 초기 차트 가시 높이가 줄어듦.
- 목표:
  - "헤더 다음에 바로 작업공간(패널)"이 보이도록 구조 단순화.
  - 의사결정 정보(컨센서스/CTA)는 유지하되 카드형 패널 제거.
  - TradingView 스타일: 상단은 얇은 정보 스트립, 본문은 최대한 chart-first.
- 레이아웃 계약:
  - Desktop/Tablet:
    - `desktop-control-row`, `tablet-control-row` 제거.
    - 컨트롤 정보는 `center/chart 영역 상단 스트립`으로 재배치(높이 28~32px).
    - `pair/timeframe`는 전역 헤더와 중복되므로 축약 또는 비노출.
  - Mobile:
    - 현재 compact bar 유지 가능, 단 2-row 구조를 1-row 우선으로 축소 검토.
- 코드 설계:
  - `src/routes/terminal/+page.svelte`
    - grid row 재정의: 컨트롤 전용 row 제거.
    - center panel 내부에 top strip 슬롯 추가.
  - `src/components/terminal/TerminalControlBar.svelte`
    - card 스타일 → inline strip 스타일로 전환(반경/그림자/두꺼운 패딩 제거).
    - variant 도입: `inline`(desktop/tablet), `compact`(mobile).
  - 필요 시 `TerminalActionRail.svelte` 신규 컴포넌트 분리.
- 수용 기준:
  - 헤더 하단 카드형 패널 DOM/스타일 제거.
  - 데스크톱 기준 본문 가시 높이 최소 +20px 확보.
  - `RUN FIRST SCAN`/`TRADE`/`DENSITY` 액션 접근성 유지.
  - `npm run check`, `npm run build` 통과.
- 적용 상태:
  - Desktop/Tablet: 독립 컨트롤 row 제거 후 chart top rail로 이관 완료.
  - Mobile: compact 카드 + 보조 topbar 제거, inline rail 1줄 구조로 단순화 완료.
  - 검증: `npm run check`, `npm run build` 통과.
