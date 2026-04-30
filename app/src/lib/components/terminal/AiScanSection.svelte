<script lang="ts">
  /**
   * AiScanSection — W-0333
   * Renders AI-suggested token list at top of left rail.
   * Shows symbol, 4h change, OI trend, funding rate.
   */
  import type { AiTokenSuggestion } from '$lib/contracts/aiScan';
  import { createTerminalSelection } from '$lib/terminal/terminalSelectionState';
  import type { TerminalSelectionState } from '$lib/terminal/terminalSelectionState';

  interface Props {
    suggestions: AiTokenSuggestion[];
    activeSymbol?: string;
    onSelect?: (sel: TerminalSelectionState) => void;
    onDismiss?: () => void;
  }

  let { suggestions, activeSymbol = '', onSelect, onDismiss }: Props = $props();

  function createSelection(symbol: string): TerminalSelectionState {
    return createTerminalSelection({
      kind: 'symbol',
      symbol,
      timeframe: '4h',
      origin: 'prompt',
    });
  }

  function oiColor(trend?: string): string {
    if (trend === 'up')   return 'var(--pos, #26c281)';
    if (trend === 'down') return 'var(--neg, #ed4f4f)';
    return 'rgba(196,202,214,0.35)';
  }

  function oiLabel(trend?: string): string {
    if (trend === 'up')   return 'OI↑';
    if (trend === 'down') return 'OI↓';
    if (trend === 'flat') return 'OI→';
    return '';
  }

  function frColor(rate?: number): string {
    if (rate == null) return 'rgba(196,202,214,0.35)';
    if (rate > 0.0001)  return 'var(--amb, #e0a830)';
    if (rate < -0.0001) return 'rgba(74,222,128,0.6)';
    return 'rgba(196,202,214,0.35)';
  }
</script>

<section class="ai-scan">
  <div class="scan-header">
    <span class="scan-label">AI 추천</span>
    <span class="scan-count">{suggestions.length}건</span>
    <button class="scan-dismiss" onclick={onDismiss} aria-label="닫기">✕</button>
  </div>

  <div class="scan-rows">
    {#each suggestions as s (s.symbol)}
      {@const sym = s.symbol.replace('USDT', '')}
      {@const isActive = s.symbol === activeSymbol}
      <button
        class="scan-row"
        class:active={isActive}
        onclick={() => onSelect?.(createSelection(s.symbol))}
        title={s.reason ?? s.symbol}
      >
        <span class="scan-dot">{isActive ? '●' : '○'}</span>
        <span class="scan-sym">{sym}</span>
        {#if s.changePct4h != null}
          <span class="scan-chg" style="color: {s.changePct4h >= 0 ? 'var(--pos, #26c281)' : 'var(--neg, #ed4f4f)'}">
            {s.changePct4h >= 0 ? '+' : ''}{s.changePct4h.toFixed(1)}%
          </span>
        {/if}
        {#if s.oiTrend}
          <span class="scan-oi" style="color: {oiColor(s.oiTrend)}">{oiLabel(s.oiTrend)}</span>
        {/if}
        {#if s.fundingRate != null}
          <span class="scan-fr" style="color: {frColor(s.fundingRate)}">
            F:{s.fundingRate >= 0 ? '+' : ''}{(s.fundingRate * 100).toFixed(3)}%
          </span>
        {/if}
      </button>
    {/each}
  </div>
</section>

<style>
  .ai-scan {
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }

  .scan-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px 5px;
  }

  .scan-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(74,194,129,0.7);
    text-transform: uppercase;
  }

  .scan-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(196,202,214,0.4);
    margin-left: auto;
  }

  .scan-dismiss {
    background: none;
    border: none;
    color: rgba(196,202,214,0.3);
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    transition: color 0.1s;
  }
  .scan-dismiss:hover { color: rgba(196,202,214,0.7); }

  .scan-rows {
    display: flex;
    flex-direction: column;
  }

  .scan-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.1s;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .scan-row:hover { background: rgba(255,255,255,0.04); }
  .scan-row.active { background: rgba(74,194,129,0.06); }

  .scan-dot {
    font-size: 8px;
    color: rgba(74,194,129,0.6);
    flex-shrink: 0;
    width: 10px;
  }

  .scan-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(247,242,234,0.88);
    min-width: 36px;
  }

  .scan-chg, .scan-oi, .scan-fr {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    flex-shrink: 0;
  }

  .scan-fr { margin-left: auto; }
</style>
