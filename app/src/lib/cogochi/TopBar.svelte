<script lang="ts">
  import { shellStore, activeTabState } from './shell.store';
  import { priceStore } from '$lib/stores/priceStore';
  import { getBaseSymbolFromPair } from '$lib/utils/price';

  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;

  interface Props {
    onSymbolTap?: () => void;
    onIndicators?: () => void;
  }
  let { onSymbolTap, onIndicators }: Props = $props();

  const symbol   = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const tf       = $derived($activeTabState.timeframe ?? '4h');

  // base symbol for priceStore lookup (BTCUSDT → BTC)
  const baseSym  = $derived(getBaseSymbolFromPair(symbol));
  // display label (BTCUSDT → BTC/USDT)
  const dispSym  = $derived(baseSym ? `${baseSym}/USDT` : symbol);

  const priceEntry  = $derived($priceStore[baseSym]);
  const liveP       = $derived(priceEntry?.price ?? 0);
  const change24h   = $derived(priceEntry?.change24h ?? 0);

  function fmtPrice(p: number): string {
    if (p <= 0) return '—';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function fmtChange(c: number): string {
    if (c === 0) return '—';
    const sign = c > 0 ? '+' : '';
    return `${sign}${c.toFixed(2)}%`;
  }

  // pos / neg / neutral for coloring
  const priceClass = $derived(change24h > 0 ? 'pos' : change24h < 0 ? 'neg' : 'flat');
</script>

<header class="top-bar">
  <!-- Symbol button -->
  <button class="sym-btn" onclick={onSymbolTap}>
    <span class="sym-text">{dispSym}</span>
    <span class="sym-arrow">▾</span>
  </button>

  <div class="vdivider"></div>

  <!-- Timeframe strip -->
  <div class="tf-strip">
    {#each TIMEFRAMES as t}
      <button
        class="tf-btn"
        class:active={tf === t}
        onclick={() => shellStore.setTimeframe(t)}
      >{t}</button>
    {/each}
  </div>

  <!-- Live price — pushed right -->
  <div class="price-block {priceClass}">
    <span class="price-val">{fmtPrice(liveP)}</span>
    <span class="price-chg">{fmtChange(change24h)}</span>
  </div>

  <div class="vdivider"></div>

  <!-- Controls -->
  <button class="ctrl-btn" onclick={onIndicators} title="Indicators">IND</button>
  <button class="ctrl-btn" onclick={onIndicators} title="Settings">⚙</button>
</header>

<style>
.top-bar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 8px;
  background: var(--g1);
  border-bottom: 1px solid var(--g3);
  flex-shrink: 0;
  overflow: hidden;
}

/* ── Symbol ───────────────────────────────────── */
.sym-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  height: 22px;
  background: var(--g2);
  border: 1px solid var(--g4);
  border-radius: var(--r-2);
  cursor: pointer;
  transition: border-color 0.08s;
  flex-shrink: 0;
}
.sym-btn:hover { border-color: var(--g5); }
.sym-text {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--g9);
}
.sym-arrow {
  font-size: 7px;
  color: var(--g6);
  margin-top: 1px;
}

/* ── Vertical divider ─────────────────────────── */
.vdivider {
  width: 1px;
  height: 14px;
  background: var(--g3);
  margin: 0 6px;
  flex-shrink: 0;
}

/* ── Timeframes ───────────────────────────────── */
.tf-strip {
  display: flex;
  align-items: center;
}
.tf-btn {
  padding: 0 5px;
  height: 32px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--g6);
  cursor: pointer;
  transition: color 0.08s, border-color 0.08s;
  white-space: nowrap;
}
.tf-btn:hover { color: var(--g8); }
.tf-btn.active {
  color: var(--amb);
  border-bottom-color: var(--amb);
}

/* ── Live price ───────────────────────────────── */
.price-block {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-shrink: 0;
}
.price-val {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
}
.price-chg {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.price-block.pos .price-val,
.price-block.pos .price-chg { color: var(--pos); }
.price-block.neg .price-val,
.price-block.neg .price-chg { color: var(--neg); }
.price-block.flat .price-val { color: var(--g8); }
.price-block.flat .price-chg { color: var(--g6); }

/* ── Controls ─────────────────────────────────── */
.ctrl-btn {
  padding: 0 6px;
  height: 32px;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--g6);
  cursor: pointer;
  transition: color 0.08s;
  flex-shrink: 0;
}
.ctrl-btn:hover { color: var(--g8); }
</style>
