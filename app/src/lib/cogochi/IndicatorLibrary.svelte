<script lang="ts">
  /**
   * IndicatorLibrary — Phase D-3 left-slide panel (320px).
   * - Debounced search across id / label / synonyms / family.
   * - Family-grouped categories with expand/collapse.
   * - Favorites (★) persisted to localStorage.
   * - Toggle-visible writes to shellStore.visibleIndicators.
   */
  import { shellStore } from './shell.store';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import type { IndicatorDef, IndicatorFamily } from '$lib/indicators/types';

  interface Props {
    open: boolean;
    onClose: () => void;
  }
  const { open, onClose }: Props = $props();

  const FAV_KEY = 'cogochi.indicators.fav';

  function loadFavs(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return new Set(parsed.filter((s) => typeof s === 'string'));
    } catch {}
    return new Set();
  }

  let query        = $state('');
  let debouncedQ   = $state('');
  let favs         = $state<Set<string>>(loadFavs());
  let collapsed    = $state<Record<string, boolean>>({});
  let inputEl: HTMLInputElement | null = $state(null);

  // Debounce search 100ms
  $effect(() => {
    const v = query;
    const t = setTimeout(() => { debouncedQ = v.trim().toLowerCase(); }, 100);
    return () => clearTimeout(t);
  });

  // Auto-focus when opened
  $effect(() => {
    if (open && inputEl) {
      const id = setTimeout(() => inputEl?.focus(), 60);
      return () => clearTimeout(id);
    }
  });

  // Persist favorites
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch {}
  });

  function matches(def: IndicatorDef, q: string): boolean {
    if (!q) return true;
    if (def.id.toLowerCase().includes(q)) return true;
    if (def.label?.toLowerCase().includes(q)) return true;
    if (def.family.toLowerCase().includes(q)) return true;
    if (def.description?.toLowerCase().includes(q)) return true;
    if (def.aiSynonyms?.some((s) => s.toLowerCase().includes(q))) return true;
    return false;
  }

  // [family, defs[]] grouped & filtered
  const groupedDefs = $derived.by((): Array<[IndicatorFamily, IndicatorDef[]]> => {
    const m = new Map<IndicatorFamily, IndicatorDef[]>();
    for (const def of Object.values(INDICATOR_REGISTRY)) {
      if (!matches(def, debouncedQ)) continue;
      const arr = m.get(def.family) ?? [];
      arr.push(def);
      m.set(def.family, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.priority - b.priority);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  const favDefs = $derived.by((): IndicatorDef[] => {
    const arr: IndicatorDef[] = [];
    for (const id of favs) {
      const d = INDICATOR_REGISTRY[id];
      if (d && matches(d, debouncedQ)) arr.push(d);
    }
    return arr;
  });

  const visibleSet = $derived(new Set($shellStore.visibleIndicators));

  const totalMatches = $derived(groupedDefs.reduce((s, [, defs]) => s + defs.length, 0));

  function toggleVisible(id: string) {
    shellStore.toggleIndicatorVisible(id);
  }

  function toggleFav(id: string) {
    const next = new Set(favs);
    if (next.has(id)) next.delete(id); else next.add(id);
    favs = next;
  }

  function toggleFamily(family: string) {
    collapsed = { ...collapsed, [family]: !collapsed[family] };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }
</script>

{#if open}
  <div class="overlay" onclick={onClose} role="presentation"></div>

  <aside class="library" role="dialog" aria-label="Indicator library" aria-modal="false" onkeydown={onKey}>
    <header class="lib-head">
      <span class="lib-title">INDICATORS</span>
      <span class="lib-count">{totalMatches}</span>
      <button class="lib-close" onclick={onClose} title="Close (Esc)" aria-label="Close indicator library">✕</button>
    </header>

    <div class="lib-search">
      <span class="lib-search-icon">⌕</span>
      <input
        bind:this={inputEl}
        bind:value={query}
        type="text"
        class="lib-search-input"
        placeholder="search indicators…"
        aria-label="Search indicators"
      />
      {#if query}
        <button class="lib-search-clear" onclick={() => (query = '')} title="Clear">×</button>
      {/if}
    </div>

    <div class="lib-body">
      {#if favDefs.length > 0}
        <section class="lib-section">
          <div class="lib-section-head">
            <span class="lib-section-label">★ FAVORITES</span>
            <span class="lib-section-count">{favDefs.length}</span>
          </div>
          <ul class="lib-list">
            {#each favDefs as def (def.id)}
              {@const active = visibleSet.has(def.id)}
              <li class="lib-row" class:active>
                <button
                  class="lib-fav active"
                  onclick={() => toggleFav(def.id)}
                  title="Remove from favorites"
                  aria-label="Remove {def.label} from favorites"
                >★</button>
                <button
                  class="lib-row-main"
                  onclick={() => toggleVisible(def.id)}
                  title={def.description ?? def.label}
                  aria-pressed={active}
                >
                  <span class="lib-row-label">{def.label}</span>
                  <span class="lib-row-family">{def.family}</span>
                  {#if active}<span class="lib-row-check">✓</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#each groupedDefs as [family, defs] (family)}
        {@const isCollapsed = collapsed[family]}
        <section class="lib-section">
          <button class="lib-section-head as-button" onclick={() => toggleFamily(family)}>
            <span class="lib-section-arrow">{isCollapsed ? '▶' : '▼'}</span>
            <span class="lib-section-label">{family.toUpperCase()}</span>
            <span class="lib-section-count">{defs.length}</span>
          </button>
          {#if !isCollapsed}
            <ul class="lib-list">
              {#each defs as def (def.id)}
                {@const active = visibleSet.has(def.id)}
                {@const fav = favs.has(def.id)}
                <li class="lib-row" class:active>
                  <button
                    class="lib-fav"
                    class:active={fav}
                    onclick={() => toggleFav(def.id)}
                    title={fav ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={fav ? `Remove ${def.label} from favorites` : `Add ${def.label} to favorites`}
                  >{fav ? '★' : '☆'}</button>
                  <button
                    class="lib-row-main"
                    onclick={() => toggleVisible(def.id)}
                    title={def.description ?? def.label}
                    aria-pressed={active}
                  >
                    <span class="lib-row-label">{def.label}</span>
                    <span class="lib-row-arch" title="Archetype">{def.archetype}</span>
                    {#if active}<span class="lib-row-check">✓</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {:else}
        {#if !groupedDefs.length}
          <div class="lib-empty">no matches</div>
        {/if}
      {/each}
    </div>
  </aside>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 199;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .library {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 320px;
    max-width: 86vw;
    z-index: 200;
    background: var(--g1);
    border-right: 1px solid var(--g4);
    display: flex;
    flex-direction: column;
    font-family: 'JetBrains Mono', monospace;
    color: var(--g8);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.4);
    animation: slideIn 0.2s ease;
  }
  @keyframes slideIn {
    from { transform: translateX(-100%); }
    to   { transform: translateX(0); }
  }

  .lib-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--g3);
    flex-shrink: 0;
  }
  .lib-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    color: var(--g9);
  }
  .lib-count {
    font-size: 9px;
    color: var(--g6);
  }
  .lib-close {
    margin-left: auto;
    background: transparent;
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    color: var(--g6);
    width: 22px;
    height: 22px;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    transition: color 0.1s, border-color 0.1s;
  }
  .lib-close:hover { color: var(--g9); border-color: var(--g6); }

  .lib-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--g3);
    background: var(--g0);
    flex-shrink: 0;
  }
  .lib-search-icon {
    color: var(--g5);
    font-size: 12px;
  }
  .lib-search-input {
    flex: 1;
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 4px;
    color: var(--g9);
    font-family: inherit;
    font-size: 11px;
    padding: 4px 8px;
    outline: none;
    min-width: 0;
  }
  .lib-search-input:focus { border-color: var(--brand); }
  .lib-search-input::placeholder { color: var(--g5); }
  .lib-search-clear {
    background: transparent;
    border: none;
    color: var(--g5);
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }
  .lib-search-clear:hover { color: var(--g8); }

  .lib-body {
    flex: 1;
    overflow-y: auto;
  }

  .lib-section {
    border-bottom: 0.5px solid var(--g3);
  }

  .lib-section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    background: var(--g0);
    border: none;
    color: var(--g6);
    font-family: inherit;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-align: left;
    cursor: default;
  }
  .lib-section-head.as-button { cursor: pointer; }
  .lib-section-head.as-button:hover { color: var(--g9); }

  .lib-section-arrow {
    width: 8px;
    color: var(--g5);
    font-size: 8px;
    flex-shrink: 0;
  }
  .lib-section-label {
    font-weight: 700;
    color: var(--g8);
  }
  .lib-section-count {
    margin-left: auto;
    color: var(--g5);
    font-size: 9px;
  }

  .lib-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lib-row {
    display: grid;
    grid-template-columns: 18px 1fr 50px 14px;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 12px 5px 8px;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: var(--g7);
    font-family: inherit;
    font-size: 10px;
    text-align: left;
    cursor: pointer;
    transition: background 0.08s, color 0.08s;
  }
  .lib-row:hover {
    background: var(--g2);
    color: var(--g9);
  }
  .lib-row.active {
    background: var(--g2);
    color: var(--brand);
    border-left-color: var(--brand);
  }

  .lib-fav {
    background: transparent;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    transition: color 0.1s;
  }
  .lib-fav.active,
  .lib-fav:hover { color: var(--amb); }

  .lib-row-label {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lib-row-family,
  .lib-row-arch {
    font-size: 8px;
    color: var(--g6);
    text-transform: lowercase;
    letter-spacing: 0.04em;
    text-align: right;
  }
  .lib-row-check {
    color: var(--brand);
    font-size: 10px;
  }

  .lib-empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--g5);
    font-size: 10px;
    letter-spacing: 0.1em;
  }
</style>
