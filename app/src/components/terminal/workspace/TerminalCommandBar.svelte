<script lang="ts">
  import { activePair, setActivePair } from '$lib/stores/activePairStore';
  import SymbolPicker from './SymbolPicker.svelte';

  interface Props {
    assetsCount?: number;
    marketRailOpen?: boolean;
    onToggleMarketRail?: () => void;
  }

  let {
    assetsCount = 0,
    marketRailOpen = false,
    onToggleMarketRail,
  }: Props = $props();
  let showSymbolDrop = $state(false);
</script>

<nav class="command-bar" aria-label="Terminal symbol selector">
  <div class="command-actions">
    <button
      class="symbol-btn"
      type="button"
      title={assetsCount > 1 ? `${assetsCount} active assets in scan context` : 'Switch symbol'}
      onclick={() => showSymbolDrop = !showSymbolDrop}
    >
      <span class="symbol-copy">
        <em>Symbol</em>
        <strong>{$activePair || 'BTC/USDT'}</strong>
      </span>
      <span class="symbol-side">
        <small>Switch</small>
        <span class="symbol-caret" aria-hidden="true">▾</span>
      </span>
    </button>

    <button class="rail-btn" type="button" onclick={() => onToggleMarketRail?.()} aria-pressed={marketRailOpen}>
      <span>Market</span>
      <strong>{marketRailOpen ? 'On' : 'Open'}</strong>
    </button>
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

  .command-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .symbol-btn {
    width: min(332px, 100%);
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 11px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.028);
    color: var(--sc-text-0);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .symbol-btn:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.14);
  }

  .symbol-copy {
    display: grid;
    gap: 3px;
    text-align: left;
  }

  .symbol-copy em,
  .symbol-copy strong,
  .symbol-side small,
  .symbol-caret {
    font-family: var(--sc-font-mono);
    font-style: normal;
  }

  .symbol-copy em {
    font-size: 7px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }

  .symbol-copy strong {
    font-size: 12px;
    font-weight: 700;
    color: var(--sc-text-0);
  }

  .symbol-side {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(247,242,234,0.52);
  }

  .symbol-side small {
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .symbol-caret {
    font-size: 11px;
    color: rgba(247,242,234,0.58);
  }

  .rail-btn {
    min-height: 38px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.028);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(247,242,234,0.7);
    cursor: pointer;
  }

  .rail-btn span,
  .rail-btn strong {
    font-family: var(--sc-font-mono);
    font-style: normal;
  }

  .rail-btn span {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.46);
  }

  .rail-btn strong {
    font-size: 10px;
    color: rgba(247,242,234,0.86);
  }

  .rail-btn[aria-pressed='true'] {
    border-color: rgba(99,179,237,0.28);
    background: rgba(99,179,237,0.1);
  }

  @media (max-width: 768px) {
    .command-actions {
      width: 100%;
    }

    .symbol-btn {
      width: min(100%, calc(100% - 88px));
      min-height: 38px;
    }

    .rail-btn {
      min-width: 80px;
      min-height: 38px;
      justify-content: center;
      padding-inline: 10px;
    }
  }
</style>
