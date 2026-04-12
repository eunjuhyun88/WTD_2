<script lang="ts">
  import type { TradeOrder, Position, OrderType, OrderAction } from '$lib/stores/battleStore';
  import { DEFAULT_SHARES } from '$lib/stores/battleStore';

  let {
    currentPrice = 0,
    position = { type: null, shares: 0, costBasis: 0, stopPrice: null, unrealizedPL: 0 } as Position,
    pendingOrders = [] as TradeOrder[],
    onPlaceOrder,
    onCancel,
  }: {
    currentPrice: number;
    position: Position;
    pendingOrders: TradeOrder[];
    onPlaceOrder: (order: { type: OrderType; action: OrderAction; price: number; shares: number; total: number; createdAt: number }) => void;
    onCancel: (orderId: string) => void;
  } = $props();

  let orderType: OrderType = $state('market');
  let orderAction: OrderAction = $state('buy');
  let orderPrice = $state(0);
  let orderShares = $state(DEFAULT_SHARES);

  const orderTotal = $derived(
    orderType === 'market'
      ? Math.round(currentPrice * orderShares * 100) / 100
      : Math.round(orderPrice * orderShares * 100) / 100
  );

  // Sync price when currentPrice changes (for limit/stop orders)
  $effect(() => {
    if (orderType !== 'market' && orderPrice === 0) {
      orderPrice = Math.round(currentPrice * 100) / 100;
    }
  });

  function handlePlaceOrder(): void {
    const price = orderType === 'market' ? currentPrice : orderPrice;
    if (price <= 0 || orderShares <= 0) return;

    onPlaceOrder({
      type: orderType,
      action: orderAction,
      price,
      shares: orderShares,
      total: Math.round(price * orderShares * 100) / 100,
      createdAt: 0,
    });
  }

  function formatPrice(p: number): string {
    return p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : p.toFixed(2);
  }
</script>

<div class="order-panel">
  <!-- Order Type -->
  <div class="op-section">
    <div class="op-label">Order Type</div>
    <div class="op-radio-group">
      <button
        class="op-radio"
        class:active={orderType === 'market'}
        onclick={() => orderType = 'market'}
      >Market</button>
      <button
        class="op-radio"
        class:active={orderType === 'limit'}
        onclick={() => { orderType = 'limit'; orderPrice = Math.round(currentPrice * 100) / 100; }}
      >Limit</button>
      <button
        class="op-radio"
        class:active={orderType === 'stop'}
        onclick={() => { orderType = 'stop'; orderPrice = Math.round(currentPrice * 100) / 100; }}
      >Stop</button>
    </div>
  </div>

  <!-- Buy / Sell -->
  <div class="op-section">
    <div class="op-label">Action</div>
    <div class="op-radio-group op-action-group">
      <button
        class="op-radio op-buy"
        class:active={orderAction === 'buy'}
        onclick={() => orderAction = 'buy'}
      >Buy</button>
      <button
        class="op-radio op-sell"
        class:active={orderAction === 'sell'}
        onclick={() => orderAction = 'sell'}
      >Sell</button>
    </div>
  </div>

  <!-- Price -->
  {#if orderType !== 'market'}
    <div class="op-section">
      <div class="op-label">Price</div>
      <input
        class="op-input"
        type="number"
        step="0.01"
        bind:value={orderPrice}
      />
    </div>
  {:else}
    <div class="op-section">
      <div class="op-label">Price</div>
      <div class="op-market-price">${formatPrice(currentPrice)}</div>
    </div>
  {/if}

  <!-- Shares -->
  <div class="op-section">
    <div class="op-label">Shares</div>
    <input
      class="op-input"
      type="number"
      step="1"
      min="1"
      bind:value={orderShares}
    />
  </div>

  <!-- Total -->
  <div class="op-section">
    <div class="op-label">Total</div>
    <div class="op-total">${formatPrice(orderTotal)}</div>
  </div>

  <!-- Place Order Button -->
  <button
    class="op-place-btn"
    class:buy={orderAction === 'buy'}
    class:sell={orderAction === 'sell'}
    onclick={handlePlaceOrder}
  >
    Place {orderAction === 'buy' ? 'Buy' : 'Sell'} Order
  </button>

  <!-- Pending Orders List -->
  {#if pendingOrders.length > 0}
    <div class="op-orders-section">
      <div class="op-label">Pending Orders</div>
      <div class="op-orders-list">
        {#each pendingOrders as order (order.id)}
          <div class="op-order-row">
            <span class="op-order-type">{order.type.toUpperCase()}</span>
            <span class="op-order-action" class:buy={order.action === 'buy'} class:sell={order.action === 'sell'}>
              {order.action.toUpperCase()}
            </span>
            <span class="op-order-price">${formatPrice(order.price)}</span>
            <span class="op-order-shares">x{order.shares}</span>
            <button class="op-cancel-btn" onclick={() => onCancel(order.id)}>X</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .order-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-2, 8px);
  }

  .op-section {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
  }

  .op-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .op-radio-group {
    display: flex;
    gap: var(--sc-sp-1, 4px);
  }

  .op-radio {
    flex: 1;
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-2, 8px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .op-radio:hover {
    border-color: var(--sc-accent, #db9a9f);
    color: var(--sc-text-0, #f7f2ea);
  }

  .op-radio.active {
    background: rgba(219, 154, 159, 0.15);
    border-color: var(--sc-accent, #db9a9f);
    color: var(--sc-accent, #db9a9f);
  }

  .op-action-group .op-buy.active {
    background: rgba(173, 202, 124, 0.15);
    border-color: var(--sc-good, #adca7c);
    color: var(--sc-good, #adca7c);
  }

  .op-action-group .op-sell.active {
    background: rgba(207, 127, 143, 0.15);
    border-color: var(--sc-bad, #cf7f8f);
    color: var(--sc-bad, #cf7f8f);
  }

  .op-input {
    width: 100%;
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-2, 8px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-text-0, #f7f2ea);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    outline: none;
    box-sizing: border-box;
  }

  .op-input:focus {
    border-color: var(--sc-accent, #db9a9f);
  }

  .op-market-price {
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-2, 8px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-text-0, #f7f2ea);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
  }

  .op-total {
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-2, 8px);
    background: var(--sc-bg-2, #111b2c);
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-accent-3, #f2d193);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-base, 12px);
    font-weight: 600;
  }

  .op-place-btn {
    width: 100%;
    padding: var(--sc-sp-2, 8px) var(--sc-sp-4, 16px);
    border: none;
    border-radius: var(--sc-radius-md, 6px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .op-place-btn.buy {
    background: var(--sc-good, #adca7c);
    color: #0b1220;
  }

  .op-place-btn.sell {
    background: var(--sc-bad, #cf7f8f);
    color: #0b1220;
  }

  .op-place-btn:hover {
    opacity: 0.85;
    transform: translateY(-1px);
  }

  .op-orders-section {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
    margin-top: var(--sc-sp-2, 8px);
    padding-top: var(--sc-sp-2, 8px);
    border-top: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
  }

  .op-orders-list {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
  }

  .op-order-row {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-1, 4px);
    padding: var(--sc-sp-1, 4px) var(--sc-sp-1_5, 6px);
    background: var(--sc-surface, #0f1828);
    border-radius: var(--sc-radius-sm, 4px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-2xs, 9px);
  }

  .op-order-type {
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    min-width: 40px;
  }

  .op-order-action {
    font-weight: 700;
    min-width: 28px;
  }

  .op-order-action.buy { color: var(--sc-good, #adca7c); }
  .op-order-action.sell { color: var(--sc-bad, #cf7f8f); }

  .op-order-price {
    color: var(--sc-text-0, #f7f2ea);
    flex: 1;
  }

  .op-order-shares {
    color: var(--sc-text-2, rgba(247,242,234,0.68));
  }

  .op-cancel-btn {
    background: none;
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-bad, #cf7f8f);
    font-size: var(--sc-fs-2xs, 9px);
    cursor: pointer;
    padding: 2px 5px;
    line-height: 1;
  }

  .op-cancel-btn:hover {
    background: rgba(207, 127, 143, 0.15);
  }
</style>
