<script lang="ts">
  import AlphaMarketBar from '../cogochi/AlphaMarketBar.svelte';
  import { EMPTY_THERMO_DATA, type ThermoData } from '$lib/hubs/terminal/marketPulse';
  import { activePairState } from '$lib/stores/activePairStore';
  import { openTradeCount } from '$lib/stores/quickTradeStore';
  import { activeSignalCount } from '$lib/stores/trackedSignalStore';
  import { livePrices } from '$lib/stores/priceStore';

  let {
    thermo = EMPTY_THERMO_DATA,
    buckets = null
  }: {
    thermo?: ThermoData;
    buckets?: import('$lib/stores/alphaBuckets').AlphaBuckets | null;
  } = $props();

  const state = $derived($activePairState);
  const openPos = $derived($openTradeCount);
  const trackedSigs = $derived($activeSignalCount);
  const liveP = $derived($livePrices);

  const selectedToken = $derived(state.pair.split('/')[0] || 'BTC');
  const selectedPrice = $derived(liveP[selectedToken] || 0);
  const priceText = $derived(
    selectedPrice > 0
      ? '$' + Number(selectedPrice).toLocaleString('en-US', {
          minimumFractionDigits: selectedPrice >= 1000 ? 0 : 2,
          maximumFractionDigits: selectedPrice >= 1000 ? 0 : 2
        })
      : ''
  );
</script>

<div id="status-bar">
  <div class="sb-shell">
    <div class="sb-section sb-lead">
      <span class="sb-kicker">Market</span>
      <div class="sb-market-lead">
        <span class="sb-pair">{state.pair}</span>
        {#if priceText}
          <span class="sb-price">{priceText}</span>
        {/if}
      </div>
    </div>

    <div class="sb-center">
      <AlphaMarketBar thermo={thermo} buckets={buckets} />
    </div>

    <div class="sb-section sb-actions">
      {#if openPos > 0}
        <a class="sb-badge" href="/terminal">
          <span class="sb-dot dot-good"></span>
          {openPos} Position
        </a>
      {/if}
      {#if trackedSigs > 0}
        <a class="sb-badge" href="/terminal">
          <span class="sb-dot dot-warn"></span>
          {trackedSigs} Watching
        </a>
      {/if}
    </div>
  </div>
</div>

<style>
  #status-bar {
    flex-shrink: 0;
    padding: 0 16px 14px;
    background: transparent;
    z-index: var(--sc-z-sticky);
  }

  .sb-shell {
    min-height: 56px;
    border-radius: 22px;
    border: 1px solid rgba(249, 216, 194, 0.08);
    background:
      linear-gradient(180deg, rgba(18, 18, 20, 0.88), rgba(10, 10, 12, 0.84)),
      radial-gradient(circle at left bottom, rgba(219, 154, 159, 0.05), transparent 24%);
    box-shadow: 0 18px 32px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(16px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 10px 14px;
  }

  .sb-section {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .sb-lead {
    gap: 12px;
  }

  .sb-kicker,
  .sb-pair {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .sb-kicker {
    color: rgba(var(--home-ref-accent-rgb, 219, 154, 159), 0.82);
    font-size: 10px;
  }

  .sb-market-lead {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .sb-pair {
    color: rgba(250, 247, 235, 0.5);
    font-size: 10px;
  }

  .sb-price {
    color: rgba(250, 247, 235, 0.96);
    font-family: var(--sc-font-body);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .sb-center {
    min-width: 0;
  }

  .sb-center :global(.market-pulse) {
    min-width: 0;
  }

  .sb-center :global(.pulse-marquee) {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01)),
      radial-gradient(circle at left center, rgba(219, 154, 159, 0.04), transparent 22%);
    border-radius: 16px;
    border: 1px solid rgba(249, 216, 194, 0.06);
  }

  .sb-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .sb-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid rgba(249, 216, 194, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.78);
    font-family: var(--sc-font-body);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    transition: transform var(--sc-duration-fast), background var(--sc-duration-fast);
  }

  .sb-badge:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.06);
  }

  .sb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot-good {
    background: var(--sc-good);
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.4);
  }

  .dot-warn {
    background: var(--sc-accent);
    box-shadow: 0 0 8px rgba(219, 154, 159, 0.4);
  }

  @media (max-width: 1180px) {
    .sb-shell {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .sb-actions {
      justify-content: flex-start;
    }
  }

  @media (max-width: 900px) {
    #status-bar {
      padding: 0 12px 12px;
    }

    .sb-center {
      display: none;
    }

    .sb-shell {
      grid-template-columns: 1fr;
    }
  }
</style>
