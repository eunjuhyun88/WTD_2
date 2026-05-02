<script lang="ts">
  import { shellStore, activeTabState, activeMode } from './shell.store';
  import { priceStore } from '$lib/stores/priceStore';
  import { getBaseSymbolFromPair } from '$lib/utils/price';

  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;
  const MODES = [
    { id: 'trade',    label: 'TRADE' },
    { id: 'train',    label: 'TRAIN' },
    { id: 'flywheel', label: 'FLY'  },
  ] as const;

  interface Props {
    onSymbolTap?: () => void;
    onIndicators?: () => void;
  }
  let { onSymbolTap, onIndicators }: Props = $props();

  const symbol   = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const tf       = $derived($activeTabState.timeframe ?? '4h');

  const baseSym  = $derived(getBaseSymbolFromPair(symbol));
  const dispSym  = $derived(baseSym ? `${baseSym}/USDT` : symbol);

  const priceEntry  = $derived($priceStore[baseSym]);
  const liveP       = $derived(priceEntry?.price ?? 0);
  const change24h   = $derived(priceEntry?.change24h ?? 0);
  const high24h     = $derived(priceEntry?.high24h ?? 0);
  const low24h      = $derived(priceEntry?.low24h ?? 0);
  const vol24h      = $derived(priceEntry?.volume24h ?? 0);

  const priceClass = $derived(change24h > 0 ? 'pos' : change24h < 0 ? 'neg' : 'flat');

  function fmtPrice(p: number): string {
    if (p <= 0) return '—';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function fmtChange(c: number): string {
    if (c === 0) return '—';
    return `${c > 0 ? '+' : ''}${c.toFixed(2)}%`;
  }

  function fmtVol(v: number): string {
    if (v <= 0) return '—';
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${(v / 1e3).toFixed(0)}K`;
  }
</script>

<header class="top-bar">
  <!-- Symbol -->
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

  <div class="vdivider"></div>

  <!-- Price + 24h stats -->
  <div class="price-block {priceClass}">
    <span class="price-val">{fmtPrice(liveP)}</span>
    <span class="price-chg">{fmtChange(change24h)}</span>
  </div>

  <!-- H/L/Vol — hidden at ≤1024px -->
  <div class="ohlc-strip">
    <span class="ohlc-item"><span class="ohlc-lbl">H</span>{fmtPrice(high24h)}</span>
    <span class="ohlc-item"><span class="ohlc-lbl">L</span>{fmtPrice(low24h)}</span>
    <span class="ohlc-item ohlc-vol"><span class="ohlc-lbl">Vol</span>{fmtVol(vol24h)}</span>
  </div>

  <!-- Spacer -->
  <div class="flex-gap"></div>

  <!-- Mode segmented control -->
  <div class="mode-strip">
    {#each MODES as m}
      <button
        class="mode-btn"
        class:active={$activeMode === m.id}
        onclick={() => shellStore.switchMode(m.id)}
      >{m.label}</button>
    {/each}
  </div>

  <div class="vdivider"></div>

  <!-- Controls -->
  <button class="ctrl-btn" onclick={onIndicators} title="Indicators">IND</button>
  <button class="ctrl-btn" onclick={() => {}} title="Settings">⚙</button>
</header>

<style>
.top-bar {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 8px;
  background: var(--g1);
  border-bottom: 1px solid var(--g3);
  flex-shrink: 0;
  overflow: hidden;
}

/* ── Symbol ── */
.sym-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  height: 22px;
  background: var(--g2);
  border: 1px solid var(--g4);
  border-radius: var(--r-2, 2px);
  cursor: pointer;
  transition: border-color 0.08s;
  flex-shrink: 0;
}
.sym-btn:hover { border-color: var(--g5); }
.sym-text {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--g9);
}
.sym-arrow {
  font-size: var(--ui-text-xs);
  color: var(--g6);
  margin-top: 1px;
}

/* ── Divider ── */
.vdivider {
  width: 1px;
  height: 14px;
  background: var(--g3);
  margin: 0 6px;
  flex-shrink: 0;
}

/* ── Timeframes ── */
.tf-strip {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.tf-btn {
  padding: 0 5px;
  height: 32px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: var(--font-mono, monospace);
  font-size: var(--ui-text-xs);
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
  font-weight: 700;
}

/* ── Price ── */
.price-block {
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-shrink: 0;
}
.price-val {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
}
.price-chg {
  font-family: var(--font-mono, monospace);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.price-block.pos .price-val,
.price-block.pos .price-chg { color: var(--pos); }
.price-block.neg .price-val,
.price-block.neg .price-chg { color: var(--neg); }
.price-block.flat .price-val { color: var(--g8); }
.price-block.flat .price-chg { color: var(--g6); }

/* ── OHLC strip ── */
.ohlc-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 10px;
  flex-shrink: 0;
}
.ohlc-item {
  font-family: var(--font-mono, monospace);
  font-size: var(--ui-text-xs);
  font-weight: 500;
  color: var(--g7);
  white-space: nowrap;
}
.ohlc-lbl {
  color: var(--g5);
  margin-right: 2px;
}
/* hide Vol at ≤1280px, hide all OHLC at ≤1024px */
@media (max-width: 1280px) { .ohlc-vol { display: none; } }
@media (max-width: 1024px) { .ohlc-strip { display: none; } }

/* ── Spacer ── */
.flex-gap { flex: 1; min-width: 0; }

/* ── Mode segmented control ── */
.mode-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.mode-btn {
  padding: 0 7px;
  height: 22px;
  background: var(--g2);
  border: 1px solid var(--g3);
  border-radius: var(--r-2, 2px);
  font-family: var(--font-mono, monospace);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--g6);
  cursor: pointer;
  transition: color 0.08s, background 0.08s, border-color 0.08s;
}
.mode-btn:hover { color: var(--g8); border-color: var(--g5); }
.mode-btn.active {
  background: var(--g3);
  border-color: var(--amb);
  color: var(--amb);
}

/* ── Controls ── */
.ctrl-btn {
  padding: 0 6px;
  height: 32px;
  background: transparent;
  border: none;
  font-family: var(--font-mono, monospace);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--g6);
  cursor: pointer;
  transition: color 0.08s;
  flex-shrink: 0;
}
.ctrl-btn:hover { color: var(--g8); }
</style>
