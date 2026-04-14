<script lang="ts">
  import { activePair, activeTimeframe } from '$lib/stores/activePairStore';

  interface Props {
    onSend?: (text: string, files?: File[]) => void;
    loading?: boolean;
  }
  let { onSend, loading = false }: Props = $props();

  let inputText = $state('');
  let files = $state<File[]>([]);
  let fileInputRef: HTMLInputElement;

  function handleSend() {
    if (!inputText.trim() && files.length === 0) return;
    onSend?.(inputText.trim(), files.length > 0 ? files : undefined);
    inputText = '';
    files = [];
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) files = [...files, ...Array.from(input.files)];
  }
</script>

<div class="bottom-dock">
  <div class="dock-bar">
    <!-- Inline context badges -->
    <div class="ctx-badges">
      <span class="ctx-badge">{$activePair || 'BTC/USDT'}</span>
      <span class="ctx-sep">·</span>
      <span class="ctx-badge">{($activeTimeframe || '4h').toUpperCase()}</span>
      {#if loading}
        <span class="loading-dot">●</span>
      {/if}
    </div>

    <!-- Textarea -->
    <textarea
      class="cmd-input"
      placeholder="Ask…"
      bind:value={inputText}
      onkeydown={handleKeydown}
      rows="1"
    ></textarea>

    <!-- Actions -->
    <div class="dock-actions">
      <button class="icon-btn" title="Attach" onclick={() => fileInputRef.click()} aria-label="Attach image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
      </button>
      <input type="file" accept="image/*" multiple bind:this={fileInputRef} onchange={handleFileChange} style="display:none" />

      <button
        class="send-btn"
        class:active={inputText.trim().length > 0}
        onclick={handleSend}
        disabled={loading}
        aria-label="Send"
      >
        {#if loading}
          <span class="send-pulse">●</span>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>

  {#if files.length > 0}
    <div class="file-row">
      {#each files as f, i}
        <span class="file-chip">
          {f.name}
          <button onclick={() => files = files.filter((_,j) => j !== i)} aria-label="Remove">×</button>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bottom-dock {
    flex-shrink: 0;
    background: var(--sc-bg-1, #0a0a0a);
    border-top: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    padding: 6px 12px;
  }

  .dock-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 7px;
    padding: 0 6px 0 10px;
    min-height: 36px;
  }

  /* Context badges */
  .ctx-badges {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .ctx-badge {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    color: var(--sc-text-3);
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .ctx-sep {
    color: var(--sc-text-3);
    font-size: 9px;
    opacity: 0.5;
  }

  .loading-dot {
    font-size: 6px;
    color: #fbbf24;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.2 } }

  /* Divider between badges and input */
  .ctx-badges::after {
    content: '';
    display: block;
    width: 1px;
    height: 14px;
    background: rgba(255,255,255,0.1);
    margin-left: 6px;
  }

  /* Textarea */
  .cmd-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-family: var(--sc-font-body);
    font-size: 13px;
    color: var(--sc-text-0);
    line-height: 1.4;
    padding: 8px 0;
    min-height: 20px;
    max-height: 80px;
    appearance: none;
    -webkit-appearance: none;
  }

  .cmd-input::placeholder {
    color: var(--sc-text-3);
    font-size: 13px;
  }

  /* Actions */
  .dock-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--sc-text-3);
    padding: 5px;
    border-radius: 4px;
    line-height: 0;
    transition: color 0.12s;
  }

  .icon-btn:hover { color: var(--sc-text-1); }

  .send-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    cursor: pointer;
    color: var(--sc-text-3);
    padding: 5px 7px;
    line-height: 0;
    transition: all 0.12s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
  }

  .send-btn.active {
    background: rgba(247,242,234,0.12);
    border-color: rgba(255,255,255,0.18);
    color: var(--sc-text-0);
  }

  .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .send-pulse {
    font-size: 6px;
    color: #fbbf24;
    animation: pulse 0.7s ease-in-out infinite;
  }

  /* File chips */
  .file-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 2px 0;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-1);
    padding: 2px 7px;
    background: rgba(255,255,255,0.06);
    border-radius: 20px;
  }

  .file-chip button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--sc-text-3);
    font-size: 11px;
    line-height: 1;
    padding: 0;
  }
</style>
