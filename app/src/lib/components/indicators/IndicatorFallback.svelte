<script lang="ts">
  /**
   * Fallback for archetypes that don't have a renderer yet (B/C/D/E).
   * Shows label + raw value string. Replace as slices land.
   */
  import type { IndicatorDef, IndicatorValue } from '$lib/indicators/types';

  interface Props { def: IndicatorDef; value: IndicatorValue }
  let { def, value }: Props = $props();

  const preview = $derived.by(() => {
    const c = value.current;
    if (typeof c === 'number') return Number.isFinite(c) ? c.toFixed(3) : '—';
    if (Array.isArray(c)) return `${c.length} rows`;
    if (c && typeof c === 'object') return JSON.stringify(c).slice(0, 40);
    return '—';
  });
</script>

<div class="fallback" title="Archetype {def.archetype} renderer not yet implemented">
  <div class="label">{def.label ?? def.id}</div>
  <div class="val">{preview}</div>
  <div class="hint">archetype {def.archetype}</div>
</div>

<style>
  .fallback {
    padding: 6px 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: var(--g6, rgba(255, 255, 255, 0.5));
    border: 1px dashed color-mix(in oklab, currentColor 20%, transparent);
    border-radius: 3px;
  }
  .label { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; }
  .val { font-variant-numeric: tabular-nums; margin-top: 2px; color: var(--g9); }
  .hint { font-size: 8px; opacity: 0.6; margin-top: 2px; }
</style>
