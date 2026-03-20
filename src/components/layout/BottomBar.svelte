<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { openTradeCount } from '$lib/stores/quickTradeStore';
  import { activeSignalCount } from '$lib/stores/trackedSignalStore';
  import { livePrices } from '$lib/stores/priceStore';
  import { getAppSurface } from '$lib/navigation/appSurfaces';

  const state = $derived($gameState);
  const openPos = $derived($openTradeCount);
  const trackedSigs = $derived($activeSignalCount);
  const liveP = $derived($livePrices);
  const marketSurface = getAppSurface('market');

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
  <div class="sb-section">
    {#if openPos > 0}
      <a class="sb-badge sb-pos" href="/agent">
        <span class="sb-dot dot-good"></span>
        {openPos} POS
      </a>
    {/if}
    {#if trackedSigs > 0}
      <a class="sb-badge sb-sig" href={marketSurface.href}>
        <span class="sb-dot dot-warn"></span>
        {trackedSigs} {marketSurface.shortLabel}
      </a>
    {/if}
  </div>

  <div class="sb-center">
    <span class="sb-pair">{state.pair}</span>
    {#if priceText}
      <span class="sb-price">{priceText}</span>
    {/if}
  </div>

  <div class="sb-section sb-right">
    <span class="sb-stat"><span class="sb-lbl">M:</span>{state.matchN}</span>
    <span class="sb-stat"><span class="sb-lbl">W:</span>{state.wins}</span>
    {#if state.streak > 0}
      <span class="sb-stat sb-streak">{state.streak}</span>
    {/if}
    <div class="sb-lp">
      <div class="sb-lp-track">
        <div class="sb-lp-fill" style="width:{Math.min(state.lp / 50, 100)}%"></div>
      </div>
      <span class="sb-lp-val">{state.lp.toLocaleString()} LP</span>
    </div>
  </div>
</div>

<style>
  #status-bar {
    display: flex;
    align-items: center;
    padding: 0 var(--sc-sp-3);
    gap: var(--sc-sp-3);
    border-top: 1px solid rgba(255, 127, 186, 0.18);
    background:
      radial-gradient(circle at 15% 100%, rgba(255, 118, 181, 0.08), transparent 28%),
      radial-gradient(circle at 86% 100%, rgba(186, 240, 106, 0.08), transparent 26%),
      linear-gradient(180deg, rgba(10, 15, 26, 0.96), rgba(8, 13, 23, 0.96));
    z-index: var(--sc-z-sticky);
    height: var(--sc-bottom-bar-h);
    flex-shrink: 0;
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
  }

  .sb-section {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-2);
    flex-shrink: 0;
  }
  .sb-right {
    margin-left: auto;
  }

  .sb-center {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-1_5);
  }
  .sb-pair {
    color: var(--sc-text-3);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.5px;
  }
  .sb-price {
    color: var(--sc-text-0);
    font-weight: 600;
  }

  .sb-badge {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-1);
    padding: var(--sc-sp-1) var(--sc-sp-2);
    min-height: 24px;
    border-radius: var(--sc-radius-sm);
    border: 1px solid var(--sc-line-soft);
    background: transparent;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--sc-duration-fast);
    color: var(--sc-text-1);
    text-decoration: none;
  }
  .sb-badge:hover {
    background: rgba(255, 118, 181, 0.08);
    border-color: rgba(255, 217, 122, 0.12);
  }
  .sb-badge:active {
    background: var(--sc-accent-bg);
    transform: scale(0.96);
  }

  .sb-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }
  .dot-good { background: var(--sc-good); box-shadow: 0 0 4px var(--sc-good); }
  .dot-warn { background: var(--sc-warn); box-shadow: 0 0 4px var(--sc-warn); }

  .sb-stat {
    color: var(--sc-text-1);
    font-weight: 600;
  }
  .sb-lbl {
    color: var(--sc-text-3);
    font-weight: 400;
  }
  .sb-streak {
    color: var(--sc-accent-3);
  }

  .sb-lp {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-1);
  }
  .sb-lp-track {
    width: 48px;
    height: 3px;
    border-radius: 2px;
    background: rgba(7, 15, 11, 0.9);
    border: 1px solid var(--sc-line-soft);
  }
  .sb-lp-fill {
    height: 100%;
    border-radius: 1px;
    background: linear-gradient(90deg, var(--sc-good), var(--sc-accent-2));
    transition: width 0.5s var(--sc-ease);
  }
  .sb-lp-val {
    color: var(--sc-accent-3);
    font-weight: 700;
    font-size: var(--sc-fs-2xs);
  }

  @media (max-width: 768px) {
    .sb-center { display: none; }
    .sb-lp-track { width: 36px; }
  }

  @media (max-width: 480px) {
    #status-bar {
      gap: var(--sc-sp-2);
      padding: 0 var(--sc-sp-2);
    }
    .sb-lp { display: none; }
  }
</style>
