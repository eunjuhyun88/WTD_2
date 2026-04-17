<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    patternCaptureContextStore,
    resolvePatternCaptureContext,
    type PatternCaptureContextState,
  } from '$lib/stores/patternCaptureContext';
  import {
    createPatternCapture as createPatternCaptureRecord,
    fetchSimilarPatternCaptures,
  } from '$lib/api/terminalPersistence';
  import type {
    ChartViewportSnapshot,
    PatternCaptureSimilarityMatch,
  } from '$lib/contracts/terminalPersistence';

  /**
   * SaveSetupModal persists reviewed-range evidence through the canonical
   * terminal capture route only. Downstream lab projection stays explicit.
   */

  interface Props {
    symbol:    string;
    timestamp: number;   // unix seconds
    tf:        string;
    open:      boolean;
    /** Fresh slice of visible chart + indicators at open / save time (from ChartBoard) */
    getViewportCapture?: () => ChartViewportSnapshot | null;
    onClose:   () => void;
    onSaved:   (captureId: string) => void;
    /**
     * Desktop mode: desktop save flow routes through SaveStrip + chartSaveMode instead.
     * When true this modal is a no-op (mobile-only path, per W-0086).
     */
    desktopMode?: boolean;
  }

  let { symbol, timestamp, tf, open, getViewportCapture, onClose, onSaved, desktopMode = false }: Props = $props();

  // Phase labels matching TRADOOR pattern phases
  const PHASE_LABELS = [
    { id: 'FAKE_DUMP',     label: 'Phase 0 — Fake Dump',     desc: '가짜 덤프, OI 미동, 매도 안 함' },
    { id: 'ARCH_ZONE',     label: 'Phase 1 — Arch Zone',     desc: '반등 후 옆걸음, BB 좁아짐' },
    { id: 'REAL_DUMP',     label: 'Phase 2 — Real Dump',     desc: 'OI 급등 + 거래량 폭발 덤프' },
    { id: 'ACCUMULATION',  label: 'Phase 3 — Accumulation',  desc: '진입 구간: Higher lows + Funding flip' },
    { id: 'BREAKOUT',      label: 'Phase 4 — Breakout',      desc: '돌파: OI 재급등 + 가격 돌파' },
    { id: 'GENERAL',       label: 'General Setup',            desc: '특정 페이즈 없는 일반 셋업' },
  ];

  let selectedPhase = $state('REAL_DUMP');
  let note          = $state('');
  let saving        = $state(false);
  let saveError     = $state<string | null>(null);
  let captureState = $state<PatternCaptureContextState>({ records: [], selectedKey: null });
  const unsubscribe = patternCaptureContextStore.subscribe((value) => {
    captureState = value;
  });
  onDestroy(unsubscribe);

  let captureContext = $derived(resolvePatternCaptureContext(captureState, symbol, tf));
  const candidateTransitionId = $derived(captureContext?.candidateTransitionId ?? captureContext?.transitionId ?? null);
  const canSavePatternCapture = $derived(Boolean(
    candidateTransitionId
    && captureContext?.symbol === symbol
    && (captureContext?.patternSlug ?? captureContext?.slug)
  ));

  // Format timestamp for display
  const displayTime = $derived(
    new Date(timestamp * 1000).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    })
  );
  let viewportPreview = $state<ChartViewportSnapshot | null>(null);
  let similarMatches = $state<PatternCaptureSimilarityMatch[]>([]);
  let similarLoading = $state(false);
  const canSubmitSave = $derived(Boolean(viewportPreview && viewportPreview.barCount > 0 && viewportPreview.klines.length > 0));
  $effect(() => {
    if (open && captureContext?.phase) {
      selectedPhase = captureContext.phase;
    }
  });
  $effect(() => {
    if (open) {
      viewportPreview = getViewportCapture?.() ?? null;
    }
  });
  $effect(() => {
    if (!open) {
      similarMatches = [];
      similarLoading = false;
      return;
    }
    const timer = setTimeout(async () => {
      similarLoading = true;
      try {
        similarMatches = await fetchSimilarPatternCaptures({
          symbol,
          timeframe: captureContext?.timeframe ?? tf,
          triggerOrigin: canSavePatternCapture ? 'pattern_transition' : 'manual',
          patternSlug: captureContext?.patternSlug ?? captureContext?.slug ?? undefined,
          reason: selectedPhase,
          note,
          snapshot: viewportPreview ? { viewport: viewportPreview } : {},
          limit: 4,
        });
      } finally {
        similarLoading = false;
      }
    }, 180);
    return () => clearTimeout(timer);
  });

  let viewportPreview = $state<ChartViewportSnapshot | null>(null);
  let similarMatches = $state<PatternCaptureSimilarityMatch[]>([]);
  let similarLoading = $state(false);
  $effect(() => {
    if (open && captureContext?.phase) {
      selectedPhase = captureContext.phase;
    }
  });
  $effect(() => {
    if (open) {
      viewportPreview = getViewportCapture?.() ?? null;
    }
  });
  $effect(() => {
    if (!open) {
      similarMatches = [];
      similarLoading = false;
      return;
    }
    const timer = setTimeout(async () => {
      similarLoading = true;
      try {
        similarMatches = await fetchSimilarPatternCaptures({
          symbol,
          timeframe: captureContext?.timeframe ?? tf,
          triggerOrigin: canSavePatternCapture ? 'pattern_transition' : 'manual',
          patternSlug: captureContext?.patternSlug ?? captureContext?.slug ?? undefined,
          reason: selectedPhase,
          note,
          snapshot: viewportPreview ? { viewport: viewportPreview } : {},
          limit: 4,
        });
      } finally {
        similarLoading = false;
      }
    }, 180);
    return () => clearTimeout(timer);
  });

  async function handleSave() {
    if (saving) return;
    const viewportAtSave = getViewportCapture?.() ?? viewportPreview ?? null;
    if (!viewportAtSave || viewportAtSave.barCount <= 0 || viewportAtSave.klines.length === 0) {
      saveError = 'exact_chart_range_required';
      return;
    }

    saving = true;
    saveError = null;

    const label = PHASE_LABELS.find(p => p.id === selectedPhase)?.id ?? 'GENERAL';
    const triggerOrigin = canSavePatternCapture && label !== 'GENERAL' ? 'pattern_transition' : 'manual';

    try {
      const captureRecord = await createPatternCaptureRecord({
        symbol,
        timeframe: captureContext?.timeframe ?? tf,
        contextKind: 'symbol',
        triggerOrigin,
        patternSlug: captureContext?.patternSlug ?? captureContext?.slug ?? undefined,
        reason: label,
        note,
        snapshot: {
          price: typeof captureContext?.featureSnapshot?.last_close === 'number' ? captureContext.featureSnapshot.last_close : null,
          change24h: null,
          funding: null,
          oiDelta: null,
          freshness: 'recent',
          viewport: viewportAtSave,
        },
        decision: {},
        evidenceHash: candidateTransitionId ?? undefined,
        sourceFreshness: { source: 'terminal_save_setup' },
      });
      if (!captureRecord) {
        saveError = 'capture_save_failed';
        return;
      }

      if (triggerOrigin === 'pattern_transition') {
        patternCaptureContextStore.clearSelection();
      }

      onSaved(captureRecord.id);
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open && !desktopMode}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose} onkeydown={handleKeydown} role="dialog" aria-modal="true" tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>

    <!-- Header -->
    <div class="modal-header">
      <div class="header-left">
        <span class="modal-sym">{symbol.replace('USDT', '')}<span class="modal-quote">/USDT</span></span>
        <span class="modal-meta">{tf.toUpperCase()} · {displayTime}</span>
        {#if viewportPreview}
          <span class="viewport-hint"
            >창 구간 {viewportPreview.barCount}봉 · {viewportPreview.tf}{#if viewportPreview.anchorTime}
              · 앵커 {new Date(viewportPreview.anchorTime * 1000).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}{/if}</span
          >
        {:else}
          <span class="viewport-hint viewport-hint--warning">정확한 차트 구간을 먼저 선택해야 저장됩니다.</span>
        {/if}
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
    </div>

    <!-- Phase selector -->
    <div class="section">
      <p class="section-label">캔들 페이즈 선택</p>
      {#if canSavePatternCapture}
        <div class="capture-context">
          <span>ENGINE CAPTURE</span>
          <strong>{captureContext?.slug}</strong>
          <small>{candidateTransitionId}</small>
        </div>
      {/if}
      <div class="phase-list">
        {#each PHASE_LABELS as phase}
          <button
            class="phase-btn"
            class:selected={selectedPhase === phase.id}
            onclick={() => { selectedPhase = phase.id; }}
          >
            <span class="phase-name">{phase.label}</span>
            <span class="phase-desc">{phase.desc}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Notes -->
    <div class="section">
      <p class="section-label">메모 (선택)</p>
      <textarea
        class="note-input"
        placeholder="긴 기준문도 그대로 넣어도 됨. 예: 저점 MC 100M 이하, 고점 대비 -90% 이내, SNS 활동 유지, 최근 락업/소각 이벤트..."
        bind:value={note}
        rows={6}
      ></textarea>
    </div>

    <div class="section">
      <div class="section-heading">
        <p class="section-label">비슷한 저장 캡처</p>
        <span class="section-meta">{similarLoading ? '탐색 중…' : `${similarMatches.length}건`}</span>
      </div>
      {#if similarMatches.length === 0}
        <div class="similar-empty">메모와 현재 차트 구간을 같이 써서 저장된 캡처 중 비슷한 구조를 미리 보여줍니다.</div>
      {:else}
        <div class="similar-list">
          {#each similarMatches as match}
            <div class="similar-card">
              <div class="similar-top">
                <strong>{match.record.symbol}</strong>
                <span>{Math.round(match.score * 100)}%</span>
              </div>
              <div class="similar-meta">
                <span>{match.record.timeframe}</span>
                {#if match.record.reason}
                  <span>{match.record.reason}</span>
                {/if}
                <span>{new Date(match.record.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
              <div class="similar-breakdown">
                <span>차트 {Math.round(match.breakdown.chart * 100)}</span>
                <span>텍스트 {Math.round(match.breakdown.text * 100)}</span>
                <span>페이즈 {Math.round(match.breakdown.phase * 100)}</span>
              </div>
              {#if match.record.note}
                <p class="similar-note">{match.record.note}</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if saveError}
      <p class="save-error">! {saveError}</p>
    {/if}

    <!-- Actions -->
    <div class="modal-actions">
      <button class="cancel-btn" onclick={onClose}>취소</button>
      <button class="save-btn" onclick={handleSave} disabled={saving || !canSubmitSave}>
        {saving ? '저장 중…' : '셋업 저장 →'}
      </button>
    </div>

  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: linear-gradient(90deg, rgba(3, 6, 10, 0.14), rgba(3, 6, 10, 0.5));
    z-index: 1000;
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
    padding: 10px;
  }

  .modal {
    background: #0f0f0f;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    width: 100%;
    max-width: 420px;
    height: calc(100dvh - 20px);
    display: flex;
    flex-direction: column;
    gap: 0;
    box-shadow: 0 24px 80px rgba(0,0,0,0.8);
    overflow: auto;
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .header-left { display: flex; flex-direction: column; gap: 2px; }
  .modal-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 15px;
    font-weight: 700;
    color: #fff;
  }
  .modal-quote { font-weight: 400; color: rgba(255,255,255,0.3); font-size: 12px; }
  .modal-meta {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.35);
  }
  .viewport-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(94, 234, 212, 0.75);
    margin-top: 2px;
  }
  .viewport-hint--warning {
    color: rgba(255, 196, 120, 0.92);
  }
  .close-btn {
    background: none;
    border: none;
    color: rgba(255,255,255,0.3);
    font-size: 14px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: color 0.1s;
  }
  .close-btn:hover { color: rgba(255,255,255,0.7); }

  /* Section */
  .section {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.25);
    margin: 0;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .section-meta {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.38);
  }

  .capture-context {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    background: rgba(74, 222, 128, 0.06);
    border: 1px solid rgba(74, 222, 128, 0.18);
    border-radius: 4px;
  }
  .capture-context span {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    color: rgba(74, 222, 128, 0.7);
    letter-spacing: 0.1em;
  }
  .capture-context strong {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: #4ade80;
  }
  .capture-context small {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.35);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Phase buttons */
  .phase-list { display: flex; flex-direction: column; gap: 3px; }
  .phase-btn {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: all 0.1s;
  }
  .phase-btn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); }
  .phase-btn.selected {
    background: rgba(38,166,154,0.1);
    border-color: rgba(38,166,154,0.4);
  }
  .phase-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.8);
  }
  .phase-btn.selected .phase-name { color: #26a69a; }
  .phase-desc {
    font-size: 10px;
    color: rgba(255,255,255,0.3);
  }

  /* Notes */
  .note-input {
    width: 100%;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: rgba(255,255,255,0.8);
    font-family: var(--sc-font-body, sans-serif);
    font-size: 12px;
    padding: 8px 10px;
    resize: vertical;
    line-height: 1.5;
    box-sizing: border-box;
    transition: border-color 0.1s;
  }
  .note-input:focus { outline: none; border-color: rgba(38,166,154,0.4); }
  .note-input::placeholder { color: rgba(255,255,255,0.2); }
  .similar-empty {
    padding: 12px 14px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    border-radius: 8px;
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    line-height: 1.45;
  }
  .similar-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .similar-card {
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .similar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #fff;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
  }
  .similar-meta,
  .similar-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 10px;
    color: rgba(255,255,255,0.45);
    font-family: var(--sc-font-mono, monospace);
  }
  .similar-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: rgba(255,255,255,0.72);
    display: -webkit-box;
    line-clamp: 3;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Error */
  .save-error {
    margin: 0;
    padding: 0 16px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: #f87171;
  }

  /* Actions */
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
  }
  .cancel-btn {
    padding: 7px 14px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4);
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    transition: all 0.1s;
  }
  .cancel-btn:hover { border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.7); }
  .save-btn {
    padding: 7px 18px;
    background: rgba(38,166,154,0.15);
    border: 1px solid rgba(38,166,154,0.45);
    color: #26a69a;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    transition: all 0.12s;
  }
  .save-btn:hover:not(:disabled) { background: rgba(38,166,154,0.28); }
  .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
