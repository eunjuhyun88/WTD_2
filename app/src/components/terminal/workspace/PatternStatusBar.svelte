<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    patternCaptureContextStore,
    type PatternCaptureContext as PatternSignalItem,
  } from '$lib/stores/patternCaptureContext';

  interface Props {
    pollMs?: number;
    onSelect?: (item: PatternSignalItem) => void;
    onTransition?: (items: PatternSignalItem[]) => void;
  }
  let { pollMs = 60_000, onSelect, onTransition }: Props = $props();

  // Poll /api/patterns every 60 seconds
  let entrySymbols = $state<PatternSignalItem[]>([]);
  let loading = $state(true);
  let interval: ReturnType<typeof setInterval> | null = null;
  let freshKeys = $state(new Set<string>());
  let seenKeys = new Set<string>();
  let hydrated = false;

  function itemKey(item: PatternSignalItem): string {
    return `${item.slug}:${item.symbol}:${item.phase}:${item.candidateTransitionId ?? item.transitionId ?? ''}`;
  }

  function normalizeCandidateRecord(record: Record<string, unknown>): PatternSignalItem | null {
    const symbol = typeof record.symbol === 'string' ? record.symbol : '';
    const slug = typeof record.slug === 'string'
      ? record.slug
      : typeof record.pattern_slug === 'string'
        ? record.pattern_slug
        : '';
    if (!symbol || !slug) return null;
    return {
      symbol,
      slug,
      phase: typeof record.phase === 'string' ? record.phase : 'ACCUMULATION',
      phaseLabel: typeof record.phase_label === 'string' ? record.phase_label : undefined,
      patternSlug: typeof record.pattern_slug === 'string' ? record.pattern_slug : slug,
      patternVersion: typeof record.pattern_version === 'number' ? record.pattern_version : undefined,
      timeframe: typeof record.timeframe === 'string' ? record.timeframe : undefined,
      transitionId: typeof record.transition_id === 'string' ? record.transition_id : null,
      candidateTransitionId: typeof record.candidate_transition_id === 'string' ? record.candidate_transition_id : null,
      scanId: typeof record.scan_id === 'string' ? record.scan_id : null,
      blockScores: typeof record.block_scores === 'object' && record.block_scores !== null
        ? record.block_scores as Record<string, unknown>
        : undefined,
      featureSnapshot: typeof record.feature_snapshot === 'object' && record.feature_snapshot !== null
        ? record.feature_snapshot as Record<string, unknown>
        : null,
    };
  }

  function markFresh(items: PatternSignalItem[]) {
    const next = new Set(freshKeys);
    for (const item of items) next.add(itemKey(item));
    freshKeys = next;

    setTimeout(() => {
      const current = new Set(freshKeys);
      for (const item of items) current.delete(itemKey(item));
      freshKeys = current;
    }, 90_000);
  }

  async function fetchPatterns() {
    try {
      const res = await fetch('/api/patterns');
      if (!res.ok) return;
      const data = await res.json();
      const flat: PatternSignalItem[] = [];

      const richRecords = Array.isArray(data.candidate_records) ? data.candidate_records : [];
      for (const record of richRecords) {
        const item = normalizeCandidateRecord(record as Record<string, unknown>);
        if (item) flat.push(item);
      }
      patternCaptureContextStore.setRecords(flat);

      const candidates = data.entry_candidates ?? {};
      if (flat.length === 0 && Object.keys(candidates).length > 0) {
        for (const [slug, symbols] of Object.entries(candidates)) {
          for (const sym of (symbols as string[])) {
            flat.push({ symbol: sym, slug, phase: 'ACCUMULATION' });
          }
        }
      }

      const nextKeys = new Set(flat.map(itemKey));
      if (hydrated) {
        const fresh = flat.filter((item) => !seenKeys.has(itemKey(item)));
        if (fresh.length > 0) {
          markFresh(fresh);
          onTransition?.(fresh);
        }
      }

      seenKeys = nextKeys;
      hydrated = true;
      entrySymbols = [...flat].sort((a, b) => {
        const aFresh = freshKeys.has(itemKey(a)) ? 1 : 0;
        const bFresh = freshKeys.has(itemKey(b)) ? 1 : 0;
        return bFresh - aFresh || a.symbol.localeCompare(b.symbol);
      });
    } catch {
      // silent
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchPatterns();
    interval = setInterval(fetchPatterns, pollMs);
  });

  onDestroy(() => { if (interval) clearInterval(interval); });
</script>

{#if entrySymbols.length > 0}
<div class="pattern-bar">
  <span class="bar-label">ENTRY SIGNALS</span>
  {#each entrySymbols as item}
    <button
      class="signal-pill"
      class:fresh={freshKeys.has(itemKey(item))}
      onclick={() => {
        patternCaptureContextStore.select(item);
        onSelect?.(item);
      }}
    >
      <span class="sig-dot"></span>
      <span class="sig-sym">{item.symbol.replace('USDT', '')}</span>
      <span class="sig-phase">{item.phase}</span>
      {#if item.candidateTransitionId}
        <span class="sig-link">CAP</span>
      {/if}
      {#if freshKeys.has(itemKey(item))}
        <span class="sig-new">NEW</span>
      {/if}
    </button>
  {/each}
</div>
{/if}

<style>
  .pattern-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: rgba(74, 222, 128, 0.05);
    border-bottom: 1px solid rgba(74, 222, 128, 0.15);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .bar-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    color: rgba(74, 222, 128, 0.6);
    letter-spacing: 0.1em;
    white-space: nowrap;
    margin-right: 4px;
  }

  .signal-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    background: rgba(74, 222, 128, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.2);
    border-radius: 3px;
    white-space: nowrap;
    cursor: pointer;
    appearance: none;
    color: inherit;
  }

  .signal-pill:hover {
    background: rgba(74, 222, 128, 0.15);
  }

  .signal-pill.fresh {
    background: rgba(74, 222, 128, 0.18);
    border-color: rgba(74, 222, 128, 0.38);
    box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.1), 0 0 20px rgba(74, 222, 128, 0.12);
  }

  .sig-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #4ade80;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .sig-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: #4ade80;
  }

  .sig-phase {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(74, 222, 128, 0.5);
  }

  .sig-new {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    color: #08130c;
    background: #4ade80;
    border-radius: 999px;
    padding: 1px 5px;
    letter-spacing: 0.08em;
  }

  .sig-link {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    color: rgba(74, 222, 128, 0.8);
    border: 1px solid rgba(74, 222, 128, 0.22);
    border-radius: 999px;
    padding: 1px 5px;
    letter-spacing: 0.06em;
  }
</style>
