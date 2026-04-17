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

<nav class="command-bar" aria-label="Terminal command bar">
  <button
    class="sym-chip"
    type="button"
    title={assetsCount > 1 ? `${assetsCount} active assets in scan context` : '심볼 변경'}
    onclick={() => showSymbolDrop = !showSymbolDrop}
  >
    <span class="sym-kicker">SYMBOL</span>
    <strong class="sym-value">{$activePair || 'BTC/USDT'}</strong>
    <span class="sym-caret" aria-hidden="true">▾</span>
  </button>

  <button
    class="rail-toggle"
    type="button"
    onclick={() => onToggleMarketRail?.()}
    aria-pressed={marketRailOpen}
    title="Market list"
  >
    <span class="rail-kicker">MARKETS</span>
    <span class="rail-state">{marketRailOpen ? '●' : '○'}</span>
  </button>
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
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: transparent;
    min-height: 36px;
  }

  .sym-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--sc-radius-1, 2px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.028);
    color: var(--sc-text-0);
    cursor: pointer;
    transition: background var(--sc-dur-fast, 140ms) ease, border-color var(--sc-dur-fast, 140ms) ease;
    font-family: var(--sc-font-mono);
  }

  .sym-chip:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.14);
  }

  .sym-kicker {
    font-size: 9px;
    letter-spacing: 0.12em;
    color: rgba(177, 181, 189, 0.5);
  }

  .sym-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--sc-text-0);
    letter-spacing: 0.02em;
  }

  .sym-caret {
    font-size: 10px;
    color: rgba(247, 242, 234, 0.58);
  }

  .rail-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--sc-radius-1, 2px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.028);
    cursor: pointer;
    font-family: var(--sc-font-mono);
    transition: background var(--sc-dur-fast, 140ms) ease, border-color var(--sc-dur-fast, 140ms) ease;
  }

  .rail-toggle:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rail-toggle[aria-pressed='true'] {
    border-color: rgba(99, 179, 237, 0.28);
    background: rgba(99, 179, 237, 0.1);
  }

  .rail-kicker {
    font-size: 9px;
    letter-spacing: 0.12em;
    color: rgba(177, 181, 189, 0.5);
  }

  .rail-state {
    font-size: 11px;
    color: rgba(99, 179, 237, 0.72);
  }

  @media (max-width: 767px) {
    .command-bar {
      padding: 4px 8px;
      min-height: 32px;
    }
    .sym-chip {
      flex: 1 1 auto;
      justify-content: flex-start;
    }
  }
</style>
