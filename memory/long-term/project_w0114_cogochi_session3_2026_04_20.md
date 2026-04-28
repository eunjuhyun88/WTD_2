---
name: W-0114 Cogochi Session 3 체크포인트
description: W-0114 Session 3 완료 — ChartBoard 실제 데이터 연결. 3 commits on main, 푸시 완료. 다음: /dashboard 디자인 통일 + PeekDrawer animation + topology_linear 이식
type: project
originSessionId: current
---
## 완료 (commits de40138, 4712858, 67a989b → main)

- **ChartBoard 연결**: TradeMode.svelte의 ChartSvg 4개 → ChartBoard 교체
  - `fetchTerminalBundle({ symbol, tf })` — $effect로 symbol/timeframe 변경 시 자동 refetch
  - `chartPayload` (klines + OI/Funding/CVD bars), `change24hPct` 실데이터 공급
  - `contextMode="chart"` — Cogochi 컨텍스트에 맞춤
  - `analyzed` 게이트 제거 → 차트 항상 표시 (AI 입력 대기 불필요)
- **이전 세션 완료**: ChartSvg 이식, nav redirect, WTD 헤더 복원, ScanGrid TABLE 뷰

## 현재 상태

- `/cogochi` 라이브 BTC/USDT 4H 캔들 + VOL + RSI + OI/Funding/CVD 서브패인 렌더링 확인
- 브랜치: worktree main (nice-aryabhata-5414ac), origin/main 푸시 완료
- TypeScript 에러: 없음 (콘솔 에러 없음)

## 다음 작업 (우선순위 순)

**P0 · /dashboard 디자인 패턴 통일**
- 현재 Cogochi: `--g0~g9` 자체 CSS 변수
- 목표: `--sc-text-*`, `--sc-font-*` (Bebas Neue/Space Grotesk/JetBrains Mono), `--sc-market-up/down`, `--sc-good/bad` 토큰 적용
- 참조: `app/src/lib/styles/tokens.css`

**P1 · PeekDrawer 슬라이드 애니메이션**
- 프로토타입: `@keyframes peekSlide` (mode_trade.jsx)
- 현재: transition 없음
- 파일: `app/src/components/terminal/peek/PeekDrawer.svelte` 또는 TradeMode의 `.peek-overlay`

**P1 · Chart↕Peek 수직 Splitter**
- Layout D: chart-body-fill ↕ peek-overlay 사이 드래그 리사이저 필요
- `onResizerDown` 이미 구현됨 — Splitter 컴포넌트 삽입 위치: `.ld-chart` 하단

**P2 · topology_linear.jsx 이식** (794줄)
**P2 · TrainMode 본격 구현**
**P2 · Evidence/Proposal 동적 바인딩** (현재 TradeMode hardcoded)

## Why / How to apply

ChartBoard에 `quantRegime`/`cvdDivergence` 미전달 — 선택적이므로 차트 정상 작동.
원하면 `bundle.snapshot` → quantRegime 변환 로직 추가 가능 (terminal +page.svelte 참조).
디자인 통일 시: cogochi CSS 변수를 `--sc-*` 토큰으로 교체. `--g0` → `--sc-bg-base`, `--pos` → `--sc-market-up` 매핑.
