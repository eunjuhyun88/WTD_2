---
name: Terminal UX 전면 개선 세션 (2026-04-19) — 완료
description: TradingView UX 디자이너 관점 터미널 전체 이슈 분석+구현 완료. Left Rail 상시화, Lab CTA, CommandBar TF/가격, 탭 복원, BottomDock parse hint, 모바일 홈 내비. 커밋 머지 main 0e7978e
type: project
originSessionId: 87a28f23-a92e-4bd3-b2dc-09c43e9c43cb
---

## 완료된 변경사항 (커밋 0e7978e, main 머지 완료)

### 파일 변경 목록
- `app/src/components/terminal/shell/DesktopShell.svelte` — `slotLeftRail` prop + `<aside class="shell-left-rail">` (240px, border-right), 모바일 hidden
- `app/src/components/terminal/shell/TerminalShell.svelte` — `slotLeftRail` prop 추가, DesktopShell에 전달
- `app/src/routes/terminal/+page.svelte` — slotLeftRail 스니펫(TerminalLeftRail 연결), CommandBar tf/price/change24h props, Lab CTA 배너(showLabCta/labCtaSlug/8초), CSS
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte` — TF 선택기(1m~1W) + 가격/변동% (이전 세션)
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte` — 탭 Summary/Entry/Risk/Catalysts/Metrics (이전 세션)
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte` — SYMBOL_RE/TF_RE parseHint $derived + `.parse-hint` 라인
- `app/src/components/home/MobileHomeHero.svelte` — 중복 app-bar 제거 (글로벌 Header와 충돌 해소)
- `app/src/routes/+layout.svelte` — `showMobileBottomNav`: `!$isHome` 제거 → 홈에서도 바텀 내비 표시, home-mode 모바일 padding-bottom 수정

### 구현 상세

#### P0: Left Rail 상시화 (240px)
- DesktopShell `slotLeftRail?: Snippet` + `{#if slotLeftRail}<aside class="shell-left-rail">`
- TerminalShell → DesktopShell prop 전달 체인
- +page.svelte `{#snippet slotLeftRail()}` → TerminalLeftRail (watchlist/trending/anomalies)

#### P0: Lab CTA 배너
- `showLabCta`, `labCtaSlug` state
- handleCaptureSaved: labCtaSlug = symbol, showLabCta = true, 8초 후 자동 닫힘
- "✓ Setup saved · Open in Lab →" `/lab?slug=<symbol>` 딥링크

#### P1: CommandBar TF/가격
- tf={gTf}, onTfChange, price={activeAnalysisData?.price}, change24h 연결

#### P1: 탭 라벨 계약 복원
- Summary / Entry / Risk / Catalysts / Metrics ✅

#### P2: BottomDock 파스 힌트
- 입력 중 BTC, 4h 패턴 감지 → `→ BTC/USDT · 4H` 실시간 표시

#### 모바일 홈 UX
- 더블 헤더 제거 (MobileHomeHero app-bar 삭제)
- 홈에서도 MobileBottomNav 표시 (HOME | TERMINAL | DASHBOARD)

## 작업 중 발생한 이슈 (다음 세션 참고)

### 파일 되돌림 패턴 ⚠️
- +page.svelte가 시스템 `Note: file was modified` 알림 이후 구버전으로 반복 되돌아옴
- 대응: 항상 main app 파일 직접 Edit. **worktree 경유 cp 사용 금지**

### git 이슈
- push 거절 (non-fast-forward) → git pull --rebase + index.lock 제거 → 정상 push
- experiment_log.jsonl 충돌 → 마커 라인 제거로 resolve

## 설계 계약 현황 (docs/product/pages/02-terminal.md)
- 코어루프: Terminal(캡처) → Lab(평가) → Dashboard(모니터링) ✅
- 탭 5개: Summary | Entry | Risk | Catalysts | Metrics ✅
- Left rail ~19% (240px) 상시 표시 ✅
- Deep link: Terminal→Lab = `/lab?slug=<symbol>` ✅
- Right panel NEVER empty — 부분 구현 (preanalysis skeleton)
- Retry CTA (engine fail시) — 미구현

## 서버 정보
- 메인 dev 서버: port 5173, serverId 1117b43a-4772-4f90-bf27-ac183256faac
- 커밋: main 0e7978e (github.com/eunjuhyun88/WTD_2)
