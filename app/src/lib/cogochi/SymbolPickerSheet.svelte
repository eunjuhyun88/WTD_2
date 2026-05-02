<script lang="ts">
  interface Props {
    currentSymbol: string;
    onSelect: (sym: string) => void;
    onClose: () => void;
  }

  const { currentSymbol, onSelect, onClose }: Props = $props();

  interface SymbolEntry { symbol: string; base: string; }

  let query = $state('');
  let results = $state<SymbolEntry[]>([]);
  let loading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => { inputEl?.focus(); });

  // Debounced fetch on query change
  $effect(() => {
    const q = query;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSymbols(q), 250);
  });

  async function fetchSymbols(q: string) {
    loading = true;
    try {
      const url = q.trim()
        ? `/api/market/symbols?q=${encodeURIComponent(q.trim())}&limit=40`
        : `/api/market/symbols?limit=30`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as { symbols: SymbolEntry[] };
        results = data.symbols;
      }
    } catch {
      // leave results as-is on network error
    } finally {
      loading = false;
    }
  }

  // Initial load on mount
  $effect(() => { fetchSymbols(''); });

  function pick(sym: string) {
    onSelect(sym);
    onClose();
  }

  function onBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('sps-backdrop')) onClose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sps-backdrop" onclick={onBackdropClick}>
  <div class="sps-sheet">
    <div class="sps-handle-bar"><div class="sps-handle"></div></div>
    <div class="sps-search">
      <span class="sps-icon">⌕</span>
      <input
        bind:this={inputEl}
        bind:value={query}
        class="sps-input"
        placeholder="심볼 검색 (예: BTC, SOL, INJ)"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="characters"
        spellcheck={false}
      />
      {#if loading}
        <span class="sps-spinner"></span>
      {:else if query}
        <button class="sps-clear" onclick={() => (query = '')}>×</button>
      {/if}
    </div>
    <div class="sps-list">
      {#each results as entry (entry.symbol)}
        <button
          class="sps-row"
          class:active={entry.symbol === currentSymbol}
          onclick={() => pick(entry.symbol)}
        >
          <span class="sps-base">{entry.base}</span>
          <span class="sps-quote">/ USDT</span>
          {#if entry.symbol === currentSymbol}
            <span class="sps-check">✓</span>
          {/if}
        </button>
      {/each}
      {#if !loading && results.length === 0}
        <div class="sps-empty">검색 결과 없음</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .sps-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 300;
    display: flex;
    align-items: flex-end;
  }

  .sps-sheet {
    width: 100%;
    max-height: 70vh;
    background: var(--g1);
    border-top: 1px solid var(--g4);
    border-radius: 10px 10px 0 0;
    display: flex;
    flex-direction: column;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    animation: sheetUp 0.18s ease;
  }

  @keyframes sheetUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  .sps-handle-bar {
    display: flex;
    justify-content: center;
    padding: 8px 0 4px;
    flex-shrink: 0;
  }

  .sps-handle {
    width: 36px;
    height: 4px;
    background: var(--g4);
    border-radius: 2px;
  }

  .sps-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 12px 8px;
    padding: 0 10px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    height: 36px;
    flex-shrink: 0;
  }

  .sps-icon {
    color: var(--g5);
    font-size: 14px;
    flex-shrink: 0;
  }

  .sps-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--g9);
  }

  .sps-input::placeholder { color: var(--g5); }

  .sps-clear {
    color: var(--g5);
    font-size: 16px;
    background: transparent;
    border: none;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }

  .sps-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--g4);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .sps-list {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    padding: 0 8px 8px;
  }

  .sps-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 11px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .sps-row:active,
  .sps-row.active { background: var(--g2); }

  .sps-base {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--g9);
    min-width: 60px;
  }

  .sps-quote {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
  }

  .sps-check {
    margin-left: auto;
    color: var(--brand);
    font-size: 13px;
  }

  .sps-empty {
    padding: 20px 12px;
    font-size: 11px;
    color: var(--g5);
    text-align: center;
  }
</style>
