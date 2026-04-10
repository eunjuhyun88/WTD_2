<script lang="ts">
  import type {
    SignalSnapshot,
    LayerId,
  } from '$lib/engine/cogochi/types';
  import {
    ALL_LAYER_IDS,
    LAYER_MAX_CONTRIBUTION,
  } from '$lib/engine/cogochi/types';

  // ─── Props (Svelte 5 runes) ─────────────────────────────────
  let { snapshot, onClose }: {
    snapshot: any; // SignalSnapshot
    onClose?: () => void;
  } = $props();

  // ─── Layer Metadata ─────────────────────────────────────────
  const LAYER_NAMES: Record<string, string> = {
    l1: 'Wyckoff Phase',
    l2: 'Supply / Demand',
    l3: 'Volume Surge',
    l4: 'Order Book',
    l5: 'Basis / Liq-Est',
    l6: 'On-Chain',
    l7: 'Fear & Greed',
    l8: 'Kimchi Premium',
    l9: 'Liquidation',
    l10: 'Multi-Timeframe',
    l11: 'CVD Divergence',
    l12: 'Sector Flow',
    l13: 'Breakout',
    l14: 'Bollinger Bands',
    l15: 'ATR / Vol State',
    l18: '5m Momentum',
    l19: 'OI Acceleration',
  };

  // ─── Derived rows ──────────────────────────────────────────
  type LayerRow = {
    id: LayerId;
    displayId: string;
    name: string;
    score: number;
    max: number;
    signal: string;
  };

  function buildRows(s: any): LayerRow[] {
    if (!s) return [];
    return ALL_LAYER_IDS
      .filter((lid) => s[lid])
      .map((lid) => ({
        id: lid,
        displayId: lid.toUpperCase().replace('L', 'L'),
        name: LAYER_NAMES[lid] ?? lid,
        score: s[lid].score ?? 0,
        max: LAYER_MAX_CONTRIBUTION[lid],
        signal: extractSignal(lid, s[lid]),
      }));
  }

  function extractSignal(lid: string, layer: any): string {
    if (!layer) return '--';
    switch (lid) {
      case 'l1':  return layer.pattern ?? layer.phase ?? '--';
      case 'l2':  return layer.detail ?? fmtFr(layer.fr);
      case 'l3':  return layer.label ?? (layer.v_surge ? 'SURGE' : 'None');
      case 'l4':  return layer.label ?? `B/A ${fmt2(layer.bid_ask_ratio)}`;
      case 'l5':  return layer.label ?? `${fmt2(layer.basis_pct)}%`;
      case 'l6':  return layer.detail ?? `${layer.n_tx ?? 0} tx`;
      case 'l7':  return layer.label ?? `${layer.fear_greed}`;
      case 'l8':  return layer.label ?? `${fmt2(layer.kimchi)}%`;
      case 'l9':  return layer.label ?? fmtUsd((layer.liq_long_usd ?? 0) + (layer.liq_short_usd ?? 0));
      case 'l10': return layer.label ?? layer.mtf_confluence ?? '--';
      case 'l11': return layer.cvd_state ?? '--';
      case 'l12': return layer.sector_flow ?? '--';
      case 'l13': return layer.label ?? (layer.breakout ? 'BREAKOUT' : 'None');
      case 'l14': return layer.label ?? (layer.bb_squeeze ? 'SQUEEZE' : `w${fmt3(layer.bb_width)}`);
      case 'l15': return `${fmt2(layer.atr_pct)}%`;
      case 'l18': return layer.label ?? `${fmt2(layer.momentum_30m)}%`;
      case 'l19': return layer.label ?? layer.signal ?? '--';
      default:    return '--';
    }
  }

  // ─── Formatters ────────────────────────────────────────────
  function fmtFr(fr: number): string {
    return fr != null ? `${(fr * 100).toFixed(3)}%` : '--';
  }
  function fmtUsd(v: number): string {
    if (!v) return '--';
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }
  function fmtPrice(v: number | undefined): string {
    if (v == null) return '--';
    if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (v >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return v.toPrecision(4);
  }
  function fmt2(v: number | undefined): string {
    return v != null ? v.toFixed(2) : '--';
  }
  function fmt3(v: number | undefined): string {
    return v != null ? v.toFixed(3) : '--';
  }

  // ─── Bar helpers ───────────────────────────────────────────
  function barPct(score: number, max: number): number {
    return max === 0 ? 0 : Math.min((Math.abs(score) / max) * 100, 100);
  }

  // ─── Color helpers ─────────────────────────────────────────
  function alphaColorClass(s: number): string {
    if (s >= 60) return 'strong-bull';
    if (s >= 25) return 'bull';
    if (s > -25) return 'neutral';
    if (s > -60) return 'bear';
    return 'strong-bear';
  }

  function flagBool(v: boolean | undefined): string {
    return v ? 'YES' : '--';
  }

  function binanceUrl(symbol: string): string {
    const clean = symbol.replace('USDT', '').toLowerCase();
    return `https://www.binance.com/en/futures/${clean}usdt`;
  }
</script>

{#if snapshot}
  {@const rows = buildRows(snapshot)}
  {@const s = snapshot}
  {@const l1 = s.l1}
  {@const l2 = s.l2}
  {@const l15 = s.l15}

  <div class="ddp">
    <!-- ━━━ Close button ━━━ -->
    {#if onClose}
      <button class="ddp-close" onclick={onClose} aria-label="Close panel">x</button>
    {/if}

    <!-- ━━━ 1. Header ━━━ -->
    <header class="ddp-header">
      <div class="ddp-header-left">
        <span class="ddp-symbol">{s.symbol}</span>
        <span class="ddp-tf">{s.timeframe}</span>
        <span class="ddp-regime {alphaColorClass(s.alphaScore)}">{s.regime}</span>
      </div>
      <div class="ddp-header-right">
        <div class="ddp-alpha-label">ALPHA SCORE</div>
        <div class="ddp-alpha-val {alphaColorClass(s.alphaScore)}">{s.alphaScore}</div>
        <div class="ddp-verdict {alphaColorClass(s.alphaScore)}">{s.verdict ?? s.alphaLabel}</div>
      </div>
    </header>

    <!-- ━━━ 2. Alerts Bar ━━━ -->
    {#if s.extremeFR || s.mtfTriple || s.bbBigSqueeze}
      <div class="ddp-alerts">
        {#if s.extremeFR}
          <span class="ddp-alert-badge">{s.frAlert ?? 'EXTREME FR'}</span>
        {/if}
        {#if s.mtfTriple}
          <span class="ddp-alert-badge">MTF TRIPLE</span>
        {/if}
        {#if s.bbBigSqueeze}
          <span class="ddp-alert-badge">BB BIG SQUEEZE</span>
        {/if}
      </div>
    {/if}

    <!-- ━━━ 3. Layer Detail Table ━━━ -->
    <section class="ddp-section">
      <div class="ddp-section-title">17-LAYER BREAKDOWN</div>
      <div class="ddp-layer-table">
        <div class="ddp-layer-head">
          <span>ID</span>
          <span>Layer</span>
          <span>Signal</span>
          <span class="ddp-col-bar">Strength</span>
          <span class="ddp-col-score">Score</span>
        </div>

        {#each rows as row}
          <div class="ddp-layer-row" class:hot={Math.abs(row.score) >= row.max * 0.6}>
            <span class="ddp-lid">{row.displayId}</span>
            <span class="ddp-lname">{row.name}</span>
            <span class="ddp-lsignal">{row.signal}</span>

            <!-- Centered divergence bar -->
            <div class="ddp-bar-wrap">
              <div class="ddp-bar-track">
                <div class="ddp-bar-center"></div>
                {#if row.score !== 0}
                  <div
                    class="ddp-bar"
                    class:bear={row.score < 0}
                    class:bull={row.score > 0}
                    style="width:{barPct(row.score, row.max) / 2}%;{row.score < 0 ? 'right:50%' : 'left:50%'}"
                  ></div>
                {/if}
              </div>
              <span class="ddp-bar-range">{row.max}</span>
            </div>

            <span class="ddp-lscore" class:c-bull={row.score > 0} class:c-bear={row.score < 0}>
              {row.score !== 0 ? (row.score > 0 ? '+' : '') + row.score : '0'}
            </span>
          </div>

          <!-- L1 expanded details -->
          {#if row.id === 'l1' && l1}
            <div class="ddp-layer-extra">
              <span class="ddp-extra-item">Pattern: <b>{l1.pattern ?? '--'}</b></span>
              <span class="ddp-extra-item">Spring: <b class:flag-on={l1.hasSpring}>{flagBool(l1.hasSpring)}</b></span>
              <span class="ddp-extra-item">UTAD: <b class:flag-on={l1.hasUtad}>{flagBool(l1.hasUtad)}</b></span>
              <span class="ddp-extra-item">SOS: <b class:flag-on={l1.hasSos}>{flagBool(l1.hasSos)}</b></span>
              <span class="ddp-extra-item">SOW: <b class:flag-on={l1.hasSow}>{flagBool(l1.hasSow)}</b></span>
            </div>
          {/if}

          <!-- L2 expanded details -->
          {#if row.id === 'l2' && l2}
            <div class="ddp-layer-extra">
              <span class="ddp-extra-item">FR: <b>{fmtFr(l2.fr)}</b></span>
              <span class="ddp-extra-item">OI Chg: <b>{fmt2(l2.oi_change)}%</b></span>
              <span class="ddp-extra-item">L/S: <b>{fmt2(l2.ls_ratio)}</b></span>
              <span class="ddp-extra-item">Taker: <b>{fmt2(l2.taker_ratio)}</b></span>
            </div>
          {/if}

          <!-- L15 expanded details -->
          {#if row.id === 'l15' && l15}
            <div class="ddp-layer-extra">
              <span class="ddp-extra-item">ATR%: <b>{fmt2(l15.atr_pct)}%</b></span>
              <span class="ddp-extra-item">SL Long: <b>{fmtPrice(l15.stop_long)}</b></span>
              <span class="ddp-extra-item">SL Short: <b>{fmtPrice(l15.stop_short)}</b></span>
              <span class="ddp-extra-item">R:R: <b>{fmt2(l15.rr_ratio)}</b></span>
            </div>
          {/if}
        {/each}
      </div>
    </section>

    <!-- ━━━ 4. Wyckoff C&E Target ━━━ -->
    {#if l1?.ceTarget}
      <section class="ddp-section">
        <div class="ddp-section-title">WYCKOFF C&E TARGET</div>
        <div class="ddp-ce-grid">
          <div class="ddp-ce-item">
            <span class="ddp-ce-label">C&E Target</span>
            <span class="ddp-ce-val">${fmtPrice(l1.ceTarget)}</span>
          </div>
          <div class="ddp-ce-item">
            <span class="ddp-ce-label">x1.0 Projection</span>
            <span class="ddp-ce-val">${fmtPrice(l1.ceTarget)}</span>
          </div>
          <div class="ddp-ce-item">
            <span class="ddp-ce-label">x1.5 Projection</span>
            <span class="ddp-ce-val">${fmtPrice(l1.ceTarget * 1.5)}</span>
          </div>
        </div>
      </section>
    {/if}

    <!-- ━━━ 5. ATR Trade Plan ━━━ -->
    {#if l15}
      <section class="ddp-section">
        <div class="ddp-section-title">ATR TRADE PLAN</div>
        <div class="ddp-trade-grid">
          <div class="ddp-trade-row">
            <div class="ddp-trade-cell">
              <span class="ddp-trade-label">SL (Long)</span>
              <span class="ddp-trade-val c-bear">{fmtPrice(l15.stop_long)}</span>
            </div>
            <div class="ddp-trade-cell">
              <span class="ddp-trade-label">SL (Short)</span>
              <span class="ddp-trade-val c-bear">{fmtPrice(l15.stop_short)}</span>
            </div>
          </div>
          <div class="ddp-trade-row">
            <div class="ddp-trade-cell">
              <span class="ddp-trade-label">TP1 (Long)</span>
              <span class="ddp-trade-val c-bull">{fmtPrice(l15.tp1_long)}</span>
            </div>
            <div class="ddp-trade-cell">
              <span class="ddp-trade-label">TP2 (Long)</span>
              <span class="ddp-trade-val c-bull">{fmtPrice(l15.tp2_long)}</span>
            </div>
          </div>
          <div class="ddp-trade-row">
            <div class="ddp-trade-cell full">
              <span class="ddp-trade-label">Risk : Reward</span>
              <span class="ddp-trade-val rr">1 : {fmt2(l15.rr_ratio)}</span>
            </div>
          </div>
        </div>
      </section>
    {/if}

    <!-- ━━━ 6. Binance Link ━━━ -->
    <section class="ddp-section ddp-footer">
      <a
        class="ddp-binance-btn"
        href={binanceUrl(s.symbol)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open on Binance
      </a>
    </section>
  </div>

{:else}
  <div class="ddp-empty">
    <div class="ddp-empty-icon">&#9670;</div>
    <div class="ddp-empty-text">NO SNAPSHOT</div>
    <div class="ddp-empty-hint">Select a symbol to view deep-dive analysis</div>
    {#if onClose}
      <button class="ddp-empty-close" onclick={onClose}>Close</button>
    {/if}
  </div>
{/if}

<style>
  /* ════════════════════════════════════════════════════════════
     DeepDivePanel — 17-Layer Analysis Panel
     ════════════════════════════════════════════════════════════ */

  .ddp {
    position: relative;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--sc-bg-0);
    color: var(--sc-text-0);
    font-family: var(--sc-font-body, 'Space Grotesk', system-ui, sans-serif);
    border: 1px solid var(--sc-line-soft);
    border-radius: 6px;
  }

  /* ─── Close ─────────────────────────────────────────────── */

  .ddp-close {
    position: sticky;
    top: 0;
    right: 0;
    z-index: 10;
    align-self: flex-end;
    width: 28px;
    height: 28px;
    margin: 6px 6px -28px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--sc-bg-1);
    border: 1px solid var(--sc-line-soft);
    border-radius: 4px;
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .ddp-close:hover {
    color: var(--sc-text-0);
    border-color: var(--sc-good);
  }

  /* ─── Header ────────────────────────────────────────────── */

  .ddp-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--sc-line-soft);
    background: var(--sc-bg-1);
  }

  .ddp-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .ddp-symbol {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 18px;
    font-weight: 800;
    color: var(--sc-text-0);
    letter-spacing: 0.5px;
  }

  .ddp-tf {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-2);
    background: rgba(247, 242, 234, 0.06);
    padding: 2px 7px;
    border-radius: 3px;
  }

  .ddp-regime {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 2px;
  }
  .ddp-regime.strong-bull,
  .ddp-regime.bull { color: var(--sc-good); background: rgba(173, 202, 124, 0.1); }
  .ddp-regime.strong-bear,
  .ddp-regime.bear { color: var(--sc-bad); background: rgba(207, 127, 143, 0.1); }
  .ddp-regime.neutral { color: var(--sc-text-2); background: rgba(247, 242, 234, 0.06); }

  .ddp-header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 80px;
  }

  .ddp-alpha-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1.5px;
    color: var(--sc-text-3);
    margin-bottom: 2px;
  }

  .ddp-alpha-val {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 32px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -1px;
    font-variant-numeric: tabular-nums;
  }

  .ddp-verdict {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    margin-top: 3px;
  }

  .strong-bull, .bull { color: var(--sc-good); }
  .strong-bear, .bear { color: var(--sc-bad); }
  .neutral { color: var(--sc-text-2); }

  /* ─── Alerts Bar ────────────────────────────────────────── */

  .ddp-alerts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px;
    background: rgba(242, 209, 147, 0.06);
    border-bottom: 1px solid rgba(242, 209, 147, 0.18);
  }

  .ddp-alert-badge {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    color: var(--sc-warn);
    background: rgba(242, 209, 147, 0.12);
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid rgba(242, 209, 147, 0.25);
  }

  /* ─── Sections ──────────────────────────────────────────── */

  .ddp-section {
    padding: 10px 16px 14px;
    border-bottom: 1px solid var(--sc-line-soft);
  }

  .ddp-section-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.8px;
    color: var(--sc-text-3);
    margin-bottom: 8px;
  }

  /* ─── Layer Table ───────────────────────────────────────── */

  .ddp-layer-table {
    display: flex;
    flex-direction: column;
  }

  .ddp-layer-head {
    display: grid;
    grid-template-columns: 32px 1fr 1fr 120px 40px;
    gap: 6px;
    padding: 0 0 5px;
    border-bottom: 1px solid var(--sc-line-soft);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.2px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .ddp-layer-row {
    display: grid;
    grid-template-columns: 32px 1fr 1fr 120px 40px;
    gap: 6px;
    padding: 4px 0;
    align-items: center;
    font-size: 10px;
    border-bottom: 1px solid rgba(219, 154, 159, 0.08);
    transition: background 0.1s;
    border-left: 2px solid transparent;
  }

  .ddp-layer-row:hover {
    background: rgba(255, 255, 255, 0.015);
  }

  .ddp-layer-row.hot {
    background: rgba(173, 202, 124, 0.03);
    border-left-color: var(--sc-good);
  }

  .ddp-lid {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    color: var(--sc-text-3);
  }

  .ddp-lname {
    font-size: 10px;
    font-weight: 500;
    color: var(--sc-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ddp-lsignal {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 500;
    color: var(--sc-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ─── Divergence Bar ────────────────────────────────────── */

  .ddp-bar-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ddp-bar-track {
    position: relative;
    flex: 1;
    height: 4px;
    background: var(--sc-bg-2);
    border-radius: 2px;
    overflow: hidden;
  }

  .ddp-bar-center {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--sc-line-soft);
  }

  .ddp-bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .ddp-bar.bull {
    background: var(--sc-good);
    opacity: 0.75;
  }

  .ddp-bar.bear {
    background: var(--sc-bad);
    opacity: 0.75;
  }

  .ddp-bar-range {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 8px;
    color: var(--sc-text-3);
    min-width: 18px;
    text-align: right;
  }

  .ddp-lscore {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--sc-text-2);
  }

  .ddp-col-bar { text-align: center; }
  .ddp-col-score { text-align: right; }

  .c-bull { color: var(--sc-good) !important; }
  .c-bear { color: var(--sc-bad) !important; }

  /* ─── Layer Extra (L1, L2, L15 expanded rows) ───────────── */

  .ddp-layer-extra {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 3px 0 6px 38px;
    border-bottom: 1px solid rgba(219, 154, 159, 0.08);
  }

  .ddp-extra-item {
    font-size: 9px;
    color: var(--sc-text-3);
    letter-spacing: 0.3px;
  }

  .ddp-extra-item b {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-weight: 600;
    color: var(--sc-text-2);
  }

  .ddp-extra-item b.flag-on {
    color: var(--sc-good);
  }

  /* ─── C&E Target ────────────────────────────────────────── */

  .ddp-ce-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .ddp-ce-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    background: rgba(173, 202, 124, 0.04);
    border: 1px solid rgba(173, 202, 124, 0.1);
    border-radius: 4px;
  }

  .ddp-ce-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.8px;
    color: var(--sc-text-3);
  }

  .ddp-ce-val {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    color: var(--sc-good);
    font-variant-numeric: tabular-nums;
  }

  /* ─── Trade Plan ────────────────────────────────────────── */

  .ddp-trade-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ddp-trade-row {
    display: flex;
    gap: 8px;
  }

  .ddp-trade-cell {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    background: var(--sc-bg-1);
    border: 1px solid var(--sc-line-soft);
    border-radius: 4px;
  }

  .ddp-trade-cell.full {
    flex: unset;
    width: 100%;
  }

  .ddp-trade-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.8px;
    color: var(--sc-text-3);
  }

  .ddp-trade-val {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 14px;
    font-weight: 700;
    color: var(--sc-text-0);
    font-variant-numeric: tabular-nums;
  }

  .ddp-trade-val.rr {
    color: var(--sc-warn);
  }

  /* ─── Binance Button ────────────────────────────────────── */

  .ddp-footer {
    display: flex;
    justify-content: center;
    padding: 12px 16px 14px;
  }

  .ddp-binance-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 20px;
    font-family: var(--sc-font-body, 'Space Grotesk', system-ui, sans-serif);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #f0b90b;
    background: rgba(240, 185, 11, 0.06);
    border: 1px solid rgba(240, 185, 11, 0.2);
    border-radius: 4px;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .ddp-binance-btn:hover {
    background: rgba(240, 185, 11, 0.12);
    border-color: rgba(240, 185, 11, 0.4);
  }

  /* ─── Empty State ───────────────────────────────────────── */

  .ddp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    gap: 8px;
    padding: 40px 20px;
    background: var(--sc-bg-0);
    border: 1px solid var(--sc-line-soft);
    border-radius: 6px;
    opacity: 0.6;
  }

  .ddp-empty-icon {
    font-size: 24px;
    color: var(--sc-good);
    opacity: 0.4;
  }

  .ddp-empty-text {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--sc-text-2);
  }

  .ddp-empty-hint {
    font-size: 10px;
    color: var(--sc-text-3);
  }

  .ddp-empty-close {
    margin-top: 12px;
    padding: 4px 14px;
    font-size: 10px;
    font-weight: 600;
    color: var(--sc-text-2);
    background: transparent;
    border: 1px solid var(--sc-line-soft);
    border-radius: 3px;
    cursor: pointer;
  }
  .ddp-empty-close:hover {
    border-color: var(--sc-text-2);
  }

  /* ─── Scrollbar ─────────────────────────────────────────── */

  .ddp::-webkit-scrollbar { width: 4px; }
  .ddp::-webkit-scrollbar-thumb { background: var(--sc-line-soft); border-radius: 2px; }
  .ddp::-webkit-scrollbar-track { background: transparent; }
</style>
