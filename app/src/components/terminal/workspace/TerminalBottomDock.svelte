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
    if (e.key === 'Enter' && !e.shiftKey) {
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
  <div class="context-strip">
    <span class="context-badge">{$activePair || 'BTC/USDT'}</span>
    <span class="context-sep">·</span>
    <span class="context-badge">{($activeTimeframe || '4h').toUpperCase()}</span>
    {#if loading}
      <span class="loading-dot">●</span>
    {/if}
  </div>

  <div class="composer">
    <div class="input-row">
      <textarea
        class="command-input"
        placeholder="Ask about {$activePair || 'BTC/USDT'}… (Enter to send, Shift+Enter for newline)"
        bind:value={inputText}
        onkeydown={handleKeydown}
        rows="1"
      ></textarea>

      <div class="actions">
        <button class="action-btn" title="Attach image" onclick={() => fileInputRef.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </button>
        <input type="file" accept="image/*" multiple bind:this={fileInputRef} onchange={handleFileChange} style="display:none" />

        <button class="send-btn" class:has-input={inputText.trim().length > 0} onclick={handleSend} disabled={loading} aria-label="Send message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>

    {#if files.length > 0}
      <div class="file-preview">
        {#each files as f, i}
          <span class="file-chip">
            {f.name}
            <button onclick={() => files = files.filter((_,j) => j !== i)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .bottom-dock {
    background: var(--sc-bg-1);
    border-top: 1px solid rgba(255,255,255,0.1);
    padding: 8px 16px 12px;
  }
  .context-strip {
    display: flex; align-items: center; gap: 4px;
    margin-bottom: 6px;
  }
  .context-badge {
    font-family: var(--sc-font-mono); font-size: 10px; font-weight: 600;
    color: var(--sc-text-2); padding: 2px 6px;
    background: rgba(255,255,255,0.06); border-radius: 3px;
  }
  .context-sep { color: var(--sc-text-2); font-size: 10px; }
  .loading-dot { color: #fbbf24; font-size: 8px; animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }

  .composer { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
  .input-row { display: flex; align-items: flex-end; }
  .command-input {
    flex: 1; background: none; border: none; outline: none; resize: none;
    font-family: var(--sc-font-body); font-size: 14px; color: var(--sc-text-0);
    padding: 10px 12px; line-height: 1.5; min-height: 40px; max-height: 120px;
  }
  .command-input::placeholder { color: var(--sc-text-2); }

  .actions { display: flex; align-items: flex-end; padding: 8px; gap: 4px; }
  .action-btn {
    background: none; border: none; cursor: pointer; color: var(--sc-text-2);
    padding: 4px; border-radius: 4px;
  }
  .action-btn:hover { color: var(--sc-text-1); background: rgba(255,255,255,0.06); }
  .send-btn {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px; cursor: pointer; color: var(--sc-text-2);
    padding: 6px 8px; transition: all 0.15s;
  }
  .send-btn.has-input { background: rgba(247,242,234,0.12); color: var(--sc-text-0); }
  .send-btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .file-preview { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px 8px; }
  .file-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-1);
    padding: 2px 8px; background: rgba(255,255,255,0.06); border-radius: 20px;
  }
  .file-chip button { background: none; border: none; cursor: pointer; color: var(--sc-text-2); }
</style>
