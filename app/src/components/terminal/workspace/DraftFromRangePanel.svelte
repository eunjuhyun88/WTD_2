<script lang="ts">
  /**
   * DraftFromRangePanel — A-04-app entry component.
   *
   * Embeddable panel: given chart range (anchorA + anchorB),
   * fetches PatternDraft from engine + renders 12-feature chips.
   *
   * Designed for inline placement in SaveSetupModal or SaveStrip.
   * SaveSetupModal full integration is a follow-up task (Wave 2.5).
   */

  import { draftPatternFromRange, type PatternDraftBodyShape } from '$lib/api/terminalApi';

  interface Props {
    symbol: string;
    /** Unix epoch seconds */
    startTs: number | null;
    /** Unix epoch seconds */
    endTs: number | null;
    timeframe?: string;
    onDraftReceived?: (draft: PatternDraftBodyShape) => void;
  }

  let { symbol, startTs, endTs, timeframe = '15m', onDraftReceived }: Props = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);
  let draft = $state<PatternDraftBodyShape | null>(null);

  const canSubmit = $derived(
    !loading
    && symbol.length > 0
    && startTs !== null
    && endTs !== null
    && (endTs ?? 0) > (startTs ?? 0)
  );

  async function handleClick() {
    if (!canSubmit) return;
    loading = true;
    error = null;
    try {
      const result = await draftPatternFromRange(symbol, startTs!, endTs!, timeframe);
      draft = result;
      onDraftReceived?.(result);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Draft 추출 실패';
      draft = null;
    } finally {
      loading = false;
    }
  }

  // 12 canonical features (A-04-eng spec)
  const FEATURE_KEYS = [
    'oi_change', 'funding', 'cvd', 'liq_volume',
    'price', 'volume', 'btc_corr', 'higher_lows',
    'lower_highs', 'compression', 'smart_money', 'venue_div',
  ] as const;

  function featureValue(key: string): number | null {
    const v = draft?.extracted_features?.[key];
    return typeof v === 'number' ? v : null;
  }

  function featureClass(key: string): string {
    const v = featureValue(key);
    if (v === null) return 'feat-null';
    // p50 무색 룰: |x| < 0.3 = neutral, < 0.7 = warn, else extreme
    const abs = Math.abs(v);
    if (abs < 0.3) return 'feat-neutral';
    if (abs < 0.7) return 'feat-warn';
    return 'feat-extreme';
  }
</script>

<div class="draft-panel">
  <button
    class="draft-btn"
    onclick={handleClick}
    disabled={!canSubmit}
    title={canSubmit ? 'Extract 12 features from selected range' : 'Select a range first'}
  >
    {#if loading}
      <span class="spinner">●</span> Drafting…
    {:else}
      📐 Draft from Range
    {/if}
  </button>

  {#if error}
    <div class="draft-error">{error}</div>
  {/if}

  {#if draft}
    <div class="draft-meta">
      {#if draft.pattern_family}
        <span class="meta-chip">{draft.pattern_family}</span>
      {/if}
      {#if draft.pattern_label}
        <span class="meta-chip">{draft.pattern_label}</span>
      {/if}
    </div>

    <div class="features-grid" aria-label="Extracted features">
      {#each FEATURE_KEYS as key}
        {@const v = featureValue(key)}
        <div class="feat-chip {featureClass(key)}" title={key}>
          <span class="feat-key">{key}</span>
          <span class="feat-val">{v === null ? '—' : v.toFixed(2)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .draft-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border: 1px solid rgba(219, 154, 159, 0.18);
    border-radius: 4px;
    background: rgba(219, 154, 159, 0.04);
  }

  .draft-btn {
    align-self: flex-start;
    padding: 8px 14px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid rgba(219, 154, 159, 0.4);
    color: #db9a9f;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .draft-btn:hover:not(:disabled) {
    background: rgba(219, 154, 159, 0.12);
    color: #f7f2ea;
  }
  .draft-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .draft-error {
    font-size: 10px;
    color: rgba(248, 113, 113, 0.85);
    padding: 4px 6px;
    background: rgba(248, 113, 113, 0.08);
    border-radius: 3px;
  }

  .draft-meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .meta-chip {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 8px;
    background: rgba(34, 211, 238, 0.12);
    color: rgba(34, 211, 238, 0.95);
    font-family: var(--sc-font-mono, monospace);
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }

  .feat-chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid transparent;
    font-family: var(--sc-font-mono, monospace);
  }
  .feat-key {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(247, 242, 234, 0.45);
  }
  .feat-val {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .feat-null {
    border-color: rgba(102, 102, 102, 0.3);
    color: rgba(247, 242, 234, 0.3);
  }
  .feat-neutral {
    border-color: rgba(247, 242, 234, 0.18);
    color: rgba(247, 242, 234, 0.85);
  }
  .feat-warn {
    border-color: rgba(250, 204, 21, 0.4);
    background: rgba(250, 204, 21, 0.08);
    color: #facc15;
  }
  .feat-extreme {
    border-color: rgba(250, 204, 21, 0.7);
    background: rgba(250, 204, 21, 0.18);
    color: #fde047;
    animation: pulse-bg 2s ease-in-out infinite;
  }
  @keyframes pulse-bg {
    0%, 100% { background: rgba(250, 204, 21, 0.18); }
    50%      { background: rgba(250, 204, 21, 0.32); }
  }
</style>
