# Extra Implemented Surfaces (Current)

## Purpose

Track implemented routes that are outside the Day-1 canonical page set but active in the app.

## `/patterns`

Current implementation:

- pattern engine dashboard page is mounted
- manual scan trigger and periodic refresh behavior exist
- candidate cards, phase-state table, and pattern stats blocks render
- includes verdict action buttons and terminal deep links

Notes:

- this route is implemented product surface even if not part of Day-1 canonical loop docs

Button action highlights:

- `Run Scan` -> POST scan trigger -> refresh candidates/states/stats
- `Open Terminal` -> navigate to `/terminal`
- candidate `Open Chart` -> navigate to terminal symbol context
- candidate verdict buttons (`Valid`/`Skip`) -> submit verdict -> refresh data

## `/settings`

Current implementation:

- preference controls (timeframe, data source, chart theme, language, speed)
- cloud/local preference sync path
- AI runtime mode configuration (TERMINAL / HEURISTIC / OLLAMA / API)
- inline AI connectivity test flow
- local reset controls

Notes:

- settings route is actively used by terminal runtime behavior

Button action highlights:

- timeframe/speed/theme/language controls -> persist preferences + update runtime state
- AI mode/provider/key controls -> patch runtime config store
- `테스트` -> send test message to terminal message API -> stream response text
- `RESET` -> clear resettable local storage keys + reload app

## `/passport`

Current implementation:

- profile/passport summary page is mounted
- wallet/connect state handling is present
- passport API payload rendering for identity/performance/activity/badges exists
- dashboard and terminal return actions exist

Notes:

- current route is summary/profile surface; dossier-style wallet evidence contract remains future scope

Button action highlights:

- `Connect/Wallet` -> open wallet modal
- `Dashboard` -> navigate to `/dashboard`
- error-state fallback buttons route to wallet connect or terminal

## `/agent` and `/agent/[id]`

Current implementation:

- both routes immediately redirect to `/lab`

Notes:

- route shell exists for backward compatibility and deep-link safety

Button action highlights:

- no functional controls; mount action redirects to `/lab`
