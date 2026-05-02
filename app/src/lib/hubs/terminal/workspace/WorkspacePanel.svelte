<script lang="ts">
  import {
    buildEvidenceFromAnalysis,
    buildVerdictFromAnalysis,
    type PanelAnalyzeData,
  } from '$lib/terminal/panelAdapter';
  import type { TerminalEvidence } from '$lib/types/terminal';

  type JudgmentVerdict = 'valid' | 'invalid' | 'too_early' | 'too_late' | 'near_miss';

  interface Props {
    analysisData?: PanelAnalyzeData | null;
    symbol?: string;
    tf?: string;
    onJudge?: (verdict: JudgmentVerdict, note?: string) => void;
  }

  let {
    analysisData,
    symbol = '',
    tf = '4h',
    onJudge,
  }: Props = $props();

  const verdict = $derived(buildVerdictFromAnalysis(analysisData));
  const evidence = $derived(buildEvidenceFromAnalysis(analysisData));
  const sym = $derived(symbol.replace('USDT', '') || '—');
  const dir = $derived(verdict?.direction ?? null);
  const conf = $derived(
    analysisData?.p_win != null
      ? `${Math.round((analysisData.p_win as number) * 100)}%`
      : (verdict?.confidence ?? null)
  );

  let judged = $state<JudgmentVerdict | null>(null);

  function handleJudge(v: JudgmentVerdict) {
    judged = judged === v ? null : v;
    if (judged) onJudge?.(v);
  }

  function stateClass(state: TerminalEvidence['state']) {
    if (state === 'bullish') return 'pass';
    if (state === 'bearish') return 'fail';
    if (state === 'warning') return 'warn';
    return 'dim';
  }

  function stateGlyph(state: TerminalEvidence['state']) {
    if (state === 'bullish') return '▲';
    if (state === 'bearish') return '▼';
    if (state === 'warning') return '!';
    return '·';
  }
</script>

<!-- TradingView-style sub-pane: always visible, fixed height below chart -->
<div class="ws-pane">

  <!-- Pane header: label + legend + judgment micro-buttons -->
  <div class="ws-head">
    <span class="ws-pane-label">EVIDENCE</span>

    {#if sym !== '—'}
      <span class="ws-sym-tag">{sym} · {tf.toUpperCase()}</span>
    {/if}

    {#if dir}
      <span class="ws-verdict-tag" data-dir={dir}>{dir.toUpperCase()}</span>
    {/if}

    {#if conf}
      <span class="ws-conf">{conf}</span>
    {/if}

    <div class="ws-head-spacer"></div>

    <!-- Inline judgment micro-buttons (TV-style compact) -->
    <div class="ws-judge-row" role="group" aria-label="Quick judgment">
      {#each ([
        { key: 'valid',     label: '✓',  tone: 'good', title: 'Valid' },
        { key: 'invalid',   label: '✗',  tone: 'bad',  title: 'Invalid' },
        { key: 'too_early', label: '⏤', tone: 'warn', title: 'Too Early' },
        { key: 'too_late',  label: '⌛', tone: 'warn', title: 'Too Late' },
        { key: 'near_miss', label: '◎',  tone: 'dim',  title: 'Near Miss' },
      ] as const) as btn}
        <button
          class="judge-micro"
          class:active={judged === btn.key}
          data-tone={btn.tone}
          title={btn.title}
          onclick={() => handleJudge(btn.key)}
          aria-pressed={judged === btn.key}
        >{btn.label}</button>
      {/each}
    </div>

    {#if judged}
      <span class="judge-saved">saved: {judged.replace('_', ' ')}</span>
    {/if}
  </div>

  <!-- Evidence rows — scrollable horizontal compact table -->
  <div class="ws-body">
    {#if evidence.length === 0}
      <div class="ws-empty">
        {#if !verdict}
          <span class="ws-empty-text">Analyze a symbol to see evidence</span>
        {:else}
          <span class="ws-empty-text">No evidence layers available</span>
        {/if}
      </div>
    {:else}
      <div class="ev-grid">
        <!-- Column headers -->
        <div class="ev-col-head">Feature</div>
        <div class="ev-col-head">Value</div>
        <div class="ev-col-head ev-col-state">▲▼</div>
        <div class="ev-col-head ev-col-why">Interpretation</div>

        <!-- Evidence rows -->
        {#each evidence as ev}
          <div class="ev-cell ev-metric" title={ev.metric}>{ev.metric}</div>
          <div class="ev-cell ev-val">{ev.value}{ev.delta ? ` ${ev.delta}` : ''}</div>
          <div class="ev-cell ev-state" data-s={stateClass(ev.state)}>
            <span class="ev-glyph">{stateGlyph(ev.state)}</span>
          </div>
          <div class="ev-cell ev-why" title={ev.interpretation}>{ev.interpretation}</div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Pane shell — TradingView sub-pane aesthetics ── */
  .ws-pane {
    flex-shrink: 0;
    height: 148px;
    display: flex;
    flex-direction: column;
    background: var(--tv-bg-1, #131722);
    border-top: 1px solid rgba(255,255,255,0.055);
    overflow: hidden;
  }

  /* ── Pane header ── */
  .ws-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 26px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.012);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ws-head::-webkit-scrollbar { display: none; }

  .ws-pane-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255,255,255,0.28);
    flex-shrink: 0;
  }
  .ws-sym-tag {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: rgba(255,255,255,0.55);
    flex-shrink: 0;
  }
  .ws-verdict-tag {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .ws-verdict-tag[data-dir='bullish'] { background: rgba(34,171,148,0.14); color: #22ab94; }
  .ws-verdict-tag[data-dir='bearish'] { background: rgba(242,54,69,0.14);  color: #f23645; }
  .ws-verdict-tag[data-dir='neutral'] { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.55); }

  .ws-conf {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(255,199,80,0.72);
    flex-shrink: 0;
  }

  .ws-head-spacer { flex: 1; }

  /* ── Judgment micro-buttons (right side of header) ── */
  .ws-judge-row {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .judge-micro {
    width: 20px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.10);
    background: transparent;
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.35);
    cursor: pointer;
    transition: all 0.08s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .judge-micro:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.72); }
  .judge-micro.active[data-tone='good'] { background: rgba(34,171,148,0.18); border-color: rgba(34,171,148,0.4); color: #22ab94; }
  .judge-micro.active[data-tone='bad']  { background: rgba(242,54,69,0.18);  border-color: rgba(242,54,69,0.4);  color: #f23645; }
  .judge-micro.active[data-tone='warn'] { background: rgba(239,192,80,0.18); border-color: rgba(239,192,80,0.4); color: #efc050; }
  .judge-micro.active[data-tone='dim']  { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.75); }

  .judge-saved {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(34,171,148,0.72);
    flex-shrink: 0;
  }

  /* ── Body: scrollable evidence grid ── */
  .ws-body {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    min-height: 0;
  }

  .ws-empty {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 14px;
  }
  .ws-empty-text {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.20);
  }

  /* Evidence grid — CSS grid with fixed columns, single-row scrollable */
  .ev-grid {
    display: grid;
    grid-template-columns: 160px 100px 30px 1fr;
    grid-auto-rows: auto;
    min-width: max-content;
    width: 100%;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
  }

  /* Column headers */
  .ev-col-head {
    padding: 3px 6px;
    background: rgba(255,255,255,0.03);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.28);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .ev-col-state { text-align: center; }

  /* Evidence cells */
  .ev-cell {
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
  }
  .ev-cell:hover { background: rgba(255,255,255,0.025); }

  .ev-metric { color: rgba(255,255,255,0.55); }
  .ev-val    { color: rgba(255,255,255,0.85); font-weight: 700; }
  .ev-why    { color: rgba(255,255,255,0.38); font-size: var(--ui-text-xs); }

  .ev-state { justify-content: center; }
  .ev-glyph { font-size: var(--ui-text-xs); font-weight: 700; }
  .ev-state[data-s='pass'] .ev-glyph { color: #22ab94; }
  .ev-state[data-s='fail'] .ev-glyph { color: #f23645; }
  .ev-state[data-s='warn'] .ev-glyph { color: #efc050; }
  .ev-state[data-s='dim']  .ev-glyph { color: rgba(255,255,255,0.28); }

  @media (max-width: 959px) { .ws-pane { display: none; } }
</style>
