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

  const SYMBOL_RE = /\b([A-Z]{2,10})(?:\/?(USDT|BTC|ETH))?\b/i;
  const TF_RE = /\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d|1w)\b/i;

  const parseHint = $derived(
    (() => {
      if (!inputText.trim()) return null;
      const symMatch = inputText.match(SYMBOL_RE);
      const tfMatch = inputText.match(TF_RE);
      if (!symMatch && !tfMatch) return null;
      const sym = symMatch ? symMatch[1].toUpperCase() + (symMatch[2] ? '/' + symMatch[2].toUpperCase() : '/USDT') : null;
      const tf = tfMatch ? tfMatch[1].toLowerCase() : null;
      return { sym, tf };
    })()
  );

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

<div class="slim-dock">
  <!-- Quick action pills -->
  <div class="dock-pills">
    {#each dockActions as action}
      <button
        type="button"
        class="dock-pill"
        disabled={loading}
        onclick={() => runDockAction(action)}
      >{action.label}</button>
    {/each}
  </div>

  <div class="dock-sep" aria-hidden="true"></div>

  <!-- Input row -->
  <div class="dock-input-row">
    {#if parseHint}
      <span class="dock-parse-hint">→ {parseHint.sym ?? $activePair}{parseHint.tf ? ` · ${parseHint.tf.toUpperCase()}` : ''}</span>
    {/if}
    <textarea
      class="dock-input"
      placeholder="Ask before you save or act…"
      bind:value={inputText}
      onkeydown={handleKeydown}
      rows="1"
    ></textarea>
    <button
      class="dock-send"
      class:active={inputText.trim().length > 0}
      onclick={handleSend}
      disabled={loading}
      aria-label="Send"
    >
      {#if loading}
        <span class="dock-pulse">●</span>
      {:else}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      {/if}
    </button>
    <button class="dock-attach" type="button" title="Attach" onclick={() => fileInputRef?.click()} aria-label="Attach">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
      </svg>
    </button>
    <input type="file" accept="image/*" multiple bind:this={fileInputRef} onchange={handleFileChange} style="display:none" />
  </div>

  <!-- Response preview — only visible when streaming or has content -->
  {#if loading || previewAssistantText}
    <div class="dock-response" class:live={loading}>
      <span class="dock-response-kicker">{loading ? 'Streaming' : 'Response'}</span>
      <span class="dock-response-text">{previewAssistantText || '…'}</span>
    </div>
  {/if}

  {#if files.length > 0}
    <div class="dock-files">
      {#each files as f, i}
        <span class="dock-file-chip">
          {f.name}
          <button onclick={() => files = files.filter((_, j) => j !== i)} aria-label="Remove">×</button>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .slim-dock {
    position: relative;
    flex-shrink: 0;
    background: var(--tv-bg-1, #131722);
    border-top: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* Pills row */
  .dock-pills {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px 0;
  }
  .dock-pill {
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    background: rgba(255,255,255,0.025);
    color: var(--tv-text-2, rgba(209,212,220,0.4));
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.07em;
    cursor: pointer;
    transition: all 80ms;
  }
  .dock-pill:hover:not(:disabled) {
    background: rgba(75,158,253,0.08);
    border-color: rgba(75,158,253,0.22);
    color: var(--tv-text-0, #D1D4DC);
  }
  .dock-pill:disabled { opacity: 0.35; cursor: not-allowed; }

  .dock-sep {
    height: 1px;
    margin: 6px 12px 0;
    background: var(--tv-border, rgba(255,255,255,0.055));
  }

  /* Input row */
  .dock-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px 8px;
    position: relative;
  }
  .dock-parse-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: var(--tv-blue, #4B9EFD);
    opacity: 0.75;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .dock-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    resize: none;
    font-family: var(--sc-font-body, sans-serif);
    font-size: 13px;
    color: var(--tv-text-0, #D1D4DC);
    line-height: 1.4;
    padding: 0;
    min-height: 22px;
    max-height: 72px;
    appearance: none;
    -webkit-appearance: none;
  }
  .dock-input::placeholder {
    color: var(--tv-text-2, rgba(209,212,220,0.4));
  }
  .dock-send,
  .dock-attach {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    color: var(--tv-text-2);
    background: rgba(255,255,255,0.02);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 80ms;
  }
  .dock-send:hover:not(:disabled),
  .dock-attach:hover {
    background: rgba(255,255,255,0.06);
    color: var(--tv-text-0);
  }
  .dock-send.active {
    background: rgba(34,171,148,0.15);
    border-color: rgba(34,171,148,0.35);
    color: var(--tv-green, #22AB94);
  }
  .dock-send:disabled { opacity: 0.35; cursor: not-allowed; }
  .dock-pulse {
    font-size: 6px;
    color: var(--tv-amber, #EFC050);
    animation: dock-pulse 0.7s ease-in-out infinite;
  }

  /* Response preview strip */
  .dock-response {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 12px 6px;
    border-top: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    background: rgba(255,255,255,0.01);
  }
  .dock-response.live {
    background: rgba(34,171,148,0.04);
    border-top-color: rgba(34,171,148,0.14);
  }
  .dock-response-kicker {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--tv-text-2, rgba(209,212,220,0.4));
    flex-shrink: 0;
  }
  .dock-response.live .dock-response-kicker { color: var(--tv-green, #22AB94); }
  .dock-response-text {
    font-size: 11px;
    color: var(--tv-text-1, rgba(209,212,220,0.72));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  /* Files */
  .dock-files {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 12px 6px;
  }
  .dock-file-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(255,255,255,0.05);
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: var(--tv-text-1);
  }
  .dock-file-chip button {
    background: none;
    border: none;
    color: var(--tv-text-2);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  @keyframes dock-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

  @media (max-width: 1024px) {
    .dock-parse-hint { display: none; }
  }
</style>
