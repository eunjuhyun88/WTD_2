<script lang="ts">
  const TF_CYCLE = ['15m', '1h', '4h', '1d', '1w'];

  interface Props {
    symbol: string;
    timeframe: string;
    aiVisible: boolean;
    toggleAI: () => void;
    onSymbolTap?: () => void;
    onTFChange?: (tf: string) => void;
    onModeTap?: () => void;
  }

  const { symbol, timeframe, aiVisible, toggleAI, onSymbolTap, onTFChange, onModeTap }: Props = $props();

  function cycleTF() {
    const idx = TF_CYCLE.indexOf(timeframe);
    const next = TF_CYCLE[(idx + 1) % TF_CYCLE.length];
    onTFChange?.(next);
  }
</script>

<div class="mobile-top-bar">
  <span class="logo">COGOCHI</span>
  <span class="sep">│</span>

  <button class="chip symbol-chip" onclick={() => onSymbolTap?.()}>
    {symbol.replace('USDT', '')} <span class="dim">/ USDT</span> ▾
  </button>

  <button class="chip tf-chip" onclick={cycleTF}>
    {timeframe} ▾
  </button>

  <span class="spacer"></span>

  <button class="ai-btn" class:active={aiVisible} onclick={toggleAI}>
    <span class="dot" class:active={aiVisible}></span>
    AI
  </button>

  <button class="mode-btn" onclick={() => onModeTap?.()} title="Select mode">···</button>
</div>

<style>
  .mobile-top-bar {
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    background: var(--g1);
    border-bottom: 1px solid var(--g5);
    z-index: 30;
  }

  .logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--brand);
    letter-spacing: 0.14em;
  }

  .sep {
    color: var(--g4);
    font-size: 12px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 10px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--g9);
    cursor: pointer;
    transition: background 0.12s;
  }

  .chip:active {
    background: var(--g3);
  }

  .symbol-chip {
    min-width: 90px;
  }

  .tf-chip {
    font-size: 11px;
    min-width: 48px;
    justify-content: center;
  }

  .dim {
    color: var(--g6);
    font-weight: 400;
    font-size: 10px;
  }

  .spacer {
    flex: 1;
  }

  .ai-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    background: transparent;
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--g6);
    cursor: pointer;
    transition: all 0.15s;
  }

  .ai-btn.active {
    background: var(--brand-dd);
    color: var(--brand);
    border-color: var(--brand-d);
  }

  .mode-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--g5);
    font-size: 14px;
    cursor: pointer;
    letter-spacing: -0.05em;
    transition: color 0.12s;
    flex-shrink: 0;
  }
  .mode-btn:active { color: var(--g8); }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--g5);
    transition: background 0.15s;
  }

  .dot.active {
    background: var(--brand);
  }
</style>
