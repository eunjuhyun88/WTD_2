<script lang="ts">
  import { activePair } from '$lib/stores/activePairStore';

  interface Props {
    onSend?: (text: string, files?: File[]) => void;
    loading?: boolean;
    queryChips?: Array<{ id: string; label: string; action: string }>;
    onChip?: (action: string) => void;
    assistantText?: string;
    onOpenDetail?: () => void;
  }

  let {
    onSend,
    loading = false,
    queryChips = [],
    onChip,
    assistantText = '',
    onOpenDetail,
  }: Props = $props();

  let inputText = $state('');
  let files = $state<File[]>([]);
  let fileInputRef = $state<HTMLInputElement | null>(null);

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

  function handleChip(action: string) {
    onChip?.(action);
  }
</script>

<div class="command-dock">
  <div class="dock-topline">
    <div class="dock-labels">
      <span class="context-kicker">Prompt</span>
      <strong class="mobile-pair">{$activePair || 'BTC/USDT'}</strong>
    </div>
    <button class="detail-btn" type="button" onclick={() => onOpenDetail?.()}>
      Analysis
    </button>
  </div>

  {#if assistantText}
    <div class="result-preview" data-loading={loading}>
      <span class="result-preview-kicker">{loading ? 'AI Streaming' : 'Latest Response'}</span>
      <p>{assistantText}</p>
    </div>
  {/if}

  <div class="composer">
    <textarea
      class="cmd-input"
      placeholder="Ask before you save or hand off."
      bind:value={inputText}
      onkeydown={handleKeydown}
      rows="1"
    ></textarea>

    <div class="actions">
      <button
        class="action-btn"
        title="Attach image"
        onclick={() => fileInputRef?.click()}
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
          <button onclick={() => files = files.filter((_, j) => j !== i)} aria-label="Remove file">×</button>
        </span>
      {/each}
    </div>
  {/if}

  {#if queryChips.length > 0}
    <div class="chip-strip">
      {#each queryChips.slice(0, 3) as chip (chip.id)}
        <button class="quick-chip" onclick={() => handleChip(chip.action)}>
          {chip.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .command-dock {
    position: sticky;
    bottom: 0;
    z-index: 18;
    display: grid;
    gap: 7px;
    padding: 7px 10px calc(8px + env(safe-area-inset-bottom));
    background:
      linear-gradient(180deg, rgba(6,8,13,0.72), rgba(6,8,13,0.96) 24%, rgba(6,8,13,1));
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 -10px 26px rgba(0, 0, 0, 0.28);
  }

  .dock-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .dock-labels {
    display: inline-grid;
    gap: 2px;
  }

  .context-kicker,
  .result-preview-kicker {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(131, 188, 255, 0.82);
  }

  .mobile-pair {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: rgba(247,242,234,0.88);
  }

  .detail-btn {
    min-height: 32px;
    padding: 0 11px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: var(--sc-text-1);
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  .result-preview {
    display: grid;
    gap: 4px;
    padding: 7px 9px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
  }

  .result-preview p {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--sc-text-1);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-preview[data-loading='true'] {
    border-color: rgba(74,222,128,0.18);
    background: rgba(74,222,128,0.05);
  }

  .composer {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 7px 7px 7px 11px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(8,12,18,0.78);
  }

  .cmd-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-family: var(--sc-font-body);
    font-size: 14px;
    color: var(--sc-text-0);
    padding: 8px 0;
    line-height: 1.4;
    min-height: 40px;
    max-height: 92px;
    appearance: none;
    -webkit-appearance: none;
  }

  .cmd-input::placeholder {
    color: var(--sc-text-3);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .action-btn,
  .send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    border-radius: 7px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: var(--sc-text-2);
    cursor: pointer;
  }

  .send-btn.has-input {
    background: rgba(77,143,245,0.18);
    border-color: rgba(77,143,245,0.3);
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

  .file-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-1);
  }

  .file-chip button {
    background: none;
    border: none;
    color: var(--sc-text-3);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .chip-strip {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .chip-strip::-webkit-scrollbar {
    display: none;
  }

  .quick-chip {
    flex-shrink: 0;
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: var(--sc-text-1);
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    cursor: pointer;
    white-space: nowrap;
  }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
</style>
