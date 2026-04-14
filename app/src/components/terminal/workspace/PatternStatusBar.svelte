<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface PatternSignalItem {
    symbol: string;
    slug: string;
    phase: string;
  }

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
    return `${item.slug}:${item.symbol}:${item.phase}`;
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
      // Flatten entry_candidates into symbol list
      const flat: PatternSignalItem[] = [];
      // Support both response shapes: engine direct (entry_candidates) and proxy (candidates)
      const candidates = data.entry_candidates ?? {};
      if (Object.keys(candidates).length > 0) {
        for (const [slug, symbols] of Object.entries(candidates)) {
          for (const sym of (symbols as string[])) {
            flat.push({ symbol: sym, slug, phase: 'ACCUMULATION' });
          }
        }
      } else if (Array.isArray(data.candidates)) {
        for (const c of data.candidates) {
          flat.push({ symbol: c.symbol, slug: c.pattern_id, phase: c.phase_name ?? 'ACCUMULATION' });
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
    <button class="signal-pill" class:fresh={freshKeys.has(itemKey(item))} onclick={() => onSelect?.(item)}>
      <span class="sig-dot"></span>
      <span class="sig-sym">{item.symbol.replace('USDT', '')}</span>
      <span class="sig-phase">{item.phase}</span>
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
</style>
