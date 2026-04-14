<script lang="ts">
  import { activePair, activeTimeframe, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import SymbolPicker from './SymbolPicker.svelte';

  type LayoutId = 'hero3' | 'compare2x2' | 'focus';

  interface Props {
    flowBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
    layout?: LayoutId;
    onLayout?: (l: LayoutId) => void;
    assetsCount?: number;
    onQuickIntent?: (q: string) => void;
    onClear?: () => void;
    onCapture?: () => void;
  }
  let {
    flowBias = 'NEUTRAL',
    layout = 'hero3',
    onLayout,
    assetsCount = 0,
    onQuickIntent,
    onClear,
    onCapture,
  }: Props = $props();

  const tfs = ['15m', '1H', '4H', '1D'];
  const layouts: { id: LayoutId; label: string }[] = [
    { id: 'hero3', label: 'Hero+3' },
    { id: 'compare2x2', label: '2×2' },
    { id: 'focus', label: 'Focus' },
  ];
  const quickIntents = [
    { label: 'Buy Candidates', action: 'Show me the best buy candidates right now', tone: 'info' },
    { label: 'High OI', action: 'Show assets with the highest open interest expansion', tone: 'warn' },
    { label: "What's Wrong", action: 'What assets have warning signals right now?', tone: 'risk' },
    { label: 'Breakout', action: 'Which assets are near breakout conditions?', tone: 'neutral' },
    { label: 'Liquidation', action: 'Show liquidation risk and nearest clusters', tone: 'neutral' },
  ];

  let showSymbolDrop = $state(false);

  const biasColor = { LONG: '#4ade80', SHORT: '#f87171', NEUTRAL: 'rgba(247,242,234,0.4)' };
  const biasLabel = { LONG: '●LONG', SHORT: '●SHORT', NEUTRAL: '◎NEUTRAL' };
</script>

<nav class="command-bar">
  <div class="command-main">
    <div class="command-row">
      <div class="workspace-badge">
        <span class="ws-label">Workspace</span>
        <span class="ws-value">{assetsCount > 1 ? 'Scan' : 'Focus'}</span>
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

      <div class="quick-intents" aria-label="Quick terminal intents">
        {#each quickIntents as intent}
          <button
            class="intent-chip"
            data-tone={intent.tone}
            type="button"
            onclick={() => onQuickIntent?.(intent.action)}
          >
            {intent.label}
          </button>
        {/each}
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
    display: block;
    padding: 0;
  }
  .command-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .command-actions,
  .quick-intents {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .command-row > :first-child {
    flex-shrink: 0;
  }
  .command-row > :last-child {
    margin-left: auto;
  }
  .workspace-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    border-radius: 3px;
    background: rgba(21, 33, 53, 0.42);
    border: 1px solid rgba(77,143,245,0.18);
    white-space: nowrap;
  }
  .ws-label,
  .board-badge {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }
  .ws-value {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #77b8ff;
  }
  .symbol-btn {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-0);
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px;
    padding: 4px 7px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .symbol-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.16); }
  .tf-ladder {
    display: flex;
    gap: 1px;
    padding: 0;
    border: none;
    background: transparent;
  }
  .tf-btn {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    color: var(--sc-text-2);
    background: transparent;
    border: 1px solid transparent;
    padding: 4px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .tf-btn:hover { color: var(--sc-text-0); background: rgba(255,255,255,0.04); }
  .tf-btn.active { color: #63b3ed; background: rgba(77,143,245,0.12); border-color: rgba(77,143,245,0.14); }
  .bias-badge {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0 2px;
    white-space: nowrap;
  }
  .board-badge {
    padding: 4px 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    white-space: nowrap;
  }
  .layout-switch {
    display: flex;
    gap: 1px;
  }
  .layout-btn {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 4px 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .layout-btn.active, .layout-btn:hover {
    color: #8bbfff;
    border-color: rgba(77,143,245,0.16);
    background: rgba(77,143,245,0.08);
  }
  .clear-btn {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.14em; color: var(--sc-text-2);
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px; padding: 4px 7px; cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .clear-btn:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }

  .capture-btn {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #0b1015;
    background: linear-gradient(180deg, #c9f27b, #9dcc63);
    border: 1px solid rgba(201,242,123,0.35);
    border-radius: 3px;
    padding: 5px 9px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    box-shadow: 0 8px 18px rgba(157,204,99,0.16);
  }
  .capture-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(157,204,99,0.2); }

  .intent-chip {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    color: rgba(160,168,180,0.78);
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 2px;
    padding: 3px 5px;
    cursor: pointer;
    letter-spacing: 0.035em;
    white-space: nowrap;
    transition: all 0.12s ease;
  }

  .intent-chip:hover {
    color: rgba(230,236,246,0.95);
    border-color: rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.045);
  }

  .intent-chip[data-tone='info'] {
    color: rgba(120,184,255,0.86);
    border-color: rgba(77,143,245,0.14);
    background: rgba(77,143,245,0.06);
  }

  .intent-chip[data-tone='warn'] {
    color: rgba(233,193,103,0.88);
    border-color: rgba(251,191,36,0.14);
    background: rgba(251,191,36,0.06);
  }

  .intent-chip[data-tone='risk'] {
    color: rgba(241,153,153,0.86);
    border-color: rgba(248,113,113,0.14);
    background: rgba(248,113,113,0.055);
  }

  @media (max-width: 768px) {
    .command-bar {
      padding: 0;
    }
    .command-main {
      display: block;
    }
    .command-row {
      gap: 8px;
    }
    .quick-intents {
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
    .capture-btn,
    .clear-btn {
      padding: 9px 10px;
    }
  }
</style>
