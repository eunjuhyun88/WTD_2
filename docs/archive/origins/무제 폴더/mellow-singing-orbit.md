# HOOT Protocol UI/UX 감사 및 반응형 리팩토링 계획

## Context

**대상 서버**: `localhost:5215` (worktree: `clever-mclean`)
파란 올빼미 + 한국어 UI로 리디자인된 최신 버전. 6개 메인 페이지(Dashboard, Studio, Models, Network, Protocol, Protocol sub-tabs)를 데스크톱(1280), 태블릿(768), 모바일(375)에서 스크린샷 기반으로 감사함.

---

## Phase 1: Critical Bugs (P0)

### 1-1. ModelsPage — 콘텐츠가 투명해서 안 보임 (전 뷰포트)
- **파일**: `src-svelte/lib/pages/models/ModelsHero.svelte` (line 149-162, 225-280)
- **증상**: "Model Hub" 타이틀 + "Train New Model" 버튼만 보이고 stats-ribbon, featured-card, catalog 전부 안 보임
- **근본 원인**: CSS `animation: fade-up 500ms ... both`가 실행되지 않아 `opacity: 0` 상태에서 멈춤. `animPlayState: "running"`이지만 실제로 시각적 전이가 발생하지 않음. Svelte의 scoped CSS가 `@keyframes`를 `s-FfpGsmkLXfql-fade-up`으로 해싱하면서 동적 마운트 시 애니메이션 트리거 실패
- **DOM 확인**: `stats-ribbon {opacity: 0, transform: translateY(16px)}`, `featured-card {opacity: 0, transform: translateY(16px)}`
- **수정**:
  - `animation: fade-up ... both` 대신 Svelte 트랜지션(`transition:fly`, `in:fade`) 사용
  - 또는 `animation-fill-mode: both` 제거하고 초기 상태를 `opacity: 1`로 설정
  - 관련 요소: `.hero-header` (line 156), `.stats-ribbon` (line 234), `.featured-card` (line 279)

### 1-2. ModelsCatalog — 렌더되지 않음
- **파일**: `src-svelte/lib/pages/models/ModelsCatalog.svelte`
- **증상**: `.catalog` 요소가 DOM에 없음 (`found: false`)
- **원인 추정**: ModelsCatalog도 동일한 fade-up 애니메이션 또는 조건부 렌더링 이슈
- **수정**: ModelsCatalog.svelte 확인 후 동일 패턴 수정

---

## Phase 2: Mobile/Tablet Responsive Issues (P1)

### 2-1. Network 페이지 — 모바일에서 Side Panel 탭 가로 잘림
- **파일**: `src-svelte/lib/pages/network/NetworkSidePanel.svelte`
- **증상**: "My GPU | Bond & Trust | Jobs | Notary | Swarms | Feed" 중 "Feed"가 모바일에서 잘림
- **수정**: 탭 컨테이너에 `overflow-x: auto; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory` 추가

### 2-2. Network 페이지 — 모바일 stat 카드 overflow
- **증상**: 데스크톱 6개 stat 카드가 모바일에서 3+2+1 그리드로 변환. "frame 2/26 STATUS" 카드가 단독 줄에 남아 공간 낭비
- **파일**: `src-svelte/lib/components/NetworkHUD.svelte`
- **수정**: 모바일에서 3x2 그리드 통일, "frame/status" 정보를 header 영역에 통합하거나 숨김

### 2-3. Protocol Economics — Flywheel 모바일 가로 잘림
- **파일**: `src-svelte/lib/pages/EconomicsPage.svelte`
- **증상**: Protocol Flywheel 5단계 중 "Publish" 뒤가 잘림. 모바일 스크린샷에서 "Pu..." 만 보임
- **수정**: 모바일에서 Flywheel을 `overflow-x: auto` + 수평 스크롤로 전환, 또는 2행 래핑

### 2-4. Protocol Economics — Stats strip "892/1,443 MAU" 잘림
- **증상**: 모바일에서 5개 stat 중 마지막 "892/1,443 MAU → DEFLATION"이 뷰포트 밖으로 밀림
- **수정**: 모바일에서 stats를 2행(3+2) 그리드로 변경

### 2-5. Studio — Template 카드 마지막 잘림
- **파일**: `src-svelte/lib/components/research/ResearchBrowse.svelte` 또는 관련 컴포넌트
- **증상**: 데스크톱에서 5개 중 "Knowledge D..." 잘림, 모바일에서 "Fine-tu...d" 잘림
- **수정**: 카드 컨테이너에 `overflow-x: auto; scroll-snap-type: x mandatory` 적용

### 2-6. AI FAB 버튼 — 하단 콘텐츠 가림
- **파일**: `src-svelte/App.svelte`
- **증상**: 우하단 고정 FAB(😊 버튼)이 모바일에서 "Claim Rewards" 등 하단 CTA와 겹침
- **수정**: FAB에 `margin-bottom: env(safe-area-inset-bottom)` 추가, 또는 하단 콘텐츠에 FAB 높이만큼 여유 padding 추가

---

## Phase 3: UX/User Journey Improvements (P2)

### 3-1. Dashboard — 콘텐츠 부족, 하단 빈 공간
- **증상**: 데스크톱에서 2개 역할 카드 + 지갑 연결 후 빈 공간만 남음. "뭘 해야 하는지" 안내 부재
- **수정**: 하단에 "How it works" 단계별 가이드 또는 최신 네트워크 활동 위젯 추가 검토

### 3-2. Dashboard → Studio 연결성
- **증상**: Dashboard의 "AI 연구 시작하기" 카드가 Studio의 검색 바와 기능 중복. 유저 저니에서 불필요한 중간 단계
- **검토**: Dashboard를 단순 라우팅 허브가 아닌 활동 대시보드로 진화시킬지 결정

### 3-3. 좌측 NavBar "Models" 활성 표시 오류
- **증상**: Models 페이지 진입 시 NavBar에서 "Research"가 활성(파란색)으로 표시됨 — "Models"여야 함
- **파일**: `src-svelte/lib/layout/NavBar.svelte`
- **수정**: 라우터 매칭 로직 수정

### 3-4. Protocol "L1 PROOF / L2 MODEL / L3 AGENT" 배지
- **증상**: 클릭 불가, 용도 불명확. 시각적 공간만 차지
- **수정**: 툴팁 추가하거나 인터랙션 기능 부여, 또는 제거

---

## Phase 4: Design Consistency (P3)

### 4-1. CTA 버튼 색상 불일치
- "Train New Model" = 보라/파란, "Register GPU" = 보라/파란, "Burn HOOT" = 살구색, "Claim Rewards" = 초록
- **수정**: 프라이머리(accent blue), 세컨더리(outline), 성공(green), 위험(red) 토큰 정리

### 4-2. 카드 border 스타일 불일치
- Network node 카드 = 파란 border, Featured model 카드 = 회색 border + radial glow, Protocol stat 카드 = 회색 border
- **수정**: 카드 elevation 토큰 통일

---

## Implementation Order

| 순서 | 작업 | 영향도 | 예상 작업 |
|------|------|--------|----------|
| 1 | ModelsHero fade-up 애니메이션 fix | P0 Critical | CSS 애니메이션 → Svelte transition으로 교체 |
| 2 | ModelsCatalog 렌더링 fix | P0 Critical | 같은 패턴 수정 |
| 3 | NavBar active state 오류 | P1 | 라우터 매칭 로직 수정 |
| 4 | Network Side Panel 탭 스크롤 | P1 | overflow-x: auto 추가 |
| 5 | Protocol Flywheel 모바일 잘림 | P1 | 수평 스크롤 또는 래핑 |
| 6 | Protocol Stats strip 모바일 | P1 | 2행 그리드 전환 |
| 7 | Studio template 카드 잘림 | P1 | scroll-snap 적용 |
| 8 | AI FAB 버튼 겹침 | P2 | margin/padding 조정 |
| 9 | Network stat grid 모바일 | P2 | 그리드 정리 |
| 10 | Dashboard 빈 공간 | P3 | 콘텐츠 추가 검토 |
| 11 | 버튼/카드 디자인 통일 | P3 | 토큰 정리 |

---

## Key Files (clever-mclean worktree)

```
src-svelte/lib/pages/models/ModelsHero.svelte     ← P0 애니메이션 fix
src-svelte/lib/pages/models/ModelsCatalog.svelte   ← P0 렌더링 fix
src-svelte/lib/layout/NavBar.svelte                ← P1 active state
src-svelte/lib/pages/network/NetworkSidePanel.svelte ← P1 탭 스크롤
src-svelte/lib/pages/EconomicsPage.svelte          ← P1 Flywheel/Stats
src-svelte/lib/components/research/ResearchBrowse.svelte ← P1 카드 잘림
src-svelte/App.svelte                              ← P2 FAB 겹침
src-svelte/lib/tokens.css                          ← P3 토큰 정리
```

---

## Verification

각 수정 후 `preview_screenshot`으로 3개 뷰포트(1280, 768, 375) 확인:
1. ModelsPage: stats-ribbon, featured-card, model grid 모두 보이는지
2. NavBar: 현재 페이지와 활성 메뉴 일치하는지
3. Network: 모바일에서 모든 탭 접근 가능한지
4. Protocol: Flywheel 5단계 + stats 5개 모바일에서 모두 보이는지
5. FAB 버튼: 하단 CTA와 겹치지 않는지
