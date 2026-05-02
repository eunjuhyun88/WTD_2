<script lang="ts">
  import type { PanelAnalyzeData } from '$lib/terminal/panelAdapter';

  interface Props {
    analysisData?: PanelAnalyzeData | null;
    symbol?: string;
    tf?: string;
  }

  let { analysisData, symbol = '', tf = '4h' }: Props = $props();

  const s = $derived((analysisData as any)?.snapshot ?? {});
  const deep = $derived((analysisData as any)?.deep ?? {});
  const layers = $derived((deep?.layers ?? {}) as Record<string, { score: number; sigs: Array<{ t: string; type: string }> }>);
  const flow = $derived(analysisData?.flowSummary ?? {});
  const deriv = $derived(analysisData?.derivativesSnapshot ?? {});

  function fmt(v: number | null | undefined, decimals = 2, suffix = ''): string {
    if (v == null) return '—';
    return v.toFixed(decimals) + suffix;
  }

  function fmtPct(v: number | null | undefined): string {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(3) + '%';
  }

  function layerScore(name: string): string {
    const lr = layers[name];
    if (!lr) return '—';
    return (lr.score >= 0 ? '+' : '') + lr.score;
  }

  function layerSig(name: string): string {
    const lr = layers[name];
    if (!lr?.sigs?.length) return '';
    return lr.sigs[0].t?.slice(0, 40) ?? '';
  }

  function layerState(name: string): 'bull' | 'bear' | 'warn' | 'dim' {
    const lr = layers[name];
    if (!lr) return 'dim';
    if (lr.score >= 5) return 'bull';
    if (lr.score <= -5) return 'bear';
    const topType = lr.sigs[0]?.type;
    if (topType === 'warn') return 'warn';
    if (topType === 'bull') return 'bull';
    if (topType === 'bear') return 'bear';
    return 'dim';
  }

  function rsiState(v: number | null | undefined): 'bull' | 'bear' | 'warn' | 'dim' {
    if (v == null) return 'dim';
    if (v > 70) return 'warn';
    if (v < 30) return 'bull';
    return 'dim';
  }

  function frState(v: number | null | undefined): 'bull' | 'bear' | 'warn' | 'dim' {
    if (v == null) return 'dim';
    if (v > 0.01) return 'warn';
    if (v < -0.005) return 'bull';
    return 'dim';
  }

  function oiState(v: number | null | undefined): 'bull' | 'bear' | 'warn' | 'dim' {
    if (v == null) return 'dim';
    if (v > 0.02) return 'bull';
    if (v < -0.02) return 'bear';
    return 'dim';
  }

  const sym = $derived(symbol.replace('USDT', '') || '—');
  const tfUpper = $derived(tf.toUpperCase());

  const rsi = $derived(s.rsi14 as number | null | undefined);
  const fundingRate = $derived((s.funding_rate ?? (analysisData as any)?.derivatives?.funding_rate) as number | null | undefined);
  const oiChange = $derived(s.oi_change_1h as number | null | undefined);
  const lsRatio = $derived((deriv as any).lsRatio as number | null | undefined);
  const takerRatio = $derived((flow as any).takerBuyRatio as number | null | undefined);
  const volRatio = $derived(s.vol_ratio_3 as number | null | undefined);
  const emaAlignment = $derived(s.ema_alignment as string | null | undefined);
  const htfStructure = $derived(s.htf_structure as string | null | undefined);
  const pWin = $derived(analysisData?.p_win as number | null | undefined);
</script>

<div class="ind-panel">
  <div class="ind-header">
    <span class="ind-sym">{sym} · {tfUpper}</span>
    {#if pWin != null}
      <span class="ind-pwin">P(win) {Math.round(pWin * 100)}%</span>
    {/if}
  </div>

  <!-- MOMENTUM -->
  <div class="ind-section">
    <div class="ind-section-label">MOMENTUM</div>
    <div class="ind-row">
      <span class="ind-name">RSI 14</span>
      <span class="ind-val" data-state={rsiState(rsi)}>{fmt(rsi, 1)}</span>
      <span class="ind-badge" data-state={rsiState(rsi)}>{rsi != null ? (rsi > 70 ? '▲' : rsi < 30 ? '▼' : '·') : ''}</span>
    </div>
    <div class="ind-row">
      <span class="ind-name">Momentum</span>
      <span class="ind-val" data-state={layerState('momentum')}>{layerScore('momentum')}</span>
      <span class="ind-badge" data-state={layerState('momentum')}>{layerState('momentum') === 'bull' ? '▲' : layerState('momentum') === 'bear' ? '▼' : '·'}</span>
    </div>
    {#if emaAlignment}
      <div class="ind-row">
        <span class="ind-name">EMA Align</span>
        <span class="ind-val">{emaAlignment}</span>
        <span class="ind-badge">·</span>
      </div>
    {/if}
  </div>

  <!-- FLOW -->
  <div class="ind-section">
    <div class="ind-section-label">FLOW</div>
    <div class="ind-row">
      <span class="ind-name">Funding</span>
      <span class="ind-val" data-state={frState(fundingRate)}>{fmtPct(fundingRate)}</span>
      <span class="ind-badge" data-state={frState(fundingRate)}>{fundingRate != null ? (Math.abs(fundingRate) > 0.005 ? '⚡' : '·') : ''}</span>
    </div>
    <div class="ind-row">
      <span class="ind-name">OI Δ 1H</span>
      <span class="ind-val" data-state={oiState(oiChange)}>{oiChange != null ? (oiChange >= 0 ? '+' : '') + (oiChange * 100).toFixed(2) + '%' : '—'}</span>
      <span class="ind-badge" data-state={oiState(oiChange)}>{oiChange != null ? (oiChange > 0.02 ? '↑' : oiChange < -0.02 ? '↓' : '·') : ''}</span>
    </div>
    {#if lsRatio != null}
      <div class="ind-row">
        <span class="ind-name">L/S</span>
        <span class="ind-val" data-state={lsRatio > 1 ? 'bull' : lsRatio < 0.85 ? 'bear' : 'dim'}>{lsRatio.toFixed(2)}</span>
        <span class="ind-badge" data-state={lsRatio > 1 ? 'bull' : 'dim'}>{lsRatio > 1 ? '↑' : lsRatio < 0.85 ? '↓' : '·'}</span>
      </div>
    {/if}
    {#if takerRatio != null}
      <div class="ind-row">
        <span class="ind-name">Taker</span>
        <span class="ind-val" data-state={takerRatio > 1.1 ? 'bull' : takerRatio < 0.9 ? 'bear' : 'dim'}>{takerRatio.toFixed(2)}×</span>
        <span class="ind-badge" data-state={takerRatio > 1.1 ? 'bull' : 'dim'}>{takerRatio > 1.1 ? '↑' : takerRatio < 0.9 ? '↓' : '·'}</span>
      </div>
    {/if}
    {#if (flow as any).cvd}
      <div class="ind-row ind-row--sub"><span class="ind-sub">CVD: {(flow as any).cvd}</span></div>
    {/if}
  </div>

  <!-- STRUCTURE -->
  <div class="ind-section">
    <div class="ind-section-label">STRUCTURE</div>
    <div class="ind-row">
      <span class="ind-name">BB</span>
      <span class="ind-val" data-state={layerState('bb')}>{layerScore('bb')}</span>
      <span class="ind-badge" data-state={layerState('bb')}>{layerState('bb') === 'warn' ? '⚡' : layerState('bb') === 'bull' ? '▲' : layerState('bb') === 'bear' ? '▼' : '·'}</span>
    </div>
    {#if layerSig('bb')}<div class="ind-row ind-row--sub"><span class="ind-sub">{layerSig('bb')}</span></div>{/if}
    <div class="ind-row">
      <span class="ind-name">Wyckoff</span>
      <span class="ind-val" data-state={layerState('wyckoff')}>{layerScore('wyckoff')}</span>
      <span class="ind-badge" data-state={layerState('wyckoff')}>{layerState('wyckoff') === 'bull' ? '▲' : layerState('wyckoff') === 'bear' ? '▼' : '·'}</span>
    </div>
    {#if layerSig('wyckoff')}<div class="ind-row ind-row--sub"><span class="ind-sub">{layerSig('wyckoff')}</span></div>{/if}
    <div class="ind-row">
      <span class="ind-name">MTF</span>
      <span class="ind-val" data-state={layerState('mtf')}>{layerScore('mtf')}</span>
      <span class="ind-badge" data-state={layerState('mtf')}>{layerState('mtf') === 'bull' ? '★' : layerState('mtf') === 'bear' ? '☆' : '·'}</span>
    </div>
    {#if htfStructure}
      <div class="ind-row">
        <span class="ind-name">HTF</span>
        <span class="ind-val">{htfStructure}</span>
        <span class="ind-badge">·</span>
      </div>
    {/if}
    {#if volRatio != null}
      <div class="ind-row">
        <span class="ind-name">Vol Ratio</span>
        <span class="ind-val" data-state={volRatio > 2 ? 'warn' : volRatio > 1.2 ? 'bull' : 'dim'}>{volRatio.toFixed(1)}×</span>
        <span class="ind-badge" data-state={volRatio > 2 ? 'warn' : 'dim'}>{volRatio > 2 ? '⚡' : '·'}</span>
      </div>
    {/if}
  </div>

  <!-- MACRO -->
  <div class="ind-section">
    <div class="ind-section-label">MACRO</div>
    <div class="ind-row">
      <span class="ind-name">Kimchi</span>
      <span class="ind-val" data-state={layerState('kimchi')}>{layerScore('kimchi')}</span>
      <span class="ind-badge" data-state={layerState('kimchi')}>{layerState('kimchi') === 'bull' ? '▲' : layerState('kimchi') === 'bear' ? '▼' : '·'}</span>
    </div>
    {#if layerSig('kimchi')}<div class="ind-row ind-row--sub"><span class="ind-sub">{layerSig('kimchi')}</span></div>{/if}
    <div class="ind-row">
      <span class="ind-name">F&amp;G</span>
      <span class="ind-val" data-state={layerState('fg')}>{layerScore('fg')}</span>
      <span class="ind-badge" data-state={layerState('fg')}>{layerState('fg') === 'bear' ? '↓' : layerState('fg') === 'bull' ? '↑' : '·'}</span>
    </div>
    <div class="ind-row">
      <span class="ind-name">On-chain</span>
      <span class="ind-val" data-state={layerState('onchain')}>{layerScore('onchain')}</span>
      <span class="ind-badge" data-state={layerState('onchain')}>{layerState('onchain') === 'bull' ? '▲' : layerState('onchain') === 'bear' ? '▼' : '·'}</span>
    </div>
  </div>
</div>

<style>
  .ind-panel {
    font-family: var(--sc-font-mono, monospace);
    background: var(--tv-bg-1, #131722);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
  }
  .ind-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .ind-sym { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.65); letter-spacing: 0.06em; }
  .ind-pwin { font-size: var(--ui-text-xs); color: rgba(255,199,80,0.8); }
  .ind-section { border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 4px; }
  .ind-section-label {
    font-size: var(--ui-text-xs); font-weight: 700; letter-spacing: 0.14em;
    color: rgba(255,255,255,0.25); padding: 6px 10px 3px; text-transform: uppercase;
  }
  .ind-row { display: grid; grid-template-columns: 1fr auto 16px; align-items: center; padding: 2px 10px; gap: 4px; }
  .ind-row--sub { grid-template-columns: 1fr; padding: 1px 10px 3px; }
  .ind-name { font-size: var(--ui-text-xs); color: rgba(255,255,255,0.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ind-val { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.80); text-align: right; white-space: nowrap; }
  .ind-val[data-state='bull'] { color: #22ab94; }
  .ind-val[data-state='bear'] { color: #f23645; }
  .ind-val[data-state='warn'] { color: #efc050; }
  .ind-badge { font-size: var(--ui-text-xs); text-align: center; color: rgba(255,255,255,0.25); }
  .ind-badge[data-state='bull'] { color: #22ab94; }
  .ind-badge[data-state='bear'] { color: #f23645; }
  .ind-badge[data-state='warn'] { color: #efc050; }
  .ind-sub { font-size: var(--ui-text-xs); color: rgba(255,255,255,0.28); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
