<script lang="ts">
  import { FACTOR_BLOCKS, FACTOR_CATEGORIES } from '$lib/stores/strategyStore';
  import type { Strategy, ConditionBlock, ExitConfig, RiskConfig } from '$lib/lab/backtest';

  const { strategy, onAddCondition, onRemoveCondition, onToggleCondition, onUpdateCondition, onUpdateExit, onUpdateRisk, onUpdateDirection } = $props<{
    strategy: Strategy;
    onAddCondition: (cond: ConditionBlock) => void;
    onRemoveCondition: (index: number) => void;
    onToggleCondition: (index: number) => void;
    onUpdateCondition: (index: number, updates: Partial<ConditionBlock>) => void;
    onUpdateExit: (updates: Partial<ExitConfig>) => void;
    onUpdateRisk: (updates: Partial<RiskConfig>) => void;
    onUpdateDirection: (dir: Strategy['direction']) => void;
  }>();

  let showAddMenu = $state(false);
  let addMenuCategory = $state<string | null>(null);

  function handleAddFactor(factorId: string) {
    const def = FACTOR_BLOCKS.find(f => f.id === factorId);
    if (!def) return;
    onAddCondition({
      factorId: def.id,
      operator: def.defaultOperator,
      value: def.defaultValue,
      enabled: true,
    });
    showAddMenu = false;
    addMenuCategory = null;
  }

  function getFactorDef(factorId: string) {
    return FACTOR_BLOCKS.find(f => f.id === factorId);
  }

  function operatorLabel(op: ConditionBlock['operator']): string {
    switch (op) {
      case 'gt': return '>';
      case 'lt': return '<';
      case 'gte': return '≥';
      case 'lte': return '≤';
      case 'between': return '~';
    }
  }

  const operators: ConditionBlock['operator'][] = ['gt', 'lt', 'gte', 'lte'];

  const trailingTypes: { value: ExitConfig['trailingType']; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'atr', label: 'ATR' },
    { value: 'percent', label: '%' },
  ];
</script>

<div class="builder">
  <!-- Direction -->
  <div class="section">
    <div class="section-label">Direction</div>
    <div class="direction-row">
      {#each [['long', 'Long'], ['short', 'Short'], ['both', 'Both']] as [val, label]}
        <button
          class="dir-btn"
          class:active={strategy.direction === val}
          class:long={val === 'long' && strategy.direction === val}
          class:short={val === 'short' && strategy.direction === val}
          onclick={() => onUpdateDirection(val as Strategy['direction'])}
        >{label}</button>
      {/each}
    </div>
  </div>

  <!-- Entry Conditions -->
  <div class="section">
    <div class="section-header">
      <span class="section-label">Entry Conditions</span>
      <span class="section-badge">{strategy.entryConditions.filter((c: ConditionBlock) => c.enabled).length}</span>
    </div>

    {#if strategy.entryConditions.length === 0}
      <div class="empty-hint">Add conditions to build your strategy</div>
    {/if}

    <div class="cond-list">
      {#each strategy.entryConditions as cond, i (i)}
        {@const def = getFactorDef(cond.factorId)}
        <div class="cond-block" class:disabled={!cond.enabled}>
          <div class="cond-top">
            <button class="cond-toggle" class:on={cond.enabled} onclick={() => onToggleCondition(i)}>
              {cond.enabled ? '●' : '○'}
            </button>
            <span class="cond-name" title={def?.description}>{def?.nameKR ?? cond.factorId}</span>
            <select
              class="cond-op"
              value={cond.operator}
              onchange={(e) => onUpdateCondition(i, { operator: (e.target as HTMLSelectElement).value as ConditionBlock['operator'] })}
            >
              {#each operators as op}
                <option value={op}>{operatorLabel(op)}</option>
              {/each}
            </select>
            <input
              class="cond-value"
              type="number"
              value={cond.value}
              step={def?.step ?? 1}
              min={def?.min}
              max={def?.max}
              oninput={(e) => onUpdateCondition(i, { value: parseFloat((e.target as HTMLInputElement).value) || 0 })}
            />
            <button class="cond-remove" onclick={() => onRemoveCondition(i)} title="Remove">×</button>
          </div>
          {#if def}
            <div class="cond-range">
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={cond.value}
                oninput={(e) => onUpdateCondition(i, { value: parseFloat((e.target as HTMLInputElement).value) })}
                disabled={!cond.enabled}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Add condition -->
    <div class="add-area">
      <button class="add-btn" onclick={() => { showAddMenu = !showAddMenu; addMenuCategory = null; }}>
        + Add Condition
      </button>

      {#if showAddMenu}
        <div class="add-menu">
          {#if !addMenuCategory}
            {#each FACTOR_CATEGORIES as cat}
              <button class="menu-cat" onclick={() => addMenuCategory = cat}>{cat}</button>
            {/each}
          {:else}
            <button class="menu-back" onclick={() => addMenuCategory = null}>← {addMenuCategory}</button>
            {#each FACTOR_BLOCKS.filter(f => f.category === addMenuCategory) as factor}
              <button class="menu-item" onclick={() => handleAddFactor(factor.id)}>
                <span class="mi-name">{factor.nameKR}</span>
                <span class="mi-desc">{factor.description}</span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Exit Config -->
  <div class="section">
    <div class="section-label">Exit Config</div>
    <div class="exit-grid">
      <div class="exit-row">
        <span class="exit-label">TP</span>
        <input
          class="exit-input"
          type="number"
          step="0.1"
          min="0.5"
          max="20"
          value={strategy.exitConditions.tpPercent}
          oninput={(e) => onUpdateExit({ tpPercent: parseFloat((e.target as HTMLInputElement).value) || 3 })}
        />
        <span class="exit-unit">%</span>
      </div>
      <div class="exit-row">
        <span class="exit-label">SL</span>
        <input
          class="exit-input"
          type="number"
          step="0.1"
          min="0.1"
          max="10"
          value={strategy.exitConditions.slPercent}
          oninput={(e) => onUpdateExit({ slPercent: parseFloat((e.target as HTMLInputElement).value) || 1.5 })}
        />
        <span class="exit-unit">%</span>
      </div>
      <div class="exit-row">
        <span class="exit-label">Trail</span>
        <select
          class="exit-select"
          value={strategy.exitConditions.trailingType}
          onchange={(e) => onUpdateExit({ trailingType: (e.target as HTMLSelectElement).value as ExitConfig['trailingType'] })}
        >
          {#each trailingTypes as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
        {#if strategy.exitConditions.trailingType !== 'none'}
          <input
            class="exit-input trail-val"
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={strategy.exitConditions.trailingValue}
            oninput={(e) => onUpdateExit({ trailingValue: parseFloat((e.target as HTMLInputElement).value) || 1.5 })}
          />
          <span class="exit-unit">{strategy.exitConditions.trailingType === 'atr' ? '×' : '%'}</span>
        {/if}
      </div>
    </div>

    <div class="rr-display">
      R:R <span class="rr-value">{strategy.exitConditions.slPercent > 0 ? (strategy.exitConditions.tpPercent / strategy.exitConditions.slPercent).toFixed(1) : '∞'}</span>
    </div>
  </div>

  <!-- Risk Config -->
  <div class="section">
    <div class="section-label">Risk</div>
    <div class="exit-grid">
      <div class="exit-row">
        <span class="exit-label">Size</span>
        <input
          class="exit-input"
          type="number"
          step="0.5"
          min="0.5"
          max="10"
          value={strategy.riskConfig.positionSizePercent}
          oninput={(e) => onUpdateRisk({ positionSizePercent: parseFloat((e.target as HTMLInputElement).value) || 2 })}
        />
        <span class="exit-unit">%</span>
      </div>
      <div class="exit-row">
        <span class="exit-label">Max</span>
        <input
          class="exit-input"
          type="number"
          step="1"
          min="1"
          max="5"
          value={strategy.riskConfig.maxConcurrentPositions}
          oninput={(e) => onUpdateRisk({ maxConcurrentPositions: parseInt((e.target as HTMLInputElement).value) || 1 })}
        />
        <span class="exit-unit">pos</span>
      </div>
      <div class="exit-row">
        <span class="exit-label">Daily Loss</span>
        <input
          class="exit-input"
          type="number"
          step="0.5"
          min="1"
          max="20"
          value={strategy.riskConfig.maxDailyLossPercent}
          oninput={(e) => onUpdateRisk({ maxDailyLossPercent: parseFloat((e.target as HTMLInputElement).value) || 5 })}
        />
        <span class="exit-unit">%</span>
      </div>
    </div>
  </div>
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section {
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 8px;
    padding: 12px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .section-label {
    font-family: var(--sc-font-body);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255 255 255 / 0.4);
    margin-bottom: 8px;
  }

  .section-header .section-label { margin-bottom: 0; }

  .section-badge {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    background: rgba(var(--lis-rgb-pink), 0.15);
    color: var(--lis-accent);
    padding: 1px 6px;
    border-radius: 8px;
  }

  /* ── Direction ── */
  .direction-row {
    display: flex;
    gap: 4px;
  }

  .dir-btn {
    flex: 1;
    padding: 6px 0;
    font-family: var(--sc-font-mono);
    font-size: 12px;
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.06);
    border-radius: 5px;
    color: rgba(255 255 255 / 0.4);
    cursor: pointer;
    transition: all 0.2s;
  }

  .dir-btn:hover { color: rgba(255 255 255 / 0.7); }
  .dir-btn.active { color: rgba(255 255 255 / 0.9); border-color: var(--lis-border); background: var(--lis-surface-1); }
  .dir-btn.long { border-color: var(--lis-positive); color: var(--lis-positive); }
  .dir-btn.short { border-color: var(--sc-bad); color: var(--sc-bad); }

  /* ── Condition blocks ── */
  .empty-hint {
    font-size: 12px;
    color: rgba(255 255 255 / 0.25);
    text-align: center;
    padding: 16px 0;
    font-style: italic;
  }

  .cond-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cond-block {
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.06);
    border-radius: 6px;
    padding: 8px 10px;
    transition: opacity 0.2s;
  }

  .cond-block.disabled { opacity: 0.35; }

  .cond-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cond-toggle {
    background: none;
    border: none;
    color: var(--lis-positive);
    cursor: pointer;
    font-size: 10px;
    padding: 0;
    width: 16px;
  }

  .cond-toggle:not(.on) { color: rgba(255 255 255 / 0.2); }

  .cond-name {
    flex: 1;
    font-family: var(--sc-font-body);
    font-size: 12px;
    color: rgba(255 255 255 / 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cond-op {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    background: var(--lis-surface-1);
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 3px;
    color: var(--lis-highlight);
    padding: 2px 4px;
    width: 38px;
    text-align: center;
    cursor: pointer;
  }

  .cond-value {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    background: var(--lis-surface-1);
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 3px;
    color: rgba(255 255 255 / 0.9);
    padding: 2px 6px;
    width: 64px;
    text-align: right;
  }

  .cond-remove {
    background: none;
    border: none;
    color: rgba(255 255 255 / 0.2);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    transition: color 0.15s;
  }

  .cond-remove:hover { color: var(--sc-bad); }

  .cond-range {
    margin-top: 6px;
  }

  .cond-range input[type="range"] {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255 255 255 / 0.06);
    border-radius: 2px;
    outline: none;
  }

  .cond-range input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--lis-accent);
    cursor: pointer;
    box-shadow: 0 0 6px rgba(var(--lis-rgb-pink), 0.3);
  }

  .cond-range input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--lis-accent);
    cursor: pointer;
    border: none;
  }

  .cond-range input[type="range"]:disabled {
    opacity: 0.3;
  }

  /* ── Add menu ── */
  .add-area {
    margin-top: 8px;
    position: relative;
  }

  .add-btn {
    width: 100%;
    padding: 8px;
    background: transparent;
    border: 1px dashed rgba(var(--lis-rgb-pink), 0.2);
    border-radius: 6px;
    color: var(--lis-accent);
    font-family: var(--sc-font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn:hover {
    border-color: rgba(var(--lis-rgb-pink), 0.4);
    background: rgba(var(--lis-rgb-pink), 0.04);
  }

  .add-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--lis-surface-1);
    border: 1px solid var(--lis-border);
    border-radius: 8px;
    padding: 4px;
    z-index: 20;
    max-height: 240px;
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0 0 0 / 0.4);
  }

  .menu-cat, .menu-back, .menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.15s;
    font-family: var(--sc-font-body);
  }

  .menu-cat {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.7);
    background: transparent;
  }

  .menu-cat:hover { background: rgba(var(--lis-rgb-pink), 0.08); color: rgba(255 255 255 / 0.9); }

  .menu-back {
    font-size: 11px;
    color: var(--lis-accent);
    background: transparent;
    margin-bottom: 2px;
  }

  .menu-back:hover { background: rgba(var(--lis-rgb-pink), 0.08); }

  .menu-item {
    background: transparent;
    padding: 6px 10px;
  }

  .menu-item:hover { background: rgba(var(--lis-rgb-pink), 0.08); }

  .mi-name {
    display: block;
    font-size: 12px;
    color: rgba(255 255 255 / 0.85);
  }

  .mi-desc {
    display: block;
    font-size: 10px;
    color: rgba(255 255 255 / 0.35);
    margin-top: 2px;
  }

  /* ── Exit / Risk grid ── */
  .exit-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .exit-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .exit-label {
    font-family: var(--sc-font-body);
    font-size: 11px;
    color: rgba(255 255 255 / 0.45);
    width: 48px;
    flex-shrink: 0;
  }

  .exit-input {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 4px;
    color: rgba(255 255 255 / 0.9);
    padding: 4px 8px;
    width: 64px;
    text-align: right;
  }

  .exit-input:focus {
    border-color: rgba(var(--lis-rgb-pink), 0.4);
    outline: none;
  }

  .trail-val { width: 52px; }

  .exit-select {
    font-family: var(--sc-font-body);
    font-size: 11px;
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 4px;
    color: rgba(255 255 255 / 0.8);
    padding: 4px 6px;
    cursor: pointer;
  }

  .exit-unit {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: rgba(255 255 255 / 0.3);
    width: 16px;
  }

  .rr-display {
    margin-top: 8px;
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: rgba(255 255 255 / 0.35);
    text-align: right;
  }

  .rr-value {
    color: var(--lis-highlight);
    font-weight: 600;
    font-size: 13px;
  }
</style>
