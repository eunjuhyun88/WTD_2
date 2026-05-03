<script lang="ts">
  /**
   * SendToTerminalButton.svelte
   *
   * Sends a symbol from /lab results to WatchlistRail via terminal_candidates.
   * Props:
   *   symbol      — trading pair, e.g. "BTCUSDT"
   *   strategyId  — optional strategy id for provenance tracking
   */

  let {
    symbol,
    strategyId = undefined,
  }: {
    symbol: string;
    strategyId?: string;
  } = $props();

  type State = 'idle' | 'loading' | 'added' | 'duplicate' | 'error';

  let state = $state<State>('idle');

  async function handleClick() {
    if (state === 'loading') return;
    state = 'loading';

    try {
      const res = await fetch('/api/lab/send-to-terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy_id: strategyId }),
      });

      if (!res.ok) {
        state = 'error';
        setTimeout(() => { state = 'idle'; }, 2000);
        return;
      }

      const data = (await res.json()) as { success: boolean; added: boolean };
      state = data.added ? 'added' : 'duplicate';
      setTimeout(() => { state = 'idle'; }, 2000);
    } catch {
      state = 'error';
      setTimeout(() => { state = 'idle'; }, 2000);
    }
  }

  const LABEL: Record<State, string> = {
    idle:      '+ cogochi',
    loading:   '…',
    added:     '✓ 추가됨',
    duplicate: '이미 있음',
    error:     '오류',
  };
</script>

<button
  type="button"
  class="send-btn"
  class:state-loading={state === 'loading'}
  class:state-added={state === 'added'}
  class:state-duplicate={state === 'duplicate'}
  class:state-error={state === 'error'}
  disabled={state === 'loading'}
  onclick={handleClick}
  aria-label="cogochi watchlist에 {symbol} 추가"
>
  {LABEL[state]}
</button>

<style>
  .send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0 10px;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--amb, #f5a623) 35%, transparent);
    background: transparent;
    color: var(--amb, #f5a623);
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s, opacity 0.12s;
    white-space: nowrap;
  }

  .send-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--amb, #f5a623) 12%, transparent);
  }

  .send-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .send-btn.state-added {
    border-color: color-mix(in srgb, #22ab94 35%, transparent);
    color: #22ab94;
  }

  .send-btn.state-duplicate {
    border-color: color-mix(in srgb, var(--g5, rgba(255,255,255,0.4)) 35%, transparent);
    color: var(--g5, rgba(255, 255, 255, 0.40));
  }

  .send-btn.state-error {
    border-color: color-mix(in srgb, #cf7f8f 35%, transparent);
    color: #cf7f8f;
  }
</style>
