<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface TickerItem {
    symbol: string;
    price: number | null;
    change24h: number | null;
  }

  const SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;
  const BINANCE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;

  let items = $state<TickerItem[]>(
    SYMBOLS.map((s) => ({ symbol: s, price: null, change24h: null }))
  );
  let mounted = $state(false);
  let interval: ReturnType<typeof setInterval> | null = null;

  function fmtPrice(p: number | null): string {
    if (p == null) return '—';
    if (p >= 10_000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 100) return p.toLocaleString('en-US', { maximumFractionDigits: 1 });
    return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function fmtChange(c: number | null): string {
    if (c == null) return '';
    const sign = c >= 0 ? '+' : '';
    return `${sign}${c.toFixed(2)}%`;
  }

  async function fetchPrices() {
    try {
      const [priceRes, tickerRes] = await Promise.all([
        fetch(
          `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify([...BINANCE_SYMBOLS]))}`,
          { signal: AbortSignal.timeout(4000) }
        ),
        fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify([...BINANCE_SYMBOLS]))}&type=MINI`,
          { signal: AbortSignal.timeout(4000) }
        ),
      ]);

      if (!priceRes.ok || !tickerRes.ok) return;

      const prices: { symbol: string; price: string }[] = await priceRes.json();
      const tickers: { symbol: string; priceChangePercent: string }[] = await tickerRes.json();

      const changeMap = new Map<string, number>();
      for (const t of tickers) {
        changeMap.set(t.symbol, parseFloat(t.priceChangePercent));
      }

      items = SYMBOLS.map((sym, i) => ({
        symbol: sym,
        price: parseFloat(prices[i]?.price ?? '0') || null,
        change24h: changeMap.get(BINANCE_SYMBOLS[i]) ?? null,
      }));
    } catch {
      // silently fail — prices are decorative on landing
    }
  }

  onMount(() => {
    mounted = true;
    fetchPrices();
    interval = setInterval(fetchPrices, 30_000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="ticker-strip" aria-label="Live market prices">
  {#each items as item}
    {@const positive = item.change24h != null && item.change24h >= 0}
    {@const negative = item.change24h != null && item.change24h < 0}
    <div class="ticker-item">
      <span class="ticker-symbol">{item.symbol}</span>
      <span class="ticker-price" class:skeleton={!mounted || item.price == null}>
        {#if mounted && item.price != null}
          ${fmtPrice(item.price)}
        {:else}
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        {/if}
      </span>
      {#if mounted && item.change24h != null}
        <span class="ticker-change" class:pos={positive} class:neg={negative}>
          {fmtChange(item.change24h)}
        </span>
      {:else}
        <span class="ticker-change skeleton">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .ticker-strip {
    display: flex;
    gap: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    overflow: hidden;
    height: 36px;
  }

  .ticker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 24px;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    flex: 1;
    justify-content: center;
    min-width: 0;
  }

  .ticker-item:last-child {
    border-right: none;
  }

  .ticker-symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 0.75rem);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .ticker-price {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-sm, 0.8rem);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: -0.01em;
    min-width: 70px;
    text-align: right;
  }

  .ticker-change {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 0.75rem);
    min-width: 52px;
    text-align: right;
  }

  .ticker-change.pos { color: #4ade80; }
  .ticker-change.neg { color: #f87171; }

  .skeleton {
    color: transparent;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  @media (max-width: 480px) {
    .ticker-item {
      padding: 0 12px;
      gap: 6px;
    }
    .ticker-price { min-width: 56px; }
    .ticker-change { min-width: 44px; }
  }
</style>
