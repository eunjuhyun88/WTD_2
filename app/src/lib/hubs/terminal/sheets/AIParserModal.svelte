<script lang="ts">
  /**
   * AIParserModal — A-03-app entry component.
   *
   * 자유 텍스트 메모 → engine /patterns/parse (configured LLM runtime) →
   * PatternDraftBody preview → 저장 (POST /captures).
   *
   * Modal 패턴: SaveSetupModal 참조.
   */

  import { parsePatternFromText, type PatternDraftBodyShape } from '$lib/api/terminalApi';

  interface Props {
    open: boolean;
    symbol?: string;
    patternFamily?: string;
    onClose: () => void;
    onSaved?: (draft: PatternDraftBodyShape) => void;
  }

  let { open, symbol, patternFamily, onClose, onSaved }: Props = $props();

  let text = $state('');
  let parsing = $state(false);
  let parseError = $state<string | null>(null);
  let draft = $state<PatternDraftBodyShape | null>(null);

  const MAX_CHARS = 5000;
  const charCount = $derived(text.length);
  const overLimit = $derived(charCount > MAX_CHARS);
  const canParse = $derived(!parsing && text.trim().length > 0 && !overLimit);

  $effect(() => {
    if (!open) {
      // Reset state on close
      setTimeout(() => {
        text = '';
        draft = null;
        parseError = null;
      }, 200);
    }
  });

  async function handleParse() {
    if (!canParse) return;
    parsing = true;
    parseError = null;
    draft = null;
    try {
      const result = await parsePatternFromText(text.trim(), {
        symbol,
        pattern_family: patternFamily,
      });
      draft = result;
    } catch (e) {
      parseError = e instanceof Error ? e.message : 'Parse 실패';
    } finally {
      parsing = false;
    }
  }

  function handleSave() {
    if (!draft) return;
    onSaved?.(draft);
    onClose();
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && !parsing) onClose();
  }
</script>

<svelte:window onkeydown={handleEscape} />

{#if open}
  <div
    class="parser-overlay"
    role="dialog"
    aria-labelledby="parser-title"
    aria-modal="true"
  >
    <div
      class="parser-overlay-bg"
      role="button"
      tabindex="-1"
      aria-label="Close modal"
      onclick={() => !parsing && onClose()}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') !parsing && onClose(); }}
    ></div>

    <div class="parser-sheet">
      <div class="parser-header">
        <h2 id="parser-title" class="parser-title">📝 메모로 패턴 만들기</h2>
        <button class="close-btn" onclick={onClose} disabled={parsing} aria-label="Close">×</button>
      </div>

      <div class="parser-body">
        {#if !draft}
          <textarea
            class="parser-textarea"
            class:over-limit={overLimit}
            bind:value={text}
            placeholder="텔레그램 메모, 분석 노트 등 자유롭게 붙여넣으세요...&#10;&#10;예: BTC 4h. OI 급등하면서 funding 양수로 전환. higher lows + smart money cohort entry. accumulation 진입 후보."
            rows="12"
            disabled={parsing}
          ></textarea>

          <div class="parser-meta">
            <span class="char-count" class:warn={overLimit}>
              {charCount} / {MAX_CHARS}
            </span>
            {#if overLimit}
              <span class="error-msg">너무 깁니다 — {MAX_CHARS}자 이하로 줄여주세요</span>
            {/if}
          </div>

          {#if parseError}
            <div class="parse-error">{parseError}</div>
          {/if}

          <div class="parser-actions">
            <button class="btn-secondary" onclick={onClose} disabled={parsing}>취소</button>
            <button
              class="btn-primary"
              onclick={handleParse}
              disabled={!canParse}
              title={!canParse ? '텍스트를 입력하세요' : 'AI에게 패턴 추출 요청'}
            >
              {#if parsing}
                <span class="spinner">●</span> Parsing…
              {:else}
                ✨ Parse
              {/if}
            </button>
          </div>
        {:else}
          <!-- Draft preview -->
          <div class="draft-preview">
            <div class="draft-section">
              <h3>패턴</h3>
              <div class="draft-meta">
                {#if draft.pattern_family}
                  <span class="meta-chip">{draft.pattern_family}</span>
                {/if}
                {#if draft.pattern_label}
                  <span class="meta-chip primary">{draft.pattern_label}</span>
                {/if}
              </div>
            </div>

            {#if draft.phases && draft.phases.length > 0}
              <div class="draft-section">
                <h3>Phases ({draft.phases.length})</h3>
                <div class="phases-list">
                  {#each draft.phases as phase}
                    <div class="phase-card">
                      <span class="phase-id">{phase.phase_id}</span>
                      {#if phase.must_have && phase.must_have.length > 0}
                        <span class="phase-musts">{phase.must_have.join(', ')}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="draft-section">
              <h3>Signals</h3>
              <div class="signals-grid">
                {#if draft.signals_required && draft.signals_required.length > 0}
                  <div class="signals-row">
                    <span class="signals-label">required</span>
                    {#each draft.signals_required as sig}
                      <span class="sig-chip required">{sig}</span>
                    {/each}
                  </div>
                {/if}
                {#if draft.signals_preferred && draft.signals_preferred.length > 0}
                  <div class="signals-row">
                    <span class="signals-label">preferred</span>
                    {#each draft.signals_preferred as sig}
                      <span class="sig-chip preferred">{sig}</span>
                    {/each}
                  </div>
                {/if}
                {#if draft.signals_forbidden && draft.signals_forbidden.length > 0}
                  <div class="signals-row">
                    <span class="signals-label">forbidden</span>
                    {#each draft.signals_forbidden as sig}
                      <span class="sig-chip forbidden">{sig}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <div class="parser-actions">
              <button class="btn-secondary" onclick={() => { draft = null; }}>다시 작성</button>
              <button class="btn-primary" onclick={handleSave}>💾 저장</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .parser-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .parser-overlay-bg {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    cursor: pointer;
  }
  .parser-sheet {
    position: relative;
    width: 100%;
    max-width: 640px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    border: 1px solid rgba(219, 154, 159, 0.25);
    border-radius: 6px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .parser-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .parser-title {
    margin: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #f7f2ea;
  }
  .close-btn {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(247, 242, 234, 0.6);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .close-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    color: #f7f2ea;
  }
  .parser-body {
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .parser-textarea {
    width: 100%;
    min-height: 240px;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #f7f2ea;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
  }
  .parser-textarea:focus {
    outline: none;
    border-color: rgba(219, 154, 159, 0.5);
  }
  .parser-textarea.over-limit {
    border-color: rgba(248, 113, 113, 0.6);
  }
  .parser-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
  }
  .char-count {
    color: rgba(247, 242, 234, 0.45);
  }
  .char-count.warn {
    color: #f87171;
  }
  .error-msg {
    color: #f87171;
  }
  .parse-error {
    padding: 8px 10px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.3);
    border-radius: 3px;
    color: #f87171;
    font-size: 11px;
    font-family: var(--sc-font-mono, monospace);
  }
  .parser-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .btn-primary, .btn-secondary {
    padding: 8px 16px;
    border-radius: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary {
    background: rgba(219, 154, 159, 0.18);
    border: 1px solid rgba(219, 154, 159, 0.5);
    color: #db9a9f;
  }
  .btn-primary:hover:not(:disabled) {
    background: rgba(219, 154, 159, 0.28);
  }
  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(247, 242, 234, 0.7);
  }
  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
  }
  .btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
  .spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .draft-preview {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .draft-section h3 {
    margin: 0 0 6px 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(247, 242, 234, 0.5);
  }
  .draft-meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .meta-chip {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 10px;
    background: rgba(34, 211, 238, 0.12);
    color: rgba(34, 211, 238, 0.95);
    font-family: var(--sc-font-mono, monospace);
  }
  .meta-chip.primary {
    background: rgba(219, 154, 159, 0.18);
    color: #db9a9f;
  }
  .phases-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .phase-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 3px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
  }
  .phase-id {
    font-weight: 700;
    color: #f7f2ea;
  }
  .phase-musts {
    color: rgba(247, 242, 234, 0.5);
    font-size: var(--ui-text-xs);
  }
  .signals-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .signals-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .signals-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247, 242, 234, 0.4);
    min-width: 64px;
  }
  .sig-chip {
    font-size: var(--ui-text-xs);
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    font-family: var(--sc-font-mono, monospace);
  }
  .sig-chip.required {
    border-color: rgba(219, 154, 159, 0.5);
    color: #db9a9f;
  }
  .sig-chip.preferred {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(247, 242, 234, 0.7);
  }
  .sig-chip.forbidden {
    border-color: rgba(248, 113, 113, 0.5);
    color: #f87171;
  }
</style>
