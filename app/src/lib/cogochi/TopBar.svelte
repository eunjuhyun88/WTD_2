<script lang="ts">
  import { shellStore, activeTabState } from './shell.store';
  import type { ShellWorkMode } from './shell.store';
  import { priceStore } from '$lib/stores/priceStore';
  import { getBaseSymbolFromPair } from '$lib/utils/price';

  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;

  const WORK_MODES: Array<{ id: ShellWorkMode; label: string }> = [
    { id: 'observe',  label: 'OBSERVE'  },
    { id: 'analyze',  label: 'ANALYZE'  },
    { id: 'execute',  label: 'EXECUTE'  },
    { id: 'decide',   label: 'DECIDE'   },
  ];

  interface Props {
    onSymbolTap?: () => void;
    onIndicators?: () => void;
    onSettings?: () => void;
  }
  let { onSymbolTap, onIndicators, onSettings }: Props = $props();

  const symbol    = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const tf        = $derived($activeTabState.timeframe ?? '4h');
  const workMode  = $derived($shellStore.workMode ?? 'observe');

  const baseSym   = $derived(getBaseSymbolFromPair(symbol));
  const dispSym   = $derived(baseSym ? `${baseSym}/USDT` : symbol);

  const priceEntry  = $derived($priceStore[baseSym]);
  const liveP       = $derived(priceEntry?.price ?? 0);
  const change24h   = $derived(priceEntry?.change24h ?? 0);
  const high24h     = $derived(priceEntry?.high24h ?? 0);
  const low24h      = $derived(priceEntry?.low24h ?? 0);
  const volume24h   = $derived(priceEntry?.volume24h ?? 0);

  const priceClass = $derived(change24h > 0 ? 'pos' : change24h < 0 ? 'neg' : 'flat');

  function fmtPrice(p: number): string {
    if (p <= 0) return '—';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function fmtChange(c: number): string {
    if (c === 0) return '—';
    return (c > 0 ? '+' : '') + c.toFixed(2) + '%';
  }

  function fmtVol(v: number): string {
    if (v <= 0) return '—';
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B';
    if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M';
    return (v / 1_000).toFixed(0) + 'K';
  }
</script>

<header class="top-bar">
  <!-- Row 1: symbol | TF | price -->
  <div class="top-row">
    <!-- Symbol -->
    <button class="sym-btn" onclick={onSymbolTap}>
      <span class="sym-text">{dispSym}</span>
      <span class="sym-arrow">▾</span>
    </button>

    <span class="vdivider"></span>

    <!-- Timeframe strip -->
    <div class="tf-strip">
      {#each TIMEFRAMES as t}
        <button
          class="tf-btn"
          class:active={tf === t || tf.toLowerCase() === t.toLowerCase()}
          onclick={() => shellStore.setTimeframe(t)}
        >{t}</button>
      {/each}
    </div>

    <span class="vdivider"></span>

    <!-- Live price (L1) -->
    <div class="price-block {priceClass}">
      <span class="price-val">{fmtPrice(liveP)}</span>
      <span class="price-chg">{fmtChange(change24h)}</span>
    </div>

    <!-- Work mode segmented (L1 control) -->
    <div class="mode-seg">
      {#each WORK_MODES as wm}
        <button
          class="mode-btn"
          class:active={workMode === wm.id}
          onclick={() => shellStore.setWorkMode(wm.id)}
          title={wm.label}
        >{wm.label}</button>
      {/each}
    </div>

    <!-- Controls -->
    <button class="ctrl-btn" onclick={onIndicators} title="Indicators">Indicators</button>
    <button class="ctrl-btn" onclick={onSettings} title="Settings">⚙</button>
  </div>

  <!-- Row 2: L2 24h stats -->
  {#if high24h > 0 || low24h > 0 || volume24h > 0}
    <div class="l2-row">
      {#if high24h > 0}<span class="l2-item">H: <span class="l2-val">{fmtPrice(high24h)}</span></span>{/if}
      {#if low24h > 0}<span class="l2-item">L: <span class="l2-val">{fmtPrice(low24h)}</span></span>{/if}
      {#if volume24h > 0}<span class="l2-item">Vol: <span class="l2-val">{fmtVol(volume24h)}</span></span>{/if}
    </div>
  {/if}
</header>

<style>
.top-bar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--g1);
  border-bottom: 1px solid var(--g3);
  overflow: hidden;
}

/* ── Row 1 ───────────────────────────────────────── */
.top-row {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 8px;
}

/* ── Symbol ─────────────────────────────────────── */
.sym-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 8px;
  height: 26px;
  background: var(--g2);
  border: 1px solid var(--g4);
  border-radius: 3px;
  cursor: pointer;
  transition: border-color 0.08s;
  flex-shrink: 0;
}
.sym-btn:hover { border-color: var(--g5); }
.sym-text {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--g9);
  font-variant-numeric: tabular-nums;
}
.sym-arrow {
  font-size: var(--ui-text-xs);
  color: var(--g6);
}

/* ── Divider ────────────────────────────────────── */
.vdivider {
  width: 1px;
  height: 14px;
  background: var(--g3);
  margin: 0 6px;
  flex-shrink: 0;
}

/* ── Timeframes ─────────────────────────────────── */
.tf-strip {
  display: flex;
  align-items: center;
}
.tf-btn {
  padding: 0 6px;
  height: 32px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--g6);
  cursor: pointer;
  transition: color 0.08s, border-color 0.08s;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.tf-btn:hover { color: var(--g8); }
.tf-btn.active {
  color: var(--amb);
  border-bottom-color: var(--amb);
}

/* ── Price block (L1) ───────────────────────────── */
.price-block {
  margin-left: 8px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
}
.price-val {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.price-chg {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.price-block.pos .price-val,
.price-block.pos .price-chg { color: var(--pos); }
.price-block.neg .price-val,
.price-block.neg .price-chg { color: var(--neg); }
.price-block.flat .price-val { color: var(--g8); }
.price-block.flat .price-chg { color: var(--g6); }

/* ── Work mode segmented ────────────────────────── */
.mode-seg {
  margin-left: auto;
  display: flex;
  gap: 1px;
  background: var(--g2);
  border: 1px solid var(--g3);
  border-radius: 3px;
  padding: 2px;
  flex-shrink: 0;
}
.mode-btn {
  padding: 2px 8px;
  height: 22px;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  background: transparent;
  border: none;
  color: var(--g6);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.mode-btn:hover { color: var(--g8); background: var(--g3); }
.mode-btn.active {
  background: var(--g0);
  color: var(--brand);
  font-weight: 700;
}

/* ── Controls ───────────────────────────────────── */
.ctrl-btn {
  margin-left: 6px;
  padding: 0 8px;
  height: 24px;
  background: transparent;
  border: 0.5px solid var(--g3);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--g7);
  cursor: pointer;
  transition: color 0.08s, border-color 0.08s;
  flex-shrink: 0;
}
.ctrl-btn:hover {
  color: var(--g9);
  border-color: var(--g5);
}

/* ── Row 2: L2 stats ────────────────────────────── */
.l2-row {
  height: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  background: var(--g0);
  border-top: 1px solid var(--g2);
}
.l2-item {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--g5);
  font-variant-numeric: tabular-nums;
}
.l2-val {
  color: var(--g7);
  font-weight: 600;
}

/* Mobile: hide mode labels, keep segmented dots */
@media (max-width: 900px) {
  .mode-seg { display: none; }
  .ctrl-btn { font-size: 11px; padding: 0 6px; }
}
@media (max-width: 700px) {
  .tf-btn { font-size: 11px; padding: 0 4px; }
}
</style>
