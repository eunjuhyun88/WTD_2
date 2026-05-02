<script lang="ts">
  import {
    buildVerdictFromAnalysis,
    buildEvidenceFromAnalysis,
    type PanelAnalyzeData,
  } from '$lib/terminal/panelAdapter';

  interface Props {
    analysisData?: PanelAnalyzeData | null;
    isStreaming?: boolean;
    isLoading?: boolean;
    symbol?: string;
    onAction?: (text: string) => void;
    onSaveSetup?: () => void;
    onCompare?: () => void;
    onWorkspaceToggle?: () => void;
  }

  let {
    analysisData,
    isStreaming = false,
    isLoading = false,
    symbol = '',
    onAction,
    onSaveSetup,
    onCompare,
    onWorkspaceToggle,
  }: Props = $props();

  const verdict = $derived(buildVerdictFromAnalysis(analysisData));
  const evidence = $derived(buildEvidenceFromAnalysis(analysisData));
  const pWin = $derived(analysisData?.p_win ?? null);

  const sym = $derived(symbol.replace('USDT', '') || '—');
  const tf = $derived(
    (analysisData?.snapshot?.timeframe ?? analysisData?.timeframe ?? '4h')
      .toString()
      .toUpperCase(),
  );

  // Card 1
  const bias = $derived(verdict?.direction?.toUpperCase() ?? '—');
  const action = $derived(verdict?.action ?? '—');
  const confLabel = $derived(
    pWin != null
      ? `${Math.round(pWin * 100)}%`
      : (verdict?.confidence?.toUpperCase() ?? '—'),
  );
  const biasClass = $derived(
    verdict?.direction === 'bullish'
      ? 'bull'
      : verdict?.direction === 'bearish'
        ? 'bear'
        : 'neutral',
  );

  // Card 1 — levels (entry / target / stop) extracted from atr_levels
  const levels = $derived.by(() => {
    const deep = (analysisData as any)?.deep;
    if (!deep?.atr_levels) return null;
    const dir = verdict?.direction ?? '';
    const price = (analysisData as any)?.price ?? (analysisData as any)?.snapshot?.last_close;
    if (dir === 'bearish') {
      return {
        entry:  price ? Number(price) : undefined,
        target: deep.atr_levels.tp1_short  ? Number(deep.atr_levels.tp1_short)  : undefined,
        stop:   deep.atr_levels.stop_short ? Number(deep.atr_levels.stop_short) : undefined,
      };
    }
    return {
      entry:  price ? Number(price) : undefined,
      target: deep.atr_levels.tp1_long  ? Number(deep.atr_levels.tp1_long)  : undefined,
      stop:   deep.atr_levels.stop_long ? Number(deep.atr_levels.stop_long) : undefined,
    };
  });

  const rrRatio = $derived.by(() => {
    if (!levels?.entry || !levels?.target || !levels?.stop) return null;
    const reward = Math.abs(levels.target - levels.entry);
    const risk   = Math.abs(levels.stop   - levels.entry);
    if (risk === 0) return null;
    return (reward / risk).toFixed(2);
  });

  function fmtLevel(n: number | undefined): string {
    if (n == null) return '—';
    if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    if (n >= 1)     return n.toFixed(3);
    return n.toPrecision(4);
  }

  // Card 2: top 3 evidence rows
  const topEvidence = $derived(evidence.slice(0, 3));

  // Card 3: risk (invalidation + against)
  const riskItems = $derived([
    ...(verdict?.invalidation ? [verdict.invalidation] : []),
    ...(verdict?.against ?? []),
  ].slice(0, 3));

  function stateIcon(state: string) {
    if (state === 'bullish') return '✔';
    if (state === 'bearish') return '✖';
    if (state === 'warning') return '⚠';
    return '·';
  }
  function stateTone(state: string) {
    if (state === 'bullish') return 'good';
    if (state === 'bearish') return 'bad';
    if (state === 'warning') return 'warn';
    return 'dim';
  }
</script>

<div class="hud">
  <!-- HUD header -->
  <div class="hud-header">
    {#if isStreaming}
      <span class="hud-badge streaming">
        <span class="dot pulsing">●</span> Analyzing…
      </span>
    {:else if isLoading}
      <span class="hud-badge loading">Loading…</span>
    {:else}
      <span class="hud-label">HUD</span>
      <span class="hud-sym">{sym} · {tf}</span>
    {/if}
  </div>

  {#if !verdict && !isLoading && !isStreaming}
    <div class="hud-empty">
      <p class="hud-empty-text">분석 결과 없음</p>
      <button class="hud-empty-btn" onclick={() => onAction?.(`Analyze ${sym}`)}>
        Analyze {sym} →
      </button>
    </div>
  {:else}
    <!-- Card 1: Current State -->
    <div class="hud-card card-state" data-bias={biasClass}>
      <div class="card-eyebrow">CURRENT STATE</div>
      <div class="state-bias" data-bias={biasClass}>{bias}</div>
      <div class="state-action">{action}</div>
      <div class="state-conf-row">
        <span class="state-conf-label">Conf</span>
        <span class="state-conf-val">{confLabel}</span>
        {#if rrRatio}
          <span class="state-rr">R:R {rrRatio}</span>
        {/if}
      </div>
      {#if levels}
        <div class="levels-grid">
          <div class="lv-row">
            <span class="lv-label">Entry</span>
            <span class="lv-val">{fmtLevel(levels.entry)}</span>
          </div>
          <div class="lv-row lv-target">
            <span class="lv-label">TP1</span>
            <span class="lv-val">{fmtLevel(levels.target)}</span>
          </div>
          <div class="lv-row lv-stop">
            <span class="lv-label">Stop</span>
            <span class="lv-val">{fmtLevel(levels.stop)}</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Card 2: Top Evidence -->
    <div class="hud-card card-evidence">
      <div class="card-eyebrow">TOP EVIDENCE</div>
      {#if topEvidence.length === 0}
        <p class="ev-empty">—</p>
      {:else}
        {#each topEvidence as ev}
          <div class="ev-row" data-tone={stateTone(ev.state)}>
            <span class="ev-icon">{stateIcon(ev.state)}</span>
            <span class="ev-metric">{ev.metric}</span>
            <span class="ev-val">{ev.value}</span>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Card 3: Risk -->
    <div class="hud-card card-risk">
      <div class="card-eyebrow">RISK</div>
      {#if riskItems.length === 0}
        <p class="ev-empty">—</p>
      {:else}
        {#each riskItems as item}
          <div class="risk-row">
            <span class="risk-icon">⚠</span>
            <span class="risk-text">{item}</span>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Card 4: Actions -->
    <div class="hud-card card-actions">
      <button
        class="action-btn primary"
        onclick={onSaveSetup}
        disabled={!verdict}
      >Save Setup</button>
      <button
        class="action-btn"
        onclick={onCompare}
        disabled={!verdict}
      >Compare</button>
      <button
        class="action-btn"
        onclick={() => onAction?.(`Explain the current ${bias} setup for ${sym} on ${tf}. Include why this phase, top evidence, and failure scenario.`)}
        disabled={!verdict}
      >AI Explain</button>
      <button
        class="action-btn workspace-toggle"
        onclick={onWorkspaceToggle}
      >Evidence Table ↕</button>
    </div>
  {/if}
</div>

<style>
  /* ── Shell ── */
  .hud {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--tv-bg-0, #0b0e11);
  }

  /* ── Header ── */
  .hud-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    background: rgba(255,255,255,0.015);
  }
  .hud-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.32);
  }
  .hud-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
    margin-left: auto;
    letter-spacing: 0.04em;
  }
  .hud-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 3px;
  }
  .hud-badge.streaming {
    background: rgba(74,222,128,0.08);
    color: #4ade80;
    border: 1px solid rgba(74,222,128,0.22);
  }
  .hud-badge.loading {
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.4);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .dot.pulsing { animation: hud-pulse 1.3s ease-in-out infinite; }

  /* ── Empty ── */
  .hud-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
  }
  .hud-empty-text {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.28);
  }
  .hud-empty-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    padding: 6px 14px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 4px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.62);
    cursor: pointer;
    transition: all 0.1s;
  }
  .hud-empty-btn:hover {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.9);
  }

  /* ── Cards ── */
  .hud-card {
    margin: 6px 8px 0;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.022);
    padding: 8px 10px;
    flex-shrink: 0;
  }

  /* last card no bottom margin gap */
  .card-actions { margin-bottom: 8px; }

  .card-eyebrow {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.28);
    margin-bottom: 7px;
  }

  /* Card 1: State */
  .card-state[data-bias='bull'] {
    border-color: rgba(34,171,148,0.22);
    background: rgba(34,171,148,0.06);
  }
  .card-state[data-bias='bear'] {
    border-color: rgba(242,54,69,0.22);
    background: rgba(242,54,69,0.06);
  }

  .state-bias {
    font-family: var(--sc-font-mono, monospace);
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: rgba(255,255,255,0.92);
    line-height: 1;
    margin-bottom: 4px;
  }
  .state-bias[data-bias='bull'] { color: #22ab94; }
  .state-bias[data-bias='bear'] { color: #f23645; }

  .state-action {
    font-size: 11px;
    color: rgba(255,255,255,0.62);
    line-height: 1.35;
    margin-bottom: 6px;
  }
  .state-conf-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .state-conf-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.30);
  }
  .state-conf-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: rgba(255,255,255,0.72);
  }
  .state-rr {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(255,199,80,0.82);
    margin-left: auto;
    background: rgba(255,199,80,0.07);
    border: 1px solid rgba(255,199,80,0.18);
    border-radius: 3px;
    padding: 1px 5px;
  }

  /* Levels grid (entry / target / stop) */
  .levels-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .lv-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lv-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.30);
  }
  .lv-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: rgba(255,255,255,0.82);
    letter-spacing: 0.02em;
  }
  .lv-target .lv-val { color: #22ab94; }
  .lv-stop   .lv-val { color: #f23645; }

  /* Card 2: Evidence */
  .ev-empty {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.22);
  }
  .ev-row {
    display: grid;
    grid-template-columns: 14px 1fr auto;
    gap: 5px;
    align-items: center;
    padding: 3px 0;
  }
  .ev-row + .ev-row {
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .ev-icon {
    font-size: 9px;
    font-family: var(--sc-font-mono, monospace);
  }
  .ev-row[data-tone='good'] .ev-icon { color: #22ab94; }
  .ev-row[data-tone='bad']  .ev-icon { color: #f23645; }
  .ev-row[data-tone='warn'] .ev-icon { color: #efc050; }
  .ev-row[data-tone='dim']  .ev-icon { color: rgba(255,255,255,0.28); }

  .ev-metric {
    font-size: 10px;
    color: rgba(255,255,255,0.60);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ev-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: rgba(255,255,255,0.82);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Card 3: Risk */
  .risk-row {
    display: grid;
    grid-template-columns: 14px 1fr;
    gap: 5px;
    padding: 3px 0;
    align-items: start;
  }
  .risk-row + .risk-row {
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .risk-icon {
    font-size: 9px;
    color: #efc050;
    font-family: var(--sc-font-mono, monospace);
    margin-top: 1px;
  }
  .risk-text {
    font-size: 10px;
    color: rgba(255,255,255,0.55);
    line-height: 1.35;
  }

  /* Card 4: Actions */
  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: transparent;
    border-color: rgba(255,255,255,0.05);
  }
  .action-btn {
    width: 100%;
    padding: 7px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.62);
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    text-align: left;
    transition: all 0.08s;
  }
  .action-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.88);
    border-color: rgba(255,255,255,0.18);
  }
  .action-btn:disabled {
    opacity: 0.32;
    cursor: not-allowed;
  }
  .action-btn.primary {
    border-color: rgba(34,171,148,0.28);
    background: rgba(34,171,148,0.08);
    color: #22ab94;
  }
  .action-btn.primary:hover:not(:disabled) {
    background: rgba(34,171,148,0.14);
  }
  .action-btn.workspace-toggle {
    border-style: dashed;
    border-color: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.35);
    font-size: 9px;
    text-align: center;
  }
  .action-btn.workspace-toggle:hover:not(:disabled) {
    color: rgba(255,255,255,0.58);
  }

  @keyframes hud-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
</style>
