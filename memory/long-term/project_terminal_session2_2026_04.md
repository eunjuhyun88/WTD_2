# Terminal Session 2 — 2026-04-13

## 완료된 작업

### 버그 수정
- **빈 보드**: `heroAsset`/`heroVerdict`를 `+page.svelte` 부모 스코프 `$derived`로 계산
  - 원인: WorkspaceGrid의 `$.prop($props, 'assets', 19, ...)` ACCESSOR 플래그가 `boardAssets` 의존성 구독을 끊음
  - 해결: WorkspaceGrid 제거, 부모에서 inline VerdictCard 렌더
- **$effect 가격 틱 폭풍**: `gState = $derived($activePairState)` → `gPair`/`gTf` narrow derived 분리
- **이중 쿠키 배너**: `app.html`의 Zoho PageSense 스크립트 제거

### UI 개선
- **패널 리사이징**: `startResize('left'|'right', e)` + CSS grid `4px` handle slots
  - 좌: 160–400px, 우: 240–520px
- **Right panel**: 기본 숨김 (`showRightPanel = $state(false)`), 쿼리 시 노출
- **TerminalBottomDock 슬림화**: 2줄 → 1줄 인라인 바 (~36px)
- **BottomBar 제거**: `/terminal`에서 `showBottomBar = false` (가격 중복)

### 복구
- `claude/funny-roentgen` 브랜치 (`691e228`) main에 미머지 상태였음
  - settings, dashboard, passport, lab Bloomberg 디자인 복구
  - app.css, tokens.css 가독성 토큰 복구

## 현재 main 커밋
```
49e59e3  Merge branch 'claude/funny-roentgen'
bef6c7d  feat(ui): restore Bloomberg-tier design system
f1a0ebe  feat(terminal): fix board rendering, resizable panels, slim dock
920d23c  feat(engine): market judgment engine (#14)
```

## 알려진 이슈
- `ensemble: null` — BTC 1D/4H에서 Python 엔진 앙상블 미생성
  - API는 정상 응답, snapshot 데이터는 있음
  - `ensemble_triggered: false` — 트리거 조건 미충족
- 서버 포트: 5175 (5173/5174 좀비)

## 다음 우선순위
1. ensemble null 디버깅 (building_blocks 트리거 조건)
2. Symbol picker 드롭다운
3. Book Panel / Trade Tape (websocket)
