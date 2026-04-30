<script lang="ts">
  interface IndicatorFilter {
    feature_name: string;
    operator: string;
    value: number | string | (number | string)[];
    filter_type: 'hard';
  }

  interface FeatureMeta {
    label: string;
    unit: string | null;
    operators: string[];
    value_type: 'float' | 'enum';
    category: string;
    range: [number, number] | null;
    enum_values: string[] | null;
    description: string;
  }

  interface Props {
    filters: IndicatorFilter[];
    onchange: (filters: IndicatorFilter[]) => void;
  }
  const { filters, onchange }: Props = $props();

  let catalog = $state<Record<string, FeatureMeta>>({});
  let adding = $state(false);
  let newFeature = $state('');
  let newOperator = $state('<');
  let newValue = $state<string>('');

  // Group features by category
  const byCategory = $derived((() => {
    const groups: Record<string, [string, FeatureMeta][]> = {};
    for (const [k, v] of Object.entries(catalog)) {
      if (!groups[v.category]) groups[v.category] = [];
      groups[v.category].push([k, v]);
    }
    return groups;
  })());

  const selectedMeta = $derived(newFeature ? catalog[newFeature] : null);

  async function loadCatalog() {
    try {
      const res = await fetch('/api/research/indicator-features');
      if (res.ok) catalog = await res.json();
    } catch {
      // silently ignore catalog load failures
    }
  }

  $effect(() => { loadCatalog(); });

  function addFilter() {
    if (!newFeature || !newOperator || newValue === '') return;
    const val = selectedMeta?.value_type === 'float' ? parseFloat(newValue) : newValue;
    onchange([...filters, { feature_name: newFeature, operator: newOperator, value: val, filter_type: 'hard' }]);
    newFeature = ''; newOperator = '<'; newValue = ''; adding = false;
  }

  function removeFilter(i: number) {
    onchange(filters.filter((_, idx) => idx !== i));
  }
</script>

<div class="indicator-filter-panel">
  <div class="panel-header">
    <span class="panel-label">Indicator Conditions</span>
    <button class="add-btn" onclick={() => adding = !adding}>+ Add</button>
  </div>

  {#if filters.length > 0}
    <div class="filter-list">
      {#each filters as f, i}
        <div class="filter-chip">
          <span class="chip-text">{catalog[f.feature_name]?.label ?? f.feature_name} {f.operator} {f.value}</span>
          <button class="remove-btn" onclick={() => removeFilter(i)}>×</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if adding}
    <div class="add-form">
      <select bind:value={newFeature}>
        <option value="">Select indicator…</option>
        {#each Object.entries(byCategory) as [cat, feats]}
          <optgroup label={cat}>
            {#each feats as [key, meta]}
              <option value={key}>{meta.label}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      {#if selectedMeta}
        <select bind:value={newOperator}>
          {#each selectedMeta.operators as op}
            <option value={op}>{op}</option>
          {/each}
        </select>
        {#if selectedMeta.value_type === 'enum' && selectedMeta.enum_values}
          <select bind:value={newValue}>
            {#each selectedMeta.enum_values as ev}
              <option value={ev}>{ev}</option>
            {/each}
          </select>
        {:else}
          <input type="number" bind:value={newValue}
            placeholder={selectedMeta.range ? `${selectedMeta.range[0]}–${selectedMeta.range[1]}` : 'value'} />
        {/if}
        <button class="confirm-btn" onclick={addFilter}>Add</button>
      {/if}
      <button class="cancel-btn" onclick={() => adding = false}>Cancel</button>
    </div>
  {/if}
</div>

<style>
  .indicator-filter-panel { display: flex; flex-direction: column; gap: 8px; }
  .panel-header { display: flex; justify-content: space-between; align-items: center; }
  .panel-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
  .add-btn { font-size: 11px; color: rgba(255,255,255,0.5); background: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; padding: 2px 8px; cursor: pointer; }
  .add-btn:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
  .filter-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .filter-chip { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.06); border-radius: 4px; padding: 3px 8px; }
  .chip-text { font-size: 11px; color: rgba(255,255,255,0.7); font-family: monospace; }
  .remove-btn { background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 14px; padding: 0; line-height: 1; }
  .remove-btn:hover { color: #f87171; }
  .add-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; }
  select, input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; color: rgba(255,255,255,0.8); font-size: 12px; padding: 4px 6px; }
  .confirm-btn { background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.3); color: #4ade80; font-size: 11px; border-radius: 3px; padding: 4px 10px; cursor: pointer; }
  .cancel-btn { background: none; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); font-size: 11px; border-radius: 3px; padding: 4px 10px; cursor: pointer; }
</style>
