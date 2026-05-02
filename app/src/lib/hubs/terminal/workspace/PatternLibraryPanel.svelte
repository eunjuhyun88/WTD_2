<script lang="ts">
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface Props {
    open: boolean;
    records: PatternCaptureRecord[];
    loading?: boolean;
    onClose?: () => void;
    onSelect?: (record: PatternCaptureRecord) => void;
  }

  let { open, records, loading = false, onClose, onSelect }: Props = $props();

  let symbolFilter = $state('');
  let timeframeFilter = $state('');
  let verdictFilter = $state('');
  let originFilter = $state('');

  let filtered = $derived.by(() =>
    records.filter((record) => {
      if (symbolFilter && !record.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
      if (timeframeFilter && record.timeframe !== timeframeFilter) return false;
      if (verdictFilter && (record.decision.verdict ?? '') !== verdictFilter) return false;
      if (originFilter && record.triggerOrigin !== originFilter) return false;
      return true;
    })
  );
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pattern-sheet-backdrop" role="presentation" tabindex="-1" onclick={onClose} onkeydown={(event) => event.key === 'Escape' && onClose?.()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="pattern-sheet" role="dialog" aria-modal="true" tabindex="0" onclick={(event) => event.stopPropagation()} onkeydown={() => {}}>
      <header>
        <h3>Pattern Library</h3>
        <button type="button" onclick={onClose} aria-label="Close pattern library">x</button>
      </header>
      <section class="filters">
        <input placeholder="Symbol" bind:value={symbolFilter} />
        <select bind:value={timeframeFilter}>
          <option value="">All TF</option>
          <option value="1h">1H</option>
          <option value="4h">4H</option>
          <option value="1d">1D</option>
        </select>
        <select bind:value={verdictFilter}>
          <option value="">All Verdict</option>
          <option value="bullish">Bullish</option>
          <option value="bearish">Bearish</option>
          <option value="neutral">Neutral</option>
        </select>
        <select bind:value={originFilter}>
          <option value="">All Origins</option>
          <option value="manual">Manual</option>
          <option value="alert">Alert</option>
          <option value="anomaly">Anomaly</option>
          <option value="pattern_transition">Pattern Transition</option>
        </select>
      </section>
      <section class="rows">
        {#if loading}
          <p class="empty">Loading saved patterns...</p>
        {:else if filtered.length === 0}
          <p class="empty">No saved patterns match current filters.</p>
        {:else}
          {#each filtered as record}
            <button type="button" class="row" onclick={() => onSelect?.(record)}>
              <div>
                <strong>{record.symbol.replace('USDT', '')}</strong>
                <small>{record.timeframe.toUpperCase()} · {record.triggerOrigin}</small>
              </div>
              <div class="right">
                <span>{record.decision.verdict ?? '—'}</span>
                <small>{new Date(record.updatedAt).toLocaleString()}</small>
              </div>
            </button>
          {/each}
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .pattern-sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 50; display: flex; justify-content: flex-end; }
  .pattern-sheet { width: min(560px, 92vw); height: 100%; background: #0b0e14; border-left: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-rows: auto auto 1fr; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  h3 { margin: 0; font-family: var(--sc-font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(247,242,234,0.8); }
  header button { border: 1px solid rgba(255,255,255,0.12); background: transparent; color: rgba(247,242,234,0.65); border-radius: 3px; padding: 2px 6px; cursor: pointer; }
  .filters { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  input, select { background: rgba(255,255,255,0.04); color: rgba(247,242,234,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; font-size: 12px; padding: 6px 8px; }
  .rows { overflow-y: auto; padding: 8px; display: grid; gap: 4px; }
  .row { width: 100%; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; background: rgba(255,255,255,0.02); padding: 8px; display: flex; justify-content: space-between; gap: 8px; text-align: left; cursor: pointer; }
  .row strong { font-family: var(--sc-font-mono); font-size: 11px; color: rgba(247,242,234,0.88); }
  .row small { display: block; font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: rgba(247,242,234,0.42); }
  .right { text-align: right; }
  .right span { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: rgba(131,188,255,0.8); text-transform: uppercase; }
  .empty { margin: 12px; font-size: 12px; color: rgba(247,242,234,0.45); }
</style>
