# W-0382-A — Phase A: Tree Consolidation (디렉토리 통합)

> Parent: W-0382 | Priority: P1
> Status: 🔴 Blocked (W-0382 master 승인 대기)
> Pre-conditions: W-0382 master approved (Q-1~Q-4 answered)
> Estimated files: ~120 | Estimated time: 4~6시간

---

## 이 Phase가 하는 일

`lib/cogochi/` + `components/terminal/` 두 트리를 `lib/hubs/terminal/` + `lib/shared/` 한 구조로 통합한다.
**기능 변경 없음** — 파일 이동 + import path 수정만.

---

## Pre-conditions Checklist

- [ ] W-0382 master doc 사용자 승인
- [ ] Q-1 답변: `/terminal` URL 301 수용 여부
- [ ] Q-2 답변: AIPanel + AIAgentPanel 통합 vs 분리
- [ ] `git checkout -b feat/W-0382-A-tree-consolidation`
- [ ] `cd app && pnpm svelte-check` — 시작 전 0 errors 확인

---

## Step 1 — 디렉토리 구조 생성

```bash
cd app/src/lib

# Hub 구조
mkdir -p hubs/terminal/{L1,panels,sheets,workspace,peek,stores}
mkdir -p hubs/terminal/panels/WatchlistRail
mkdir -p hubs/terminal/panels/AIAgentPanel
mkdir -p hubs/dashboard/{L1,panels,sheets}
mkdir -p hubs/patterns/{L1,panels,sheets,stores}
mkdir -p hubs/lab/{L1,panels,sheets}
mkdir -p hubs/lab/panels/{research,verdict}
mkdir -p hubs/settings/sections

# Shared 구조
mkdir -p shared/{chart,panels,primitives,stores}
mkdir -p shared/chart/{primitives,overlays}
mkdir -p shared/panels/{peek,mobile}
```

---

## Step 2 — Operations Table

에이전트는 이 표를 **위에서 아래로** 순서대로 실행한다.
각 MOVE 후: 해당 파일을 import하는 모든 파일의 경로 수정 (Step 3 Import Map 참조).

### A. lib/cogochi/ → lib/hubs/terminal/ 또는 lib/shared/

| # | 타입 | Source | Destination | 비고 |
|---|---|---|---|---|
| A-1 | MOVE | `lib/cogochi/AppShell.svelte` | `lib/hubs/terminal/TerminalHub.svelte` | 클래스명/컴포넌트명 유지 |
| A-2 | MOVE | `lib/cogochi/TabBar.svelte` | `lib/shared/panels/TabBar.svelte` | cross-hub 사용 |
| A-3 | MOVE | `lib/cogochi/WatchlistRail.svelte` | `lib/hubs/terminal/panels/WatchlistRail/WatchlistRail.svelte` | W-0382-B에서 분할 예정 |
| A-4 | MOVE | `lib/cogochi/AIPanel.svelte` | `lib/hubs/terminal/panels/AIAgentPanel/AIPanel.svelte` | W-0382-B에서 통합/분할 예정 |
| A-5 | MOVE | `lib/cogochi/AIAgentPanel.svelte` | `lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` | W-0382-B에서 통합/분할 예정 |
| A-6 | MOVE | `lib/cogochi/AIOverlayCanvas.svelte` | `lib/shared/chart/overlays/AIOverlayCanvas.svelte` | |
| A-7 | MOVE | `lib/cogochi/IndicatorLibrary.svelte` | `lib/hubs/terminal/sheets/IndicatorLibrary.svelte` | workspace/ 버전과 병합 (A-24) |
| A-8 | MOVE | `lib/cogochi/WorkspaceStage.svelte` | `lib/hubs/terminal/workspace/WorkspaceStage.svelte` | |
| A-9 | MOVE | `lib/cogochi/ModeSheet.svelte` | `lib/hubs/terminal/sheets/ModeSheet.svelte` | |
| A-10 | MOVE | `lib/cogochi/MultiPaneChartAdapter.svelte` | `lib/hubs/terminal/workspace/MultiPaneChartAdapter.svelte` | |
| A-11 | MOVE | `lib/cogochi/ChartSvg.svelte` | `lib/shared/chart/ChartSvg.svelte` | |
| A-12 | MOVE | `lib/cogochi/ChartToolbar.svelte` | `lib/hubs/terminal/L1/ChartToolbar.svelte` | |
| A-13 | MOVE | `lib/cogochi/CommandBar.svelte` | `lib/shared/panels/CommandBar.svelte` | |
| A-14 | MOVE | `lib/cogochi/CommandPalette.svelte` | `lib/shared/panels/CommandPalette.svelte` | |
| A-15 | MOVE | `lib/cogochi/CopyTradingLeaderboard.svelte` | `lib/hubs/patterns/panels/CopyTradingLeaderboard.svelte` | Q-3 답변에 따라 조정 |
| A-16 | MOVE | `lib/cogochi/DecideRightPanel.svelte` | `lib/hubs/lab/panels/DecideRightPanel.svelte` | |
| A-17 | MOVE | `lib/cogochi/DecisionHUDAdapter.svelte` | `lib/hubs/terminal/workspace/DecisionHUDAdapter.svelte` | |
| A-18 | MOVE | `lib/cogochi/DrawerSlide.svelte` | `lib/shared/primitives/DrawerSlide.svelte` | |
| A-19 | MOVE | `lib/cogochi/DrawingRail.svelte` | `lib/hubs/terminal/panels/DrawingRail.svelte` | |
| A-20 | MOVE | `lib/cogochi/IndicatorSettingsSheet.svelte` | `lib/hubs/terminal/sheets/IndicatorSettingsSheet.svelte` | |
| A-21 | MOVE | `lib/cogochi/MobileFooter.svelte` | `lib/shared/panels/mobile/MobileFooter.svelte` | |
| A-22 | MOVE | `lib/cogochi/MobileTopBar.svelte` | `lib/shared/panels/mobile/MobileTopBar.svelte` | |
| A-23 | MOVE | `lib/cogochi/BottomSheet.svelte` | `lib/shared/primitives/BottomSheet.svelte` | |
| A-24 | MERGE | `lib/cogochi/components/IndicatorLibrary.svelte` → A-7 대상 | `lib/hubs/terminal/sheets/IndicatorLibrary.svelte` | 두 파일 내용 비교 후 최신 유지 |
| A-25 | MOVE | `lib/cogochi/modes/TradeMode.svelte` | `lib/hubs/terminal/workspace/TradeMode.svelte` | W-0382-B에서 분할 예정 |
| A-26 | MOVE | `lib/cogochi/modes/TrainMode.svelte` | `lib/hubs/terminal/workspace/TrainMode.svelte` | W-0382-B에서 분할 예정 |
| A-27 | MOVE | `lib/cogochi/modes/AnalyzePanel.svelte` | `lib/hubs/terminal/workspace/AnalyzePanel.svelte` | W-0382-B에서 분할 예정 |
| A-28 | DELETE | `lib/cogochi/` | — | 위 모두 이주 완료 후, 빈 디렉토리 확인 |

### B. components/terminal/ → lib/hubs/terminal/ 또는 lib/shared/

| # | 타입 | Source | Destination | 비고 |
|---|---|---|---|---|
| B-1 | MOVE | `components/terminal/workspace/*.svelte` (50개) | `lib/hubs/terminal/workspace/` | 전체 이동 |
| B-2 | MOVE | `components/terminal/workspace/index.ts` | `lib/hubs/terminal/workspace/index.ts` | |
| B-3 | MOVE | `components/terminal/workspace/__tests__/` | `lib/hubs/terminal/workspace/__tests__/` | |
| B-4 | MOVE | `components/terminal/peek/*.svelte` (8개) | `lib/hubs/terminal/peek/` | |
| B-5 | MOVE | `components/terminal/peek/__tests__/` | `lib/hubs/terminal/peek/__tests__/` | |
| B-6 | MOVE | `components/terminal/shell/` | `lib/hubs/terminal/L1/` | |
| B-7 | MOVE | `components/terminal/chart/primitives/` | `lib/shared/chart/primitives/` | |
| B-8 | MOVE | `components/terminal/chart/overlay/` | `lib/shared/chart/overlays/` | |
| B-9 | MOVE | `components/terminal/chart/__tests__/` | `lib/shared/chart/__tests__/` | |
| B-10 | MOVE | `components/terminal/warroom/` | `lib/hubs/terminal/panels/warroom/` | |
| B-11 | MOVE | `components/terminal/research/` | `lib/hubs/lab/panels/research/` | |
| B-12 | MOVE | `components/terminal/mobile/` | `lib/shared/panels/mobile/` | |
| B-13 | MOVE | `components/terminal/peek/` | `lib/hubs/terminal/peek/` | |
| B-14 | MOVE | `components/terminal/AIParserModal.svelte` | `lib/hubs/terminal/sheets/AIParserModal.svelte` | |
| B-15 | MOVE | `components/terminal/BottomPanel.svelte` | `lib/hubs/terminal/panels/BottomPanel.svelte` | |
| B-16 | MOVE | `components/terminal/CompareWithBaselineToggle.svelte` | `lib/hubs/terminal/workspace/CompareWithBaselineToggle.svelte` | |
| B-17 | MOVE | `components/terminal/DirectionBadge.svelte` | `lib/shared/panels/DirectionBadge.svelte` | |
| B-18 | MOVE | `components/terminal/GmxTradePanel.svelte` | `lib/hubs/terminal/panels/connectors/GmxTradePanel.svelte` | |
| B-19 | MOVE | `components/terminal/IntelPanel.svelte` | `lib/hubs/terminal/panels/IntelPanel.svelte` | |
| B-20 | MOVE | `components/terminal/PolymarketBetPanel.svelte` | `lib/hubs/terminal/panels/connectors/PolymarketBetPanel.svelte` | |
| B-21 | MOVE | `components/terminal/SingleAssetBoard.svelte` | `lib/hubs/terminal/workspace/SingleAssetBoard.svelte` | |
| B-22 | MOVE | `components/terminal/StrategyCard.svelte` | `lib/shared/panels/StrategyCard.svelte` | |
| B-23 | MOVE | `components/terminal/VerdictBanner.svelte` | `lib/shared/panels/VerdictBanner.svelte` | |
| B-24 | MOVE | `components/terminal/VerdictCard.svelte` | `lib/shared/panels/VerdictCard.svelte` | |
| B-25 | MOVE | `components/terminal/WarRoom.svelte` | `lib/hubs/terminal/panels/warroom/WarRoom.svelte` | |
| B-26 | MOVE | `components/terminal/WatchToggle.svelte` | `lib/shared/panels/WatchToggle.svelte` | |
| B-27 | MOVE | `components/terminal/WorkspaceCompareBlock.svelte` | `lib/hubs/terminal/workspace/WorkspaceCompareBlock.svelte` | |
| B-28 | MOVE | `components/terminal/intelHelpers.ts` | `lib/hubs/terminal/panels/intelHelpers.ts` | |
| B-29 | MOVE | `components/terminal/hud/` (types 포함) | `lib/hubs/terminal/workspace/hud/` | |
| B-30 | MOVE | `components/terminal/terminalLayoutController.ts` | `lib/hubs/terminal/terminalLayoutController.ts` | |
| B-31 | DELETE | `components/terminal/` | — | 전부 이주 후 삭제 |

### C. Hub Entry 파일 생성

```bash
# 각 hub의 index.ts 생성
cat > app/src/lib/hubs/terminal/index.ts << 'EOF'
export { default as TerminalHub } from './TerminalHub.svelte';
EOF

cat > app/src/lib/hubs/dashboard/index.ts << 'EOF'
export { default as DashboardHub } from './DashboardHub.svelte';
EOF

cat > app/src/lib/hubs/patterns/index.ts << 'EOF'
export { default as PatternsHub } from './PatternsHub.svelte';
EOF

cat > app/src/lib/hubs/lab/index.ts << 'EOF'
export { default as LabHub } from './LabHub.svelte';
EOF

cat > app/src/lib/hubs/settings/index.ts << 'EOF'
export { default as SettingsHub } from './SettingsHub.svelte';
EOF
```

### D. routes 업데이트

| # | 파일 | 변경 내용 |
|---|---|---|
| D-1 | `routes/cogochi/+page.svelte` | import `AppShell` → `TerminalHub` from `$lib/hubs/terminal` |
| D-2 | `routes/dashboard/+page.svelte` | import 경로 업데이트 |
| D-3 | `routes/patterns/+page.svelte` | import 경로 업데이트 |
| D-4 | `routes/lab/+page.svelte` | import 경로 업데이트 |
| D-5 | `routes/settings/+page.svelte` | import 경로 업데이트 |
| D-6 | `routes/terminal/+page.svelte` | workspace import 경로 `$lib/hubs/terminal/workspace/` 로 업데이트 |

---

## Step 3 — Import Path Update Map

MOVE 완료 후 이 표에서 import 수정할 파일을 찾는다.

```bash
# 각 이동 후 영향받는 파일 찾기
grep -rn "from.*cogochi/AppShell" app/src --include="*.svelte" --include="*.ts"
grep -rn "from.*cogochi/WatchlistRail" app/src --include="*.svelte" --include="*.ts"
grep -rn "from.*cogochi/AIPanel" app/src --include="*.svelte" --include="*.ts"
grep -rn "from.*components/terminal/workspace" app/src --include="*.svelte" --include="*.ts"
grep -rn "from.*components/terminal/peek" app/src --include="*.svelte" --include="*.ts"
grep -rn "from.*components/terminal/hud" app/src --include="*.svelte" --include="*.ts"
```

현재 확인된 주요 import 출처:
- `routes/terminal/+page.svelte` → `components/terminal/workspace/**` (대부분) + `components/terminal/peek/**`
- `routes/cogochi/+page.svelte` → `lib/cogochi/AppShell.svelte` (1건)

---

## Step 4 — IndicatorLibrary 병합 처리 (A-24)

현재 두 버전 존재:
- `lib/cogochi/IndicatorLibrary.svelte` (438 LOC)
- `lib/cogochi/components/IndicatorLibrary.svelte` (360 LOC)
- `components/terminal/workspace/IndicatorLibrary.svelte` (593 LOC) ← 가장 최신/완성

```bash
# 세 파일 최신 커밋 확인
git log --oneline -3 -- app/src/lib/cogochi/IndicatorLibrary.svelte
git log --oneline -3 -- app/src/lib/cogochi/components/IndicatorLibrary.svelte
git log --oneline -3 -- app/src/components/terminal/workspace/IndicatorLibrary.svelte
```

**처리**: workspace 버전(593 LOC) 을 정식으로 채택.
cogochi 두 버전은 workspace 버전 import로 대체 후 삭제.

---

## Verification Commands

Phase A 완료 후 반드시 전부 통과:

```bash
# 1. svelte-check 에러 0
cd app && pnpm svelte-check 2>&1 | grep "^Error" | wc -l
# 결과: 0

# 2. 구 트리 import 없음
grep -rn "from.*lib/cogochi" app/src --include="*.svelte" --include="*.ts" | grep -v "node_modules" | wc -l
# 결과: 0

grep -rn "from.*components/terminal" app/src/routes --include="*.svelte" --include="*.ts" | wc -l
# 결과: 0

# 3. 빌드 성공
cd app && pnpm build 2>&1 | tail -3

# 4. 구 디렉토리 삭제 확인
ls app/src/lib/cogochi 2>/dev/null && echo "FAIL: cogochi 남아있음" || echo "OK"
ls app/src/components/terminal 2>/dev/null && echo "FAIL: terminal 남아있음" || echo "OK"

# 5. 새 구조 존재 확인
ls app/src/lib/hubs/terminal/workspace/ | wc -l  # 40+ 파일
ls app/src/lib/hubs/terminal/panels/ | wc -l     # 8+ 항목
ls app/src/lib/shared/chart/ | wc -l             # 5+ 항목
```

---

## Commit & PR

```bash
cd /Users/ej/Projects/wtd-v2/.claude/worktrees/mystifying-dirac-193ed8

git add app/src/lib/hubs/ app/src/lib/shared/ app/src/lib/cogochi/ \
        app/src/components/terminal/ app/src/routes/

git commit -m "refactor(W-0382-A): tree consolidation — cogochi/ + components/terminal/ → lib/hubs/terminal/ + lib/shared/

- ~120 files moved, import paths updated
- lib/cogochi/ deleted
- components/terminal/ deleted
- behavior unchanged (move only)"

gh pr create \
  --title "[W-0382-A] Phase A: Tree consolidation" \
  --body "$(cat <<'EOF'
## Changes
- `lib/cogochi/` → `lib/hubs/terminal/` + `lib/shared/` (A-1~A-28)
- `components/terminal/` → `lib/hubs/terminal/` + `lib/shared/` (B-1~B-31)
- Hub index.ts entry files created
- routes import paths updated

## Behavior
Move only. No logic changes.

## Verification
- [ ] svelte-check 0 errors
- [ ] grep cogochi/terminal import = 0
- [ ] pnpm build success

Closes part of #ISSUE_NUM
EOF
)"
```

---

## Exit Criteria

- [ ] AC-A1: `pnpm svelte-check` 0 errors
- [ ] AC-A2: `grep -rn "lib/cogochi" app/src` → 0건
- [ ] AC-A3: `grep -rn "components/terminal" app/src/routes` → 0건
- [ ] AC-A4: `app/src/lib/cogochi/` 디렉토리 삭제 완료
- [ ] AC-A5: `app/src/components/terminal/` 디렉토리 삭제 완료
- [ ] AC-A6: `app/src/lib/hubs/terminal/workspace/` 파일 수 ≥ 45
- [ ] AC-A7: `pnpm build` 성공
- [ ] PR merged
