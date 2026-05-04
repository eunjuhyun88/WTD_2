<script lang="ts">
  import { shellStore, activeTabState, activeMode } from './shell.store';
  import type { ChartType } from './shell.store';
  import { priceStore } from '$lib/stores/priceStore';
  import { getBaseSymbolFromPair } from '$lib/utils/price';
  import NavInboxBadge from '$lib/components/header/NavInboxBadge.svelte';
  import TopBarTFPopover from './TopBarTFPopover.svelte';
  import TopBarTypePopover from './TopBarTypePopover.svelte';

  // Available timeframes (used by TF popover and test assertions)
  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;

  // Mode segmented control
  const MODES = [
    { id: 'trade',    label: 'TRADE' },
    { id: 'train',    label: 'TRAIN' },
    { id: 'flywheel', label: 'FLY'  },
  ] as const;

  // Chart type display labels
  const TYPE_LABEL: Record<ChartType, string> = {
    candle: 'Candle',
    heikin: 'HA',
    bar:    'Bar',
    line:   'Line',
    area:   'Area',
  };

  interface Props {
    onSymbolTap?: () => void;
    onIndicators?: () => void;
  }
  let { onSymbolTap, onIndicators }: Props = $props();

  const symbol    = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const tf        = $derived($activeTabState.timeframe ?? '4h');
  const chartType = $derived(($activeTabState.chartType ?? 'candle') as ChartType);

  const baseSym  = $derived(getBaseSymbolFromPair(symbol));
  const dispSym  = $derived(baseSym ? `${baseSym}/USDT` : symbol);

  const priceEntry  = $derived($priceStore[baseSym]);
  const liveP       = $derived(priceEntry?.price ?? 0);
  const change24h   = $derived(priceEntry?.change24h ?? 0);
  const high24h     = $derived(priceEntry?.high24h ?? 0);
  const low24h      = $derived(priceEntry?.low24h ?? 0);
  const vol24h      = $derived(priceEntry?.volume24h ?? 0);

  const priceClass = $derived(change24h > 0 ? 'pos' : change24h < 0 ? 'neg' : 'flat');

  // ── Popover state (local) ───────────────────────────────────────
  let tfPopoverOpen   = $state(false);
  let typePopoverOpen = $state(false);

  // Anchor refs for positioning
  let tfBtnEl   = $state<HTMLButtonElement | null>(null);
  let typeBtnEl = $state<HTMLButtonElement | null>(null);

  function toggleTFPopover(e: MouseEvent) {
    e.stopPropagation();
    typePopoverOpen = false;
    tfPopoverOpen = !tfPopoverOpen;
  }

  function toggleTypePopover(e: MouseEvent) {
    e.stopPropagation();
    tfPopoverOpen = false;
    typePopoverOpen = !typePopoverOpen;
  }

  function closePopovers() {
    tfPopoverOpen   = false;
    typePopoverOpen = false;
  }

  // ── L2 Quant data ───────────────────────────────────────────────
  let oiVal       = $state<number | null>(null);   // USD
  let oiDeltaPct  = $state<number | null>(null);   // % vs 30m ago
  let frVal       = $state<number | null>(null);   // raw rate, e.g. 0.00012
  let kimchiPct   = $state<number | null>(null);   // %

  const frClass     = $derived(frVal === null ? '' : frVal > 0 ? 'fr-long' : frVal < 0 ? 'fr-short' : '');
  const oiClass     = $derived(oiDeltaPct === null ? '' : oiDeltaPct > 0 ? 'oi-up' : 'oi-down');
  const kimchiClass = $derived(kimchiPct === null ? '' : kimchiPct > 1.5 ? 'kim-hot' : kimchiPct < -0.5 ? 'kim-cold' : '');
  const showKimchi  = $derived(baseSym === 'BTC');

  const hasL2 = $derived(oiVal !== null || frVal !== null || (showKimchi && kimchiPct !== null));

  function fmtOI(usd: number): string {
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
    return `$${(usd / 1e3).toFixed(0)}K`;
  }

  function fmtFR(rate: number): string {
    const pct = (rate * 100).toFixed(3);
    return rate > 0 ? `+${pct}%` : `${pct}%`;
  }

  async function fetchQuantData(sym: string, price: number) {
    const ticker = sym.toUpperCase() + 'USDT';
    try {
      const [oiRes, frRes] = await Promise.allSettled([
        fetch(`/api/market/oi?symbol=${ticker}&period=30m&limit=4`),
        fetch(`/api/market/funding?symbol=${ticker}&limit=3`),
      ]);
      if (oiRes.status === 'fulfilled' && oiRes.value.ok) {
        const d = await oiRes.value.json() as { bars: { c: number }[] };
        const bars = d.bars ?? [];
        if (bars.length >= 2) {
          const cur  = bars[bars.length - 1].c;
          const prev = bars[bars.length - 2].c;
          oiVal      = price > 0 ? cur * price : null;
          oiDeltaPct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
        }
      }
      if (frRes.status === 'fulfilled' && frRes.value.ok) {
        const d = await frRes.value.json() as { bars: { delta: number }[] };
        const bars = d.bars ?? [];
        if (bars.length > 0) frVal = bars[bars.length - 1].delta;
      }
    } catch { /* silent — L2 is best-effort */ }
  }

  async function fetchKimchi() {
    try {
      const res = await fetch('/api/market/kimchi-premium');
      if (!res.ok) return;
      const d = await res.json() as { ok: boolean; data: { premium_pct: number } };
      if (d.ok) kimchiPct = d.data.premium_pct;
    } catch { /* silent */ }
  }

  $effect(() => {
    const sym   = baseSym;
    const price = liveP;
    if (!sym) return;

    fetchQuantData(sym, price);
    fetchKimchi();

    const oiTimer  = setInterval(() => fetchQuantData(sym, liveP), 60_000);
    const kimTimer = setInterval(fetchKimchi, 30_000);
    return () => { clearInterval(oiTimer); clearInterval(kimTimer); };
  });

  // ── Price formatters ────────────────────────────────────────────
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

<!-- Click-outside to close popovers -->
<svelte:window onclick={closePopovers} />

<header class="top-bar">
  <!-- L1 row: 6 logical slots -->
  <div class="l1-row">

    <!-- Slot 1: Symbol -->
    <button class="sym-btn" onclick={onSymbolTap}>
      <span class="sym-text">{dispSym}</span>
      <span class="sym-arrow">▾</span>
    </button>

    <div class="vdivider"></div>

    <!-- Slot 2: TF chip + popover -->
    <div class="chip-wrap">
      <button
        bind:this={tfBtnEl}
        class="chip-btn"
        class:active={tfPopoverOpen}
        onclick={toggleTFPopover}
        aria-haspopup="true"
        aria-expanded={tfPopoverOpen}
      >
        <span class="chip-label">{tf}</span>
        <span class="chip-arrow">▾</span>
      </button>
      {#if tfPopoverOpen}
        <div class="popover-anchor" role="none" onclick={(e) => e.stopPropagation()}>
          <TopBarTFPopover currentTF={tf} onClose={closePopovers} />
        </div>
      {/if}
    </div>

    <div class="vdivider"></div>

    <!-- Slot 3: Chart Type chip + popover -->
    <div class="chip-wrap">
      <button
        bind:this={typeBtnEl}
        class="chip-btn"
        class:active={typePopoverOpen}
        onclick={toggleTypePopover}
        aria-haspopup="true"
        aria-expanded={typePopoverOpen}
      >
        <span class="chip-label">{TYPE_LABEL[chartType]}</span>
        <span class="chip-arrow">▾</span>
      </button>
      {#if typePopoverOpen}
        <div class="popover-anchor" role="none" onclick={(e) => e.stopPropagation()}>
          <TopBarTypePopover currentType={chartType} onClose={closePopovers} />
        </div>
      {/if}
    </div>

    <div class="vdivider"></div>

    <!-- Slot 4: Price block — price + OHLC + L2 quant (single visual unit) -->
    <div class="price-unit">
      <!-- Price + change -->
      <div class="price-block {priceClass}">
        <span class="price-val">{fmtPrice(liveP)}</span>
        <span class="price-chg">{fmtChange(change24h)}</span>
      </div>

      <!-- OHLC — hidden ≤1024px -->
      <div class="ohlc-strip">
        <span class="ohlc-item"><span class="ohlc-lbl">H</span>{fmtPrice(high24h)}</span>
        <span class="ohlc-item"><span class="ohlc-lbl">L</span>{fmtPrice(low24h)}</span>
        <span class="ohlc-item ohlc-vol"><span class="ohlc-lbl">Vol</span>{fmtVol(vol24h)}</span>
      </div>

      <!-- L2 quant inline — hidden ≤1024px -->
      {#if hasL2}
        <div class="l2-inline">
          {#if oiVal !== null}
            <span class="q-item">
              <span class="q-lbl">OI</span>
              <span class="q-val {oiClass}">{fmtOI(oiVal)}</span>
              {#if oiDeltaPct !== null}
                <span class="q-arrow {oiClass}">{oiDeltaPct > 0 ? '↑' : '↓'}{Math.abs(oiDeltaPct).toFixed(1)}%</span>
              {/if}
            </span>
            {#if frVal !== null || (showKimchi && kimchiPct !== null)}
              <span class="q-sep">│</span>
            {/if}
          {/if}

          {#if frVal !== null}
            <span class="q-item">
              <span class="q-lbl">FR</span>
              <span class="q-val {frClass}">{fmtFR(frVal)}</span>
              {#if Math.abs(frVal) >= 0.005}
                <span class="q-hint {frClass}">{frVal > 0 ? '롱쏠림' : '숏쏠림'}</span>
              {/if}
            </span>
            {#if showKimchi && kimchiPct !== null}
              <span class="q-sep">│</span>
            {/if}
          {/if}

          {#if showKimchi && kimchiPct !== null}
            <span class="q-item kim-item">
              <span class="q-lbl">Kim</span>
              <span class="q-val {kimchiClass}">{kimchiPct > 0 ? '+' : ''}{kimchiPct.toFixed(2)}%</span>
            </span>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Spacer -->
    <div class="flex-gap"></div>

    <!-- Slot 5: Mode segmented control -->
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

    <!-- Slot 6: Inbox dot (NavInboxBadge) -->
    <NavInboxBadge />

    <!-- Slot 6: Settings -->
    <button class="ctrl-btn" onclick={onIndicators} title="Settings">⚙</button>

  </div>
</header>

<style>
.top-bar {
  display: flex;
  flex-direction: column;
  background: var(--g1);
  border-bottom: 1px solid var(--g3);
  flex-shrink: 0;
  overflow: visible; /* allow popovers to overflow */
}

/* ── L1 row ── */
.l1-row {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 8px;
  overflow: visible;
  position: relative;
}

/* ── Divider ── */
.vdivider {
  width: 1px;
  height: 14px;
  background: var(--g3);
  margin: 0 6px;
  flex-shrink: 0;
}

/* ── Symbol (Slot 1) ── */
.sym-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  height: 32px;
  min-height: 44px; /* logical touch target */
  background: var(--g2);
  border: 1px solid var(--g4);
  border-radius: var(--r-2, 2px);
  cursor: pointer;
  transition: border-color 0.08s;
  flex-shrink: 0;
  position: relative;
}
/* Extend hit area to 44px logical */
.sym-btn::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.sym-btn:hover { border-color: var(--g5); }
.sym-text {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary, var(--g9));
}
.sym-arrow {
  font-size: var(--type-xs, 10px);
  color: var(--g6);
  margin-top: 1px;
}

/* ── TF/Type chip (Slots 2 & 3) ── */
.chip-wrap {
  position: relative;
  flex-shrink: 0;
}

.chip-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 var(--sp-3, 8px);
  height: 32px;
  min-height: 44px; /* logical touch target */
  background: var(--surface-2, var(--g2));
  border: 1px solid var(--g3);
  border-radius: var(--r-2, 3px);
  cursor: pointer;
  transition: border-color 0.08s, color 0.08s, background 0.08s;
  flex-shrink: 0;
  position: relative;
}
.chip-btn::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.chip-btn:hover {
  border-color: var(--g5);
  background: var(--surface-2, rgba(255,255,255,0.06));
}
.chip-btn.active {
  border-color: var(--accent-amb, var(--amb, #d6a347));
  color: var(--accent-amb, var(--amb, #d6a347));
}
.chip-label {
  font-family: var(--font-mono, monospace);
  font-size: var(--type-md, 11px);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: inherit;
  white-space: nowrap;
}
.chip-arrow {
  font-size: var(--type-xs, 9px);
  color: var(--g5);
  margin-top: 1px;
}
.chip-btn.active .chip-arrow {
  color: var(--accent-amb, var(--amb, #d6a347));
}

/* ── Popover anchor ── */
.popover-anchor {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
}

/* ── Price unit (Slot 4) — single visual unit ── */
.price-unit {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  overflow: hidden;
}

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
  font-size: var(--type-xs, 10px);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.price-block.pos .price-val,
.price-block.pos .price-chg { color: var(--pos); }
.price-block.neg .price-val,
.price-block.neg .price-chg { color: var(--neg); }
.price-block.flat .price-val { color: var(--text-primary, var(--g8)); }
.price-block.flat .price-chg { color: var(--text-secondary, var(--g6)); }

/* ── OHLC strip ── */
.ohlc-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.ohlc-item {
  font-family: var(--font-mono, monospace);
  font-size: var(--type-sm, 10px);
  font-weight: 500;
  color: var(--text-secondary, var(--g7));
  white-space: nowrap;
}
.ohlc-lbl {
  color: var(--g5);
  margin-right: 2px;
}
@media (max-width: 1280px) { .ohlc-vol { display: none; } }
@media (max-width: 1024px) { .ohlc-strip { display: none; } }

/* ── L2 quant inline ── */
.l2-inline {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}
@media (max-width: 1024px) { .l2-inline { display: none; } }

.q-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-mono, monospace);
  font-size: var(--type-xs, 10px);
  white-space: nowrap;
}
.q-lbl {
  font-size: var(--type-xs, 10px);
  font-weight: 500;
  color: var(--g5);
  letter-spacing: 0.04em;
}
.q-val {
  font-size: var(--type-xs, 10px);
  font-weight: 600;
  color: var(--text-secondary, var(--g7));
  letter-spacing: 0.02em;
}
.q-arrow {
  font-size: var(--type-xs, 10px);
  font-weight: 600;
}
.q-hint {
  font-size: var(--type-xs, 10px);
  font-weight: 400;
  opacity: 0.7;
}
.q-sep {
  font-size: var(--type-xs, 10px);
  color: var(--g3);
  margin: 0 8px;
}

/* ── Kim item: hide ≤1280px ── */
@media (max-width: 1280px) { .kim-item { display: none; } }

/* FR colors */
.fr-long  { color: var(--accent-amb, var(--amb, #d6a347)); }
.fr-short { color: #38bdf8; }

/* OI delta colors */
.oi-up   { color: var(--pos); }
.oi-down { color: var(--neg); }

/* Kimchi colors */
.kim-hot  { color: var(--accent-amb, var(--amb, #d6a347)); }
.kim-cold { color: #38bdf8; }

/* ── Spacer ── */
.flex-gap { flex: 1; min-width: 0; }

/* ── Mode strip ── */
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
  border-color: var(--g5);
  color: var(--text-primary, var(--g9));
}

/* ── Controls ── */
.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  font-size: var(--type-md, 14px);
  color: var(--text-secondary, var(--g6));
  cursor: pointer;
  transition: color 0.08s;
  flex-shrink: 0;
  position: relative;
}
.ctrl-btn::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.ctrl-btn:hover { color: var(--text-primary, var(--g8)); }
</style>
