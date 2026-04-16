<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    patternCaptureContextStore,
    resolvePatternCaptureContext,
    type PatternCaptureContextState,
  } from '$lib/stores/patternCaptureContext';
  import { createPatternCapture as createPatternCaptureRecord } from '$lib/api/terminalPersistence';
  import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';

  /**
   * SaveSetupModal — appears when user clicks "+ Save" on a candle.
   * Pattern candidate saves go to engine /captures. Manual saves keep the
   * legacy /challenge/create fallback.
   */

  interface Props {
    symbol:    string;
    timestamp: number;   // unix seconds
    tf:        string;
    open:      boolean;
    getViewportCapture?: () => ChartViewportSnapshot | null;
    onClose:   () => void;
    onSaved:   (slug: string) => void;
  }

  let { symbol, timestamp, tf, open, getViewportCapture, onClose, onSaved }: Props = $props();

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
  const isoTime = $derived(new Date(timestamp * 1000).toISOString());
  let viewportPreview = $state<ChartViewportSnapshot | null>(null);

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

  async function handleSave() {
    if (saving) return;
    saving    = true;
    saveError = null;

    const label = PHASE_LABELS.find(p => p.id === selectedPhase)?.id ?? 'GENERAL';
    const shouldCreatePatternCapture = canSavePatternCapture && label !== 'GENERAL';
    let captureRecordId: string | null = null;
    const engineCaptureSymbol = captureContext?.symbol ?? symbol;
    const engineCaptureTimeframe = captureContext?.timeframe ?? tf;
    const engineCaptureSlug = captureContext?.patternSlug ?? captureContext?.slug ?? '';
    const engineCapturePhase = captureContext?.phase ?? label;
    const viewportAtSave = getViewportCapture?.() ?? null;

    try {
      const captureRecord = await createPatternCaptureRecord({
        symbol,
        timeframe: captureContext?.timeframe ?? tf,
        contextKind: 'symbol',
        triggerOrigin: shouldCreatePatternCapture ? 'pattern_transition' : 'manual',
        patternSlug: captureContext?.patternSlug ?? captureContext?.slug ?? undefined,
        reason: label,
        note,
        snapshot: {
          price: typeof captureContext?.featureSnapshot?.last_close === 'number' ? captureContext.featureSnapshot.last_close : null,
          change24h: null,
          funding: null,
          oiDelta: null,
          freshness: 'recent',
          ...(viewportAtSave ? { viewport: viewportAtSave } : {}),
        },
        decision: {},
        evidenceHash: candidateTransitionId ?? undefined,
        sourceFreshness: { source: 'terminal_save_setup' },
      });
      if (!captureRecord) {
        console.warn('[save-setup] pattern capture create failed; continuing without pattern_capture_id');
      } else {
        captureRecordId = captureRecord.id;
      }

      let res: Response;
      if (shouldCreatePatternCapture) {
        res = await fetch('/api/engine/captures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              capture_kind: 'pattern_candidate',
              symbol: engineCaptureSymbol,
              pattern_slug: engineCaptureSlug,
              pattern_version: captureContext?.patternVersion ?? 1,
              phase: engineCapturePhase,
              timeframe: engineCaptureTimeframe,
              candidate_transition_id: candidateTransitionId,
              scan_id: captureContext?.scanId,
              user_note: note,
              chart_context: {
                timestamp: isoTime,
                selected_phase: label,
                source: 'terminal_save_setup',
                ...(captureRecordId ? { pattern_capture_id: captureRecordId } : {}),
                ...(viewportAtSave
                  ? {
                      viewport_tf: viewportAtSave.tf,
                      viewport_bar_count: viewportAtSave.barCount,
                      viewport_time_from: new Date(viewportAtSave.timeFrom * 1000).toISOString(),
                      viewport_time_to: new Date(viewportAtSave.timeTo * 1000).toISOString(),
                    }
                  : {}),
              },
              feature_snapshot: captureContext?.featureSnapshot ?? undefined,
              block_scores: captureContext?.blockScores ?? {},
            }),
          });

        if (!res.ok && res.status === 400) {
          console.warn('[save-setup] /api/engine/captures returned 400; falling back to challenge/create');
          res = await fetch('/api/engine/challenge/create', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              snaps: [{ symbol, timestamp: isoTime, label }],
              note,
              ...(captureRecordId ? { pattern_capture_id: captureRecordId } : {}),
            }),
          });
        }
      } else {
        res = await fetch('/api/engine/challenge/create', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              snaps: [{ symbol, timestamp: isoTime, label }],
              note,
              ...(captureRecordId ? { pattern_capture_id: captureRecordId } : {}),
            }),
          });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (shouldCreatePatternCapture) {
        patternCaptureContextStore.clearSelection();
      }
      onSaved(captureRecordId ?? data.capture?.capture_id ?? data.slug ?? '');
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('HTTP ')) {
        saveError = `engine_save_failed (${e.message})`;
      } else {
        saveError = String(e);
      }
    } finally {
      saving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open}
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
        placeholder="ex: OI +22%, 거래량 4.3x, 진입은 Phase 3 Higher lows 후..."
        bind:value={note}
        rows={3}
      ></textarea>
    </div>

    {#if saveError}
      <p class="save-error">! {saveError}</p>
    {/if}

    <!-- Actions -->
    <div class="modal-actions">
      <button class="cancel-btn" onclick={onClose}>취소</button>
      <button class="save-btn" onclick={handleSave} disabled={saving}>
        {saving ? '저장 중…' : canSavePatternCapture && selectedPhase !== 'GENERAL' ? '캡처 저장 →' : '셋업 저장 →'}
      </button>
    </div>

  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal {
    background: #0f0f0f;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 0;
    box-shadow: 0 24px 80px rgba(0,0,0,0.8);
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
