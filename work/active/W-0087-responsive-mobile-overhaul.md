# W-0087 Responsive System and Mobile Full Overhaul

## Goal

Define the canonical responsive architecture for Cogochi across mobile, tablet, and desktop, and fully redesign the mobile experience so it stops compressing desktop columns and instead uses explicit mode switching per W-0078 intent. This work item pins the breakpoint model, the 4-mode mobile shell, gesture rules, responsive transition invariants, and the mobile home hero redesign, all aligned with W-0078 shell ownership and W-0086 chart-layer contract.

## Owner

app (UX + frontend surface). Depends on W-0086 chart architecture and W-0078 ownership matrix.

## Scope

- codify a three-tier breakpoint system (`MOBILE < 768`, `TABLET 768-1279`, `DESKTOP >= 1280`) with no intermediate states
- specify mobile shell as a mode switcher with four bottom-tab modes (`Chart`, `Detail`, `Scan`, `Judge`) rather than compressed desktop columns
- specify gesture rules for mobile chart that preserve Lightweight Charts native interactions during range-mode Save Setup
- specify tablet layout as two-column (chart + right rail) with drawer-based market panel
- reconfirm desktop layout follows W-0078 three-column shell without modification
- specify cross-tier transition invariants (primitive persistence, mode-state URL encoding, scroll preservation)
- redesign mobile home hero (`/`) because frozen status covers desktop hero, not mobile compression failure
- establish WCAG-grade touch targets, safe-area handling, and iOS keyboard behavior

## Non-Goals

- adding drawing tools on any tier
- replacing Lightweight Charts with a full TradingView widget
- introducing a light mode; dark-first per W-0078
- reopening W-0078 ownership decisions
- redesigning desktop home surface
- building a fifth mobile tab or a hamburger menu

## Canonical Files

- `work/active/W-0078-terminal-core-loop-ux-overhaul.md`
- `work/active/W-0086-core-loop-ux-concretization.md`
- `work/active/W-0087-responsive-mobile-overhaul.md`
- `docs/product/pages/01-home.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/pages/03-lab.md`
- `docs/product/pages/04-dashboard.md`

## Breakpoint System

Three tiers only. The product does not recognize intermediate states.

- `MOBILE` — viewport width `< 768px`
  layout model: mode switcher, one surface visible at a time, bottom tab bar
  typical device: iPhone/Android portrait

- `TABLET` — viewport width `768px` through `1279px`
  layout model: two-column (chart + right rail), market drawer, no bottom tab bar
  typical device: iPad portrait and landscape, small laptops, portrait external monitors
  note: mobile landscape is treated as `TABLET`

- `DESKTOP` — viewport width `>= 1280px`
  layout model: W-0078 three-column shell (market drawer, chart, right rail) with slim top and slim footer
  content cap: `1920px` max; wider viewports center content and allow only chart to fill

## Device Safety Constraints

- minimum supported width: `320px` (iPhone SE first generation); below this, horizontal scroll is allowed
- dark-first across all tiers; light mode is not part of Day-1
- WebGL and heavy canvas effects are disabled on `MOBILE`
- `env(safe-area-inset-bottom)` padding must be honored for all sticky footers and the mobile bottom tab bar

## Mobile Mode-Switcher Shell

Mobile uses four mutually exclusive modes driven by a bottom tab bar. Only one mode is visible at a time. Mode transitions occur only by tab taps; horizontal swipe to switch modes is disabled to prevent accidental loss of in-progress actions.

### Mode inventory

- `Chart` — chart review and Save Setup range-mode
- `Detail` — full-screen analysis rail equivalent to desktop right rail
- `Scan` — full-screen market drawer equivalent to desktop left market panel
- `Judge` — mobile dashboard, Signal Alerts feedback loop first

### Shared mobile chrome

- top symbol picker strip, slim height ~48px, visible in `Chart` and `Detail` modes
- sticky prompt footer, visible in `Chart` and `Detail` modes, input first, send second, no quick-action chips except on empty state
- bottom tab bar, persistent across all modes, safe-area padded

### Chart mode layout

- chart canvas ~70% of available vertical space
- indicator pane ~30%
- phase badge chip in top-right overlay, pointer-events: none by default
- Save Setup button in the chart header row
- range-mode uses tap-tap (first tap sets start anchor, second tap sets end anchor); pan and pinch-zoom remain available
- during range-mode, pan on empty-space becomes long-press + drag so a single tap does not accidentally anchor

### Detail mode layout

- breadcrumb row back to `Chart` mode with active symbol and timeframe
- horizontally scrollable pill tabs `Verdict / Why / Risk / Sources`; `Metrics` folds into `Sources` on mobile
- scrollable tab body
- sticky conclusion strip: `Bias / Action / Invalidation`
- sticky prompt footer
- bottom tab bar

### Scan mode layout

- full-screen market list with filter chips
- tapping a symbol auto-switches to `Chart` mode with the selected symbol active
- pull-to-refresh reloads market data

### Judge mode layout

- full-screen dashboard, Signal Alerts section fixed at top
- each pending alert row exposes `agree / disagree` plus a single-select reason chip (`valid / late / noisy / invalid / almost`)
- row tap deep-links into `Chart` mode replay for the alert context

## Mobile Gesture Contract

| gesture                         | default behavior | exception |
|---|---|---|
| one-finger drag on chart canvas | pan time axis    | disabled during range-mode; long-press + drag required |
| pinch                           | zoom             | always available |
| one-finger tap                  | crosshair snap   | sets range anchor during range-mode |
| horizontal body swipe           | no action        | never used for mode switching |
| pull-to-refresh                 | data reload      | `Chart`, `Scan`, `Judge` modes only |

## Tablet Shell

- two-column body: chart + right rail
- right rail fixed width `320px`; chart takes `calc(100% - 320px)`
- market drawer opens from top bar as a modal drawer, never a permanent column
- bottom tab bar is not used; primary navigation is in the top bar with Terminal, Lab, Dashboard
- Lab and Dashboard also render in two-column mode (list + detail)

## Desktop Shell

- unchanged from W-0078
- three-column: market drawer (collapsed default), chart workspace, right rail `320-340px`
- slim top bar, slim footer
- content cap `1920px`

## Cross-Tier Transition Invariants

Every viewport resize must preserve these properties without user-visible state loss.

1. Chart primitives (Save range rectangle, phase zones) are anchored in time coordinates and must survive any width change
2. Current mode or rail-open state is encoded in URL so a mobile `Detail` mode continues as a desktop rail-open state on resize
3. Scroll position within the active surface is preserved across resize
4. Sticky footer uses `position: sticky`; virtual keyboard appearance does not detach it on iOS
5. During Save range-mode, resizing preserves the range primitive and the save strip; the strip re-renders per the active tier

## Mobile Home Hero Redesign

The home spec is otherwise frozen. Mobile hero is the explicit exception because compressing the desktop hero into mobile breaks readability.

### Layout

- top: slim app mark and sign-in link at 44px
- hero body: single-column text, H1 at 28px, sub-copy at 18px, aligned left
- start bar: full-width input with send affordance, followed by primary CTA `Open Terminal` and a text link `See How Lab Scores It`
- learning loop: vertical list `01 Capture`, `02 Scan`, `03 Judge` with arrows; `Judge` is the emphasized step because loop closure is the differentiator
- surface map: simple vertical list of active Day-1 surfaces
- background: WebGL ASCII effect disabled on `MOBILE` for battery and performance

## Accessibility and Ergonomics

- minimum touch target: `44x44pt`
- two-typeface scale only: `display` for chart values and control chrome, `body` for prose
- color tokens: neutral base, green and red for market direction, blue for interactive active state, yellow for warnings; no additional accent colors introduced for responsive variants
- motion: limited to 200ms slide on mode transition; no decorative loops or pulses on mobile

## Deletion and Suppression List for Mobile

- mini-dashboard cards below the chart body must be removed, per W-0078 and this spec
- Save Setup must not appear as a full-width banner on mobile; it remains inside the chart header flow
- cookie consent must use a reserved bottom strip contract so the prompt footer and bottom tab bar never collide
- hamburger side menu must be removed; navigation lives only in the bottom tab bar
- horizontal scroll is disallowed except for the `Detail` pill-tab row

## Mapping to Branch Refactor

Phase 5 of the refactor plan is split into two batches so mobile and tablet shell redesign is not delayed by desktop surface polish.

- `phase 5a mobile-only`
  - Terminal `Chart`, `Detail`, `Scan`, `Judge` modes
  - bottom tab bar
  - mobile home hero redesign
  - safe-area handling and sticky footer correctness
- `phase 5b desktop and tablet follow-up`
  - Lab capture merge and phase reorder
  - Dashboard reason-chip feedback loop on desktop and tablet
  - tablet two-column shell for Lab and Dashboard

`phase 5a` precedes `phase 5b` because mobile is the largest friction point for the `A3` activation target defined in W-0086.

## Exit Criteria

- resizing from 1440 to 390 preserves chart primitives, active mode, scroll position, and save-in-progress strip
- mobile Terminal can reach first Save Setup within three minutes in unassisted testing, matching `A3` target
- no horizontal scroll on any mobile surface outside the `Detail` pill-tab row
- bottom tab bar respects iOS safe-area insets and never overlaps prompt footer or consent strip
- mobile home hero renders without WebGL background and passes readability review at 390x844
- tablet layout passes the same W-0086 native regression tests (crosshair, pan, zoom, timeframe persistence) as desktop

## Open Questions

- whether `Scan` mode should include a separate saved-setups list or rely on navigation to `Judge` mode
- whether pull-to-refresh should also trigger a fresh engine scan or only reload cached data
- whether tablet landscape `>= 1024` should unlock a collapsible market column instead of a pure drawer

## Handoff Checklist

- do not introduce intermediate breakpoints between the three tiers
- any chart-adjacent UI on any tier must remain in W-0086 Layer 1 or Layer 2
- any new mobile surface must attach to one of the four modes, never as a new fifth tab
- cross-tier state transfer must use only URL parameters or persisted records per W-0086 handoff event list

## Implementation Plan

### Component Tree (Mobile shell)

```
routes/terminal/+page.svelte (same entry for all tiers; tier-branch inside)
  └ shell/TerminalShell.svelte
      ├ tier === MOBILE
      │   ├ mobile/MobileSymbolStrip.svelte          (new; shared across Chart & Detail)
      │   ├ mobile/ModeRouter.svelte                 (new; switches on activeMode)
      │   │   ├ mobile/ChartMode.svelte              (new; hosts CanvasHost + indicator pane)
      │   │   ├ mobile/DetailMode.svelte             (new; full-screen rail equivalent)
      │   │   ├ mobile/ScanMode.svelte               (new; market list)
      │   │   └ mobile/JudgeMode.svelte              (new; dashboard alerts subset)
      │   ├ mobile/MobilePromptFooter.svelte         (renamed from MobileCommandDock)
      │   └ mobile/BottomTabBar.svelte               (new; 4 tabs, safe-area padded)
      ├ tier === TABLET
      │   └ TabletShell.svelte                       (new; 2-column chart + rail)
      └ tier === DESKTOP
          └ DesktopShell.svelte                      (existing; W-0078 3-column)
```

### Tier + Mode Stores (new)

```ts
// app/src/lib/stores/viewportTier.ts (new)
type ViewportTier = 'MOBILE' | 'TABLET' | 'DESKTOP';
interface ViewportTierState { tier: ViewportTier; width: number; height: number; }
// driven by a single matchMedia listener; updates on resize/orientation change

// app/src/lib/stores/mobileMode.ts (new)
type MobileMode = 'chart' | 'detail' | 'scan' | 'judge';
interface MobileModeState {
  active: MobileMode;
  lastSymbolContext: { symbol: string; tf: string } | null;
  pendingAlertId: string | null;   // set by JudgeMode row tap when jumping to ChartMode replay
}
// serializes to URL query `?m=chart|detail|scan|judge` so resize to desktop hydrates correctly
```

Rule: `viewportTier` is read-only derived from window; `mobileMode` is owned by user navigation and persisted to URL.

### File-Level Diff Plan

New files:
- `app/src/lib/stores/viewportTier.ts`
- `app/src/lib/stores/mobileMode.ts`
- `app/src/components/terminal/mobile/ModeRouter.svelte`
- `app/src/components/terminal/mobile/ChartMode.svelte`
- `app/src/components/terminal/mobile/DetailMode.svelte`
- `app/src/components/terminal/mobile/ScanMode.svelte`
- `app/src/components/terminal/mobile/JudgeMode.svelte`
- `app/src/components/terminal/mobile/BottomTabBar.svelte`
- `app/src/components/terminal/mobile/MobileSymbolStrip.svelte`
- `app/src/components/terminal/mobile/MobilePromptFooter.svelte` (renamed)
- `app/src/components/terminal/shell/TabletShell.svelte`
- `app/src/components/terminal/shell/DesktopShell.svelte` (extracted from current +page)
- `app/src/components/home/MobileHomeHero.svelte` (new mobile-only hero)

Modify:
- `app/src/components/terminal/shell/TerminalShell.svelte` — branch on `viewportTier`
- `app/src/routes/+page.svelte` — conditional import of `MobileHomeHero` when tier is MOBILE
- `app/src/components/home/WebGLAsciiBackground.svelte` — early return on `viewportTier === 'MOBILE'`
- `app/src/components/home/HomeHero.svelte` — scope to non-MOBILE tiers only

Delete or relocate from mobile path:
- `app/src/components/terminal/mobile/MobileActiveBoard.svelte` — contents move into `ChartMode` + `DetailMode`; file archived
- `app/src/components/terminal/mobile/MobileDetailSheet.svelte` — replaced by `DetailMode` full-screen

### Gesture Implementation Notes

- `ChartMode` wraps CanvasHost (from W-0086) with a pointer handler layer that is enabled only when `chartSaveMode.active === true`
- when range-mode is active, the pointer layer intercepts single taps to set anchors, and elevates drag to long-press + drag (`pointerdown` timer >= 350ms before allowing LWC native pan)
- pinch zoom is never intercepted; passed straight to LWC

### Safe-Area and Keyboard Rules

- `BottomTabBar` uses `padding-bottom: env(safe-area-inset-bottom)`
- `MobilePromptFooter` uses `position: sticky; bottom: 56px` where 56px is the BottomTabBar height plus safe-area token
- virtual keyboard detection via `visualViewport` resize event shrinks the mode body rather than the footer

### Acceptance Checklist (DoD)

- 390x844 iPhone viewport: all four modes reachable via bottom tab bar in one tap each
- first Save Setup reachable within 3 minutes on mobile in unassisted testing (`A3` target from W-0086)
- rotating device to landscape triggers `TABLET` layout without losing save-in-progress state
- resizing from 1440x900 to 390x844 preserves active mode (via URL `?m=`) and chart primitives
- no horizontal scroll on any mobile mode except the Detail pill-tab row
- `BottomTabBar` sits above the iOS home indicator using safe-area padding on iPhone X-class devices
- WebGL background does not mount on mobile home; FPS verified > 55 on low-tier Android via Chrome DevTools device throttle

