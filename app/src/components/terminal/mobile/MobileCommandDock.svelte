<script lang="ts">
  import { activePair, activeTimeframe } from '$lib/stores/activePairStore';

  interface Props {
    onSend?: (text: string, files?: File[]) => void;
    loading?: boolean;
    queryChips?: Array<{ id: string; label: string; action: string }>;
    onChip?: (action: string) => void;
  }

  let {
    onSend,
    loading = false,
    queryChips = [],
    onChip,
  }: Props = $props();

  let inputText = $state('');
  let files = $state<File[]>([]);
  let fileInputRef: HTMLInputElement;
  let expanded = $state(false);

  function handleSend() {
    if (!inputText.trim() && files.length === 0) return;
    onSend?.(inputText.trim(), files.length > 0 ? files : undefined);
    inputText = '';
    files = [];
    expanded = false;
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

  function handleChip(action: string) {
    onChip?.(action);
    expanded = false;
  }

  function handleFocus() {
    expanded = true;
  }
</script>

<div class="command-dock" class:expanded>

  <!-- Quick chip strip (collapsed state) -->
  {#if !expanded && queryChips.length > 0}
    <div class="chip-strip">
      {#each queryChips.slice(0, 5) as chip (chip.id)}
        <button class="quick-chip" onclick={() => handleChip(chip.action)}>
          {chip.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Context badge row -->
  <div class="context-row">
    <span class="ctx-badge">{$activePair || 'BTC/USDT'}</span>
    <span class="ctx-sep">·</span>
    <span class="ctx-badge">{($activeTimeframe || '4h').toUpperCase()}</span>
    {#if loading}
      <span class="loading-dot">●</span>
    {/if}
  </div>

  <!-- Composer -->
  <div class="composer" class:composer-active={expanded}>
    <div class="input-row">
      <textarea
        class="cmd-input"
        placeholder="Ask about {$activePair || 'BTC/USDT'}…"
        bind:value={inputText}
        onkeydown={handleKeydown}
        onfocus={handleFocus}
        rows={expanded ? 2 : 1}
      ></textarea>

      <div class="actions">
        {#if expanded}
          <button
            class="action-btn"
            title="Attach image"
            onclick={() => fileInputRef.click()}
            aria-label="Attach image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
          </button>
          <input
            type="file"
            accept="image/*"
            multiple
            bind:this={fileInputRef}
            onchange={handleFileChange}
            style="display:none"
          />
        {/if}

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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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
            <button onclick={() => files = files.filter((_,j) => j !== i)} aria-label="Remove file">×</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Dismiss overlay touch zone when expanded -->
  {#if expanded && inputText.length === 0}
    <button
      class="dismiss-hint"
      onclick={() => expanded = false}
      aria-label="Collapse input"
    >
      tap outside to dismiss
    </button>
  {/if}

</div>

<style>
  .command-dock {
    flex-shrink: 0;
    background: var(--sc-bg-1);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 12px;
    padding-bottom: calc(6px + env(safe-area-inset-bottom));
    transition: height 0.2s ease;
  }

  /* ── Chip strip ── */
  .chip-strip {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .chip-strip::-webkit-scrollbar { display: none; }

  .quick-chip {
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--sc-text-1);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .quick-chip:active {
    background: rgba(255, 255, 255, 0.12);
    color: var(--sc-text-0);
  }

  /* ── Context ── */
  .context-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 5px;
  }

  .ctx-badge {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--sc-text-2);
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
  }

  .ctx-sep {
    color: var(--sc-text-3);
    font-size: 10px;
  }

  .loading-dot {
    color: #fbbf24;
    font-size: 8px;
    animation: pulse 1s infinite;
  }

  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }

  /* ── Composer ── */
  .composer {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .composer-active {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .input-row {
    display: flex;
    align-items: flex-end;
  }

  .cmd-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-family: var(--sc-font-body);
    font-size: 15px;
    color: var(--sc-text-0);
    padding: 10px 12px;
    line-height: 1.4;
    min-height: 40px;
    max-height: 100px;
    -webkit-appearance: none;
  }

  .cmd-input::placeholder { color: var(--sc-text-3); }

  .actions {
    display: flex;
    align-items: flex-end;
    padding: 7px 8px;
    gap: 4px;
  }

  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--sc-text-2);
    padding: 4px;
    border-radius: 4px;
    line-height: 0;
  }

  .send-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    cursor: pointer;
    color: var(--sc-text-2);
    padding: 7px 9px;
    transition: all 0.15s;
    line-height: 0;
    min-width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .send-btn.has-input {
    background: rgba(247, 242, 234, 0.14);
    color: var(--sc-text-0);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sending-dot {
    color: #fbbf24;
    font-size: 8px;
    animation: pulse 0.8s infinite;
  }

  /* ── Files ── */
  .file-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 10px 8px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-1);
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 20px;
  }

  .file-chip button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--sc-text-3);
    font-size: 12px;
    line-height: 1;
    padding: 0;
  }

  /* ── Dismiss ── */
  .dismiss-hint {
    display: block;
    width: 100%;
    text-align: center;
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-3);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0 0;
    letter-spacing: 0.04em;
  }
</style>
