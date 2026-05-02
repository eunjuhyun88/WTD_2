# W-0382-B — Monolithic Component Split

> Status: Complete | Branch: feat/W-0382-B-monolithic-split

## Files Created
- `app/src/lib/hubs/terminal/panels/WatchlistRail/WatchlistItem.svelte` — 170 lines (single symbol row: price, change%, sparkline, remove button)
- `app/src/lib/hubs/terminal/panels/WatchlistRail/WatchlistHeader.svelte` — 179 lines (header bar with fold toggle, symbol count, add-symbol input)
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/PatternTab.svelte` — 244 lines (PAT tab: filter input, verdict chips, pattern list, skeleton loader)

## Files Modified
- `app/src/lib/hubs/terminal/panels/WatchlistRail/WatchlistRail.svelte` — 459 lines (was 702; now orchestrator shell importing WatchlistHeader + WatchlistItem)
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` — 502 lines (was 675; PAT tab delegated to PatternTab, inline CSS + logic removed)

## Split rationale
- WatchlistItem: clearly bounded single-row rendering with its own formatting helpers
- WatchlistHeader: header + add-symbol flow isolated; uses $bindable for addInput
- PatternTab: largest self-contained block in AIAgentPanel (filter state + list + skeleton); keyboard nav moved inside component
- Whale alerts and 내 패턴 sections kept in WatchlistRail (small, tightly coupled to rail-level state)
