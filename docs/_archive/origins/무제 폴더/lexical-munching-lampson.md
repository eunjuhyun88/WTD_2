# Nav + AI Panel 상호작용 재설계

## Context

현재 3-panel 레이아웃(Nav 80px | Content 1fr | AI Panel 300px)에서 AI 패널이 열리면 세 패널이 공간을 경쟁함. `navCollapsed` 변수가 선언만 되고 사용 안 됨. Nav와 AI Panel 간 상태 조율 없음. 모바일에서 Nav drawer와 AI panel이 동시에 열릴 수 있음.

## 설계 방향

**ChatGPT/Figma 패턴**: AI 패널이 열리면 Nav가 자동으로 축소되고, 상호 배타적 동작.

## 구현 계획

### Step 1: 패널 상태 스토어 생성
**파일**: `src-svelte/lib/stores/panelStore.ts` (신규)

```ts
// Writable store for coordinated panel state
- aiPanelOpen: boolean
- navCollapsed: boolean
- toggleAI(): AI 열기/닫기 + Nav 자동 축소/복원
- toggleNav(): Nav 축소/확장 (AI 열려있으면 닫기)
- closeMobileOverlays(): 모바일용 — 모든 overlay 닫기
```

핵심 로직:
- `toggleAI()`: AI 열 때 → `navCollapsed = true`, AI 닫을 때 → `navCollapsed = false`
- `toggleNav()`: Nav 확장 시 → AI 열려있으면 `aiPanelOpen = false`
- 모바일: Nav drawer 열 때 → AI 닫기, AI 열 때 → Nav drawer 닫기

### Step 2: App.svelte 수정
**파일**: `src-svelte/App.svelte`

- `let aiPanelOpen` / `let navCollapsed` 로컬 상태 → `panelStore` 구독으로 교체
- `.workspace-shell` grid 변경:
  - 기본: `auto 1fr 0` (nav 풀 + AI 닫힘)
  - AI open: `0 1fr var(--agent-panel-width)` (nav 숨김 + AI 열림)
  - nav-collapsed + AI open: `0 1fr var(--agent-panel-width)`
- AI toggle FAB: `panelStore.toggleAI()` 호출
- `navCollapsed` 클래스를 활용한 CSS transition

### Step 3: NavBar.svelte 수정
**파일**: `src-svelte/lib/layout/NavBar.svelte`

- `panelStore` import & subscribe
- Desktop rail: `navCollapsed` 일 때 48px 미니 rail (아이콘만, 라벨 숨김)
  - brand 영역: HOOT 텍스트 숨김, 올빼미만
  - rail-item: 라벨 숨김, 아이콘만 중앙 정렬
  - 하단 download 링크: 유지 (작아짐)
- Nav 확장 버튼 추가 (collapsed 상태에서 펼치기)
- 모바일: `mobileMenuOpen` → panelStore로 이동, AI 열릴 때 자동 닫힘

### Step 4: AIAssistantPanel.svelte 수정
**파일**: `src-svelte/lib/components/AIAssistantPanel.svelte`

- `on:toggle` dispatch → `panelStore.toggleAI()` 직접 호출
- `export let open` → panelStore의 `$aiPanelOpen` 구독

### Step 5: CSS Transition 정리
- Grid transition: `grid-template-columns 300ms cubic-bezier(0.22, 1, 0.36, 1)` (기존 유지)
- Nav collapse: `width 300ms` 동일 easing
- 모바일: overlay z-index 정리 — Nav > AI 또는 AI > Nav 아닌, 마지막 열린 것이 위

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src-svelte/lib/stores/panelStore.ts` | 신규 — 패널 상태 조율 |
| `src-svelte/App.svelte` | 로컬 상태 → 스토어, grid CSS 수정 |
| `src-svelte/lib/layout/NavBar.svelte` | collapsed 상태 지원, 스토어 연동 |
| `src-svelte/lib/components/AIAssistantPanel.svelte` | 스토어 연동 |

## 검증

1. `npm run dev`로 로컬 서버 실행
2. AI toggle 클릭 → Nav 자동 축소 확인
3. AI 닫기 → Nav 자동 복원 확인
4. 모바일 뷰: Nav drawer + AI 동시 열림 불가 확인
5. 태블릿 뷰: overlay 상호배타 확인
6. transition이 300ms 부드럽게 작동하는지 확인
