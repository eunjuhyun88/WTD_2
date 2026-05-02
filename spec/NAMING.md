# NAMING — 이름 계약서

> **Rule 0**: 이 파일을 먼저 바꾸고 코드를 바꿔라. 반대 순서 금지.
>
> `lib/cogochi/` + `components/terminal/` 는 W-0382-D (#906)에서 삭제됨.
> 현재 정규 경로는 §3 참조.

---

## §1 RightPanelTab

| 값 | 설명 |
|---|---|
| `decision` | 매수/매도 결정 패널 |
| `pattern` | 패턴 라이브러리 |
| `verdict` | AI 판정 + 분석 (구 `analyze`) |
| `research` | 스캔 + 연구 (구 `scan`) |
| `judge` | 최종 종합 판단 |

**금지**: `analyze`, `scan` — merge conflict 원인 (W-0374 사례)

```bash
# 검증
grep -rn '"analyze"\|"scan"' app/src/lib/hubs/ --include="*.ts" --include="*.svelte" | grep -v "\.test\." | grep -v "//.*analyze"
# 결과 0줄이어야 통과
```

---

## §2 SHELL_KEY

현재 값: **`cogochi_shell_v12`**

변경 시: 이 파일 §2 먼저 업데이트 → `shell.store.ts` `SHELL_KEY` 상수 → 이전 키 cleanup 배열 추가.

```bash
grep -n "SHELL_KEY\|cogochi_shell_v" app/src/lib/hubs/terminal/shell.store.ts | head -5
```

---

## §3 파일 경로 (W-0382-D 이후 — hubs/ 정규 경로)

| 컴포넌트 | 정규 경로 |
|---|---|
| DrawerSlide | `app/src/lib/shared/primitives/DrawerSlide.svelte` |
| IndicatorLibrary | `app/src/lib/hubs/terminal/sheets/IndicatorLibrary.svelte` |
| DrawingToolbar | `app/src/lib/hubs/terminal/workspace/DrawingToolbar.svelte` |
| AIAgentPanel | `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` |
| TradeMode | `app/src/lib/hubs/terminal/workspace/TradeMode.svelte` |
| shell.store | `app/src/lib/hubs/terminal/shell.store.ts` |

**삭제됨**: `app/src/lib/cogochi/` 전체, `app/src/components/terminal/` 전체 (W-0382-D #906)

---

## §4 drawerTab (TradeMode 내부)

`'verdict' | 'research' | 'judge'`

**금지**: `'analyze'`, `'scan'`

---

## §5 MobileView (TradeMode/shell 내부)

`'chart' | 'verdict' | 'research' | 'judge'`

---

## §6 API Routes

| 경로 | 역할 |
|---|---|
| `POST /api/terminal/agent` | AI agent query |
| `GET /api/terminal/signals` | signal feed |
| `GET /api/terminal/patterns` | pattern list |

---

## §7 Layout Contracts

- ChartBoard: **≤ 2600 lines** (W-0287 CI AC1) — `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`
- DrawingToolbar: `drawingToolsVisible` 상태 + `onToggleDrawingTools` prop (W-0289 CI AC7b)
- shell.store: `setDrawingTool(tool)` + `setChartActiveMode(mode)` (toggleDrawingMode 금지)

---

## 변경 이력

| 날짜 | 변경 | 이유 |
|---|---|---|
| 2026-05-02 | 최초 작성 | W-0374 병렬 브랜치 naming conflict 방지 |
| 2026-05-02 | SHELL_KEY v12 | shell.store merge — v9/v10/v11 cleanup 추가 |
| 2026-05-02 | §3 경로 전면 업데이트 | W-0382-D — lib/cogochi + components/terminal 삭제 (#906) |
