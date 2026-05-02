<script lang="ts">
  /**
   * ChartGridLayout — TradingView-style multi-chart grid.
   *
   * W-0288: Supports 6 layout presets (identical to TradingView free tier):
   *   1    — single chart (default)
   *   2H   — two charts, horizontal split (left | right)
   *   2V   — two charts, vertical split (top / bottom)
   *   2+1  — large left + two stacked right
   *   2x2  — four charts 2×2
   *   3+1  — three left column + one large right
   *
   * Each pane is a <ChartPane> with independent symbol / tf state.
   * The layout picker toolbar mirrors TradingView's icon row.
   */

  import ChartPane from './ChartPane.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  type LayoutKey = '1' | '2H' | '2V' | '2+1' | '2x2' | '3+1';

  interface PaneConfig {
    id:     number;
    symbol: string;
    tf:     string;
  }

  interface Props {
    /** Symbol for the initial / primary pane */
    symbol: string;
    /** Timeframe for the initial / primary pane */
    tf: string;
    /** surfaceStyle forwarded to each ChartPane → ChartBoard */
    surfaceStyle?: 'default' | 'velo';
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  let { symbol, tf, surfaceStyle = 'velo' }: Props = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let layout    = $state<LayoutKey>('1');
  let activePaneId = $state(0);
  let nextId    = $state(1);
  let panes     = $state<PaneConfig[]>([{ id: 0, symbol, tf }]);

  // Sync first pane when parent symbol / tf changes (e.g. symbol search in terminal)
  $effect(() => {
    if (panes.length > 0 && panes[0].symbol !== symbol) {
      panes = panes.map((p, i) => i === 0 ? { ...p, symbol } : p);
    }
  });
  $effect(() => {
    if (panes.length > 0 && panes[0].tf !== tf) {
      panes = panes.map((p, i) => i === 0 ? { ...p, tf } : p);
    }
  });

  // ── Layout definitions ─────────────────────────────────────────────────────
  const LAYOUT_PANE_COUNT: Record<LayoutKey, number> = {
    '1':   1,
    '2H':  2,
    '2V':  2,
    '2+1': 3,
    '2x2': 4,
    '3+1': 4,
  };

  const LAYOUT_GRID_STYLE: Record<LayoutKey, string> = {
    '1':   'grid-template-columns: 1fr; grid-template-rows: 1fr;',
    '2H':  'grid-template-columns: 1fr 1fr; grid-template-rows: 1fr;',
    '2V':  'grid-template-columns: 1fr; grid-template-rows: 1fr 1fr;',
    '2+1': 'grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;',
    '2x2': 'grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;',
    '3+1': 'grid-template-columns: 1fr 2fr; grid-template-rows: 1fr 1fr 1fr;',
  };

  // Maps pane index → grid area for special layouts
  const LAYOUT_AREA_MAP: Partial<Record<LayoutKey, string[]>> = {
    '2+1': [
      'grid-area: 1 / 1 / 3 / 2',  // large left spans 2 rows
      'grid-area: 1 / 2 / 2 / 3',  // top right
      'grid-area: 2 / 2 / 3 / 3',  // bottom right
    ],
    '3+1': [
      'grid-area: 1 / 1 / 2 / 2',
      'grid-area: 2 / 1 / 3 / 2',
      'grid-area: 3 / 1 / 4 / 2',
      'grid-area: 1 / 2 / 4 / 3',  // large right spans 3 rows
    ],
  };

  // ── Layout switching ───────────────────────────────────────────────────────
  function setLayout(key: LayoutKey) {
    if (key === layout) return;
    layout = key;

    const needed = LAYOUT_PANE_COUNT[key];

    if (panes.length < needed) {
      // Add new panes, inheriting the primary symbol
      const toAdd = needed - panes.length;
      const base  = panes[0];
      for (let i = 0; i < toAdd; i++) {
        panes = [...panes, { id: nextId++, symbol: base.symbol, tf: base.tf }];
      }
    } else if (panes.length > needed) {
      // Trim extra panes (keep first N)
      panes = panes.slice(0, needed);
      if (activePaneId >= needed) activePaneId = 0;
    }
  }

  function closePane(id: number) {
    if (panes.length <= 1) return; // keep at least 1
    panes = panes.filter((p) => p.id !== id);
    if (activePaneId === id) activePaneId = panes[0]?.id ?? 0;

    // Snap layout down
    const remaining = panes.length;
    if (remaining === 1) layout = '1';
    else if (remaining === 2 && layout !== '2V') layout = '2H';
    else if (remaining === 3) layout = '2+1';
  }

  // ── Layout icons (SVG paths as text) ─────────────────────────────────────
  const LAYOUT_ICONS: Record<LayoutKey, string> = {
    '1':   '▪',
    '2H':  '▪▪',
    '2V':  '▴▾',
    '2+1': '⊡',
    '2x2': '⊞',
    '3+1': '⊟',
  };

  const LAYOUT_LABELS: Record<LayoutKey, string> = {
    '1':   '1 Chart',
    '2H':  '2 Horizontal Split',
    '2V':  '2 Vertical Split',
    '2+1': '1 Main + 2',
    '2x2': '2×2',
    '3+1': '3 + 1 Main',
  };


</script>

<div class="chart-grid-root">
  <!-- ── Layout picker toolbar ── -->
  <div class="layout-toolbar" role="toolbar" aria-label="Chart layout picker">
    <span class="toolbar-label">LAYOUT</span>
    {#each (['1', '2H', '2V', '2+1', '2x2', '3+1'] as LayoutKey[]) as key}
      <button
        class="layout-btn"
        class:active={layout === key}
        onclick={() => setLayout(key)}
        title={LAYOUT_LABELS[key]}
        aria-pressed={layout === key}
        aria-label={LAYOUT_LABELS[key]}
      >
        {LAYOUT_ICONS[key]}
      </button>
    {/each}
  </div>

  <!-- ── Chart grid ── -->
  <div
    class="chart-grid"
    style={LAYOUT_GRID_STYLE[layout]}
  >
    {#each panes as pane, i (pane.id)}
      {@const areaStyle = LAYOUT_AREA_MAP[layout]?.[i] ?? ''}
      <div class="pane-slot" style={areaStyle}>
        <ChartPane
          symbol={pane.symbol}
          tf={pane.tf}
          active={pane.id === activePaneId}
          closeable={panes.length > 1}
          {surfaceStyle}
          onActivate={() => { activePaneId = pane.id; }}
          onClose={() => closePane(pane.id)}
          onSymbolChange={(sym) => {
            panes = panes.map((p) => p.id === pane.id ? { ...p, symbol: sym } : p);
          }}
          onTfChange={(newTf) => {
            panes = panes.map((p) => p.id === pane.id ? { ...p, tf: newTf } : p);
          }}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .chart-grid-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #0a0e14;
  }

  /* ── Layout picker ── */
  .layout-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    height: 32px;
    flex-shrink: 0;
  }

  .toolbar-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.25);
    letter-spacing: 0.08em;
    margin-right: 4px;
    font-weight: 600;
  }

  .layout-btn {
    background: none;
    border: 1px solid transparent;
    color: rgba(255, 255, 255, 0.35);
    border-radius: 4px;
    padding: 3px 7px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    transition: color 0.1s, background 0.1s, border-color 0.1s;
    font-family: inherit;
  }

  .layout-btn:hover {
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.06);
  }

  .layout-btn.active {
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.4);
    background: rgba(59, 130, 246, 0.08);
  }

  /* ── Chart grid ── */
  .chart-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 3px;
    padding: 3px;
  }

  .pane-slot {
    min-width: 0;
    min-height: 0;
    display: flex;
  }

  .pane-slot > :global(.chart-pane) {
    flex: 1;
  }
</style>
