<script lang="ts">
  import { activePair } from '$lib/stores/activePairStore';

  interface Props {
    onSend?: (text: string, files?: File[]) => void;
    onDockAction?: (label: string, prompt: string) => void;
    loading?: boolean;
    assistantText?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }

  let {
    onSend,
    onDockAction,
    loading = false,
    assistantText = '',
    history = [],
  }: Props = $props();

  let inputText = $state('');
  let files = $state<File[]>([]);
  let fileInputRef = $state<HTMLInputElement | null>(null);

  const dockActions = [
    {
      label: 'Scan',
      prompt: () => `Scan the market from ${$activePair || 'BTC/USDT'} context. Return buy candidates, high OI, liquidation risk, and warnings with evidence.`,
    },
    {
      label: 'Compare',
      prompt: () => `Compare ${$activePair || 'BTC/USDT'} against ETH/USDT and SOL/USDT with verdict, evidence, and risk.`,
    },
    {
      label: 'Risk',
      prompt: () => `Run a backend risk check for ${$activePair || 'BTC/USDT'}. Include funding, OI, CVD, liquidity, invalidation, and avoid actions.`,
    },
  ];

  const lastUserPrompt = $derived(
    [...history].reverse().find((entry) => entry.role === 'user')?.content ?? ''
  );
  const previewAssistantText = $derived(
    (assistantText.trim() || [...history].reverse().find((entry) => entry.role === 'assistant')?.content) ?? ''
  );
  function handleSend() {
    if (!inputText.trim() && files.length === 0) return;
    onSend?.(inputText.trim(), files.length > 0 ? files : undefined);
    inputText = '';
    files = [];
  }

  function runDockAction(action: { label: string; prompt: () => string }) {
    if (loading) return;
    const prompt = action.prompt();
    if (onDockAction) {
      onDockAction(action.label, prompt);
      return;
    }
    onSend?.(prompt);
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
  <div class="dock-grid">
    <section class="dock-composer-panel">
      <div class="dock-head">
        <div class="dock-title">
          <span class="dock-kicker">Prompt Lane</span>
          <strong>{$activePair || 'BTC/USDT'}</strong>
        </div>
        <span class="dock-hint">
          {loading ? 'Analyzing active market…' : 'Ask before you save or hand off.'}
        </span>
      </div>

      <div class="composer-shell">
        <textarea
          class="cmd-input"
          placeholder="Ask before you save or hand off this setup."
          bind:value={inputText}
          onkeydown={handleKeydown}
          rows="1"
        ></textarea>

        <div class="composer-actions">
          <button class="icon-btn" type="button" title="Attach image" onclick={() => fileInputRef?.click()} aria-label="Attach image">
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

      <div class="quick-strip" aria-label="Quick prompts">
        {#each dockActions as action}
          <button
            type="button"
            class="quick-btn"
            disabled={loading}
            onclick={() => runDockAction(action)}
          >
            {action.label}
          </button>
        {/each}
      </div>
    </section>

    <aside class="dock-response-panel" data-live={loading}>
      <span class="response-kicker">{loading ? 'Streaming' : previewAssistantText ? 'Latest Response' : 'Last Prompt'}</span>
      <p>{previewAssistantText || lastUserPrompt || 'AI output appears here after you send a prompt.'}</p>
    </aside>
  </div>
</div>

<style>
  .bottom-dock {
    position: relative;
    flex-shrink: 0;
    background: var(--sc-bg-1, #0a0a0a);
    border-top: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    padding: 8px 10px 10px;
  }

  .dock-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(260px, 0.85fr);
    gap: 8px;
    align-items: stretch;
  }

  .dock-composer-panel,
  .dock-response-panel {
    min-width: 0;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    background: rgba(255,255,255,0.02);
  }

  .dock-composer-panel {
    display: grid;
    gap: 7px;
    padding: 9px;
  }

  .dock-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .dock-title {
    display: inline-grid;
    gap: 2px;
  }

  .dock-kicker,
  .response-kicker,
  .dock-hint {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .dock-kicker,
  .response-kicker {
    color: rgba(131, 188, 255, 0.82);
  }

  .dock-title strong {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: rgba(247,242,234,0.86);
  }

  .dock-hint {
    color: rgba(247,242,234,0.3);
    max-width: 40%;
    text-align: right;
    font-size: 7px;
  }

  .composer-shell {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    min-height: 60px;
    padding: 7px 7px 7px 11px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(8,12,18,0.72);
  }

  .cmd-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-family: var(--sc-font-body);
    font-size: 13px;
    color: var(--sc-text-0);
    line-height: 1.45;
    padding: 6px 0;
    min-height: 42px;
    max-height: 96px;
    appearance: none;
    -webkit-appearance: none;
  }

  .cmd-input::placeholder {
    color: var(--sc-text-3);
  }

  .composer-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .icon-btn,
  .send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    border-radius: 7px;
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--sc-text-2);
    background: rgba(255,255,255,0.03);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .icon-btn:hover,
  .send-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.07);
    color: var(--sc-text-0);
  }

  .send-btn.active {
    background: rgba(77,143,245,0.18);
    border-color: rgba(99,179,237,0.3);
    color: var(--sc-text-0);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-pulse {
    font-size: 6px;
    color: #fbbf24;
    animation: pulse 0.7s ease-in-out infinite;
  }

  .file-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    font-family: var(--sc-font-mono);
    font-size: 9px;
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

  .quick-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .quick-btn {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    color: rgba(247,242,234,0.72);
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 9px;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .quick-btn:hover:not(:disabled) {
    background: rgba(77,143,245,0.11);
    border-color: rgba(77,143,245,0.28);
    color: rgba(220,232,255,0.96);
  }

  .quick-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dock-response-panel {
    display: grid;
    gap: 6px;
    padding: 9px 10px;
    align-content: start;
  }

  .dock-response-panel[data-live='true'] {
    border-color: rgba(74,222,128,0.16);
    background: rgba(74,222,128,0.04);
  }

  .dock-response-panel p {
    margin: 0;
    font-size: 11px;
    line-height: 1.42;
    color: rgba(247,242,234,0.68);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

  @media (max-width: 1024px) {
    .dock-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .dock-hint {
      display: none;
    }

    .dock-response-panel p {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }
  }
</style>
