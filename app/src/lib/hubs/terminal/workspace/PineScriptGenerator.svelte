<script lang="ts">
  interface Props {
    symbol?: string;
    tf?: string;
    open?: boolean;
    onClose?: () => void;
  }

  let {
    symbol = '',
    tf = '4h',
    open = false,
    onClose,
  }: Props = $props();

  // State
  let prompt = $state('');
  let loading = $state(false);
  let result = $state<{
    name: string;
    description: string;
    script: string;
    usage: string;
    limitations: string;
    provider?: string;
  } | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);

  const activeSym = $derived(symbol.replace('USDT', '') || 'BTC');

  // Example prompts
  const examples = $derived([
    `${activeSym} vs ETH normalized CVD comparison chart`,
    'VPVR (Volume Profile Visible Range) histogram',
    'Smart money entry/exit markers (large candle breakout detection)',
    'Funding Rate + OI Delta composite indicator',
    'Whale liquidation level heatmap (approximation)',
    'MTF RSI: 15m/1H/4H/1D simultaneous display',
    'CVD Divergence auto-detection + alerts',
    'Exchange-basis (futures-spot spread) by venue',
  ]);

  async function generate() {
    if (!prompt.trim() || loading) return;
    loading = true;
    error = null;
    result = null;
    copied = false;

    try {
      const res = await fetch('/api/cogochi/pine-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), symbol, tf }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? `HTTP ${res.status}`);
      }
      result = await res.json();
    } catch (e: any) {
      error = e.message ?? 'Unknown error';
    } finally {
      loading = false;
    }
  }

  async function copyScript() {
    if (!result?.script) return;
    await navigator.clipboard.writeText(result.script);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  function openTradingView() {
    window.open('https://www.tradingview.com/pine/', '_blank', 'noopener');
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
    if (e.key === 'Escape') onClose?.();
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="pine-backdrop"
    role="presentation"
    onclick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
  ></div>

  <!-- Panel -->
  <div class="pine-panel" role="dialog" aria-label="Pine Script Generator">
    <!-- Header -->
    <div class="pine-head">
      <div class="pine-head-left">
        <span class="pine-icon">⌥</span>
        <span class="pine-title">Pine Script Generator</span>
        <span class="pine-subtitle">Natural language → TradingView script</span>
      </div>
      <button class="pine-close" onclick={onClose} aria-label="Close">×</button>
    </div>

    <!-- Input area -->
    <div class="pine-input-area">
      <textarea
        class="pine-prompt"
        bind:value={prompt}
        placeholder="What indicator would you like to build? e.g. A normalized chart to compare CVD of BTC and ETH side by side"
        rows={3}
        onkeydown={handleKey}
        disabled={loading}
      ></textarea>
      <div class="pine-input-actions">
        <span class="pine-hint">⌘Enter to generate</span>
        <button
          class="pine-generate-btn"
          onclick={generate}
          disabled={loading || !prompt.trim()}
        >
          {#if loading}
            <span class="pine-spin">⟳</span> Generating…
          {:else}
            ⚡ Generate Script
          {/if}
        </button>
      </div>
    </div>

    <!-- Examples -->
    {#if !result && !loading}
      <div class="pine-examples">
        <div class="pine-examples-label">Example prompts</div>
        <div class="pine-example-chips">
          {#each examples as ex}
            <button
              class="pine-chip"
              onclick={() => { prompt = ex; }}
            >{ex}</button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Error -->
    {#if error}
      <div class="pine-error">
        <span>⚠ {error}</span>
      </div>
    {/if}

    <!-- Result -->
    {#if result}
      <div class="pine-result">
        <!-- Meta -->
        <div class="pine-result-meta">
          <div class="pine-result-name">{result.name}</div>
          <div class="pine-result-desc">{result.description}</div>
          {#if result.provider}
            <span class="pine-provider-badge">{result.provider}</span>
          {/if}
        </div>

        <!-- Script -->
        <div class="pine-script-wrap">
          <div class="pine-script-head">
            <span class="pine-script-label">Pine Script v5</span>
            <div class="pine-script-actions">
              <button class="pine-action-btn" onclick={copyScript}>
                {copied ? '✓ Copied!' : '⎘ Copy'}
              </button>
              <button class="pine-action-btn pine-action-btn--tv" onclick={openTradingView}>
                Open TradingView →
              </button>
            </div>
          </div>
          <pre class="pine-code">{result.script}</pre>
        </div>

        <!-- Usage + Limitations -->
        {#if result.usage || result.limitations}
          <div class="pine-notes">
            {#if result.usage}
              <div class="pine-note">
                <span class="pine-note-label">Usage</span>
                <span class="pine-note-text">{result.usage}</span>
              </div>
            {/if}
            {#if result.limitations}
              <div class="pine-note">
                <span class="pine-note-label">Limits</span>
                <span class="pine-note-text">{result.limitations}</span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Re-generate -->
        <button class="pine-regen-btn" onclick={() => { result = null; }}>
          ← Rewrite
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Backdrop */
  .pine-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 200;
  }

  /* Panel — slides in from right, wider than IndicatorLibrary */
  .pine-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 560px;
    z-index: 201;
    background: var(--tv-bg-0, #0b0e11);
    border-left: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: pine-slide-in 0.18s ease;
  }
  @keyframes pine-slide-in {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }

  /* Header */
  .pine-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
    background: rgba(255,255,255,0.015);
  }
  .pine-head-left { display: flex; align-items: center; gap: 8px; }
  .pine-icon {
    font-size: 16px;
    color: rgba(255,199,80,0.8);
  }
  .pine-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
  }
  .pine-subtitle {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.36);
  }
  .pine-close {
    font-size: 18px;
    color: rgba(255,255,255,0.38);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 3px;
    transition: all 0.1s;
  }
  .pine-close:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); }

  /* Input area */
  .pine-input-area {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .pine-prompt {
    width: 100%;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 6px;
    padding: 10px 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.85);
    resize: vertical;
    outline: none;
    line-height: 1.5;
    box-sizing: border-box;
    transition: border-color 0.1s;
  }
  .pine-prompt:focus { border-color: rgba(255,199,80,0.4); }
  .pine-prompt::placeholder { color: rgba(255,255,255,0.25); }
  .pine-prompt:disabled { opacity: 0.5; }

  .pine-input-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }
  .pine-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.22);
  }
  .pine-generate-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 7px 16px;
    border-radius: 5px;
    border: 1px solid rgba(255,199,80,0.35);
    background: rgba(255,199,80,0.10);
    color: rgba(255,199,80,0.9);
    cursor: pointer;
    transition: all 0.1s;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .pine-generate-btn:hover:not(:disabled) {
    background: rgba(255,199,80,0.18);
    border-color: rgba(255,199,80,0.55);
    color: #ffc750;
  }
  .pine-generate-btn:disabled { opacity: 0.42; cursor: not-allowed; }
  .pine-spin { display: inline-block; animation: pine-spin 0.8s linear infinite; }
  @keyframes pine-spin { to { transform: rotate(360deg); } }

  /* Examples */
  .pine-examples {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }
  .pine-examples-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.26);
    margin-bottom: 8px;
  }
  .pine-example-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .pine-chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.50);
    cursor: pointer;
    transition: all 0.1s;
    text-align: left;
  }
  .pine-chip:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.80); border-color: rgba(255,255,255,0.18); }

  /* Error */
  .pine-error {
    margin: 12px 16px;
    padding: 8px 12px;
    border-radius: 5px;
    background: rgba(242,54,69,0.08);
    border: 1px solid rgba(242,54,69,0.22);
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: #f23645;
    flex-shrink: 0;
  }

  /* Result */
  .pine-result {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 14px 16px;
    gap: 12px;
  }

  .pine-result-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pine-result-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
  }
  .pine-result-desc {
    font-size: 11px;
    color: rgba(255,255,255,0.50);
  }
  .pine-provider-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.32);
    align-self: flex-start;
    margin-top: 2px;
  }

  /* Script */
  .pine-script-wrap {
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .pine-script-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .pine-script-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.32);
  }
  .pine-script-actions { display: flex; gap: 6px; }

  .pine-action-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.62);
    cursor: pointer;
    transition: all 0.1s;
  }
  .pine-action-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.88); }
  .pine-action-btn--tv {
    background: rgba(34,171,148,0.08);
    border-color: rgba(34,171,148,0.25);
    color: #22ab94;
  }
  .pine-action-btn--tv:hover { background: rgba(34,171,148,0.16); border-color: rgba(34,171,148,0.4); }

  .pine-code {
    background: rgba(0,0,0,0.35);
    padding: 12px;
    font-family: 'IBM Plex Mono', 'Fira Code', monospace;
    font-size: 10px;
    line-height: 1.55;
    color: rgba(255,255,255,0.80);
    overflow-x: auto;
    white-space: pre;
    max-height: 360px;
    overflow-y: auto;
    margin: 0;
  }

  /* Notes */
  .pine-notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }
  .pine-note {
    display: flex;
    gap: 8px;
    font-size: 11px;
  }
  .pine-note-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.28);
    flex-shrink: 0;
    padding-top: 1px;
    min-width: 44px;
  }
  .pine-note-text { color: rgba(255,255,255,0.50); line-height: 1.4; }

  /* Re-generate */
  .pine-regen-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.10);
    background: transparent;
    color: rgba(255,255,255,0.40);
    cursor: pointer;
    transition: all 0.1s;
    align-self: flex-start;
    flex-shrink: 0;
  }
  .pine-regen-btn:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.70); }

  @media (max-width: 767px) {
    .pine-panel { width: 100%; }
  }
</style>
