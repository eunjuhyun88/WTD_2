# Chart Contract

**Status:** current
**Verified by:** `design/current/invariants.yml`

## ChartBoard Props

`app/src/components/terminal/workspace/ChartBoard.svelte` owns live chart rendering, multi-pane indicators, capture mode, and alpha overlay application.

Current verified props:

| Prop | Required | Notes |
|---|---:|---|
| `symbol` | yes | Active market symbol. |
| `tf` | no | External timeframe override. |
| `verdictLevels` | no | Entry/stop/target overlays. |
| `initialData` | no | Initial candle/chart payload. |
| `surfaceStyle` | no | Current styles are `default` and `velo`. |
| `analysisData` | no | Drives `AlphaOverlayLayer` lines and markers. |
| `onCandleClose` | no | Parent refresh hook for analyze/verdict state. |
| `gammaPin` | no | Options gamma pin overlay. |

## Drift Rule

If the prop names or optionality change, update this contract and `design/current/invariants.yml` in the same PR.
