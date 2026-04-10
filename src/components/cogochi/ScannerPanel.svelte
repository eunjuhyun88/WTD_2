<script lang="ts">
  import { onMount } from 'svelte';
  import { pushBucketsFromResults } from '$lib/stores/alphaBuckets';

  interface ScanResult {
    symbol: string;
    price: number;
    change24h: number;
    alphaScore: number;
    alphaLabel: string;
    regime: string;
    hasWyckoff: boolean;
    hasMTF: boolean;
    hasSqueeze: boolean;
    hasLiqAlert: boolean;
    extremeFR: boolean;
    snapshot: Record<string, any>;
  }

  type Preset = 'top10' | 'top30' | 'ai' | 'defi' | 'meme';
  type Filter = 'ALL' | 'BULL' | 'BEAR' | 'WK' | 'MTF' | 'FR' | 'LIQ';

  let {
    onSelectSymbol,
    onAnalyzeSymbol,
  }: {
    onSelectSymbol?: (result: ScanResult) => void;
    onAnalyzeSymbol?: (result: ScanResult) => void;
  } = $props();

  const PRESETS: Array<{ key: Preset; label: string }> = [
    { key: 'top10', label: 'Top10' },
    { key: 'top30', label: 'Top30' },
    { key: 'ai', label: 'AI' },
    { key: 'defi', label: 'DeFi' },
    { key: 'meme', label: 'Meme' },
  ];

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'ALL', label: 'ALL' },
    { key: 'BULL', label: 'BULL' },
    { key: 'BEAR', label: 'BEAR' },
    { key: 'WK', label: 'WK' },
    { key: 'MTF', label: 'MTF' },
    { key: 'FR', label: 'FR' },
    { key: 'LIQ', label: 'LIQ' },
  ];

  const SEED_RESULTS: ScanResult[] = [
    {
      symbol: 'BTCUSDT',
      price: 71687,
      change24h: 1.8,
      alphaScore: 34,
      alphaLabel: 'BULL',
      regime: 'RANGE',
      hasWyckoff: true,
      hasMTF: false,
      hasSqueeze: false,
      hasLiqAlert: false,
      extremeFR: false,
      snapshot: { symbol: 'BTCUSDT', timeframe: '4h', regime: 'RANGE', alphaScore: 34, alphaLabel: 'BULL', verdict: 'BULL' },
    },
    {
      symbol: 'ETHUSDT',
      price: 3842,
      change24h: 2.4,
      alphaScore: 28,
      alphaLabel: 'BULL',
      regime: 'MARKUP',
      hasWyckoff: false,
      hasMTF: true,
      hasSqueeze: false,
      hasLiqAlert: false,
      extremeFR: false,
      snapshot: { symbol: 'ETHUSDT', timeframe: '4h', regime: 'MARKUP', alphaScore: 28, alphaLabel: 'BULL', verdict: 'BULL' },
    },
    {
      symbol: 'SOLUSDT',
      price: 182.4,
      change24h: -1.1,
      alphaScore: -18,
      alphaLabel: 'NEUTRAL',
      regime: 'RANGE',
      hasWyckoff: false,
      hasMTF: false,
      hasSqueeze: true,
      hasLiqAlert: false,
      extremeFR: false,
      snapshot: { symbol: 'SOLUSDT', timeframe: '4h', regime: 'RANGE', alphaScore: -18, alphaLabel: 'NEUTRAL', verdict: 'NEUTRAL' },
    },
    {
      symbol: 'DOGEUSDT',
      price: 0.1921,
      change24h: -3.6,
      alphaScore: -41,
      alphaLabel: 'BEAR',
      regime: 'MARKDOWN',
      hasWyckoff: true,
      hasMTF: true,
      hasSqueeze: false,
      hasLiqAlert: true,
      extremeFR: true,
      snapshot: { symbol: 'DOGEUSDT', timeframe: '4h', regime: 'MARKDOWN', alphaScore: -41, alphaLabel: 'BEAR', verdict: 'BEAR' },
    },
    {
      symbol: 'FETUSDT',
      price: 2.18,
      change24h: 4.7,
      alphaScore: 57,
      alphaLabel: 'STRONG BULL',
      regime: 'MARKUP',
      hasWyckoff: false,
      hasMTF: true,
      hasSqueeze: true,
      hasLiqAlert: false,
      extremeFR: false,
      snapshot: { symbol: 'FETUSDT', timeframe: '4h', regime: 'MARKUP', alphaScore: 57, alphaLabel: 'STRONG BULL', verdict: 'STRONG BULL' },
    },
  ];

  let results = $state<ScanResult[]>([]);
  let isScanning = $state(false);
  let error = $state('');
  let activePreset = $state<Preset>('top10');
  let activeFilter = $state<Filter>('ALL');
  let selectedSymbol = $state('');

  let filteredResults = $derived.by(() => {
    switch (activeFilter) {
      case 'BULL':
        return results.filter((row) => row.alphaScore >= 25);
      case 'BEAR':
        return results.filter((row) => row.alphaScore <= -25);
      case 'WK':
        return results.filter((row) => row.hasWyckoff);
      case 'MTF':
        return results.filter((row) => row.hasMTF);
      case 'FR':
        return results.filter((row) => row.extremeFR);
      case 'LIQ':
        return results.filter((row) => row.hasLiqAlert);
      default:
        return results;
    }
  });

  function alphaClass(alphaScore: number): string {
    if (alphaScore >= 55) return 'strong-bull';
    if (alphaScore >= 25) return 'bull';
    if (alphaScore <= -55) return 'strong-bear';
    if (alphaScore <= -25) return 'bear';
    return 'neutral';
  }

  function formatPrice(price: number): string {
    if (!Number.isFinite(price)) return '--';
    return price >= 1
      ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : price.toFixed(4);
  }

  function buildFlags(row: ScanResult): string[] {
    const flags: string[] = [];
    if (row.hasWyckoff) flags.push('WK');
    if (row.hasMTF) flags.push('MTF');
    if (row.extremeFR) flags.push('FR');
    if (row.hasLiqAlert) flags.push('LIQ');
    if (row.hasSqueeze) flags.push('BB');
    return flags;
  }

  async function runScan(preset = activePreset) {
    if (isScanning) return;
    isScanning = true;
    error = '';

    try {
      const res = await fetch('/api/cogochi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'topN', preset }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }

      const payload = (await res.json()) as { results?: ScanResult[] };
      results = Array.isArray(payload.results) ? payload.results : [];
      pushBucketsFromResults(
        results.map((row) => ({
          alphaScore: row.alphaScore,
          extremeFR: row.extremeFR,
          fr: row.snapshot?.l2?.fr,
        }))
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Scan failed';
      results = [];
      pushBucketsFromResults([]);
    } finally {
      isScanning = false;
    }
  }

  function selectRow(row: ScanResult) {
    selectedSymbol = row.symbol;
    onSelectSymbol?.(row);
  }

  function analyzeRow(row: ScanResult) {
    selectedSymbol = row.symbol;
    onAnalyzeSymbol?.(row);
  }

  onMount(() => {
    results = SEED_RESULTS;
    pushBucketsFromResults(
      SEED_RESULTS.map((row) => ({
        alphaScore: row.alphaScore,
        extremeFR: row.extremeFR,
      }))
    );
    void runScan();
  });
</script>

<div class="scanner-panel">
  <div class="scanner-head">
    <div>
      <div class="scanner-label">ALPHA SCAN</div>
      <div class="scanner-sub">{results.length} symbols loaded</div>
    </div>
    <button type="button" class="scan-btn" onclick={() => runScan()}>
      {isScanning ? '...' : 'RUN'}
    </button>
  </div>

  <div class="preset-row">
    {#each PRESETS as preset}
      <button
        type="button"
        class:active={activePreset === preset.key}
        onclick={() => {
          activePreset = preset.key;
          void runScan(preset.key);
        }}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <div class="filter-row">
    {#each FILTERS as filter}
      <button
        type="button"
        class:active={activeFilter === filter.key}
        onclick={() => {
          activeFilter = filter.key;
        }}
      >
        {filter.label}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="scanner-error">{error}</div>
  {/if}

  <div class="table-head">
    <span>SYM</span>
    <span>A</span>
    <span>24H</span>
    <span>FLAG</span>
  </div>

  <div class="table-body">
    {#each filteredResults as row}
      <button
        type="button"
        class="scan-row"
        class:selected={selectedSymbol === row.symbol}
        onclick={() => selectRow(row)}
        ondblclick={() => analyzeRow(row)}
      >
        <div class="cell symbol">
          <span class="sym">{row.symbol.replace('USDT', '')}</span>
          <span class="price">${formatPrice(row.price)}</span>
        </div>
        <div class={`cell alpha ${alphaClass(row.alphaScore)}`}>
          {row.alphaScore > 0 ? '+' : ''}{row.alphaScore}
        </div>
        <div class="cell change" class:up={row.change24h >= 0} class:dn={row.change24h < 0}>
          {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(1)}%
        </div>
        <div class="cell flags">
          {#each buildFlags(row).slice(0, 2) as flag}
            <span>{flag}</span>
          {/each}
        </div>
      </button>
    {/each}

    {#if !filteredResults.length && !isScanning}
      <div class="empty-state">No rows for this filter.</div>
    {/if}
  </div>

  <div class="scanner-foot">
    <span>{filteredResults.length}/{results.length}</span>
    <span>Click: open analysis</span>
    <span>Double-click: ask DOUNI</span>
  </div>
</div>

<style>
  .scanner-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
    background: rgba(8, 11, 18, 0.92);
    border-right: 1px solid var(--sc-line-soft, rgba(219, 154, 159, 0.14));
    overflow: hidden;
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
  }

  .scanner-head,
  .scanner-foot,
  .table-head,
  .scan-row {
    display: grid;
    grid-template-columns: 1.7fr 0.8fr 0.95fr 1fr;
    gap: 8px;
    align-items: center;
  }

  .scanner-head {
    grid-template-columns: 1fr auto;
    margin-bottom: 10px;
  }

  .scanner-label {
    color: var(--sc-text-0);
    font-size: 0.78rem;
    letter-spacing: 0.16em;
  }

  .scanner-sub,
  .scanner-foot,
  .table-head,
  .price {
    color: var(--sc-text-3);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 0.68rem;
  }

  .scan-btn,
  .preset-row button,
  .filter-row button {
    border: 1px solid var(--sc-line-soft, rgba(219, 154, 159, 0.16));
    background: rgba(17, 24, 35, 0.86);
    color: var(--sc-text-1);
    border-radius: 999px;
    padding: 0 10px;
    min-height: 30px;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
  }

  .preset-row,
  .filter-row {
    display: grid;
    gap: 8px;
    margin-bottom: 10px;
  }

  .preset-row {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .filter-row {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .preset-row button.active,
  .filter-row button.active,
  .scan-btn:hover {
    border-color: rgba(242, 209, 147, 0.32);
    color: var(--sc-warn);
  }

  .scanner-error {
    margin-bottom: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(207, 127, 143, 0.12);
    color: var(--sc-bad);
    font-size: 0.78rem;
  }

  .table-head {
    padding: 0 10px 8px;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219, 154, 159, 0.1));
    letter-spacing: 0.08em;
  }

  .table-body {
    flex: 1;
    overflow-y: auto;
    margin: 4px -4px 0;
    padding: 0 4px;
  }

  .scan-row {
    width: 100%;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    text-align: left;
  }

  .scan-row:hover,
  .scan-row.selected {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--sc-line-soft, rgba(219, 154, 159, 0.16));
  }

  .cell.symbol {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .sym {
    color: var(--sc-text-0);
    font-size: 0.84rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .cell.alpha,
  .cell.change,
  .flags {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 0.74rem;
  }

  .cell.alpha.strong-bull,
  .cell.alpha.bull,
  .change.up {
    color: var(--sc-good);
  }

  .cell.alpha.strong-bear,
  .cell.alpha.bear,
  .change.dn {
    color: var(--sc-bad);
  }

  .cell.alpha.neutral {
    color: var(--sc-text-2);
  }

  .flags {
    display: flex;
    gap: 4px;
    justify-content: flex-start;
    color: var(--sc-warn);
  }

  .empty-state {
    padding: 18px 10px;
    color: var(--sc-text-3);
    font-size: 0.78rem;
  }

  .scanner-foot {
    grid-template-columns: 0.7fr 1fr 1.2fr;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--sc-line-soft, rgba(219, 154, 159, 0.1));
  }
</style>
