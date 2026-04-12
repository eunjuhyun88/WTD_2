<script lang="ts">
  import { onMount } from 'svelte';

  // ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  interface ScanResult {
    symbol: string;
    price: number;
    change24h: number;
    alphaScore: number;
    alphaLabel: string;
    regime: string;
    flags: string[];
    snapshot: Record<string, any>;
  }

  type FilterTab =
    | 'ALL'
    | 'WATCHLIST'
    | 'BULLISH'
    | 'BEARISH'
    | 'WYCKOFF'
    | 'MTF'
    | 'BB_SQUEEZE'
    | 'LIQ_ALERT'
    | 'EXTREME_FR';

  type SortColumn = 'symbol' | 'price' | 'change24h' | 'alphaScore' | 'regime';

  type LayerRow = { id: string; name: string; val: string; score: number; max: number };

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: 'ALL', label: 'ALL' },
    { key: 'WATCHLIST', label: 'WATCHLIST' },
    { key: 'BULLISH', label: 'BULLISH' },
    { key: 'BEARISH', label: 'BEARISH' },
    { key: 'WYCKOFF', label: 'WYCKOFF' },
    { key: 'MTF', label: 'MTF\u2605' },
    { key: 'BB_SQUEEZE', label: 'BB\uC2A4\uD018\uC988' },
    { key: 'LIQ_ALERT', label: '\uCCAD\uC0B0\uACBD\uBCF4' },
    { key: 'EXTREME_FR', label: 'EXTREME FR' },
  ];

  const PRESETS: { label: string; symbols?: string[]; topN?: number; sector?: string }[] = [
    { label: 'Top5', topN: 5 },
    { label: 'Top10', topN: 10 },
    { label: 'AI', sector: 'ai' },
    { label: 'DeFi', sector: 'defi' },
    { label: 'Meme', sector: 'meme' },
  ];

  const TOP_N_OPTIONS = [10, 30, 50];

  const FLAG_MAP: Record<string, string> = {
    wyckoff: '\uD83C\uDF0A',
    mtf_triple: '\u2605',
    bb_squeeze: '\uD83D\uDCCA',
    fr_extreme: '\u26A1',
    liq_alert: '\uD83D\uDD25',
  };

  // ━━━ State ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let scanResults = $state<ScanResult[]>([]);
  let isScanning = $state(false);
  let scanError = $state('');
  let scanProgress = $state(0);
  let scanTotal = $state(0);
  let activeFilter = $state<FilterTab>('ALL');
  let sortCol = $state<SortColumn>('alphaScore');
  let sortDir = $state(-1);
  let searchQuery = $state('');
  let watchlist = $state<Set<string>>(new Set());
  let selectedSnapshot = $state<ScanResult | null>(null);
  let scanMode = $state<'topN' | 'custom'>('topN');
  let topN = $state(30);
  let customSymbols = $state('');
  let deepDiveOpen = $state(false);

  // ━━━ Derived ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let filteredResults = $derived.by(() => {
    let items = scanResults;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      items = items.filter((r) => r.symbol.toUpperCase().includes(q));
    }

    // Tab filter
    switch (activeFilter) {
      case 'WATCHLIST':
        items = items.filter((r) => watchlist.has(r.symbol));
        break;
      case 'BULLISH':
        items = items.filter((r) => r.alphaScore > 20);
        break;
      case 'BEARISH':
        items = items.filter((r) => r.alphaScore < -20);
        break;
      case 'WYCKOFF':
        items = items.filter((r) => r.flags.includes('wyckoff'));
        break;
      case 'MTF':
        items = items.filter((r) => r.flags.includes('mtf_triple'));
        break;
      case 'BB_SQUEEZE':
        items = items.filter((r) => r.flags.includes('bb_squeeze'));
        break;
      case 'LIQ_ALERT':
        items = items.filter((r) => r.flags.includes('liq_alert'));
        break;
      case 'EXTREME_FR':
        items = items.filter((r) => r.flags.includes('fr_extreme'));
        break;
    }

    // Sort
    items = [...items].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * sortDir;
      }
      return ((av as number) - (bv as number)) * sortDir;
    });

    return items;
  });

  // ━━━ Layer Detail Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function layerRows(s: Record<string, any>): LayerRow[] {
    if (!s) return [];
    const rows: LayerRow[] = [];
    const push = (id: string, name: string, val: string, score: number, max: number) => {
      rows.push({ id, name, val, score: score ?? 0, max });
    };
    if (s.l1) push('L01', 'Wyckoff', s.l1.phase ?? '---', s.l1.score, 28);
    if (s.l2) push('L02', 'Flow', s.l2.fr != null ? `${(s.l2.fr * 100).toFixed(3)}%` : '---', s.l2.score, 55);
    if (s.l3) push('L03', 'V-Surge', s.l3.label ?? (s.l3.v_surge ? 'YES' : '---'), s.l3.score, 15);
    if (s.l4) push('L04', 'OrdBook', s.l4.label ?? `${s.l4.bid_ask_ratio ?? '---'}`, s.l4.score, 12);
    if (s.l5) push('L05', 'LiqEst', s.l5.label ?? (s.l5.basis_pct != null ? `${s.l5.basis_pct}%` : '---'), s.l5.score, 12);
    if (s.l6) push('L06', 'OnChain', s.l6.detail ?? `${s.l6.n_tx ?? 0}tx`, s.l6.score, 10);
    if (s.l7) push('L07', 'F&G', s.l7.label ?? `${s.l7.fear_greed ?? '---'}`, s.l7.score, 8);
    if (s.l8) push('L08', 'Kimchi', s.l8.label ?? (s.l8.kimchi != null ? `${s.l8.kimchi}%` : '---'), s.l8.score, 10);
    if (s.l9) push('L09', 'RealLiq', s.l9.label ?? fmtUsd((s.l9.liq_long_usd ?? 0) + (s.l9.liq_short_usd ?? 0)), s.l9.score, 12);
    if (s.l10) push('L10', 'MTF', s.l10.label ?? (s.l10.mtf_confluence ?? '---'), s.l10.score, 20);
    if (s.l11) push('L11', 'CVD', s.l11.cvd_state ?? '---', s.l11.score, 12);
    if (s.l12) push('L12', 'Sector', s.l12.sector_flow ?? '---', s.l12.score, 10);
    if (s.l13) push('L13', 'Break', s.l13.label ?? (s.l13.breakout ? 'YES' : '---'), s.l13.score, 12);
    if (s.l14) push('L14', 'BB', s.l14.label ?? (s.l14.bb_squeeze ? 'SQZ' : `w${s.l14.bb_width ?? 0}`), s.l14.score, 10);
    if (s.l15) push('L15', 'ATR', s.l15.atr_pct != null ? `${s.l15.atr_pct}%` : '---', s.l15.score ?? 0, 6);
    if (s.l18) push('L18', '5mMom', s.l18.label ?? `${s.l18.momentum_30m ?? 0}%`, s.l18.score, 25);
    if (s.l19) push('L19', 'OIAcc', s.l19.label ?? (s.l19.signal ?? '---'), s.l19.score, 15);
    return rows;
  }

  function fmtUsd(v: number): string {
    return !v ? '---' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;
  }

  function barPct(v: number, max: number): number {
    return max === 0 ? 0 : Math.min((Math.abs(v) / max) * 100, 100);
  }

  // ━━━ Persistence ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function loadWatchlist(): Set<string> {
    try {
      const raw = localStorage.getItem('cogochi-scanner-watchlist');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch { /* ignore */ }
    return new Set();
  }

  function saveWatchlist(wl: Set<string>) {
    try {
      localStorage.setItem('cogochi-scanner-watchlist', JSON.stringify([...wl]));
    } catch { /* ignore */ }
  }

  onMount(() => {
    watchlist = loadWatchlist();
  });

  // ━━━ Actions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function toggleWatchlist(symbol: string) {
    const next = new Set(watchlist);
    if (next.has(symbol)) {
      next.delete(symbol);
    } else {
      next.add(symbol);
    }
    watchlist = next;
    saveWatchlist(next);
  }

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      sortDir = sortDir * -1;
    } else {
      sortCol = col;
      sortDir = col === 'symbol' ? 1 : -1;
    }
  }

  function selectRow(result: ScanResult) {
    selectedSnapshot = result;
    deepDiveOpen = true;
  }

  function closeDeepDive() {
    deepDiveOpen = false;
    selectedSnapshot = null;
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    if (preset.topN) {
      scanMode = 'topN';
      topN = preset.topN;
    }
    if (preset.sector) {
      scanMode = 'custom';
      customSymbols = `sector:${preset.sector}`;
    }
    runScan();
  }

  async function runScan() {
    if (isScanning) return;
    isScanning = true;
    scanError = '';
    scanProgress = 0;
    scanTotal = 0;

    const body: Record<string, any> = { mode: scanMode };
    if (scanMode === 'topN') {
      body.topN = topN;
    } else {
      body.symbols = customSymbols
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }

    try {
      const res = await fetch('/api/cogochi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data.results || !Array.isArray(data.results)) {
        throw new Error('Invalid response format');
      }

      scanResults = data.results.map((r: any) => ({
        symbol: r.symbol || r.pair || '',
        price: r.price ?? 0,
        change24h: r.change24h ?? 0,
        alphaScore: r.snapshot?.alphaScore ?? r.alphaScore ?? 0,
        alphaLabel: r.snapshot?.alphaLabel ?? r.alphaLabel ?? '---',
        regime: r.snapshot?.regime ?? r.regime ?? '---',
        flags: extractFlags(r.snapshot),
        snapshot: r.snapshot ?? {},
      }));
      scanTotal = scanResults.length;
      scanProgress = scanTotal;
    } catch (err: any) {
      scanError = err?.message || 'Scan failed';
      scanResults = [];
    } finally {
      isScanning = false;
    }
  }

  function extractFlags(snapshot: Record<string, any> | undefined): string[] {
    if (!snapshot) return [];
    const flags: string[] = [];

    // L01 Wyckoff accumulation/distribution phase
    if (snapshot.l1?.phase && /accum|distrib/i.test(snapshot.l1.phase)) {
      flags.push('wyckoff');
    }

    // L10 MTF triple confluence
    if (snapshot.l10?.mtf_confluence === 'TRIPLE') {
      flags.push('mtf_triple');
    }

    // L14 Bollinger Band squeeze
    if (snapshot.l14?.bb_squeeze) {
      flags.push('bb_squeeze');
    }

    // L02 extreme funding rate
    if (snapshot.l2?.fr != null && Math.abs(snapshot.l2.fr) > 0.001) {
      flags.push('fr_extreme');
    }

    // L09 liquidation alert
    const liqTotal = (snapshot.l9?.liq_long_usd ?? 0) + (snapshot.l9?.liq_short_usd ?? 0);
    if (liqTotal > 5_000_000) {
      flags.push('liq_alert');
    }

    return flags;
  }

  // ━━━ Formatters ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function fmtPrice(v: number): string {
    if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (v >= 1) return v.toFixed(4);
    return v.toPrecision(4);
  }

  function fmtChange(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  }

  function alphaClass(score: number): string {
    if (score >= 60) return 'strong-bull';
    if (score >= 20) return 'bull';
    if (score > -20) return 'neutral';
    if (score > -60) return 'bear';
    return 'strong-bear';
  }

  function sortIndicator(col: SortColumn): string {
    if (sortCol !== col) return '';
    return sortDir === -1 ? ' \u25BC' : ' \u25B2';
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && deepDiveOpen) closeDeepDive(); }} />

<div class="scanner">
  <!-- ━━━ Scan Controls ━━━ -->
  <div class="controls">
    <div class="controls-left">
      <!-- Mode toggle -->
      <div class="mode-group">
        <button
          class="mode-btn"
          class:active={scanMode === 'topN'}
          onclick={() => { scanMode = 'topN'; }}
        >
          Top N
        </button>
        <button
          class="mode-btn"
          class:active={scanMode === 'custom'}
          onclick={() => { scanMode = 'custom'; }}
        >
          Custom
        </button>
      </div>

      {#if scanMode === 'topN'}
        <select
          class="topn-select"
          bind:value={topN}
        >
          {#each TOP_N_OPTIONS as n}
            <option value={n}>{n}</option>
          {/each}
        </select>
      {:else}
        <input
          class="custom-input"
          type="text"
          placeholder="BTC, ETH, SOL..."
          bind:value={customSymbols}
          onkeydown={(e) => { if (e.key === 'Enter') runScan(); }}
        />
      {/if}

      <!-- Preset buttons -->
      <div class="presets">
        {#each PRESETS as preset}
          <button
            class="preset-btn"
            onclick={() => applyPreset(preset)}
            disabled={isScanning}
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="controls-right">
      {#if isScanning}
        <div class="progress">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <span class="progress-text">SCANNING...</span>
        </div>
      {/if}

      <button
        class="scan-btn"
        onclick={runScan}
        disabled={isScanning}
      >
        {isScanning ? 'SCANNING...' : 'SCAN'}
      </button>
    </div>
  </div>

  <!-- ━━━ Filter Tabs + Search ━━━ -->
  <div class="filter-bar">
    <div class="filter-tabs">
      {#each FILTER_TABS as tab}
        <button
          class="filter-tab"
          class:active={activeFilter === tab.key}
          onclick={() => { activeFilter = tab.key; }}
        >
          {tab.label}
          {#if tab.key === 'WATCHLIST'}
            <span class="tab-count">{watchlist.size}</span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="search-box">
      <span class="search-icon">/</span>
      <input
        class="search-input"
        type="text"
        placeholder="Filter symbol..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button class="search-clear" onclick={() => { searchQuery = ''; }}>x</button>
      {/if}
    </div>
  </div>

  <!-- ━━━ Results Table ━━━ -->
  <div class="table-wrap">
    {#if scanError}
      <div class="state-msg error">
        <span class="state-icon">!</span>
        <span class="state-text">{scanError}</span>
        <button class="retry-btn" onclick={runScan}>RETRY</button>
      </div>
    {:else if scanResults.length === 0 && !isScanning}
      <div class="state-msg empty">
        <div class="empty-diamond">&#x25C8;</div>
        <span class="state-text">NO SCAN DATA</span>
        <span class="state-hint">
          Select a mode and press SCAN to begin analysis
        </span>
      </div>
    {:else if filteredResults.length === 0 && scanResults.length > 0}
      <div class="state-msg empty">
        <span class="state-text">NO MATCHES</span>
        <span class="state-hint">
          {activeFilter !== 'ALL' ? `No results for ${activeFilter} filter` : 'Try adjusting your search'}
        </span>
      </div>
    {:else}
      <table class="scan-table">
        <thead>
          <tr>
            <th class="th-idx">#</th>
            <th class="th-star"></th>
            <th
              class="th-symbol sortable"
              onclick={() => handleSort('symbol')}
            >
              Symbol{sortIndicator('symbol')}
            </th>
            <th
              class="th-price sortable"
              onclick={() => handleSort('price')}
            >
              Price{sortIndicator('price')}
            </th>
            <th
              class="th-change sortable"
              onclick={() => handleSort('change24h')}
            >
              24H%{sortIndicator('change24h')}
            </th>
            <th
              class="th-alpha sortable"
              onclick={() => handleSort('alphaScore')}
            >
              Alpha{sortIndicator('alphaScore')}
            </th>
            <th class="th-verdict">Verdict</th>
            <th
              class="th-regime sortable"
              onclick={() => handleSort('regime')}
            >
              Regime{sortIndicator('regime')}
            </th>
            <th class="th-flags">Flags</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredResults as result, idx}
            <tr
              class="scan-row"
              class:selected={selectedSnapshot?.symbol === result.symbol}
              onclick={() => selectRow(result)}
            >
              <td class="td-idx">{idx + 1}</td>
              <td class="td-star">
                <button
                  class="star-btn"
                  class:starred={watchlist.has(result.symbol)}
                  onclick={(e) => { e.stopPropagation(); toggleWatchlist(result.symbol); }}
                  title={watchlist.has(result.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  {watchlist.has(result.symbol) ? '\u2605' : '\u2606'}
                </button>
              </td>
              <td class="td-symbol">{result.symbol.replace('USDT', '')}</td>
              <td class="td-price">{fmtPrice(result.price)}</td>
              <td class="td-change" class:bull={result.change24h > 0} class:bear={result.change24h < 0}>
                {fmtChange(result.change24h)}
              </td>
              <td class="td-alpha {alphaClass(result.alphaScore)}">
                {result.alphaScore}
              </td>
              <td class="td-verdict">
                <span class="verdict-badge {alphaClass(result.alphaScore)}">
                  {result.alphaLabel}
                </span>
              </td>
              <td class="td-regime">{result.regime}</td>
              <td class="td-flags">
                {#each result.flags as flag}
                  <span class="flag-icon" title={flag}>{FLAG_MAP[flag] ?? ''}</span>
                {/each}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if isScanning}
      <div class="scan-overlay">
        <div class="scan-spinner"></div>
        <span class="scan-overlay-text">Analyzing {scanMode === 'topN' ? `top ${topN}` : 'symbols'}...</span>
      </div>
    {/if}
  </div>

  <!-- ━━━ Status Bar ━━━ -->
  <div class="status-bar">
    <span class="status-left">
      {filteredResults.length}/{scanResults.length} results
      {#if activeFilter !== 'ALL'}
        &middot; {activeFilter}
      {/if}
    </span>
    <span class="status-right">
      {#if scanResults.length > 0}
        Sorted by {sortCol} {sortDir === -1 ? 'DESC' : 'ASC'}
      {/if}
    </span>
  </div>

  <!-- ━━━ Deep Dive Slide-over ━━━ -->
  {#if deepDiveOpen && selectedSnapshot}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="deepdive-backdrop" onclick={closeDeepDive}></div>
    <aside class="deepdive-panel">
      <div class="dd-header">
        <div class="dd-title">
          <span class="dd-symbol">{selectedSnapshot.symbol.replace('USDT', '')}</span>
          <span class="dd-price">{fmtPrice(selectedSnapshot.price)}</span>
          <span class="dd-change" class:bull={selectedSnapshot.change24h > 0} class:bear={selectedSnapshot.change24h < 0}>
            {fmtChange(selectedSnapshot.change24h)}
          </span>
        </div>
        <button class="dd-close" onclick={closeDeepDive}>ESC</button>
      </div>

      <div class="dd-alpha-bar">
        <div class="dd-alpha-top">
          <span class="dd-alpha-label">ALPHA SCORE</span>
          <span class="dd-alpha-regime">{selectedSnapshot.regime}</span>
        </div>
        <div class="dd-alpha-bottom">
          <span class="dd-alpha-val {alphaClass(selectedSnapshot.alphaScore)}">{selectedSnapshot.alphaScore}</span>
          <span class="dd-alpha-tag {alphaClass(selectedSnapshot.alphaScore)}">{selectedSnapshot.alphaLabel}</span>
        </div>
      </div>

      <!-- Layer detail grid -->
      <div class="dd-layers">
        <div class="dd-layers-title">LAYER BREAKDOWN</div>
        {#if selectedSnapshot.snapshot && Object.keys(selectedSnapshot.snapshot).length > 0}
          {#each layerRows(selectedSnapshot.snapshot) as layer}
            <div class="dd-layer-row" class:hot={Math.abs(layer.score) >= 15}>
              <span class="dd-lr-id">{layer.id}</span>
              <span class="dd-lr-name">{layer.name}</span>
              <div class="dd-lr-bar-wrap">
                <div class="dd-lr-bar-track">
                  <div class="dd-lr-center"></div>
                  {#if layer.score !== 0}
                    <div
                      class="dd-lr-bar"
                      class:bear={layer.score < 0}
                      class:bull={layer.score > 0}
                      style="width:{barPct(layer.score, layer.max) / 2}%;{layer.score < 0 ? 'right:50%' : 'left:50%'}"
                    ></div>
                  {/if}
                </div>
              </div>
              <span class="dd-lr-val" class:c-bull={layer.score > 0} class:c-bear={layer.score < 0}>{layer.val}</span>
              <span class="dd-lr-score" class:c-bull={layer.score > 0} class:c-bear={layer.score < 0}>
                {layer.score !== 0 ? (layer.score > 0 ? '+' : '') + layer.score : '\u00B7'}
              </span>
            </div>
          {/each}
        {:else}
          <div class="dd-no-layers">No layer data available</div>
        {/if}
      </div>

      <!-- Flags summary -->
      {#if selectedSnapshot.flags.length > 0}
        <div class="dd-flags">
          <div class="dd-flags-title">ACTIVE FLAGS</div>
          <div class="dd-flags-list">
            {#each selectedSnapshot.flags as flag}
              <span class="dd-flag-chip">
                <span class="dd-flag-icon">{FLAG_MAP[flag] ?? ''}</span>
                <span class="dd-flag-name">{flag.replace('_', ' ').toUpperCase()}</span>
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </aside>
  {/if}
</div>

<style>
  /* ━━━ Layout ━━━ */
  .scanner {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: var(--font-sans, 'IBM Plex Sans', sans-serif);
    position: relative;
  }

  /* ━━━ Scan Controls ━━━ */
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: var(--cg-surface, #0a0a11);
    border-bottom: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .controls-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .controls-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .mode-group {
    display: flex;
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    overflow: hidden;
  }

  .mode-btn {
    background: transparent;
    border: none;
    color: var(--cg-text-dim, #505078);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .mode-btn:hover {
    color: var(--cg-text, #c8c8e0);
    background: var(--cg-surface-2, #0e0e17);
  }

  .mode-btn.active {
    color: var(--cg-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.08);
  }

  .topn-select {
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    color: var(--cg-text, #c8c8e0);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    padding: 4px 8px;
    cursor: pointer;
    outline: none;
  }

  .topn-select:focus {
    border-color: var(--cg-cyan, #00e5ff);
  }

  .custom-input {
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    color: var(--cg-text, #c8c8e0);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    padding: 4px 8px;
    width: 180px;
    outline: none;
  }

  .custom-input::placeholder {
    color: var(--cg-text-muted, #383860);
  }

  .custom-input:focus {
    border-color: var(--cg-cyan, #00e5ff);
  }

  .presets {
    display: flex;
    gap: 4px;
  }

  .preset-btn {
    background: transparent;
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 3px;
    color: var(--cg-text-dim, #505078);
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .preset-btn:hover:not(:disabled) {
    color: var(--cg-text, #c8c8e0);
    border-color: var(--cg-border-strong, #1e1e38);
    background: var(--cg-surface-2, #0e0e17);
  }

  .preset-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .progress-bar {
    width: 60px;
    height: 3px;
    background: var(--cg-surface-2, #0e0e17);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    width: 100%;
    background: var(--cg-cyan, #00e5ff);
    border-radius: 2px;
    animation: pulse-progress 1.2s ease-in-out infinite;
  }

  @keyframes pulse-progress {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .progress-text {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--cg-cyan, #00e5ff);
  }

  .scan-btn {
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 4px;
    color: var(--cg-cyan, #00e5ff);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.5px;
    padding: 5px 16px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .scan-btn:hover:not(:disabled) {
    background: rgba(0, 229, 255, 0.18);
    border-color: rgba(0, 229, 255, 0.5);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
  }

  .scan-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ━━━ Filter Bar ━━━ */
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 12px;
    height: 32px;
    background: var(--cg-surface, #0a0a11);
    border-bottom: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
  }

  .filter-tabs {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filter-tabs::-webkit-scrollbar {
    display: none;
  }

  .filter-tab {
    background: transparent;
    border: none;
    color: var(--cg-text-muted, #383860);
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.8px;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .filter-tab:hover {
    color: var(--cg-text-dim, #505078);
    background: var(--cg-surface-2, #0e0e17);
  }

  .filter-tab.active {
    color: var(--cg-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.06);
  }

  .tab-count {
    font-size: 8px;
    background: rgba(0, 229, 255, 0.12);
    color: var(--cg-cyan, #00e5ff);
    padding: 1px 4px;
    border-radius: 2px;
    font-variant-numeric: tabular-nums;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 3px;
    padding: 0 6px;
    height: 22px;
    flex-shrink: 0;
  }

  .search-icon {
    color: var(--cg-text-muted, #383860);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
  }

  .search-input {
    background: transparent;
    border: none;
    color: var(--cg-text, #c8c8e0);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    width: 100px;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--cg-text-muted, #383860);
  }

  .search-clear {
    background: transparent;
    border: none;
    color: var(--cg-text-muted, #383860);
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .search-clear:hover {
    color: var(--cg-text-dim, #505078);
  }

  /* ━━━ Table ━━━ */
  .table-wrap {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .table-wrap::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  .table-wrap::-webkit-scrollbar-thumb {
    background: var(--cg-border, #16162a);
    border-radius: 2px;
  }

  .scan-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    min-width: 700px;
  }

  .scan-table thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .scan-table th {
    background: var(--cg-surface, #0a0a11);
    border-bottom: 1px solid var(--cg-border-strong, #1e1e38);
    color: var(--cg-text-muted, #383860);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 6px 8px;
    text-align: left;
    white-space: nowrap;
    user-select: none;
  }

  .scan-table th.sortable {
    cursor: pointer;
    transition: color 0.12s;
  }

  .scan-table th.sortable:hover {
    color: var(--cg-text-dim, #505078);
  }

  .th-idx { width: 28px; text-align: center; }
  .th-star { width: 28px; text-align: center; }
  .th-symbol { min-width: 70px; }
  .th-price { text-align: right; min-width: 80px; }
  .th-change { text-align: right; min-width: 60px; }
  .th-alpha { text-align: right; min-width: 50px; }
  .th-verdict { min-width: 80px; }
  .th-regime { min-width: 70px; }
  .th-flags { min-width: 80px; }

  /* ━━━ Table Rows ━━━ */
  .scan-row {
    height: 28px;
    cursor: pointer;
    transition: background 0.08s;
    border-bottom: 1px solid rgba(22, 22, 42, 0.5);
  }

  .scan-row:hover {
    background: rgba(255, 255, 255, 0.015);
  }

  .scan-row.selected {
    background: rgba(0, 229, 255, 0.04);
    border-left: 2px solid var(--cg-cyan, #00e5ff);
  }

  .scan-row td {
    padding: 0 8px;
    vertical-align: middle;
    white-space: nowrap;
  }

  .td-idx {
    text-align: center;
    color: var(--cg-text-muted, #383860);
    font-size: 9px;
    font-weight: 600;
  }

  .td-star {
    text-align: center;
    padding: 0 4px;
  }

  .star-btn {
    background: transparent;
    border: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--cg-text-muted, #383860);
    padding: 0;
    line-height: 1;
    transition: color 0.12s;
  }

  .star-btn:hover {
    color: var(--cg-orange, #ff9f43);
  }

  .star-btn.starred {
    color: var(--cg-orange, #ff9f43);
  }

  .td-symbol {
    font-weight: 700;
    color: var(--cg-text, #c8c8e0);
    font-size: 11px;
    letter-spacing: 0.5px;
  }

  .td-price {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--cg-text, #c8c8e0);
    font-size: 10px;
  }

  .td-change {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    font-weight: 600;
    color: var(--cg-text-dim, #505078);
  }

  .td-change.bull { color: var(--cg-cyan, #00e5ff); }
  .td-change.bear { color: var(--cg-red, #ff3860); }

  .td-alpha {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .td-alpha.strong-bull,
  .td-alpha.bull { color: var(--cg-cyan, #00e5ff); }
  .td-alpha.strong-bear,
  .td-alpha.bear { color: var(--cg-red, #ff3860); }
  .td-alpha.neutral { color: var(--cg-text-dim, #505078); }

  .verdict-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .verdict-badge.strong-bull,
  .verdict-badge.bull {
    color: var(--cg-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.08);
  }

  .verdict-badge.strong-bear,
  .verdict-badge.bear {
    color: var(--cg-red, #ff3860);
    background: rgba(255, 56, 96, 0.08);
  }

  .verdict-badge.neutral {
    color: var(--cg-text-dim, #505078);
    background: rgba(80, 80, 120, 0.1);
  }

  .td-regime {
    font-size: 9px;
    font-weight: 500;
    color: var(--cg-text-dim, #505078);
    letter-spacing: 0.3px;
  }

  .td-flags {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 28px;
  }

  .flag-icon {
    font-size: 11px;
    cursor: default;
    opacity: 0.85;
    transition: opacity 0.1s;
  }

  .flag-icon:hover {
    opacity: 1;
  }

  /* ━━━ State Messages ━━━ */
  .state-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 8px;
    font-family: var(--font-mono, monospace);
  }

  .state-msg.error .state-icon {
    font-size: 18px;
    color: var(--cg-red, #ff3860);
    font-weight: 700;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--cg-red, #ff3860);
    border-radius: 50%;
  }

  .state-msg.error .state-text {
    font-size: 11px;
    color: var(--cg-red, #ff3860);
    font-weight: 500;
  }

  .retry-btn {
    margin-top: 8px;
    background: rgba(255, 56, 96, 0.1);
    border: 1px solid rgba(255, 56, 96, 0.3);
    border-radius: 4px;
    color: var(--cg-red, #ff3860);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 4px 12px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .retry-btn:hover {
    background: rgba(255, 56, 96, 0.18);
  }

  .empty-diamond {
    font-size: 24px;
    color: var(--cg-cyan, #00e5ff);
    opacity: 0.3;
  }

  .state-msg.empty .state-text {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--cg-text-dim, #505078);
    opacity: 0.6;
  }

  .state-hint {
    font-size: 9px;
    color: var(--cg-text-muted, #383860);
    opacity: 0.6;
  }

  /* ━━━ Scan Overlay ━━━ */
  .scan-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(6, 6, 11, 0.85);
    z-index: 5;
  }

  .scan-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--cg-border, #16162a);
    border-top-color: var(--cg-cyan, #00e5ff);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .scan-overlay-text {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--cg-text-dim, #505078);
  }

  /* ━━━ Status Bar ━━━ */
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    padding: 0 12px;
    background: var(--cg-surface, #0a0a11);
    border-top: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    color: var(--cg-text-muted, #383860);
  }

  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* ━━━ Deep Dive Panel ━━━ */
  .deepdive-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 10;
  }

  .deepdive-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    max-width: 90vw;
    background: var(--cg-surface, #0a0a11);
    border-left: 1px solid var(--cg-border-strong, #1e1e38);
    z-index: 11;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slide-in 0.15s ease-out;
    font-family: var(--font-mono, monospace);
  }

  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .dd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
  }

  .dd-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .dd-symbol {
    font-size: 16px;
    font-weight: 700;
    color: var(--cg-text, #c8c8e0);
    letter-spacing: 1px;
  }

  .dd-price {
    font-size: 12px;
    font-weight: 500;
    color: var(--cg-text, #c8c8e0);
    font-variant-numeric: tabular-nums;
  }

  .dd-change {
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .dd-change.bull { color: var(--cg-cyan, #00e5ff); }
  .dd-change.bear { color: var(--cg-red, #ff3860); }

  .dd-close {
    background: transparent;
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 3px;
    color: var(--cg-text-muted, #383860);
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .dd-close:hover {
    color: var(--cg-text-dim, #505078);
    border-color: var(--cg-border-strong, #1e1e38);
  }

  .dd-alpha-bar {
    padding: 10px 14px;
    border-bottom: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
  }

  .dd-alpha-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .dd-alpha-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1.5px;
    color: var(--cg-text-muted, #383860);
  }

  .dd-alpha-regime {
    font-size: 9px;
    font-weight: 500;
    color: var(--cg-text-dim, #505078);
    letter-spacing: 0.5px;
  }

  .dd-alpha-bottom {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .dd-alpha-val {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .dd-alpha-val.strong-bull,
  .dd-alpha-val.bull { color: var(--cg-cyan, #00e5ff); }
  .dd-alpha-val.strong-bear,
  .dd-alpha-val.bear { color: var(--cg-red, #ff3860); }
  .dd-alpha-val.neutral { color: var(--cg-text-dim, #505078); }

  .dd-alpha-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .dd-alpha-tag.strong-bull,
  .dd-alpha-tag.bull {
    color: var(--cg-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.08);
  }

  .dd-alpha-tag.strong-bear,
  .dd-alpha-tag.bear {
    color: var(--cg-red, #ff3860);
    background: rgba(255, 56, 96, 0.08);
  }

  .dd-alpha-tag.neutral {
    color: var(--cg-text-dim, #505078);
    background: rgba(80, 80, 120, 0.15);
  }

  /* ━━━ Layer Breakdown ━━━ */
  .dd-layers {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .dd-layers::-webkit-scrollbar { width: 3px; }
  .dd-layers::-webkit-scrollbar-thumb { background: var(--cg-border, #16162a); border-radius: 2px; }

  .dd-layers-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--cg-text-muted, #383860);
    padding: 6px 14px 4px;
  }

  .dd-layer-row {
    display: grid;
    grid-template-columns: 28px 50px 1fr auto 30px;
    gap: 4px;
    padding: 3px 14px;
    align-items: center;
    font-size: 10px;
    transition: background 0.1s;
    border-left: 2px solid transparent;
  }

  .dd-layer-row:hover {
    background: rgba(255, 255, 255, 0.015);
  }

  .dd-layer-row.hot {
    background: rgba(0, 229, 255, 0.02);
    border-left-color: var(--cg-cyan, #00e5ff);
  }

  .dd-lr-id {
    color: var(--cg-text-muted, #383860);
    font-size: 9px;
    font-weight: 600;
  }

  .dd-lr-name {
    color: var(--cg-text-dim, #505078);
    font-size: 10px;
    font-weight: 500;
  }

  .dd-lr-bar-wrap {
    height: 100%;
    display: flex;
    align-items: center;
    min-width: 60px;
  }

  .dd-lr-bar-track {
    position: relative;
    width: 100%;
    height: 3px;
    background: var(--cg-surface-2, #0e0e17);
    border-radius: 1px;
    overflow: hidden;
  }

  .dd-lr-center {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--cg-border, #16162a);
  }

  .dd-lr-bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 1px;
    transition: width 0.3s ease;
  }

  .dd-lr-bar.bull {
    background: var(--cg-cyan, #00e5ff);
    opacity: 0.7;
  }

  .dd-lr-bar.bear {
    background: var(--cg-red, #ff3860);
    opacity: 0.7;
  }

  .dd-lr-val {
    font-size: 9px;
    font-weight: 500;
    color: var(--cg-text-dim, #505078);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70px;
  }

  .dd-lr-score {
    font-size: 9px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--cg-text-dim, #505078);
  }

  .c-bull { color: var(--cg-cyan, #00e5ff) !important; }
  .c-bear { color: var(--cg-red, #ff3860) !important; }

  .dd-no-layers {
    padding: 20px 14px;
    font-size: 10px;
    color: var(--cg-text-muted, #383860);
    text-align: center;
  }

  /* ━━━ Flags Section ━━━ */
  .dd-flags {
    padding: 10px 14px;
    border-top: 1px solid var(--cg-border, #16162a);
    flex-shrink: 0;
  }

  .dd-flags-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--cg-text-muted, #383860);
    margin-bottom: 6px;
  }

  .dd-flags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .dd-flag-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--cg-surface-2, #0e0e17);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 3px;
  }

  .dd-flag-icon {
    font-size: 11px;
  }

  .dd-flag-name {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--cg-text-dim, #505078);
  }

  /* ━━━ Responsive ━━━ */
  @media (max-width: 768px) {
    .presets {
      display: none;
    }

    .deepdive-panel {
      width: 100%;
      max-width: 100%;
    }

    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .controls-left,
    .controls-right {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
