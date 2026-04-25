# 모바일 반응형 시스템 + 페이지별 UX 통합 설계

## Context

현재 상태: 28개 비표준 브레이크포인트가 혼재하고, 태블릿(601-860px) 최적화 거의 없고, 페이지마다 간격/폰트/터치타겟 규칙이 제각각. 모바일에서 차트 960px 고정 오버플로, 결과값 잘림, 캔버스-패널 간격 문제 등 광범위한 깨짐 발생.

**목표**: (1) tokens.css 기반 공통 반응형 시스템 확립, (2) 유저 저니(연구→모델→네트워크→프로토콜) 흐름에 맞는 페이지별 정보 위계 + 모바일 동선 최적화

---

## Part A: 공통 반응형 시스템 (tokens.css 확장)

### A-1. 브레이크포인트 정규화

tokens.css에 CSS custom property로 문서화 (media query에는 직접 못 쓰지만 주석 + 코드 참조용):

```css
/* ── Breakpoints (reference only — use literals in @media) ── */
/* --bp-mobile:  600px   — phones (portrait)                  */
/* --bp-tablet:  860px   — tablets + small laptops             */
/* --bp-desktop: 1440px  — wide screens (agent panel widens)   */
```

**정규화 규칙**:
- `640px` → `600px` (LiveActivityBar, Studio 컴포넌트들)
- `960px` → `860px` (SiteFooter, ModelCardTab)
- `700px`, `500px`, `480px`, `420px` → 제거하거나 `600px` 또는 `860px`로 통합
- `380px` → 유지 (극소형 디바이스 폴백으로 필요)

### A-2. 반응형 간격 토큰

```css
/* ── Responsive spacing ── */
--content-px: var(--space-6);         /* 24px 데스크톱 좌우 패딩 */
--content-px-tablet: var(--space-5);  /* 20px */
--content-px-mobile: var(--space-3);  /* 12px */

--card-radius: var(--radius-md);      /* 10px 데스크톱 */
--card-radius-mobile: var(--radius-sm); /* 6px */
```

### A-3. 반응형 폰트 스케일

```css
/* ── Font scale (mobile) ── */
--font-hero: clamp(1.4rem, 5vw, 2rem);
--font-heading: clamp(1.05rem, 3vw, 1.5rem);
--font-body: clamp(0.82rem, 2.5vw, 0.95rem);
--font-caption: clamp(0.65rem, 2vw, 0.75rem);
--font-mono: clamp(0.7rem, 2vw, 0.82rem);
```

### A-4. 유틸리티 클래스 (tokens.css 하단)

```css
/* ── Mobile utilities ── */
@media (max-width: 600px) {
  .hide-mobile { display: none !important; }
  .show-mobile { display: block !important; }
  .stack-mobile { flex-direction: column !important; }
  .full-width-mobile { width: 100% !important; }
  .scroll-x-mobile { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
}
@media (min-width: 601px) {
  .show-mobile { display: none !important; }
}
```

### A-5. 터치타겟 글로벌 규칙

```css
/* ── Touch target enforcement ── */
@media (max-width: 860px) {
  button, [role="button"], a, input, select, textarea,
  .clickable, [tabindex="0"] {
    min-height: var(--touch-min, 44px);
  }
}
```

---

## Part B: 페이지별 UX 설계 (모바일 375px 기준)

### 모바일 레이아웃 공통 구조

```
┌─────────────────────────┐
│ NavBar (sticky, 52px)   │ ← 항상 보임. 브랜드 + 햄버거
├─────────────────────────┤
│ LiveActivityBar (44px)  │ ← 연구 진행 중일 때만. sticky
├─────────────────────────┤
│ Page Content            │ ← 스크롤 영역. 각 페이지별 설계
│                         │
│                         │
├─────────────────────────┤
│ [FAB: AI Agent] (48px)  │ ← 우하단 고정
└─────────────────────────┘
```

---

### B-1. Studio (ResearchPage) — 유저 저니 시작점

#### idle 상태: "무엇을 연구할까?"
```
┌─────────────────────────┐
│ 검색 입력창 (히어로)     │ Tier 0: 즉시 보임
│ "무엇을 연구하고 싶으세요?" │
├─────────────────────────┤
│ 프리셋 칩 (Legal Q&A 등) │ Tier 1: 빠른 시작
├─────────────────────────┤
│ 연구 타입 카드 (횡스크롤) │ Tier 2: 탐색
│ [Tabular] [LLM] [Fine]  │
├─────────────────────────┤
│ 최근 연구 리스트          │ Tier 3: 히스토리
└─────────────────────────┘
```

#### running 상태: "진행 중 모니터링"
```
┌─────────────────────────┐
│ StateBar: "Training 42%" │ Tier 0: sticky
├─────────────────────────┤
│ Convergence 차트 (풀폭)  │ Tier 1: 핵심 피드백
│ (chartWidth 반응형)      │
├─────────────────────────┤
│ 스탯 요약 (Nodes/Configs)│ Tier 2: 수치
├─────────────────────────┤
│ Branch 리더보드           │ Tier 3: 상세
├─────────────────────────┤
│ Activity Feed            │ Tier 4: 로그
└─────────────────────────┘
```

#### complete 상태: "결과 확인 + 퍼블리시"
```
┌─────────────────────────┐
│ StateBar: "Complete"     │
│ [Publish] [New Research] │ ← 버튼 풀폭, 세로 스택
├─────────────────────────┤
│ 모델 히어로 카드          │ Tier 1: 결과 요약
│ (Best: 1.382, 11 kept)  │
├─────────────────────────┤
│ 모델 정보 (3열 → 1열)   │ Tier 2: 상세
├─────────────────────────┤
│ Usage/Credits            │ Tier 3: 사용량
└─────────────────────────┘
```

**수정 파일:**
- `src-svelte/lib/components/studio/ResearchComplete.svelte` — ✅ 이미 수정됨 (chartWidth 반응형, 배너 스택, 푸터 오버플로)
- `src-svelte/lib/pages/ResearchPage.svelte` — height: auto 모바일 오버라이드 확인

---

### B-2. Models — "모델 관리 + 탐색"

#### My Models 탭
```
┌─────────────────────────┐
│ [My Models] [Explore]   │ Tier 0: 탭
├─────────────────────────┤
│ "Model Hub" 타이틀       │
│ [+ Train New Model] CTA │ ← 풀폭 버튼
├─────────────────────────┤
│ 스탯 리본 (횡스크롤)     │ Tier 1
│ 5 Models | 3 Active |...│
├─────────────────────────┤
│ Featured 모델 카드       │ Tier 2: 큰 카드
│ [Try it now] [Details >] │
├─────────────────────────┤
│ 검색바 + 필터             │ Tier 3
├─────────────────────────┤
│ 모델 그리드 (1열)        │ Tier 4
└─────────────────────────┘
```

**모바일 핵심 수정:**
- Stats 리본: `flex-nowrap` + `overflow-x: auto` + 우측 fade
- Featured 카드: 풀폭, 이미지 제거, 텍스트 중심
- Try 패널: 모바일에서 full-height 드로어 (인라인 아님)
- 모델 그리드: 1열 (`grid-template-columns: 1fr`)

**수정 파일:** `src-svelte/lib/pages/ModelsPage.svelte`, `src-svelte/lib/pages/models/ModelsHero.svelte`, `src-svelte/lib/pages/models/ModelsCatalog.svelte`

---

### B-3. Network — "GPU 네트워크 모니터링"

#### 모바일 레이아웃
```
┌─────────────────────────┐
│ HUD (stats 숨김, 제목만) │ Tier 0: sticky
├─────────────────────────┤
│ MeshCanvas (38vh, fixed) │ Tier 1: 시각적 맥락
├─────────────────────────┤
│ ─── 사이드패널 ───       │ Tier 2: 데이터
│ [My GPU] [Bond] [Jobs]  │ ← 탭 (컴팩트, 풀폭)
│ [Notary] [Swarms] [Feed]│
├─────────────────────────┤
│ 탭 컨텐츠 (스크롤)       │ Tier 3
│ (My Node 정보, 잡 목록) │
└─────────────────────────┘
```

**모바일 핵심:**
- 캔버스 → 데이터 패널 사이 **빈 공간 없음** (margin-top 정확히 매칭)
- 탭 바: 6개 탭을 `min-width: auto` + `font-size: 0.72rem`으로 압축
- 사이드 패널: `min-height: calc(62vh - 52px)` — 푸터 밀어냄

**수정 파일:** ✅ 이미 수정됨 (`NetworkView.svelte`, `NetworkSidePanel.svelte`)

---

### B-4. Protocol/Economics — "수익 확인 + 프로토콜 이해"

#### 모바일 레이아웃
```
┌─────────────────────────┐
│ [Economics] [Chain] [T&P]│ Tier 0: 탭
├─────────────────────────┤
│ HOOT Protocol 타이틀     │
│ [L1 PROOF] [L2] [L3]    │
├─────────────────────────┤
│ My Research (2열 그리드)  │ Tier 1: 내 데이터
│ [30 JOBS] [30 EXPS]     │
│ [138.2%] [Idle] [1 PUB] │
├─────────────────────────┤
│ 메트릭 스트립 (횡스크롤)  │ Tier 2: 프로토콜 건강
│ $12.4M | 847K | $3.2M →│ ← 우측 fade 인디케이터
├─────────────────────────┤
│ Protocol Flywheel        │ Tier 3: 매커니즘 이해
│ [Contribute]→[Train]→...│
├─────────────────────────┤
│ [Operations] [Analytics] │ Tier 4: 모바일 탭 전환
│ [Events]                 │
└─────────────────────────┘
```

**모바일 핵심:**
- 메트릭 스트립: ✅ 이미 수정됨 (우측 fade + 패딩)
- 플라이휠: ✅ 이미 수정됨 (노드 72px, 커넥터 축소)
- 리서치 그리드: ✅ 이미 수정됨 (2열 + gap: 8px)

**수정 파일:** ✅ 대부분 수정됨

---

## Part B-5: 뒤로가기 + 잠긴 페이지 + 빈 상태 설계

### 현재 문제

| 문제 | 현재 동작 | 유저가 기대하는 동작 |
|------|-----------|----------------------|
| 브라우저 뒤로가기 | hashchange로 동작하지만 **스크롤 위치 복원 없음** | 이전 페이지의 스크롤 위치로 복원 |
| ModelDetail → 뒤로 | **뒤로가기 버튼 없음**, breadcrumb만 존재 | 좌상단 ← 버튼으로 Models로 복귀 |
| 잠긴 페이지 접근 | **조용히 dashboard로 리다이렉트** (경고 없음) | "이 기능은 연구 완료 후 사용 가능" 메시지 |
| 404 (미존재 해시) | **조용히 dashboard로 리다이렉트** | "페이지를 찾을 수 없습니다" 안내 |
| 빈 상태 (Models, Network 등) | 일부 컴포넌트만 처리, 대부분 **빈 화면** | 의미있는 빈 상태 + CTA |
| Publish 마법사 Step 2-3 | **뒤로가기 불가** (진행만 가능) | Step 2: 취소 불가(합리적), Step 3: [Studio로 돌아가기] |
| Network→Protocol 전환 | **컨텍스트 완전 소실** | 이전 페이지 맥락 유지 (journeyStore breadcrumb) |

### 수정 설계

#### 1. 스크롤 위치 복원 (journeyStore 활용)

`journeyStore.ts`의 breadcrumb에 이미 `scrollY` 필드가 있음. router 변경 시:
- 이탈: 현재 scrollY를 breadcrumb에 저장
- 진입: 이전 breadcrumb이 같은 view면 `tick().then(() => scrollTo(0, prev.scrollY))`
- **이미 journeyStore에 구현됨** — App.svelte에서 `journeyStore` import만 하면 자동 동작

#### 2. ModelDetail 뒤로가기 버튼 추가

`ModelDetailPage.svelte` breadcrumb 앞에 ← 버튼 추가:
```svelte
<button class="back-btn" on:click={() => router.navigate('models')}>
  ← Models
</button>
```
모바일에서 44px 터치타겟, 좌상단 고정.

#### 3. 잠긴 페이지 → 안내 메시지

`App.svelte`의 stage guard를 수정:
```ts
// 기존: 조용히 리다이렉트
if (!$unlockedPages.includes($router)) router.navigate('dashboard');

// 변경: 토스트 메시지 + 리다이렉트
if (!$unlockedPages.includes($router)) {
  toastStore.show('이 페이지는 연구를 시작한 후 사용할 수 있습니다');
  router.navigate('studio');  // dashboard 대신 studio로 (더 유용)
}
```

#### 4. 빈 상태 공통 컴포넌트 활용

`EmptyState.svelte`가 이미 존재. 각 페이지에 적용:

| 페이지 | 빈 상태 조건 | 메시지 + CTA |
|--------|-------------|-------------|
| Models (My Models) | 퍼블리시된 모델 0개 | "아직 모델이 없어요. 연구를 시작해보세요" + [Start Research] |
| Network (My GPU) | 노드 미등록 | "GPU를 등록해서 수익을 시작하세요" + [Register GPU] (이미 존재) |
| Protocol (My Activity) | 지갑 미연결 | "지갑을 연결해서 수익을 확인하세요" + [Connect Wallet] |

#### 5. Publish Step 3에 Studio 복귀 버튼

StudioPublish.svelte Step 3 (성공 화면)에:
```svelte
<button on:click={() => { studioStore.reset(); dispatch('back'); }}>
  ← 새 연구 시작하기
</button>
```

---

## Part C: 남은 작업 — 파일별 체크리스트

### Phase 1: tokens.css 시스템 확장
| 파일 | 작업 |
|------|------|
| `src-svelte/lib/tokens.css` | A-1~A-5 전부 추가 (반응형 토큰, 폰트 스케일, 유틸리티, 터치타겟) |

### Phase 2: 브레이크포인트 정규화 (640→600, 960→860)
| 파일 | 현재 | 변경 |
|------|------|------|
| `lib/components/LiveActivityBar.svelte` | 640px | → 600px |
| `lib/layout/SiteFooter.svelte` | 960px, 380px | → 860px, 380px |
| `lib/pages/ModelDetailPage.svelte` | 960px | → 860px |
| `lib/components/ModelCardTab.svelte` | 960px | → 860px |
| `lib/components/DashboardGrid.svelte` | 700px, 420px | → 860px, 600px |
| `lib/components/studio/*` (5+ files) | 640px | → 600px |

### Phase 3: 페이지별 모바일 정보 위계 적용
| 파일 | 상태 | 남은 작업 |
|------|------|-----------|
| ResearchComplete.svelte | ✅ 수정됨 | 검증만 |
| NetworkView.svelte | ✅ 수정됨 | 검증만 |
| NetworkSidePanel.svelte | ✅ 수정됨 | 검증만 |
| ProtocolMetricsStrip.svelte | ✅ 수정됨 | 검증만 |
| ProtocolFlywheel.svelte | ✅ 수정됨 | 검증만 |
| EconomicsPage.svelte | ✅ 수정됨 | 검증만 |
| ModelsPage.svelte | 🔶 부분 | stats 리본 횡스크롤, try 패널 모바일 드로어 |
| ModelDetailPage.svelte | 🔶 부분 | 브레이크포인트 960→860 |
| LiveActivityBar.svelte | 🔶 부분 | 브레이크포인트 640→600 |

### Phase 4: 전체 검증
- `npm run build` 통과
- preview 도구로 3개 뷰포트 × 4개 페이지 = 12개 스크린샷
  - mobile (375×812): Studio(idle/complete), Models, Network, Protocol
  - tablet (768×1024): 같은 4개
  - desktop (1280×800): 같은 4개

---

## 구현 순서

1. **tokens.css** 확장 — 반응형 토큰, 폰트 스케일, 유틸리티, 터치타겟 → 커밋
2. **브레이크포인트 정규화** — 640→600, 960→860 (6~10개 파일) → 커밋
3. **뒤로가기 + 잠긴 페이지 + 빈 상태** → 커밋
   - App.svelte: journeyStore import (스크롤 복원 활성화) + stage guard 토스트
   - ModelDetailPage: ← 뒤로가기 버튼 추가
   - ModelsPage: My Models 빈 상태 EmptyState 적용
   - StudioPublish: Step 3 Studio 복귀 버튼
4. **ModelsPage + ModelDetailPage** 모바일 최적화 → 커밋
5. **LiveActivityBar** 640→600 + 모바일 최적화 → 커밋
6. **전체 스크린샷 검증** — 3 viewport × 4 page = 12 screenshots

각 단계 후 개별 커밋.

---

## 검증

1. `npm run build` — 빌드 에러 없음
2. preview_resize mobile (375×812) → 4개 페이지 스크린샷
3. preview_resize tablet (768×1024) → 4개 페이지 스크린샷
4. preview_resize desktop (1280×800) → 4개 페이지 스크린샷
5. 각 페이지에서: 수평 오버플로 없음, 터치타겟 44px+, 텍스트 잘림 없음
