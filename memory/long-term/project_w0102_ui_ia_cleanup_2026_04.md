---
name: W-0102 UI IA Cleanup
description: W-0102 Prompt Agent + UI information architecture deduplication — PR #99 open
type: project
---

W-0102 branch (`claude/w-0102-prompt-agent`) — PR #99 open, 8 slices total.

**Why:** Terminal had 4-5x symbol duplication (nav · cmd bar · chart · right panel · watchlist), TF strip in 2 places, 24H change from inconsistent sources.

**How to apply:** Merge PR #99 when user approves. Branch is rebased on main.

## Slices shipped

| Slice | File(s) | Change |
|-------|---------|--------|
| 1 | +page.svelte | URL `?q=` auto-submit |
| 2 | +page.svelte | `chart_action` SSE → selectAsset + setActiveTimeframe |
| 3 | chartIndicators.ts (new) | shared store for active indicators |
| 4 | ChartBoard.svelte | CVD → sub-pane only |
| A | Header.svelte | Remove `.selected-ticker` pill from global nav |
| B | TerminalCommandBar.svelte | Remove TF pills (keep only in ChartBoard) |
| C | VerdictHeader.svelte | Remove symbol+TF from verdict top row |
| D | +page.svelte | Prefer `snapshot.change24h` over kline-derived `change24h` |

## Information architecture after cleanup

- Nav: COGOCHI brand + tabs only
- Symbol canonical: TerminalCommandBar ticker button (click → SymbolPicker)
- Price + 24H Δ: TerminalCommandBar (from `snapshot.change24h`)
- TF: ChartBoard header only (triggers `setActiveTimeframe`)
- Right panel: BULLISH/BEARISH badge + freshness only (no symbol duplication)

## Status (2026-04-19)

PR #99 open. Not yet merged to main.
