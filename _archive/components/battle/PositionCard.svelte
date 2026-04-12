<script lang="ts">
  import type { Position, CompletedTrade } from '$lib/stores/battleStore';

  let {
    position = { type: null, shares: 0, costBasis: 0, stopPrice: null, unrealizedPL: 0 } as Position,
    currentPrice = 0,
    completedTrades = [] as CompletedTrade[],
  }: {
    position: Position;
    currentPrice: number;
    completedTrades: CompletedTrade[];
  } = $props();

  function formatPrice(p: number): string {
    return p >= 1000
      ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : p.toFixed(2);
  }

  function formatPL(pl: number): string {
    const sign = pl >= 0 ? '+' : '';
    return `${sign}$${formatPrice(Math.abs(pl))}`;
  }
</script>

<div class="position-card">
  <!-- Current Position -->
  <div class="pc-header">Position</div>

  {#if position.type}
    <div class="pc-grid">
      <div class="pc-field">
        <span class="pc-field-label">Type</span>
        <span class="pc-field-value" class:long={position.type === 'long'} class:short={position.type === 'short'}>
          {position.type === 'long' ? 'L' : 'S'}
        </span>
      </div>
      <div class="pc-field">
        <span class="pc-field-label">Shares</span>
        <span class="pc-field-value">{position.shares}</span>
      </div>
      <div class="pc-field">
        <span class="pc-field-label">Cost</span>
        <span class="pc-field-value">${formatPrice(position.costBasis)}</span>
      </div>
      <div class="pc-field">
        <span class="pc-field-label">Price</span>
        <span class="pc-field-value">${formatPrice(currentPrice)}</span>
      </div>
      {#if position.stopPrice}
        <div class="pc-field">
          <span class="pc-field-label">Stop</span>
          <span class="pc-field-value pc-stop">${formatPrice(position.stopPrice)}</span>
        </div>
      {/if}
      <div class="pc-field pc-pl">
        <span class="pc-field-label">P/L</span>
        <span
          class="pc-field-value"
          class:positive={position.unrealizedPL > 0}
          class:negative={position.unrealizedPL < 0}
        >
          {formatPL(position.unrealizedPL)}
        </span>
      </div>
    </div>
  {:else}
    <div class="pc-empty">No open position</div>
  {/if}

  <!-- Trades History -->
  {#if completedTrades.length > 0}
    <div class="pc-trades-header">Trades</div>
    <div class="pc-trades-list">
      {#each completedTrades as trade (trade.id)}
        <div class="pc-trade-row">
          <span class="pc-trade-dir" class:long={trade.direction === 'long'} class:short={trade.direction === 'short'}>
            {trade.direction === 'long' ? 'L' : 'S'}
          </span>
          <span class="pc-trade-entry">${formatPrice(trade.entryPrice)}</span>
          <span class="pc-trade-arrow">&rarr;</span>
          <span class="pc-trade-exit">${formatPrice(trade.exitPrice)}</span>
          <span
            class="pc-trade-gain"
            class:positive={trade.gainDollar > 0}
            class:negative={trade.gainDollar < 0}
          >
            {formatPL(trade.gainDollar)}
          </span>
          <span
            class="pc-trade-pct"
            class:positive={trade.gainPercent > 0}
            class:negative={trade.gainPercent < 0}
          >
            ({trade.gainPercent > 0 ? '+' : ''}{trade.gainPercent.toFixed(2)}%)
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .position-card {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1_5, 6px);
  }

  .pc-header,
  .pc-trades-header {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pc-trades-header {
    margin-top: var(--sc-sp-2, 8px);
    padding-top: var(--sc-sp-2, 8px);
    border-top: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
  }

  .pc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sc-sp-1, 4px) var(--sc-sp-3, 12px);
  }

  .pc-field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--sc-sp-1, 4px) var(--sc-sp-1_5, 6px);
    background: var(--sc-surface, #0f1828);
    border-radius: var(--sc-radius-sm, 4px);
  }

  .pc-field-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-2xs, 9px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
  }

  .pc-field-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    color: var(--sc-text-0, #f7f2ea);
    font-weight: 600;
  }

  .pc-field-value.long { color: var(--sc-good, #adca7c); }
  .pc-field-value.short { color: var(--sc-bad, #cf7f8f); }
  .pc-field-value.positive { color: var(--sc-good, #adca7c); }
  .pc-field-value.negative { color: var(--sc-bad, #cf7f8f); }
  .pc-stop { color: var(--sc-warn, #f2d193); }

  .pc-pl {
    grid-column: 1 / -1;
  }

  .pc-empty {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-3, rgba(247,242,234,0.52));
    text-align: center;
    padding: var(--sc-sp-3, 12px);
  }

  .pc-trades-list {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
    max-height: 140px;
    overflow-y: auto;
  }

  .pc-trade-row {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-1, 4px);
    padding: var(--sc-sp-1, 4px) var(--sc-sp-1_5, 6px);
    background: var(--sc-surface, #0f1828);
    border-radius: var(--sc-radius-sm, 4px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-2xs, 9px);
  }

  .pc-trade-dir {
    font-weight: 700;
    min-width: 14px;
  }

  .pc-trade-dir.long { color: var(--sc-good, #adca7c); }
  .pc-trade-dir.short { color: var(--sc-bad, #cf7f8f); }

  .pc-trade-entry,
  .pc-trade-exit {
    color: var(--sc-text-1, rgba(247,242,234,0.84));
  }

  .pc-trade-arrow {
    color: var(--sc-text-3, rgba(247,242,234,0.52));
  }

  .pc-trade-gain {
    font-weight: 600;
    margin-left: auto;
  }

  .pc-trade-gain.positive { color: var(--sc-good, #adca7c); }
  .pc-trade-gain.negative { color: var(--sc-bad, #cf7f8f); }

  .pc-trade-pct {
    font-size: var(--sc-fs-2xs, 9px);
  }

  .pc-trade-pct.positive { color: var(--sc-good, #adca7c); }
  .pc-trade-pct.negative { color: var(--sc-bad, #cf7f8f); }
</style>
