# W-0078 Terminal Core-Loop UX Overhaul

## Goal

Redesign `/terminal` from the shell up so it behaves like a TradingView-grade chart workspace with Cogochi's core loop layered on top: one clear symbol selector, one chart-owned timeframe surface, one save/capture surface, one prompt footer, one deterministic analysis rail, and one mobile detail sheet.

## Owner

app

## Scope

- redesign the terminal shell architecture for desktop and mobile before further visual tuning
- remove duplicated chart-near metrics, repeated context values, and duplicate action surfaces
- define explicit ownership for symbol selection, timeframe switching, save setup, prompt input, AI result display, and deterministic analysis
- restore natural responsive scrolling and sticky behavior on mobile
- keep TradingView-like chart interaction patterns intact while preserving `Save Setup -> Open in Lab`

## Non-Goals

- replacing the current lab runtime with canonical persisted challenge infrastructure
- changing engine scoring semantics or chart data contracts
- redesigning global navigation outside the terminal shell
- implementing a new visual design system across the whole product

## Canonical Files

- `AGENTS.md`
- `work/active/W-0078-terminal-core-loop-ux-overhaul.md`
- `work/active/W-0048-terminal-chart-architecture-and-layers.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/core-loop-surface-wireframes.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/mobile/MobileActiveBoard.svelte`
- `app/src/components/terminal/mobile/MobileCommandDock.svelte`
- `app/src/components/terminal/mobile/MobileDetailSheet.svelte`

## Facts

- terminal is the Day-1 entry point of the core loop and must keep chart review plus `Save Setup` primary.
- the current terminal implementation already has command, chart, detail, and mobile-specific lanes, but the prompt lane is visually weak and result placement competes with chart review.
- chart-near data still feels too card-like and duplicates some context already visible in the header and right rail.
- the current branch already contains app-only work for capture-first save flow and lab intake adapter.
- the user explicitly wants TradingView-like baseline chart behavior preserved, especially interval switching and indicator-add interaction.
- the current page has been iteratively patched and now needs a higher-level shell reset because several surfaces still overlap in responsibility.
- the current screenshots confirm four remaining shell faults: the local top bar wastes vertical space, market rail affordances still feel patched, mobile `Save Setup` becomes a banner, and cookie consent overlaps the terminal footer area.

## Current UX Faults

- desktop and mobile both repeat the same facts across header, chart strip, right rail, detail sheet, and footer
- symbol switching is not clearly available as a first-class chart workspace action
- prompt input is visually subordinate, so the AI workflow feels hidden instead of native
- `Capture`, `Save Setup`, and post-save handoff cues are split across multiple surfaces
- timeframe is shown in more than one place, which breaks chart ownership
- mobile scroll and sticky behavior are unreliable because the shell still mixes multiple nested scrolling surfaces
- mobile does not yet have a clean footer-first interaction model
- current page still feels like overlapping widgets, not a coherent TradingView-grade terminal

## Assumptions

- the best immediate improvement is to reorganize existing components and emphasis, not replace the terminal with a new shell
- AI prompt/result UX should stay adjacent to the main workspace, but must not displace chart review or deterministic evidence rails

## Open Questions

- whether the desktop prompt lane should later become a docked split-pane conversation instead of a compact bottom command lane

## Decisions

- desktop shell should be: `top context bar -> chart workspace (+ optional left market rail / right analysis rail) -> prompt footer`
- mobile shell should be: `top symbol bar -> chart workspace -> sticky prompt footer -> bottom detail sheet`
- the top context bar should own symbol selection only; it should not own timeframe, save setup, quick intents, or assistant results
- the chart should own timeframe switching, indicators, crosshair context, and save setup
- the right rail should own deterministic analysis only; it should not echo footer AI responses
- the footer should own prompt entry and the latest assistant response only; it should not become a secondary dashboard
- shell-level CTA priority should be balanced, but capture-first remains canonical: `review -> validate -> Save Setup -> Open in Lab`
- any element that duplicates data from chart header, right rail, or footer should be removed rather than compressed
- the current optimization pass should remove chart-below support surfaces from the default shell: `CollectedMetricsDock`, `PatternStatusBar`, `EvidenceStrip`, microstructure cards, and companion mini-cards
- the right rail header should be reduced to analysis identity and critical actions only; live price, repeated status pills, and extra chart CTA should not reappear there
- mobile footer should prioritize the composer first and keep only one analysis-sheet entrypoint; it should not expose a second mini-dashboard above the input
- desktop footer should be treated as a functional prompt lane with one latest-response preview, not as a status console
- hidden side tabs and collapse affordances should be removed from the default shell; if a rail is not visible, it should not leave behind a decorative stub
- the left market rail should open only from the top-bar market button and behave like a proper drawer, not like a permanent shell column
- the desktop analysis rail should stay visible by default, use a fixed width in the `320-340px` range, and stop advertising resize/collapse chrome
- mobile `Save Setup` must remain inline inside the chart capture row and never become a full-width banner block
- cookie consent should use a reserved bottom strip contract so the prompt shelf and consent banner stack instead of colliding

## Redesign Plan

1. Shell reset
   Replace the current “patched cockpit” feel with a cleaner TradingView-like frame. Reduce the number of visible bars, remove secondary badges, and make the chart the largest and clearest element on first paint.

2. Surface ownership
   Assign one home per function:
   `symbol selector` = top bar
   `timeframes + indicators + save setup` = chart header
   `analysis/verdict` = right rail or mobile sheet
   `AI prompt + latest response` = footer
   `lab handoff` = chart save confirmation / detail sheet next-step CTA

3. Desktop IA
   Default desktop layout should open in chart focus with left rail collapsed, right rail available, and footer visible.
   Scan mode can expand the rail system, but focus mode should feel like a premium chart workspace, not a data terminal collage.

4. Mobile IA
   Mobile should not attempt to show mini dashboards beneath the chart.
   The chart remains first, the footer remains always reachable, and deeper context moves into the bottom sheet.

5. Duplication removal pass
   Remove repeated timeframe badges, repeated capture/setup buttons, repeated verdict summaries, repeated AI response surfaces, and repeated market status badges.

6. Current implementation pass
   First remove the surplus shell surfaces that violate ownership.
   Then compress the analysis rail header and rebuild the prompt footer so the composer is visible immediately on both desktop and mobile.

## Surface Ownership Matrix

- `Top bar`
  Owns: symbol selection only
  Must not own: timeframe, save setup, AI result, verdict summary, quick intent dashboard

- `Chart header`
  Owns: timeframe, indicators, chart mode, save setup
  Must not own: duplicate symbol summary beyond minimal market identity

- `Right rail`
  Owns: deterministic analysis, verdict, evidence, risk, sources
  Must not own: AI chat transcript, duplicate chart stats, duplicated timeframe badges

- `Footer`
  Owns: prompt input, send action, latest assistant response, minimal quick prompts
  Must not own: deterministic verdict summary, duplicated save setup action

- `Mobile sheet`
  Owns: expanded deterministic detail and next-step CTA
  Must not own: duplicate chart controls or duplicate prompt composer

## Layout Blueprint

### Desktop

- `Row 1: Top context bar`
  Single slim strip pinned to top.
  Left: active symbol selector.
  Right: optional global shell controls only if strictly necessary later.

- `Row 2: Main workspace`
  Primary region.
  Default state: chart dominates.
  Left rail: collapsed by default, expandable for scan/watchlist workflows.
  Center: chart workspace with TradingView-like hierarchy.
  Right rail: deterministic analysis panel, fixed width, optional collapse.

- `Row 3: Prompt footer`
  Always visible.
  Large input first.
  Minimal quick actions second.
  Latest assistant response third.

### Mobile

- `Row 1: Top symbol bar`
  Full-width symbol selector, no extra badges.

- `Row 2: Chart workspace`
  Main visible body.
  Chart header owns timeframe, indicators, save setup.

- `Row 3: Sticky prompt footer`
  Always reachable.
  Input visible by default.
  One row of quick actions max.
  Latest assistant response in compact form.

- `Overlay: Bottom detail sheet`
  Opened from footer or chart CTA.
  Holds deterministic analysis, risk, evidence, sources, and lab handoff.

## Visual Direction

- Overall look
  TradingView-like restraint, not a cyberpunk dashboard collage.
  Dark neutral surfaces with clear contrast, limited accent usage, and minimal ornament.

- Typography
  Mono for control chrome, values, and chart utility labels.
  Body font for assistant copy and explanatory text.
  Fewer tiny labels; if something is too small to scan quickly, it should be removed or promoted.

- Density
  High information density is allowed only inside the chart and right rail.
  The shell itself should feel sparse and controlled.
  Every bar outside the chart must justify its existence.

- Color
  Neutral base.
  Green/red only for market direction.
  Blue only for active interaction states.
  Yellow reserved for warnings or pending state.

- Spacing
  Top bar slim.
  Chart gets the most vertical space.
  Footer should read as a functional control surface, not a decorative strip.

- Motion
  Minimal.
  Use motion only for panel open/close, sticky transitions, and save confirmation.
  No constant pulsing or multiple competing animated surfaces.

## Desktop Wireframe

```text
+---------------------------------------------------------------+
| Symbol Selector                                               |
+--------------------+---------------------------+--------------+
| Optional Market    | Chart Header              | Analysis     |
| Rail (collapsed)   | TF | Indicators | Save    | Rail         |
|                    |---------------------------| Verdict      |
|                    |                           | Evidence     |
|                    |       Main Chart          | Risk         |
|                    |                           | Sources      |
|                    |                           |              |
|                    |---------------------------|              |
|                    | Indicator panes           |              |
+--------------------+---------------------------+--------------+
| Prompt Input                          | Quick Actions | Result |
+---------------------------------------------------------------+
```

## Mobile Wireframe

```text
+------------------------------+
| Symbol Selector              |
+------------------------------+
| Chart Header                 |
| TF | Indicators | Save       |
|------------------------------|
| Main Chart                   |
|------------------------------|
| Indicator panes              |
+------------------------------+
| Prompt Input                 |
| Quick Actions                |
| Latest AI Result             |
+------------------------------+
| Bottom Detail Sheet (modal)  |
+------------------------------+
```

## Implementation Phases

1. Remove duplicate surfaces first
   Delete duplicated timeframe, duplicated save/capture actions, duplicated assistant banners, duplicated summary cards.

2. Restore core interaction ownership
   Make symbol switching obvious, make footer input always visible, keep save setup chart-owned.

3. Rebuild responsive shell
   One scroll container on mobile, sticky footer, bottom sheet for detail, no extra mobile board under the chart.

4. Tune density after structure is stable
   Only after the layout is correct should we refine spacing, type scale, and visual polish.

## Final UX Standard

- the page should read as a chart workspace first, not as a dashboard collage
- the chart should own the only visible timeframe strip, indicator trigger, and save action
- the assistant should stay visible, but should read like a helper lane beneath the workspace rather than a competing primary panel
- the right rail should answer one question only: `what is the decision and why`
- mobile should preserve the same ownership model as desktop, not compress desktop chrome into stacked mini-panels
- consent, sticky footer, and chart controls should never overlap; the shell must reserve space rather than rely on z-index fights

## Final Optimization Checklist

- desktop first paint:
  no empty hero band, no hidden rail stubs, no duplicate context summary
- chart hierarchy:
  identity row, timeframe row, studies row, capture row only
- save flow:
  `Save Setup` visible once near capture context, `Open in Lab` appears from the same row after durable save
- prompt lane:
  composer visible without scroll on desktop and mobile, latest AI response shown once
- analysis rail:
  header limited to `Analysis | Symbol`, persistent conclusion strip at bottom
- market access:
  top-bar market button opens drawer/sheet; market UI should not occupy permanent shell space by default
- mobile:
  one predictable scroll surface, sticky prompt shelf, detail sheet for deterministic analysis
- consent:
  reserved strip prevents overlap with footer and capture actions

## Remaining QA Pass

1. desktop `1440x900` and `1280x800`
   confirm chart remains dominant, analysis rail stays readable, and prompt shelf does not crowd the chart
2. mobile `390x844` and narrow landscape
   confirm sticky footer height, save-row alignment, and consent stacking
3. interaction pass
   confirm symbol switching, market drawer, save flow, lab handoff, and prompt send loop all remain obvious on first use

## Next Steps

1. isolate this work as a standalone merge unit containing terminal shell UX files only
2. run the final browser QA pass against the layout matrix and adjust spacing only where the current ownership model still feels dense
3. keep any future additions inside the established ownership matrix; do not reintroduce duplicate status surfaces

## Exit Criteria

- the primary chart review + save flow remains visually dominant
- prompt input is clearly visible and usable on desktop and mobile
- streamed AI output has a clear display region that does not collide with deterministic right-rail decision context
- duplicate metrics around the chart are materially reduced
- responsive layouts preserve core-loop actions without hiding them behind secondary panels
- the terminal now follows a stable TradingView-like shell model with one owner per function

## Handoff Checklist

- keep the chart itself visually stable unless a change directly improves readability
- preserve capture-first semantics and explicit lab handoff
- document any remaining tradeoffs between assistant lane visibility and right-rail density
- if preparing a PR from the current dirty branch, include only the terminal shell UX surfaces and this work item; leave capture/lab, engine, and unrelated surface work out of the commit
