<script lang="ts">
  /**
   * MobilePromptFooter — sticky prompt input + send above the BottomTabBar.
   * Renamed/refactored from MobileCommandDock.
   * Input + send only; no quick chips per spec.
   * Position: sticky bottom at BottomTabBar height (56px + safe-area).
   */

  interface Props {
    onSend?: (text: string) => void;
    loading?: boolean;
    assistantText?: string;
  }

  let { onSend, loading = false, assistantText = '' }: Props = $props();

  let inputText = $state('');

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    onSend?.(text);
    inputText = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="prompt-footer">
  {#if assistantText}
    <div class="result-preview" data-loading={loading}>
      <span class="result-kicker">{loading ? 'AI streaming' : 'Latest response'}</span>
      <p class="result-text">{assistantText}</p>
    </div>
  {/if}

  <div class="composer">
    <textarea
      class="input"
      placeholder="Enter an analysis or question"
      rows="1"
      bind:value={inputText}
      onkeydown={handleKeydown}
    ></textarea>

    <button
      class="send-btn"
      class:has-input={inputText.trim().length > 0}
      onclick={handleSend}
      disabled={loading}
      aria-label="Send"
    >
      {#if loading}
        <span class="sending-dot">●</span>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      {/if}
    </button>
  </div>
</div>

<style>
  .prompt-footer {
    position: sticky;
    /* Sit directly above BottomTabBar: 56px height + safe-area */
    bottom: calc(56px + env(safe-area-inset-bottom));
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    background: linear-gradient(
      180deg,
      rgba(6, 8, 13, 0.7),
      rgba(6, 8, 13, 0.96) 24%,
      rgba(6, 8, 13, 1)
    );
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .result-preview {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .result-preview[data-loading='true'] {
    border-color: rgba(74, 222, 128, 0.18);
    background: rgba(74, 222, 128, 0.04);
  }

  .result-kicker {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(131, 188, 255, 0.8);
  }

  .result-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--sc-text-1, rgba(247,242,234,0.78));
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(8, 12, 18, 0.8);
  }

  .input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-family: var(--sc-font-body);
    font-size: 14px;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    padding: 6px 0;
    line-height: 1.4;
    min-height: 40px;
    max-height: 88px;
    -webkit-appearance: none;
    appearance: none;
  }

  .input::placeholder {
    color: var(--sc-text-3, rgba(255,255,255,0.3));
  }

  .send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .send-btn.has-input {
    background: rgba(77, 143, 245, 0.18);
    border-color: rgba(77, 143, 245, 0.3);
    color: var(--sc-text-0, rgba(247,242,234,0.98));
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sending-dot {
    color: #fbbf24;
    font-size: var(--ui-text-xs);
    animation: pulse 0.8s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }
</style>
