---
name: project_uiux_home_terminal_2026_04_19
description: gracious-diffie 브랜치 — 홈페이지 WebGL 복원 + 네비게이션 IA + 터미널 UX 폴리시 (2026-04-19 main 머지)
type: project
originSessionId: a7d7611b-82ac-4b43-8c49-2b074180b6c2
---
# UI/UX 홈+터미널 세션 완료 (2026-04-19, main 7f40181)

**브랜치:** claude/gracious-diffie → main 머지

## 완료 항목

### 홈페이지
- `showAnimatedBackground = $state(true)` — WebGL 배경 즉시 표시
- HomeHero 전 뷰포트 표시 (mobile guard 제거)
- `SiteFooter.svelte` 신규 생성 — TradingView 스타일 2티어 (브랜드+링크 / 저작권)
- HomeFinalCta: `<footer>` → `<section>` 시맨틱 수정
- BottomBar 완전 제거 (thermo polling 포함)

### 모바일 네비게이션
- MobileBottomNav: 3-col grid → 4-col grid 버그 수정
- MOBILE_NAV_SURFACES: [Home, Terminal, Dashboard, Passport] → [Home, Terminal, Lab, Dashboard]

### 터미널 UX 폴리시
- verdict-hero 방향 레이블: 11px → 20px (BULLISH/BEARISH 한눈에)
- ML Score: 16px → 22px
- 전체 텍스트: 7-8px → 10px (flow rows, section labels, scan cards 등)
- panel body: padding/gap 5px → 10px/8px
- bottom dock pills: 10px, 더 큰 padding + hover 강화
- lab-cta-banner: Dashboard(초록)/Lab(파랑) pill 링크 분리, `.lab-cta-link--dash` CSS 추가
- CTA timeout: 8s → 15s

## 다음 우선순위 (W-0100 설계문서 참고)

**Why:** 플라이휠 엔진은 완성됐으나 UI가 아직 연결 안 됨

| P | 작업 | 핵심 |
|---|------|------|
| P0 | Dashboard Verdict Inbox | `outcome_ready` captures 라벨링 UI |
| P1 | Terminal↔Dashboard↔Lab 동선 강화 | 저장 후 이동 끊김 해소 |
| P2 | 홈 proof-of-concept 실데이터 | HOME_PROOF_ROWS 동적 fetch |
| P3 | 모바일 MobileShell UX 폴리시 | ScanMode/JudgeMode 개선 |

**How to apply:** 다음 세션 시작 시 `work/active/W-0100-checkpoint-2026-04-19-uiux-session.md` 설계 섹션 참고
