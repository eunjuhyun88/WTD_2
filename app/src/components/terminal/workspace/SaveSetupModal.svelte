<script lang="ts">
  /**
   * SaveSetupModal — appears when user clicks "+ Save" on a candle.
   * Collects phase label + notes, then POSTs to engine /challenge/create.
   */

  interface Props {
    symbol:    string;
    timestamp: number;   // unix seconds
    tf:        string;
    open:      boolean;
    onClose:   () => void;
    onSaved:   (slug: string) => void;
  }

  let { symbol, timestamp, tf, open, onClose, onSaved }: Props = $props();

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

  // Format timestamp for display
  const displayTime = $derived(
    new Date(timestamp * 1000).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    })
  );
  const isoTime = $derived(new Date(timestamp * 1000).toISOString());

  async function handleSave() {
    if (saving) return;
    saving    = true;
    saveError = null;

    const label = PHASE_LABELS.find(p => p.id === selectedPhase)?.id ?? 'GENERAL';
    const body  = {
      snaps: [{ symbol, timestamp: isoTime, label }],
      note,
    };

    try {
      const res = await fetch('/api/engine/challenge/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onSaved(data.slug ?? '');
    } catch (e) {
      saveError = String(e);
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
<div class="modal-backdrop" onclick={onClose} onkeydown={handleKeydown} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>

    <!-- Header -->
    <div class="modal-header">
      <div class="header-left">
        <span class="modal-sym">{symbol.replace('USDT', '')}<span class="modal-quote">/USDT</span></span>
        <span class="modal-meta">{tf.toUpperCase()} · {displayTime}</span>
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
    </div>

    <!-- Phase selector -->
    <div class="section">
      <p class="section-label">캔들 페이즈 선택</p>
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
