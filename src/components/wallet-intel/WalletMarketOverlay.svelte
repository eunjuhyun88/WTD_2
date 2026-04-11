<script lang="ts">
  import CgChart from '../cogochi/CgChart.svelte';
  import type { WalletMarketToken } from '$lib/wallet-intel/walletIntelTypes';

  let {
    tokens,
    selectedTokenSymbol = '',
    onSelectToken = () => {},
  }: {
    tokens: WalletMarketToken[];
    selectedTokenSymbol?: string;
    onSelectToken?: (symbol: string) => void;
  } = $props();

  const selectedToken = $derived(
    tokens.find((token) => token.symbol === selectedTokenSymbol) ?? tokens[0]
  );
</script>

<section class="wallet-card market-card">
  <div class="market-top">
    <div>
      <div class="eyebrow">Market Confirmation</div>
      <h3>{selectedToken.symbol} {selectedToken.pair}</h3>
      <p>{selectedToken.thesis}</p>
    </div>
    <div class="market-stats">
      <span class:up={selectedToken.changePct >= 0} class:dn={selectedToken.changePct < 0}>
        {selectedToken.changePct >= 0 ? '+' : ''}{selectedToken.changePct.toFixed(2)}%
      </span>
      <strong>${selectedToken.price.toLocaleString(undefined, { maximumFractionDigits: selectedToken.price >= 1 ? 2 : 6 })}</strong>
    </div>
  </div>

  <div class="token-row">
    {#each tokens as token}
      <button
        type="button"
        class="token-chip"
        class:active={token.symbol === selectedToken.symbol}
        onclick={() => onSelectToken(token.symbol)}
      >
        <span>{token.symbol}</span>
        <small>{token.role}</small>
      </button>
    {/each}
  </div>

  <div class="event-row">
    {#each selectedToken.eventMarkers as event}
      <div class="event-pill tone-{event.tone}">
        <span>{event.atLabel}</span>
        <strong>{event.type}</strong>
        <small>{event.usdLabel}</small>
      </div>
    {/each}
  </div>

  <div class="chart-wrap">
    <CgChart
      data={selectedToken.chart}
      currentPrice={selectedToken.price}
      annotations={selectedToken.annotations}
      indicators={selectedToken.indicators}
      symbol={selectedToken.pair}
      timeframe="4h"
      changePct={selectedToken.changePct}
      snapshot={selectedToken.snapshot}
      derivatives={selectedToken.derivatives}
    />
  </div>
</section>

<style>
  .wallet-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(13, 19, 32, 0.96), rgba(8, 12, 22, 0.94));
    border-radius: 18px;
    padding: 18px;
  }

  .market-top {
    display: flex;
    justify-content: space-between;
    gap: 18px;
  }

  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
  }

  h3 {
    margin: 8px 0 4px;
    font-size: 18px;
  }

  p {
    margin: 0;
    line-height: 1.55;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.68);
  }

  .market-stats {
    text-align: right;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .market-stats span,
  .market-stats strong {
    display: block;
  }

  .up { color: var(--sc-good, #00e9b8); }
  .dn { color: var(--sc-bad, #ff537a); }

  .token-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .token-chip {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    padding: 8px 11px;
    cursor: pointer;
    display: grid;
    gap: 2px;
    text-align: left;
  }

  .token-chip.active {
    border-color: rgba(54, 215, 255, 0.28);
    background: rgba(54, 215, 255, 0.08);
  }

  .token-chip small {
    color: rgba(255, 255, 255, 0.48);
    font-size: 10px;
  }

  .event-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin-top: 14px;
    padding-bottom: 4px;
  }

  .event-pill {
    min-width: 120px;
    border-radius: 14px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    display: grid;
    gap: 3px;
  }

  .event-pill span,
  .event-pill small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.52);
  }

  .event-pill strong {
    font-size: 12px;
  }

  .tone-bull { border-color: rgba(0, 233, 184, 0.18); }
  .tone-bear { border-color: rgba(255, 83, 122, 0.18); }
  .tone-cyan { border-color: rgba(54, 215, 255, 0.18); }
  .tone-warn { border-color: rgba(255, 191, 95, 0.18); }

  .chart-wrap {
    height: 560px;
    margin-top: 16px;
  }
</style>
