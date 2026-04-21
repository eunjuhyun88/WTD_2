<script lang="ts">
  /**
   * IndicatorSettingsSheet — TradingView-style indicator manager.
   *
   * Shows grouped checkboxes for every indicator in INDICATOR_REGISTRY.
   * Visibility is persisted via shellStore.visibleIndicators.
   * Archetype preference (e.g. switch a gauge to venue-strip) persisted via archetypePrefs.
   */
  import { shellStore } from '$lib/cogochi/shell.store';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import type { IndicatorDef, IndicatorArchetype } from '$lib/indicators/types';

  interface Props {
    onClose: () => void;
  }
  const { onClose }: Props = $props();

  // Group indicators by family, return as sorted array of [family, defs] pairs
  const families = $derived.by((): [string, IndicatorDef[]][] => {
    const map = new Map<string, IndicatorDef[]>();
    for (const def of Object.values(INDICATOR_REGISTRY)) {
      const bucket = map.get(def.family) ?? [];
      bucket.push(def);
      map.set(def.family, bucket);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.priority - b.priority);
    return Array.from(map.entries());
  });

  const visibleSet = $derived(new Set($shellStore.visibleIndicators));
  const archetypePrefs = $derived($shellStore.archetypePrefs);

  const ARCHETYPE_OPTIONS: IndicatorArchetype[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ARCHETYPE_LABEL: Record<IndicatorArchetype, string> = {
    A: 'Gauge',
    B: 'Stack',
    C: 'Heatmap',
    D: 'Divergence',
    E: 'Regime',
    F: 'Venue',
  };

  function toggleId(id: string) {
    shellStore.toggleIndicatorVisible(id);
  }

  function setArchetype(id: string, arch: string) {
    shellStore.setArchetypePref(id, arch);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="overlay" onclick={onClose} role="presentation" />

<div class="sheet" role="dialog" aria-label="Indicator settings" aria-modal="true">
  <div class="sheet-header">
    <span class="sh-title">INDICATORS</span>
    <span class="sh-sub">click to show / hide · archetype sets visualization style</span>
    <button class="sh-close" onclick={onClose} aria-label="Close indicator settings">✕</button>
  </div>

  <div class="sheet-body">
    {#each families as [family, defs] (family)}
      <div class="family-group">
        <div class="family-label">{family}</div>
        {#each defs as def (def.id)}
          {@const active = visibleSet.has(def.id)}
          {@const archPref = archetypePrefs[def.id] ?? def.archetype}
          <div class="ind-row" class:active>
            <button
              class="ind-toggle"
              class:active
              onclick={() => toggleId(def.id)}
              aria-pressed={active}
              title={def.description ?? def.label}
            >
              <span class="ind-dot" />
              <span class="ind-label">{def.label ?? def.id}</span>
              {#if def.unit}
                <span class="ind-unit">{def.unit}</span>
              {/if}
            </button>
            <select
              class="arch-sel"
              value={archPref}
              onchange={(e) => setArchetype(def.id, (e.target as HTMLSelectElement).value)}
              aria-label="Archetype for {def.label}"
            >
              {#each ARCHETYPE_OPTIONS as opt}
                <option value={opt}>{ARCHETYPE_LABEL[opt]}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <div class="sheet-footer">
    <button class="reset-btn" onclick={() => { shellStore.reset(); onClose(); }}>Reset all</button>
    <button class="done-btn" onclick={onClose}>Done</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 200;
  }

  .sheet {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: 80vh;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
    z-index: 210;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
  }

  .sh-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--brand);
  }

  .sh-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    flex: 1;
  }

  .sh-close {
    background: transparent;
    border: none;
    color: var(--g5);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    transition: color 0.12s;
  }
  .sh-close:hover { color: var(--g8); }

  .sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .family-group {
    margin-bottom: 4px;
  }

  .family-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--g5);
    padding: 6px 16px 3px;
  }

  .ind-row {
    display: flex;
    align-items: center;
    padding: 0 8px 0 16px;
    height: 30px;
    transition: background 0.1s;
  }
  .ind-row:hover { background: var(--g2); }

  .ind-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g5);
    text-align: left;
    padding: 0;
    transition: color 0.1s;
  }
  .ind-toggle.active { color: var(--g9); }
  .ind-toggle:hover { color: var(--g8); }

  .ind-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--g4);
    flex-shrink: 0;
    transition: background 0.1s;
  }
  .ind-toggle.active .ind-dot { background: var(--brand); }

  .ind-label { flex: 1; }

  .ind-unit {
    font-size: 7px;
    color: var(--g4);
    margin-left: 2px;
  }

  .arch-sel {
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    color: var(--g6);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    padding: 2px 5px;
    cursor: pointer;
    height: 20px;
    flex-shrink: 0;
  }
  .arch-sel:focus { outline: none; border-color: var(--brand-d); }

  .sheet-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px;
    border-top: 0.5px solid var(--g3);
    flex-shrink: 0;
  }

  .reset-btn {
    background: transparent;
    border: 0.5px solid var(--g4);
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.08em;
    transition: all 0.12s;
  }
  .reset-btn:hover { color: var(--neg); border-color: var(--neg-d); }

  .done-btn {
    background: var(--brand-dd);
    border: 0.5px solid var(--brand-d);
    color: var(--brand);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    padding: 4px 14px;
    border-radius: 3px;
    cursor: pointer;
    letter-spacing: 0.08em;
    transition: all 0.12s;
  }
  .done-btn:hover { background: var(--brand-d); }
</style>
