---
name: W-0114 Cogochi Session 2 체크포인트
description: W-0114 Session 2 완료 상태 — ChartSvg 이식, nav redirect, 헤더 복원, ScanGrid table뷰. 다음: 실제 ChartBoard 연결 + /dashboard 디자인 통일
type: project
originSessionId: 127f29d9-77a2-4a38-a998-49010c86d28a
---
## 완료 (commits de40138, 4712858)

- **ChartSvg.svelte 신규**: chart.jsx 이식 — 31 캔들, 5 페이즈밴드, OI/Funding/CVD 스트립
- **TradeMode.svelte 전면 재작성**: Layout A/B/C/D 전환, EmptyCanvas, ChartSvg 연결 (926줄)
- **Border/대비 전체 수정**: `0.5px var(--g3)` → `1px var(--g4)`, 텍스트 `var(--g6/g7)` 전체
- **Sidebar width 오버플로우 수정**: 240px → 100%
- **appSurfaces.ts**: terminal nav href → `/cogochi`, activePatterns에 `/cogochi` 추가
- **+layout.svelte**: showGlobalChrome 수정 → `/cogochi`에서 WTD 헤더 표시됨
- **AppShell.svelte**: height 100vh → 100% (WTD 헤더 아래 채우기)
- **ScanGrid.svelte**: GRID/TABLE 토글 추가 (vt-btn, TableView 6열 행)

## 현재 상태 (브랜치: claude/nice-aryabhata-5414ac)

- `/cogochi` 페이지: WTD 헤더(TERMINAL 하이라이트) + Cogochi CommandBar + ChartSvg 렌더링
- 서버: 포트 5174 (새 서버, launch.json 기준)
- TypeScript 에러: 11개 (전부 /terminal 라우트 기존 에러, cogochi 무관)

## 다음 작업 (우선순위 순)

**P0 · 실제 차트/지표 연결** (사용자 요청)
- ChartSvg (정적 SVG) → ChartBoard.svelte (실제 라이브 차트) 교체
- activePairStore subscribe → symbol/tf 공급
- fetchTerminalBundle({symbol, tf}) → ChartBoard에 initialData/quantRegime/cvdDivergence 전달
- 기존 /terminal 지표(OI bars, Funding bars, CVD bars) Cogochi에서 렌더링

**P0 · /dashboard 디자인 패턴 통일** (사용자 요청)
- 현재 Cogochi: `--g0~g9` 자체 CSS 변수 사용
- Dashboard: `--sc-text-*`, `--sc-font-*`, `--sc-market-up/down`, `--sc-good/bad` 사용
- 폰트: Bebas Neue(display) + Space Grotesk(body) + JetBrains Mono(mono)
- 목표: WTD 헤더 + Cogochi 내부 사이에 톤 통일

**P1 · Core Loop 포팅 계속**
- topology_linear.jsx (794줄) 이식
- TrainMode 본격 구현
- PeekDrawer animation

## 설계 문서

- 갭 분석: `work/active/W-0114-cogochi-port-gap-analysis.md`
- 전체 포팅: ~65% 완성

## Why / How to apply

ChartBoard 연결 시: AppShell에서 symbol/tf를 TradeMode에 전달하고, TradeMode에서 `onMount`에 `fetchTerminalBundle` 호출. ChartSvg 교체 위치는 `modes/TradeMode.svelte`의 `chart-body-fill` div들. /dashboard 디자인 토큰은 `app/src/lib/styles/tokens.css` 참조.
