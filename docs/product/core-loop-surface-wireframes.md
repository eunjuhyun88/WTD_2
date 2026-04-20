# Core Loop Surface Wireframes

## Purpose

Provide UI/UX implementation wireframes for the Day-1 core loop surfaces so app agents can build consistent layouts and CTA hierarchy without re-interpreting the page specs.

This is a structural wireframe document, not a visual design system.

## Global Rules

1. Every surface must expose one primary job above the fold.
2. Primary CTA must be visually dominant over helper actions.
3. Empty, loading, degraded, and error states are part of the wireframe, not afterthoughts.
4. Surface-local analytics depth must not replace the next valid action in the loop.

## `/terminal` Desktop Wireframe

Primary job:
- review chart context and save exact setup evidence

Layout:

```text
+-----------------------------------------------------------------------------------+
| Top nav / route tabs / market strip                                               |
+-----------------------------------------------------------------------------------+
| Context bar: symbol | timeframe | replay source | candidate/alert badge | fresh   |
+-----------------------------------------------------------------------------------+
| Command bar / query / chips                                                       |
+-----------------------------------------------------------------------------------+
| Left rail            | Main chart board                             | Right rail   |
| - watchlist          | - hero chart with selected range             | - Summary    |
| - candidates         | - indicators below/overlay                   | - Entry      |
| - recent captures    | - range handles / replay marker              | - Risk       |
|                      | - evidence strip under chart                 | - Catalysts  |
|                      |                                              | - Metrics    |
+-----------------------------------------------------------------------------------+
| Bottom dock: event tape | save status | similar capture preview | next actions    |
+-----------------------------------------------------------------------------------+
```

Primary CTA cluster:

1. `Save Setup`
2. `Open in Lab`
3. `View Similar`
4. `Run Query` or `Analyze` as helper only

Component rules:

- `Save Setup` stays in fixed visible location near reviewed chart context
- selected range must remain visible even while right rail changes
- note input sits adjacent to save flow, not buried in a later modal step (inline SaveStrip, not modal)
- similar capture preview appears after or beside save context, not as the hero

Drag range selection wireframe:

```text
+-----------------------------------------------------------------------------------+
| Main chart board                                                                   |
| - hero chart (lightweight-charts)                                                  |
|                                                                                    |
|   [drag area — mousedown → blue rect live → mouseup]                              |
|   ████████████████████████████████████                                            |
|   ▌ anchorA                        anchorB ▐                                      |
|                                                                                    |
+-----------------------------------------------------------------------------------+
| SaveStrip (appears after drag completes, anchorA + anchorB set):                  |
| ⊡ Apr21 14:00→16:00 · 4H (8봉)  [EMA · BB · CVD · OI]  H:84,200 L:81,900 +2.8%  |
| [메모 입력......................]  [취소]  [저장]  [Save & Open in Lab →]          |
+-----------------------------------------------------------------------------------+
```

SaveStrip content contract:

1. Range label: `시작 → 끝 · TF · N봉`
2. Collected indicator pills: list of active indicators found in selected range
3. Range stats: H/L/change% within bars
4. Inline note textarea (single line, expandable)
5. Action buttons: 취소 · 저장 · Save & Open in Lab

Drag interaction rules:

- `SELECT RANGE` button click → enter range mode → chart cursor becomes crosshair
- `mousedown` on chart → anchorA set, drag begins
- `mousemove` while button held → anchorB updated via `adjustAnchor('B', t)`, RangePrimitive re-renders live
- `mouseup` → anchorB confirmed, SaveStrip appears
- `Escape` → exitRangeMode, SaveStrip dismissed
- Range mode OFF: normal pan/zoom/crosshair behavior intact

Disabled-state rules:

- `Save Setup` / `SELECT RANGE` disabled when no explicit range exists
- `Open in Lab` disabled until a durable capture or challenge projection exists

Loading and error states:

- loading: chart skeleton, right-rail placeholders, disabled CTA cluster
- empty: prompt to open a symbol or replay a reviewed setup
- degraded: stale data badge plus preserved chart and selected range
- error: chart error with retry, but query and saved-context links remain visible

## `/terminal` Mobile Wireframe

Primary job:
- preserve review and save flow without desktop compression

Modes:

```text
Mode 1: Workspace
+----------------------------------+
| Context bar                      |
| Hero chart                       |
| Range controls                   |
| Save Setup CTA                   |
| Similar preview teaser           |
+----------------------------------+

Mode 2: Command
+----------------------------------+
| Query input                      |
| chips / presets                  |
| parse feedback                   |
| helper CTA                       |
+----------------------------------+

Mode 3: Detail Sheet
+----------------------------------+
| Summary / Entry / Risk / ...     |
| Bias / Action / Invalidation     |
+----------------------------------+
```

Mobile rules:

- `Save Setup` must be reachable without opening the detail sheet
- range selection feedback must remain visible in workspace mode
- do not put the primary CTA only inside a bottom sheet

## `/lab` Desktop Wireframe

Primary job:
- evaluate whether a saved setup generalizes enough to monitor

Layout:

```text
+-----------------------------------------------------------------------------------+
| Top nav / route tabs                                                              |
+-----------------------------------------------------------------------------------+
| Page header: selected setup | source capture summary | status badge               |
+-----------------------------------------------------------------------------------+
| Setup list / filter rail | Main evaluation pane                                   |
| - setup rows             | - evaluate controls                                    |
| - search/filter          | - streamed run log                                     |
| - recent score/status    | - summary scorecard                                    |
|                          | - refinement panel                                     |
|                          | - instance table                                       |
|                          | - activation card                                      |
+-----------------------------------------------------------------------------------+
```

Primary CTA cluster:

1. `Run Evaluate`
2. `Activate Monitoring`
3. `Open Instance in Terminal`
4. `Refine Scope`

Component rules:

- activation card must sit below or beside evaluated summary, never above raw run state
- source capture summary stays pinned near the selected setup identity
- instance table is a core region, not an expandable afterthought

Disabled-state rules:

- `Activate Monitoring` disabled until valid evaluated state exists
- `Run Evaluate` disabled only when no setup is selected or a run is already active

Loading and error states:

- loading: selected setup shell and summary placeholders
- empty: prompt to project from terminal capture
- degraded: partial logs or summary parse warning without losing selection
- error: run failure shown inline in run pane with retry action

## `/lab` Mobile Wireframe

Primary job:
- preserve evaluate -> inspect -> activate flow with stacked sections

Layout:

```text
+----------------------------------+
| Setup picker                     |
| Setup header + capture summary   |
| Run Evaluate CTA                 |
| Stream / summary accordion       |
| Refinement section               |
| Instance list                    |
| Activate Monitoring CTA          |
+----------------------------------+
```

Mobile rules:

- `Run Evaluate` and `Activate Monitoring` cannot be hidden in overflow menus
- instance replay buttons should open terminal directly

## `/dashboard` Desktop Wireframe

Primary job:
- clear pending alert judgments and manage monitoring continuity

Layout:

```text
+-----------------------------------------------------------------------------------+
| Top nav / route tabs                                                              |
+-----------------------------------------------------------------------------------+
| Header: inbox summary | filters | notification status                             |
+-----------------------------------------------------------------------------------+
| Section 1: Signal Alerts (always first, largest visual weight)                    |
| - pending alerts list                                                             |
| - agree / disagree actions                                                        |
| - open chart action                                                               |
+-----------------------------------------------------------------------------------+
| Section 2: Watching                                                               |
| - live / paused watches                                                           |
| - pause / resume / open                                                           |
+-----------------------------------------------------------------------------------+
| Section 3: Saved Setups                                                           |
| - recent evaluated setups                                                         |
| - open in lab                                                                     |
+-----------------------------------------------------------------------------------+
| Section 4: My Adapters                                                            |
| - explicit placeholder                                                            |
+-----------------------------------------------------------------------------------+
```

Primary CTA cluster:

1. `Open Alert`
2. `Agree`
3. `Disagree`
4. `Pause/Resume Watch`
5. `Open Setup in Lab`

Component rules:

- pending alerts use strongest visual emphasis
- judged alerts collapse or move below pending by default
- saved setups are summary cards, not full analytics panels

Loading and error states:

- loading: section skeletons independently
- empty alerts: explain alerts appear after lab activation
- degraded: one failed section must not blank the page
- error: section-local retry

## `/dashboard` Mobile Wireframe

Primary job:
- handle alert feedback in the fewest taps possible

Layout:

```text
+----------------------------------+
| Header / filters                 |
| Signal Alerts stack              |
| Watching stack                   |
| Saved Setups stack               |
| My Adapters placeholder          |
+----------------------------------+
```

Mobile rules:

- `Agree` and `Disagree` stay directly on alert cards
- opening terminal from alert should not require entering a secondary detail page first

## CTA Hierarchy Rules

| Surface | Primary CTA | Secondary CTA | Tertiary CTA |
|---|---|---|---|
| terminal | `Save Setup` | `Open in Lab` | `Run Query`, `Analyze`, `View Similar` |
| lab | `Run Evaluate` or `Activate Monitoring` depending state | `Open Instance in Terminal` | `Refine Scope` |
| dashboard | `Open Alert`, `Agree`, `Disagree` | `Pause/Resume Watch` | `Open Setup in Lab` |

## Micro-Interaction Rules

1. Save confirmation must identify what symbol, timeframe, and range were saved.
2. Save confirmation must list which indicators were collected in the saved payload.
3. Evaluation completion must identify score, instance count, and next valid action.
4. Alert judgment must update immediately and remain reversible only through explicit follow-up logic, not silent toggle drift.
5. Paused watch state must be visually distinct from live state.
6. Drag range selection must give real-time visual feedback (live blue rectangle) during the drag, not only after mouseup.
7. Range mode cursor must be clearly distinct from default cursor so user knows drag is available.

## Accessibility and Clarity Rules

1. Every primary action must have explicit text, not icon-only reliance.
2. Disabled buttons require a visible reason nearby.
3. Section headers must remain readable without color dependence.
4. Reduced-motion mode must not remove state feedback, only animation intensity.
