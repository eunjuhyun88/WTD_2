<script lang="ts">
  import type { MiniTickerUpdate } from '$lib/api/binance';

  interface Props {
    sym: string;
    tick: MiniTickerUpdate | undefined;
    spark: number[];
    active: boolean;
    focused?: boolean;
    folded: boolean;
    fr?: number | null;
    alphaScore?: number | null;
    onSelect: (sym: string) => void;
    onRemove: (sym: string) => void;
  }

  let { sym, tick, spark, active, focused = false, folded, fr = null, alphaScore = null, onSelect, onRemove }: Props = $props();

  const frClass = $derived(fr === null ? '' : fr > 0 ? 'fr-long' : 'fr-short');

  // 8-segment discrete alpha bar: ████████░░
  function alphaBar(score: number): string {
    const filled = Math.round(score * 8);
    return '█'.repeat(filled) + '░'.repeat(8 - filled);
  }

  function shortName(s: string) { return s.replace(/USDT$/, ''); }

  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1)     return p.toFixed(3);
    return p.toPrecision(4);
  }

  function fmtChange(c: number): string {
    return (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
  }

  function sparkPolyline(prices: number[]): string {
    const W = 30, H = 14;
    const min = Math.min(...prices), max = Math.max(...prices);
    const range = max - min || 1;
    return prices
      .map((p, i) => `${((i / (prices.length - 1)) * W).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`)
      .join(' ');
  }
</script>

<li class="symbol-item">
  <button
    type="button"
    class="symbol-row"
    class:active
    class:focused
    onclick={() => onSelect(sym)}
    title={sym}
  >
    <span class="sym-name">{shortName(sym)}</span>
    {#if !folded}
      <span class="sym-right">
        {#if tick}
          <span class="sym-price">{fmtPrice(tick.price)}</span>
          <span class="sym-bottom">
            <span class="sym-change" class:up={tick.change24h >= 0} class:dn={tick.change24h < 0}>
              {fmtChange(tick.change24h)}
            </span>
            {#if spark.length >= 3}
              <svg class="sparkline" viewBox="0 0 30 14" width="30" height="14">
                <polyline
                  points={sparkPolyline(spark)}
                  fill="none"
                  stroke={tick.change24h >= 0 ? '#22AB94' : '#F23645'}
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            {/if}
          </span>
          {#if alphaScore !== null || fr !== null}
            <span class="sym-quant">
              {#if alphaScore !== null}
                <span class="alpha-bar" title="Alpha score {(alphaScore * 100).toFixed(0)}%">{alphaBar(alphaScore)}</span>
              {/if}
              {#if fr !== null}
                <span class="sym-fr {frClass}" title="Funding rate">{fr > 0 ? '+' : ''}{(fr * 100).toFixed(3)}%</span>
              {/if}
            </span>
          {/if}
        {:else}
          <span class="sym-loading">…</span>
        {/if}
      </span>
      <button
        type="button"
        class="del-btn"
        onclick={(e) => { e.stopPropagation(); onRemove(sym); }}
        title="Remove"
        aria-label="Remove {sym}"
      >×</button>
    {/if}
  </button>
</li>

<style>
  .symbol-item { position: relative; }

  .symbol-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-bottom: 0.5px solid var(--g3);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .symbol-row:hover { background: var(--g2); }
  .symbol-row:hover .del-btn { opacity: 1; }

  .symbol-row.active {
    background: var(--g3);
    color: var(--g9);
    border-left: 2px solid var(--brand);
    padding-left: 8px;
  }

  .symbol-row.focused:not(.active) {
    background: rgba(255,255,255,0.04);
    outline: 1px solid var(--g4);
    outline-offset: -1px;
  }

  .del-btn {
    background: none;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0 0 0 4px;
    opacity: 0;
    transition: opacity 0.1s, color 0.1s;
    flex-shrink: 0;
  }
  .del-btn:hover { color: #F23645; }

  .sym-name {
    font-weight: 600;
    letter-spacing: 0.02em;
    font-size: 11px;
  }

  .sym-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .sym-price {
    font-size: var(--ui-text-xs);
    color: var(--g9);
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
  }

  .sym-bottom {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sym-change {
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
  .sym-change.up { color: #22AB94; }
  .sym-change.dn { color: #F23645; }

  .sparkline { display: block; flex-shrink: 0; }

  .sym-quant {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 1px;
  }

  .alpha-bar {
    font-size: var(--ui-text-xs);
    letter-spacing: -0.5px;
    color: var(--brand);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .sym-fr {
    font-size: var(--ui-text-xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .fr-long  { color: var(--amb, #d6a347); }
  .fr-short { color: #38bdf8; }

  .sym-loading {
    font-size: var(--ui-text-xs);
    color: var(--g5);
    animation: blink 1.2s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
