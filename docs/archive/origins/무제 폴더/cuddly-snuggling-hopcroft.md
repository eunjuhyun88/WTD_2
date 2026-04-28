# Hooti 토큰 + Dead Code 리팩토링 설계서

## Context

tokens.css에 미사용 토큰 22개, 컴포넌트에 하드코딩 색상 다수.
그리고 **아무도 import하지 않는 dead 파일**이 상당수 존재.
먼저 dead code 삭제 → 토큰 정리 → 살아있는 파일만 리팩토링.

---

## Phase 0: Dead Code → 보류

21개 dead 파일 확인됨 (MagnetStudioPage chain 6, InferencePage chain 8, Pipeline 3, ResearchZoomLab 3, HeroLanding 1).
**나중에 쓸 수 있으므로 삭제하지 않음. 토큰 작업 대상에서만 제외.**

---

## Phase 1: tokens.css 클린업

### 삭제 (22개 미사용 토큰)
```
--hooti-blue, --hooti-deep, --hooti-light, --beak-yellow, --beak-yellow-dark
--teal, --teal-light, --gold, --blue, --red
--warning, --warning-hover, --error, --error-hover
--success, --success-light, --green-light, --green-hover
--hover-surface, --text-soft
--btn-primary-disabled, --btn-secondary-disabled, --input-focus-border, --tertiary
```

### 유지 (실사용 토큰만)
```
--accent, --accent-hover, --accent-light, --accent-subtle
--green, --warn
--btn-primary, --btn-secondary
--page-bg, --surface, --surface-elevated
--border, --border-subtle
--text-primary, --text-secondary, --text-muted, --text-on-accent
--input-border, --input-surface, --input-text
--glow-*, --state-*, --glass-*, --shadow-*, --terminal-*
(+ layout/spacing/animation 토큰 전부 유지)
```

### 상단에 브랜드 팔레트 주석 블록 추가
```css
/* ── Hooti Final Color System (Reference Only) ──
 * #2F6FDF  Hooti Blue (--accent)
 * #1E3A5F  Deep Blue
 * #4FB3BF  Light Blue / Teal
 * #FFC83D  Beak Yellow (--btn-secondary)
 * #E0A800  Beak Shadow
 * #0F172A  Dark Navy (dark --page-bg)
 * #EEF1F7  Tertiary surface
 * Used directly in: PixelOwl.svelte, HootiLogo.svelte, favicon.svg
 */
```

---

## Phase 2: Fallback 값 일괄 교체

`var(--token, #OLD)` → `var(--token, #NEW)` 일괄 sed:

| 이전 | 새 값 | 약 대상 수 |
|-----|------|----------|
| `#2D2D2D` | `#1E2A4A` | ~146 |
| `#5A6B7A` | `#5F6B83` | ~80 |
| `#8B9AAB` | `#9AA6B2` | ~60 |
| `#FFC33D` | `#FFC83D` | ~15 |

---

## Phase 3: Catppuccin → terminal 토큰 마이그레이션

남아있는 파일 중 Catppuccin 하드코딩이 있는 컴포넌트:

| 파일 | Catppuccin 수 |
|------|-------------|
| StudioPublish.svelte | ~76 |
| ResearchRunning.svelte | ~69 |
| OntologySetup.svelte | ~67 |
| ResearchComplete.svelte | ~40 |
| GPUOnboardWizard.svelte | ~61 |
| AIAssistantPanel.svelte | ~65 |

각 파일에서 Catppuccin hex → `var(--terminal-*)` 토큰 교체

---

## Phase 4: 나머지 페이지 하드코딩 → 토큰

Dead code 삭제 후 남은 주요 대상:

| 파일 | 하드코딩 수 |
|------|-----------|
| ModelDetailPage.svelte | ~56 |
| BenchmarkTab.svelte | ~67 |
| StudioDashboard.svelte | ~56 |
| ClaimModal.svelte | ~57 |
| NavBar.svelte | ~18 |
| App.svelte | ~17 |

---

## 수정 파일 총계

| Phase | 작업 | 파일 수 |
|-------|------|--------|
| 0 | Dead code 삭제 | 21 삭제 |
| 1 | tokens.css 정리 | 1 |
| 2 | Fallback 일괄 교체 | ~100 (sed) |
| 3 | Catppuccin → 토큰 | ~6 |
| 4 | 하드코딩 → 토큰 | ~10 |

## 검증

- 각 Phase 후 `npm run dev` 확인
- `npm run build` 에러 없음
- Light/Dark 모드 전환 검증
- 삭제된 파일의 import 잔존 여부 grep
