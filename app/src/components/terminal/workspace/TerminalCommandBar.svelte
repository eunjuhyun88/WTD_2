<script lang="ts">
  import { activePair, activeTimeframe, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import SymbolPicker from './SymbolPicker.svelte';

  type LayoutId = 'hero3' | 'compare2x2' | 'focus';

  interface Props {
    flowBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
    layout?: LayoutId;
    onLayout?: (l: LayoutId) => void;
    assetsCount?: number;
    leftRailOpen?: boolean;
    analysisRailOpen?: boolean;
    onToggleLeftRail?: () => void;
    onToggleAnalysisRail?: () => void;
    onClear?: () => void;
    onCapture?: () => void;
  }
  let {
    flowBias = 'NEUTRAL',
    layout = 'hero3',
    onLayout,
    assetsCount = 0,
    leftRailOpen = true,
    analysisRailOpen = true,
    onToggleLeftRail,
    onToggleAnalysisRail,
    onClear,
    onCapture,
  }: Props = $props();

  const tfs = ['15m', '1H', '4H', '1D'];
  const layouts: { id: LayoutId; label: string }[] = [
    { id: 'hero3', label: 'Hero+3' },
    { id: 'compare2x2', label: '2×2' },
    { id: 'focus', label: 'Focus' },
  ];

  let showSymbolDrop = $state(false);

  const biasColor = { LONG: '#4ade80', SHORT: '#f87171', NEUTRAL: 'rgba(247,242,234,0.4)' };
  const biasLabel = { LONG: '●LONG', SHORT: '●SHORT', NEUTRAL: '◎NEUTRAL' };
</script>

<nav class="command-bar">
  <div class="command-main">
    <div class="command-row command-row-primary">
      <div class="workspace-badge">
        <span class="ws-label">Workspace</span>
        <span class="ws-value">{assetsCount > 1 ? 'Scan Board' : 'Focus Board'}</span>
      </div>

      <div class="symbol-picker">
        <button class="symbol-btn" onclick={() => showSymbolDrop = !showSymbolDrop}>
          {$activePair || 'BTC/USDT'} ▾
        </button>
      </div>

      <div class="tf-ladder">
        {#each tfs as tf}
          <button
            class="tf-btn"
            class:active={$activeTimeframe === tf.toLowerCase() || ($activeTimeframe === '4h' && tf === '4H') || ($activeTimeframe === '1h' && tf === '1H') || ($activeTimeframe === '1d' && tf === '1D')}
            onclick={() => setActiveTimeframe(tf.toLowerCase() as any)}
          >
            {tf}
          </button>
        {/each}
      </div>

      <span class="bias-badge" style="color: {biasColor[flowBias]}">
        {biasLabel[flowBias]}
      </span>

      <div class="board-badge">
        {assetsCount > 0 ? `${assetsCount} Loaded` : 'Ready'}
      </div>
      <div class="command-actions">
        <div class="layout-switch">
          {#each layouts as l}
            <button class="layout-btn" class:active={layout === l.id} onclick={() => onLayout?.(l.id)}>
              {l.label}
            </button>
          {/each}
        </div>

        <button class="capture-btn" onclick={onCapture} title="Capture this setup as PatternSeed">
          Capture
        </button>

        {#if assetsCount > 0}
          <button class="clear-btn" onclick={onClear} title="Clear board">Clr</button>
        {/if}
      </div>
    </div>

    <div class="command-row command-row-secondary">
      <div class="shell-switch" aria-label="Toggle terminal rails">
        <button
          class="shell-btn"
          class:active={leftRailOpen}
          onclick={onToggleLeftRail}
          title={leftRailOpen ? 'Hide left market rail' : 'Show left market rail'}
          aria-pressed={leftRailOpen}
        >
          Market
        </button>
        <button
          class="shell-btn"
          class:active={analysisRailOpen}
          onclick={onToggleAnalysisRail}
          title={analysisRailOpen ? 'Hide right analysis rail' : 'Show right analysis rail'}
          aria-pressed={analysisRailOpen}
        >
          Analysis
        </button>
      </div>

      <div class="chip-strip">
        <span class="mini-chip"><span>Mode</span><strong>{assetsCount > 1 ? 'Scan' : 'Focus'}</strong></span>
        <span class="mini-chip ai"><span>AI</span><strong>API</strong></span>
        <span class="mini-chip"><span>Flow Bias</span><strong>{flowBias}</strong></span>
        <span class="mini-chip"><span>Board</span><strong>{assetsCount} symbol{assetsCount === 1 ? '' : 's'}</strong></span>
      </div>
    </div>
  </div>
</nav>

{#if showSymbolDrop}
  <SymbolPicker
    activePair={$activePair || 'BTC/USDT'}
    onSelect={(pair) => setActivePair(pair)}
    onClose={() => showSymbolDrop = false}
  />
{/if}

<style>
  .command-bar {
    padding: 0;
    background: transparent;
  }
  .command-main {
    display: grid;
    gap: 12px;
    padding: 0;
  }
  .command-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .command-row-primary {
    padding-bottom: 2px;
  }
  .command-row-secondary {
    padding-top: 2px;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .command-row-primary,
  .command-row-secondary {
    padding-left: 2px;
    padding-right: 2px;
  }
  .command-actions,
  .chip-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .command-row-primary > :first-child,
  .command-row-secondary > :first-child {
    flex-shrink: 0;
  }
  .command-row-primary > :last-child,
  .command-row-secondary > :last-child {
    margin-left: auto;
  }
  .workspace-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(21, 33, 53, 0.64);
    border: 1px solid rgba(77,143,245,0.18);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    white-space: nowrap;
  }
  .ws-label,
  .board-badge,
  .mini-chip span {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }
  .ws-value {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #77b8ff;
  }
  .symbol-btn {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--sc-text-0);
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 10px 14px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .symbol-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.16); }
  .tf-ladder {
    display: flex;
    gap: 4px;
    padding: 0;
    border: none;
    background: transparent;
  }
  .tf-btn {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-2);
    background: transparent;
    border: 1px solid transparent;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .tf-btn:hover { color: var(--sc-text-0); background: rgba(255,255,255,0.04); }
  .tf-btn.active { color: #63b3ed; background: rgba(77,143,245,0.12); border-color: rgba(77,143,245,0.14); }
  .bias-badge {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0 2px;
    white-space: nowrap;
  }
  .board-badge {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    white-space: nowrap;
  }
  .layout-switch {
    display: flex;
    gap: 4px;
  }
  .layout-btn {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .layout-btn.active, .layout-btn:hover {
    color: #8bbfff;
    border-color: rgba(77,143,245,0.16);
    background: rgba(77,143,245,0.08);
  }
  .shell-switch {
    display: inline-flex;
    gap: 8px;
    padding: 8px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.04),
      0 10px 24px rgba(0,0,0,0.22);
  }
  .shell-btn {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(116, 186, 255, 0.92);
    background: rgba(37, 53, 84, 0.26);
    border: 1px solid rgba(77,143,245,0.26);
    border-radius: 999px;
    padding: 12px 22px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .shell-btn:hover {
    color: rgba(176, 216, 255, 1);
    border-color: rgba(77,143,245,0.34);
  }
  .shell-btn.active {
    color: rgba(155, 210, 255, 1);
    border-color: rgba(77,143,245,0.46);
    background: radial-gradient(circle at top, rgba(77,143,245,0.18), rgba(37, 53, 84, 0.42));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .clear-btn {
    font-family: var(--sc-font-mono); font-size: 10px; font-weight: 700;
    letter-spacing: 0.14em; color: var(--sc-text-2);
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 10px 12px; cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .clear-btn:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }

  .capture-btn {
    font-family: var(--sc-font-mono); font-size: 10px; font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #0b1015;
    background: linear-gradient(180deg, #c9f27b, #9dcc63);
    border: 1px solid rgba(201,242,123,0.35);
    border-radius: 8px;
    padding: 10px 14px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    box-shadow: 0 10px 24px rgba(157,204,99,0.16);
  }
  .capture-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(157,204,99,0.2); }

  .mini-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.02);
    white-space: nowrap;
  }
  .mini-chip strong {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(250,247,235,0.7);
  }
  .mini-chip.ai {
    border-color: rgba(102, 187, 106, 0.18);
    background: rgba(102, 187, 106, 0.06);
  }

  @media (max-width: 768px) {
    .command-bar {
      padding: 0;
    }
    .command-main {
      gap: 8px;
    }
    .command-row {
      gap: 8px;
    }
    .command-row-secondary {
      border-top: 0;
      padding-top: 0;
    }
    .chip-strip {
      width: 100%;
      overflow-x: auto;
      flex-wrap: nowrap;
    }
    .command-actions {
      justify-content: flex-start;
    }
    .layout-switch,
    .board-badge {
      display: none;
    }
    .shell-switch {
      width: 100%;
      justify-content: space-between;
    }
    .shell-btn {
      flex: 1;
      justify-content: center;
      text-align: center;
    }
    .capture-btn,
    .clear-btn {
      padding: 9px 10px;
    }
  }
</style>
