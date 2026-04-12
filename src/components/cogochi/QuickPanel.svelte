<script lang="ts">
  // ─── Quick Panel: Left sidebar for scan presets, filters, mini results ───

  type ScanItem = {
    symbol: string;
    alphaScore: number;
    alphaLabel: string;
    price: number;
    change24h: number;
    flags: string[];
  };

  type FilterTab = 'ALL' | 'BULL' | 'BEAR' | 'WK' | 'MTF' | 'BB' | 'FR';

  let {
    items = [] as ScanItem[],
    scanning = false,
    selectedSymbol = '',
    collapsed = false,
    onScan,
    onPreview,
    onAnalyze,
    onToggle,
  }: {
    items: ScanItem[];
    scanning: boolean;
    selectedSymbol: string;
    collapsed: boolean;
    onScan: (preset: string) => void;
    onPreview: (symbol: string) => void;
    onAnalyze: (symbol: string) => void;
    onToggle: () => void;
  } = $props();

  let activeFilter = $state<FilterTab>('ALL');

  const PRESETS = [
    { label: 'Top 5', key: 'top5' },
    { label: 'Top 10', key: 'top10' },
    { label: 'Top 30', key: 'top30' },
    { label: 'DeFi', key: 'defi' },
    { label: 'Meme', key: 'meme' },
    { label: 'AI', key: 'ai' },
  ];

  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: 'ALL', label: 'ALL' },
    { key: 'BULL', label: 'BULL' },
    { key: 'BEAR', label: 'BEAR' },
    { key: 'WK', label: 'WK' },
    { key: 'MTF', label: 'MTF' },
    { key: 'BB', label: 'BB' },
    { key: 'FR', label: 'FR' },
  ];

  let filtered = $derived.by(() => {
    if (activeFilter === 'ALL') return items;
    return items.filter(item => {
      switch (activeFilter) {
        case 'BULL': return item.alphaScore > 20;
        case 'BEAR': return item.alphaScore < -20;
        case 'WK': return item.flags.includes('wyckoff');
        case 'MTF': return item.flags.includes('mtf_triple');
        case 'BB': return item.flags.includes('bb_squeeze');
        case 'FR': return item.flags.includes('fr_extreme');
        default: return true;
      }
    });
  });

  function scoreColor(s: number): string {
    if (s >= 25) return 'var(--sc-good, #adca7c)';
    if (s <= -25) return 'var(--sc-bad, #cf7f8f)';
    return 'var(--sc-text-2, #606070)';
  }

  function flagGlyph(flag: string): string {
    const map: Record<string, string> = {
      wyckoff: 'WK',
      mtf_triple: 'MTF',
      bb_squeeze: 'BB',
      fr_extreme: 'FR',
      liq_alert: 'LQ',
    };
    return map[flag] ?? flag.slice(0, 2).toUpperCase();
  }
</script>

{#if !collapsed}
<aside class="qp">
  <div class="qp-header">
    <div class="qp-head-copy">
      <span class="qp-title">SCANNER</span>
      <span class="qp-sub">Quick preview on click, analyze on double click</span>
    </div>
    <button class="qp-collapse" onclick={onToggle} aria-label="Collapse panel">«</button>
  </div>

  <!-- Presets -->
  <div class="qp-presets">
    {#each PRESETS as p}
      <button
        class="qp-preset"
        class:scanning
        disabled={scanning}
        onclick={() => onScan(p.key)}
      >{p.label}</button>
    {/each}
  </div>

  <!-- Filters -->
  <div class="qp-filters">
    {#each FILTERS as f}
      <button
        class="qp-filter"
        class:active={activeFilter === f.key}
        onclick={() => activeFilter = f.key}
      >{f.label}</button>
    {/each}
  </div>

  <!-- Results -->
  <div class="qp-results">
    {#if scanning}
      <div class="qp-scanning">
        <div class="qp-scan-bar"></div>
        <span class="qp-scan-text">Scanning...</span>
      </div>
    {:else if filtered.length === 0}
      <div class="qp-empty">No results</div>
    {:else}
      {#each filtered as item}
        <button
          class="qp-row"
          class:selected={selectedSymbol === item.symbol}
          onclick={() => onPreview(item.symbol)}
          ondblclick={() => onAnalyze(item.symbol)}
        >
          <span class="qr-main">
            <span class="qr-topline">
              <span class="qr-sym">{item.symbol.replace('USDT', '')}</span>
              <span class="qr-price">${item.price >= 1 ? item.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : item.price.toFixed(4)}</span>
            </span>
            <span class="qr-flags">
              {#each item.flags.slice(0, 3) as flag}
                <span class="qr-flag">{flagGlyph(flag)}</span>
              {/each}
            </span>
          </span>
          <span class="qr-meta">
            <span class="qr-score" style="color:{scoreColor(item.alphaScore)}">
              {item.alphaScore > 0 ? '+' : ''}{item.alphaScore}
            </span>
            <span class="qr-change" class:up={item.change24h >= 0} class:dn={item.change24h < 0}>
              {item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(1)}%
            </span>
          </span>
        </button>
      {/each}
    {/if}
  </div>

  <div class="qp-count">
    <span>{filtered.length}/{items.length} visible</span>
    <span>4H desk</span>
  </div>
</aside>
{:else}
<button class="qp-expand" onclick={onToggle} aria-label="Expand panel">»</button>
{/if}

<style>
  .qp {
    width: 100%;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    background: var(--sc-bg-1, #0b1220);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .qp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--sc-line-soft);
  }
  .qp-head-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .qp-title {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 16px;
    letter-spacing: 1px;
    color: var(--sc-text-1);
  }
  .qp-sub {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: var(--sc-text-3);
  }
  .qp-collapse, .qp-expand {
    background: none;
    border: 1px solid var(--sc-line-soft);
    color: var(--sc-text-3);
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  .qp-collapse:hover, .qp-expand:hover { color: var(--sc-text-0); }
  .qp-expand {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    border-radius: 0 4px 4px 0;
    padding: 12px 4px;
  }

  /* Presets */
  .qp-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 10px 12px 6px;
  }
  .qp-preset {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    border-radius: 3px;
    border: 1px solid var(--sc-line-soft);
    background: transparent;
    color: var(--sc-text-2);
    cursor: pointer;
    transition: all 0.15s;
  }
  .qp-preset:hover {
    border-color: var(--sc-accent, #db9a9f);
    color: var(--sc-accent);
    background: rgba(219,154,159,0.06);
  }
  .qp-preset.scanning { opacity: 0.4; cursor: wait; }

  /* Filters */
  .qp-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 6px 12px 8px;
    border-bottom: 1px solid var(--sc-line-soft);
  }
  .qp-filter {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 2px;
    border: none;
    background: transparent;
    color: var(--sc-text-3);
    cursor: pointer;
  }
  .qp-filter.active {
    color: var(--sc-accent, #db9a9f);
    background: rgba(219,154,159,0.1);
  }

  /* Results list */
  .qp-results {
    flex: 1;
    overflow-y: auto;
  }
  .qp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.06));
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .qp-row:hover { background: var(--sc-bg-2, #111b2c); }
  .qp-row.selected {
    background: rgba(219,154,159,0.08);
    border-left: 2px solid var(--sc-accent, #db9a9f);
  }
  .qr-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .qr-topline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .qr-sym {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 800;
    color: var(--sc-text-0);
  }
  .qr-price {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3);
  }
  .qr-flags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .qr-flag {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 8px;
    padding: 1px 4px;
    border-radius: 999px;
    background: rgba(219,154,159,0.08);
    color: var(--sc-text-2);
  }
  .qr-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    min-width: 54px;
  }
  .qr-score {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 800;
    text-align: right;
  }
  .qr-change {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    text-align: right;
  }
  .qr-change.up { color: var(--sc-good, #adca7c); }
  .qr-change.dn { color: var(--sc-bad, #cf7f8f); }

  /* Scanning state */
  .qp-scanning {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
  }
  .qp-scan-bar {
    width: 80px;
    height: 2px;
    background: var(--sc-bg-2);
    border-radius: 1px;
    overflow: hidden;
    position: relative;
  }
  .qp-scan-bar::after {
    content: '';
    position: absolute;
    top: 0; left: 0;
    height: 100%; width: 40%;
    background: var(--sc-accent, #db9a9f);
    border-radius: 1px;
    animation: qp-slide 1.4s ease-in-out infinite;
  }
  @keyframes qp-slide {
    0% { left: -40%; opacity: 0.4; }
    50% { opacity: 1; }
    100% { left: 100%; opacity: 0.4; }
  }
  .qp-scan-text {
    font-family: var(--sc-font-body);
    font-size: 10px;
    color: var(--sc-text-3);
  }

  .qp-empty {
    padding: 20px;
    text-align: center;
    font-size: 10px;
    color: var(--sc-text-3);
  }
  .qp-count {
    padding: 6px 12px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 8px;
    color: var(--sc-text-3);
    border-top: 1px solid var(--sc-line-soft);
  }

  /* Scrollbar */
  .qp-results::-webkit-scrollbar { width: 3px; }
  .qp-results::-webkit-scrollbar-thumb { background: var(--sc-line-soft); border-radius: 2px; }

  @media (max-width: 900px) {
    .qp {
      display: flex;
      width: 100%;
      max-height: 220px;
      border-right: 0;
    }
    .qp-sub {
      display: none;
    }
    .qp-results {
      max-height: 96px;
    }
    .qp-expand {
      position: static;
      transform: none;
      display: block;
      width: 100%;
      border-radius: 0;
    }
  }
</style>
