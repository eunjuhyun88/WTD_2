<script lang="ts">
  /**
   * SaveStrip.svelte
   *
   * Canonical desktop inline capture surface for `/terminal`.
   * Shows the exact selected range, lets the user classify the phase,
   * preview similar captures, and persist the reviewed segment.
   */
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { fetchSimilarPatternCaptures } from '$lib/api/terminalPersistence';
  import type { PatternCaptureSimilarityMatch } from '$lib/contracts/terminalPersistence';
  import { PHASE_META, PHASE_ORDER, type Phase } from '$lib/terminal/phaseInfo';
  import {
    buildPatternCaptureSimilarityDraftFromSelection,
    buildSelectedRangeViewport,
    type CaptureSelectionPhase,
    type RangeSelectionBar,
  } from '$lib/terminal/rangeSelectionCapture';

  interface Props {
    symbol: string;
    tf: string;
    ohlcvBars?: RangeSelectionBar[];
    onSaved?: (captureId: string) => void;
  }

  type PhaseOption = {
    id: CaptureSelectionPhase;
    label: string;
    description: string;
    tone: 'neutral' | Phase;
  };

  const PHASE_OPTIONS: PhaseOption[] = [
    {
      id: 'GENERAL',
      label: 'General',
      description: '특정 phase 없이 reviewed evidence 로 저장',
      tone: 'neutral',
    },
    ...PHASE_ORDER.map((phase) => ({
      id: phase,
      label: PHASE_META[phase].koLabel,
      description: PHASE_META[phase].tradingRule,
      tone: phase,
    })),
  ];

  const INDICATOR_LABELS: Record<string, string> = {
    ema: 'EMA',
    bb: 'BB',
    vwap: 'VWAP',
    atr_bands: 'ATR',
    macd: 'MACD',
    rsi: 'RSI',
    cvd: 'CVD',
    oi: 'OI',
    funding: 'Funding',
    volume: 'Vol',
    taker_buy: 'TBV',
  };

  let { symbol, tf, ohlcvBars = [], onSaved }: Props = $props();

  const saveState = $derived($chartSaveMode);
  const visible = $derived(saveState.active && saveState.anchorA !== null && saveState.anchorB !== null);
  const selectedViewport = $derived(buildSelectedRangeViewport({
    timeframe: tf,
    payload: saveState.payload,
    anchorA: saveState.anchorA,
    anchorB: saveState.anchorB,
    ohlcvBars,
  }));
  const canSave = $derived(Boolean(selectedViewport && selectedViewport.barCount > 0 && selectedViewport.klines.length > 0));

  let selectedPhase = $state<CaptureSelectionPhase>('GENERAL');
  let saveError = $state<string | null>(null);
  let similarMatches = $state<PatternCaptureSimilarityMatch[]>([]);
  let similarLoading = $state(false);
  let similarRunId = 0;

  const selectedPhaseMeta = $derived(
    selectedPhase === 'GENERAL'
      ? null
      : PHASE_META[selectedPhase]
  );

  function formatRangeLabel(): string {
    if (!selectedViewport) return '정확한 차트 구간을 먼저 선택해야 저장됩니다.';
    const fmtDate = (ts: number) =>
      new Date(ts * 1000).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    const first = selectedViewport.klines[0]?.time ?? selectedViewport.timeFrom;
    const last = selectedViewport.klines.at(-1)?.time ?? selectedViewport.timeTo;
    return `${fmtDate(first)} → ${fmtDate(last)} · ${selectedViewport.tf.toUpperCase()} (${selectedViewport.barCount}봉)`;
  }

  const rangeLabel = $derived(formatRangeLabel());

  const indicatorPills = $derived.by(() => {
    if (!selectedViewport?.indicators) return [];
    return Object.entries(selectedViewport.indicators)
      .filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'number' && Number.isFinite(value)) return true;
        if (typeof value === 'string' && value.trim().length > 0) return true;
        return false;
      })
      .map(([key]) => INDICATOR_LABELS[key] ?? key.toUpperCase())
      .filter((label, index, arr) => arr.indexOf(label) === index)
      .slice(0, 8);
  });

  const rangeStats = $derived.by(() => {
    if (!selectedViewport || selectedViewport.klines.length === 0) return null;
    const bars = selectedViewport.klines;
    const high = Math.max(...bars.map((bar) => bar.high));
    const low = Math.min(...bars.map((bar) => bar.low));
    const open = bars[0]?.open ?? 0;
    const close = bars.at(-1)?.close ?? 0;
    if (!open) return { high, low, changePct: 0 };
    return {
      high,
      low,
      changePct: ((close - open) / open) * 100,
    };
  });

  $effect(() => {
    if (!visible) {
      similarRunId += 1;
      saveError = null;
      similarMatches = [];
      similarLoading = false;
      selectedPhase = 'GENERAL';
    }
  });

  $effect(() => {
    if (!visible || !canSave) {
      similarMatches = [];
      similarLoading = false;
      return;
    }

    const runId = ++similarRunId;
    const timer = setTimeout(async () => {
      const draft = buildPatternCaptureSimilarityDraftFromSelection({
        symbol,
        timeframe: tf,
        payload: saveState.payload,
        anchorA: saveState.anchorA,
        anchorB: saveState.anchorB,
        ohlcvBars,
        note: saveState.noteDraft,
        phase: selectedPhase,
      });

      if (!draft) {
        if (runId === similarRunId) {
          similarMatches = [];
          similarLoading = false;
        }
        return;
      }

      similarLoading = true;
      try {
        const matches = await fetchSimilarPatternCaptures(draft);
        if (runId === similarRunId) {
          similarMatches = matches;
        }
      } catch {
        if (runId === similarRunId) {
          similarMatches = [];
        }
      } finally {
        if (runId === similarRunId) {
          similarLoading = false;
        }
      }
    }, 180);

    return () => {
      similarRunId += 1;
      clearTimeout(timer);
    };
  });

  function fmtPrice(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function handleNoteInput(event: Event) {
    chartSaveMode.setNote((event.target as HTMLTextAreaElement).value);
  }

  async function handleSave() {
    saveError = null;
    if (!canSave) {
      saveError = '정확한 차트 구간에 유효한 캔들이 있어야 저장할 수 있습니다.';
      return;
    }
    const id = await chartSaveMode.save({
      symbol,
      tf,
      ohlcvBars,
      phase: selectedPhase,
      note: saveState.noteDraft,
    });
    if (!id) {
      saveError = '저장 실패 — 구간을 다시 선택해 보세요.';
      return;
    }
    onSaved?.(id);
  }

  async function handleSaveAndOpenLab() {
    saveError = null;
    if (!canSave) {
      saveError = '정확한 차트 구간에 유효한 캔들이 있어야 저장할 수 있습니다.';
      return;
    }
    const id = await chartSaveMode.save({
      symbol,
      tf,
      ohlcvBars,
      phase: selectedPhase,
      note: saveState.noteDraft,
    });
    if (!id) {
      saveError = '저장 실패 — 구간을 다시 선택해 보세요.';
      return;
    }
    onSaved?.(id);
    window.location.href = `/lab?captureId=${encodeURIComponent(id)}`;
  }
</script>

{#if visible}
  <section class="save-strip" aria-label="Save setup strip">
    <div class="save-strip__topline">
      <div class="save-strip__summary">
        <span class="save-strip__eyebrow">Core Loop Capture</span>
        <strong class="save-strip__range">{rangeLabel}</strong>
        {#if rangeStats}
          <div class="save-strip__stats">
            <span>H {fmtPrice(rangeStats.high)}</span>
            <span>L {fmtPrice(rangeStats.low)}</span>
            <span class:bull={rangeStats.changePct >= 0} class:bear={rangeStats.changePct < 0}>
              {rangeStats.changePct >= 0 ? '+' : ''}{rangeStats.changePct.toFixed(2)}%
            </span>
          </div>
        {/if}
      </div>

      <div class="save-strip__pills">
        {#if indicatorPills.length > 0}
          {#each indicatorPills as pill}
            <span class="save-strip__pill">{pill}</span>
          {/each}
        {:else}
          <span class="save-strip__hint">indicator slice unavailable</span>
        {/if}
      </div>
    </div>

    <div class="save-strip__phase-panel">
      <div class="save-strip__panel-head">
        <span>Capture phase</span>
        <small>
          {selectedPhaseMeta ? selectedPhaseMeta.tradingRule : 'AI research가 이 캡처를 일반 사례로 다룹니다.'}
        </small>
      </div>
      <div class="save-strip__phase-grid">
        {#each PHASE_OPTIONS as option}
          <button
            type="button"
            class="save-strip__phase-btn"
            data-tone={option.tone}
            class:is-selected={selectedPhase === option.id}
            onclick={() => { selectedPhase = option.id; }}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="save-strip__controls">
      <label class="save-strip__note">
        <span>Research note</span>
        <textarea
          class="save-strip__textarea"
          placeholder="왜 이 구간이 중요한지 짧게 적으세요. 예: OI 유지 + funding flip + higher lows"
          rows={2}
          value={saveState.noteDraft}
          oninput={handleNoteInput}
        ></textarea>
      </label>

      <div class="save-strip__actions">
        <button
          class="save-strip__action save-strip__action--ghost"
          type="button"
          onclick={() => chartSaveMode.exitRangeMode()}
        >
          취소
        </button>
        <button
          class="save-strip__action save-strip__action--secondary"
          type="button"
          onclick={handleSaveAndOpenLab}
          disabled={!canSave || saveState.submitting}
        >
          {saveState.submitting ? '저장 중…' : 'Save & Open Lab'}
        </button>
        <button
          class="save-strip__action save-strip__action--primary"
          type="button"
          onclick={handleSave}
          disabled={!canSave || saveState.submitting}
        >
          {saveState.submitting ? '저장 중…' : 'Save Setup'}
        </button>
      </div>
    </div>

    <div class="save-strip__preview">
      <div class="save-strip__panel-head">
        <span>AI Research Preview</span>
        <small>유사 캡처를 먼저 보여주고, 없으면 새 canonical example 로 저장합니다.</small>
      </div>

      {#if similarLoading}
        <div class="save-strip__empty">유사 캡처 검색 중…</div>
      {:else if similarMatches.length > 0}
        <div class="save-strip__preview-list">
          {#each similarMatches.slice(0, 4) as match}
            <a class="save-strip__preview-card" href={`/lab?captureId=${encodeURIComponent(match.record.id)}`}>
              <div class="save-strip__preview-head">
                <strong>{match.record.symbol.replace('USDT', '')} · {match.record.timeframe.toUpperCase()}</strong>
                <span>{Math.round(match.score * 100)}%</span>
              </div>
              <div class="save-strip__preview-meta">
                <span>{match.record.reason ?? 'GENERAL'}</span>
                <span>{new Date(match.record.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
              <p>{match.record.note ?? '저장된 note 없음'}</p>
            </a>
          {/each}
        </div>
      {:else}
        <div class="save-strip__empty">
          유사 캡처가 없습니다. 이 저장이 AutoResearch 의 새 기준 예시가 됩니다.
        </div>
      {/if}
    </div>

    {#if saveError}
      <div class="save-strip__error">{saveError}</div>
    {/if}
  </section>
{/if}

<style>
  .save-strip {
    display: grid;
    gap: 14px;
    padding: 14px 16px 16px;
    border-top: 1px solid rgba(77, 143, 245, 0.24);
    background:
      linear-gradient(180deg, rgba(10, 13, 22, 0.98), rgba(6, 9, 16, 0.98)),
      radial-gradient(circle at top left, rgba(77, 143, 245, 0.09), transparent 48%);
  }

  .save-strip__topline {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .save-strip__summary {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .save-strip__eyebrow {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(131, 188, 255, 0.78);
  }

  .save-strip__range {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    color: rgba(247, 242, 234, 0.9);
    line-height: 1.4;
  }

  .save-strip__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(247, 242, 234, 0.62);
  }

  .save-strip__stats .bull {
    color: rgba(92, 214, 147, 0.92);
  }

  .save-strip__stats .bear {
    color: rgba(255, 124, 124, 0.92);
  }

  .save-strip__pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  .save-strip__pill,
  .save-strip__hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    padding: 4px 7px;
    border-radius: 999px;
    border: 1px solid rgba(131, 188, 255, 0.22);
    background: rgba(77, 143, 245, 0.12);
    color: rgba(190, 221, 255, 0.85);
    white-space: nowrap;
  }

  .save-strip__hint {
    color: rgba(247, 242, 234, 0.48);
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .save-strip__phase-panel,
  .save-strip__preview {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
  }

  .save-strip__panel-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .save-strip__panel-head span {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(247, 242, 234, 0.84);
  }

  .save-strip__panel-head small {
    font-size: 11px;
    color: rgba(247, 242, 234, 0.56);
  }

  .save-strip__phase-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .save-strip__phase-btn {
    display: grid;
    gap: 4px;
    padding: 10px 11px;
    text-align: left;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(247, 242, 234, 0.82);
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease;
  }

  .save-strip__phase-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(131, 188, 255, 0.24);
  }

  .save-strip__phase-btn strong {
    font-size: 12px;
  }

  .save-strip__phase-btn span {
    font-size: 11px;
    line-height: 1.35;
    color: rgba(247, 242, 234, 0.58);
  }

  .save-strip__phase-btn.is-selected {
    border-color: rgba(131, 188, 255, 0.42);
    background: rgba(77, 143, 245, 0.12);
    box-shadow: inset 0 0 0 1px rgba(131, 188, 255, 0.14);
  }

  .save-strip__phase-btn[data-tone='GENERAL'].is-selected {
    border-color: rgba(247, 242, 234, 0.22);
    background: rgba(255, 255, 255, 0.06);
  }

  .save-strip__phase-btn[data-tone='FAKE_DUMP'].is-selected {
    background: rgba(255, 77, 109, 0.14);
  }

  .save-strip__phase-btn[data-tone='ARCH_ZONE'].is-selected,
  .save-strip__phase-btn[data-tone='BREAKOUT'].is-selected {
    background: rgba(255, 210, 63, 0.14);
  }

  .save-strip__phase-btn[data-tone='REAL_DUMP'].is-selected {
    background: rgba(255, 77, 109, 0.2);
  }

  .save-strip__phase-btn[data-tone='ACCUMULATION'].is-selected {
    background: rgba(0, 212, 255, 0.16);
  }

  .save-strip__controls {
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .save-strip__note {
    display: grid;
    gap: 6px;
  }

  .save-strip__note span {
    font-size: 12px;
    font-weight: 700;
    color: rgba(247, 242, 234, 0.8);
  }

  .save-strip__textarea {
    width: 100%;
    min-height: 64px;
    resize: vertical;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(4, 7, 13, 0.82);
    color: rgba(247, 242, 234, 0.9);
    padding: 10px 12px;
    font: inherit;
  }

  .save-strip__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .save-strip__action {
    height: 42px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .save-strip__action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .save-strip__action--ghost {
    background: transparent;
    color: rgba(247, 242, 234, 0.68);
  }

  .save-strip__action--secondary {
    background: rgba(99, 179, 237, 0.12);
    color: rgba(181, 221, 255, 0.94);
    border-color: rgba(99, 179, 237, 0.28);
  }

  .save-strip__action--primary {
    background: linear-gradient(180deg, rgba(95, 168, 255, 0.92), rgba(49, 115, 224, 0.92));
    color: rgba(5, 12, 22, 0.96);
    border-color: rgba(95, 168, 255, 0.45);
    font-weight: 700;
  }

  .save-strip__preview-list {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .save-strip__preview-card {
    display: grid;
    gap: 6px;
    padding: 10px 11px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(6, 10, 18, 0.7);
    color: inherit;
    text-decoration: none;
  }

  .save-strip__preview-card:hover {
    border-color: rgba(131, 188, 255, 0.22);
  }

  .save-strip__preview-head,
  .save-strip__preview-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(247, 242, 234, 0.72);
  }

  .save-strip__preview-head strong {
    color: rgba(247, 242, 234, 0.92);
  }

  .save-strip__preview-card p,
  .save-strip__empty,
  .save-strip__error {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
  }

  .save-strip__empty {
    color: rgba(247, 242, 234, 0.58);
  }

  .save-strip__error {
    color: rgba(255, 139, 139, 0.92);
  }

  @media (max-width: 900px) {
    .save-strip__topline,
    .save-strip__controls {
      grid-template-columns: 1fr;
      display: grid;
    }

    .save-strip__pills,
    .save-strip__actions {
      justify-content: flex-start;
    }
  }
</style>
