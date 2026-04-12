<script lang="ts">
  import { FACTOR_LABELS, type DoctrineWeights } from '$lib/stores/doctrineStore';

  const { weights, style = '', rrMinimum = 1.5, maxPosition = 3, onWeightChange, onSave, onTest }: {
    weights: DoctrineWeights;
    style?: string;
    rrMinimum?: number;
    maxPosition?: number;
    onWeightChange?: (key: keyof DoctrineWeights, value: number) => void;
    onSave?: () => void;
    onTest?: () => void;
  } = $props();

  // Factor key order
  const factorKeys: (keyof DoctrineWeights)[] = ['cvd', 'mvrv', 'funding', 'volume', 'bb', 'oi'];

  // Color gradient based on value
  function getTrackGradient(value: number): string {
    const pct = value;
    if (pct >= 80) return 'linear-gradient(90deg, var(--lis-accent), var(--lis-highlight))';
    if (pct >= 60) return 'linear-gradient(90deg, var(--lis-positive), rgba(173,202,124,0.7))';
    if (pct >= 40) return 'linear-gradient(90deg, rgba(247,242,234,0.3), rgba(247,242,234,0.5))';
    return 'linear-gradient(90deg, rgba(247,242,234,0.15), rgba(247,242,234,0.25))';
  }

  function handleInput(key: keyof DoctrineWeights, e: Event) {
    const target = e.target as HTMLInputElement;
    const value = Number(target.value);
    if (onWeightChange) {
      onWeightChange(key, value);
    }
  }
</script>

<div class="doctrine-editor">
  <div class="sliders-section">
    {#each factorKeys as key}
      {@const label = FACTOR_LABELS[key]}
      {@const value = weights[key]}
      <div class="slider-row">
        <div class="slider-header">
          <span class="factor-icon">{label.icon}</span>
          <span class="factor-name">{label.name}</span>
          <span class="factor-value">{value}%</span>
        </div>
        <div class="slider-track-wrap">
          <div
            class="slider-fill"
            style="width:{value}%;background:{getTrackGradient(value)}"
          ></div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            class="slider-input"
            oninput={(e) => handleInput(key, e)}
          />
        </div>
      </div>
    {/each}
  </div>

  <div class="summary-section">
    <div class="summary-card">
      <div class="summary-row">
        <span class="summary-label">Style</span>
        <span class="summary-value">{style || 'Custom'}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">R:R Minimum</span>
        <span class="summary-value">{rrMinimum}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Max Position</span>
        <span class="summary-value">{maxPosition}%</span>
      </div>
    </div>
  </div>

  <div class="actions-section">
    {#if onSave}
      <button class="btn-save" type="button" onclick={onSave}>
        Save Doctrine
      </button>
    {/if}
    {#if onTest}
      <button class="btn-test" type="button" onclick={onTest}>
        Test in Lab
      </button>
    {/if}
  </div>
</div>

<style>
  .doctrine-editor {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .sliders-section {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slider-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .factor-icon {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-display);
    font-size: 12px;
    letter-spacing: 0.5px;
    background: rgba(247, 242, 234, 0.04);
    border: 1px solid rgba(247, 242, 234, 0.06);
    color: var(--sc-text-2);
    flex-shrink: 0;
  }

  .factor-name {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--sc-text-1);
    flex: 1;
  }

  .factor-value {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    color: var(--lis-ivory);
    min-width: 38px;
    text-align: right;
  }

  .slider-track-wrap {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: rgba(247, 242, 234, 0.04);
    overflow: visible;
  }

  .slider-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 3px;
    pointer-events: none;
    transition: width 0.15s ease-out;
  }

  .slider-input {
    position: absolute;
    inset: -6px 0;
    width: 100%;
    height: 18px;
    margin: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }

  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--lis-ivory);
    border: 2px solid rgba(5, 9, 20, 0.8);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(247, 242, 234, 0.1);
    cursor: grab;
    transition: box-shadow 0.2s, transform 0.15s;
  }
  .slider-input::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(247, 242, 234, 0.08);
  }
  .slider-input::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.1);
  }

  .slider-input::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--lis-ivory);
    border: 2px solid rgba(5, 9, 20, 0.8);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: grab;
  }

  .slider-input::-moz-range-track {
    background: transparent;
    border: none;
    height: 6px;
  }

  /* Summary */
  .summary-section { margin-top: 4px; }

  .summary-card {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(247, 242, 234, 0.04);
    background: rgba(247, 242, 234, 0.02);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .summary-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 0.8px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .summary-value {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--sc-text-1);
  }

  /* Actions */
  .actions-section {
    display: flex;
    gap: 10px;
  }

  .btn-save,
  .btn-test {
    flex: 1;
    min-height: 42px;
    padding: 0 18px;
    border-radius: 12px;
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .btn-save {
    border: none;
    background: linear-gradient(135deg, var(--lis-accent), rgba(219, 154, 159, 0.75));
    color: var(--lis-bg-0);
    box-shadow: 0 4px 16px rgba(219, 154, 159, 0.2);
  }
  .btn-save:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(219, 154, 159, 0.3);
  }
  .btn-save:active { transform: translateY(0) scale(0.98); }

  .btn-test {
    border: 1px solid rgba(173, 202, 124, 0.2);
    background: rgba(173, 202, 124, 0.04);
    color: var(--lis-positive);
  }
  .btn-test:hover {
    border-color: rgba(173, 202, 124, 0.3);
    background: rgba(173, 202, 124, 0.08);
    transform: translateY(-2px);
  }
  .btn-test:active { transform: translateY(0) scale(0.98); }

  @media (max-width: 480px) {
    .actions-section { flex-direction: column; }
  }
</style>
