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
    open?: boolean;
    onToggle?: () => void;
    onJudge?: (verdict: JudgmentVerdict, note?: string) => void;
  }

  let {
    analysisData,
    symbol = '',
    tf = '4h',
    open = false,
    onToggle,
    onJudge,
  }: Props = $props();

  const verdict = $derived(buildVerdictFromAnalysis(analysisData));
  const evidence = $derived(buildEvidenceFromAnalysis(analysisData));
  const sym = $derived(symbol.replace('USDT', '') || '—');

  let judgeNote = $state('');
  let judged = $state<JudgmentVerdict | null>(null);

  function handleJudge(v: JudgmentVerdict) {
    judged = v;
    onJudge?.(v, judgeNote || undefined);
  }

  function stateClass(state: TerminalEvidence['state']) {
    if (state === 'bullish') return 'pass';
    if (state === 'bearish') return 'fail';
    if (state === 'warning') return 'warn';
    return 'dim';
  }

  function stateLabel(state: TerminalEvidence['state']) {
    if (state === 'bullish') return 'PASS';
    if (state === 'bearish') return 'FAIL';
    if (state === 'warning') return 'WARN';
    return '—';
  }
</script>

<div class="workspace" class:open>
  <!-- Toggle bar -->
  <button class="workspace-toggle" onclick={onToggle} aria-label="Toggle workspace">
    <span class="toggle-label">WORKSPACE</span>
    <span class="toggle-sym">{sym} · {tf.toUpperCase()}</span>
    <span class="toggle-arrow">{open ? '▼' : '▲'}</span>
  </button>

  {#if open}
    <div class="workspace-body">
      <!-- Section: Evidence Table -->
      <section class="ws-section">
        <div class="ws-section-head">Evidence Table</div>
        {#if evidence.length === 0}
          <p class="ws-empty">No evidence data</p>
        {:else}
          <div class="ev-table">
            <div class="ev-table-head">
              <span>Feature</span>
              <span>Value</span>
              <span>Status</span>
              <span>Why</span>
            </div>
            {#each evidence as ev}
              <div class="ev-table-row" data-state={stateClass(ev.state)}>
                <span class="ev-metric">{ev.metric}</span>
                <span class="ev-val">{ev.value}{ev.delta ? ` ${ev.delta}` : ''}</span>
                <span class="ev-status" data-state={stateClass(ev.state)}>{stateLabel(ev.state)}</span>
                <span class="ev-why">{ev.interpretation}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Section: Judgment -->
      <section class="ws-section">
        <div class="ws-section-head">Judgment</div>
        {#if !verdict}
          <p class="ws-empty">Analyze first</p>
        {:else}
          <div class="judge-buttons">
            {#each ([
              { key: 'valid',     label: 'Valid',      tone: 'good' },
              { key: 'invalid',   label: 'Invalid',    tone: 'bad' },
              { key: 'too_early', label: 'Too Early',  tone: 'warn' },
              { key: 'too_late',  label: 'Too Late',   tone: 'warn' },
              { key: 'near_miss', label: 'Near Miss',  tone: 'dim' },
            ] as const) as btn}
              <button
                class="judge-btn"
                class:active={judged === btn.key}
                data-tone={btn.tone}
                onclick={() => handleJudge(btn.key)}
              >{btn.label}</button>
            {/each}
          </div>
          {#if judged}
            <div class="judge-note-row">
              <input
                class="judge-note"
                type="text"
                placeholder="Note (optional)…"
                bind:value={judgeNote}
              />
              <button
                class="judge-submit"
                onclick={() => onJudge?.(judged!, judgeNote || undefined)}
              >Submit</button>
            </div>
            <p class="judge-feedback">
              Judgment saved: <strong>{judged}</strong>
              {judgeNote ? `— "${judgeNote}"` : ''}
            </p>
          {/if}
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .workspace {
    flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,0.06);
    background: var(--tv-bg-1, #131722);
    display: flex;
    flex-direction: column;
    transition: height 0.18s ease;
  }

  /* Toggle bar */
  .workspace-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    background: none;
    border: none;
    cursor: pointer;
    width: 100%;
    border-bottom: 1px solid transparent;
    transition: background 0.08s;
  }
  .workspace-toggle:hover {
    background: rgba(255,255,255,0.03);
  }
  .open .workspace-toggle {
    border-bottom-color: rgba(255,255,255,0.06);
  }
  .toggle-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.32);
  }
  .toggle-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.50);
  }
  .toggle-arrow {
    margin-left: auto;
    font-size: 8px;
    color: rgba(255,255,255,0.28);
  }

  /* Body */
  .workspace-body {
    display: flex;
    flex-direction: row;
    gap: 0;
    max-height: 260px;
    overflow: hidden;
  }

  /* Sections */
  .ws-section {
    flex: 1;
    min-width: 0;
    border-right: 1px solid rgba(255,255,255,0.05);
    padding: 8px 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ws-section:last-child { border-right: none; }

  .ws-section-head {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.28);
    flex-shrink: 0;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    margin-bottom: 2px;
  }

  .ws-empty {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.22);
  }

  /* Evidence Table */
  .ev-table {
    display: flex;
    flex-direction: column;
    gap: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
  }
  .ev-table-head {
    display: grid;
    grid-template-columns: 1.8fr 1fr 0.7fr 2fr;
    gap: 6px;
    padding: 3px 4px;
    background: rgba(255,255,255,0.04);
    border-radius: 3px 3px 0 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.30);
  }
  .ev-table-row {
    display: grid;
    grid-template-columns: 1.8fr 1fr 0.7fr 2fr;
    gap: 6px;
    padding: 4px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    align-items: center;
    transition: background 0.08s;
  }
  .ev-table-row:hover { background: rgba(255,255,255,0.03); }

  .ev-metric {
    color: rgba(255,255,255,0.60);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ev-val {
    color: rgba(255,255,255,0.82);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ev-status {
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.06em;
  }
  .ev-status[data-state='pass'] { color: #22ab94; }
  .ev-status[data-state='fail'] { color: #f23645; }
  .ev-status[data-state='warn'] { color: #efc050; }
  .ev-status[data-state='dim']  { color: rgba(255,255,255,0.28); }

  .ev-why {
    color: rgba(255,255,255,0.38);
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Judgment */
  .judge-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .judge-btn {
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.55);
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.08s;
  }
  .judge-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.85); }
  .judge-btn.active[data-tone='good']  { background: rgba(34,171,148,0.14); border-color: rgba(34,171,148,0.35); color: #22ab94; }
  .judge-btn.active[data-tone='bad']   { background: rgba(242,54,69,0.14);  border-color: rgba(242,54,69,0.35);  color: #f23645; }
  .judge-btn.active[data-tone='warn']  { background: rgba(239,192,80,0.14); border-color: rgba(239,192,80,0.35); color: #efc050; }
  .judge-btn.active[data-tone='dim']   { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.22); color: rgba(255,255,255,0.75); }

  .judge-note-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .judge-note {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 11px;
    color: rgba(255,255,255,0.72);
    outline: none;
  }
  .judge-note::placeholder { color: rgba(255,255,255,0.22); }
  .judge-submit {
    padding: 5px 10px;
    border: 1px solid rgba(34,171,148,0.28);
    background: rgba(34,171,148,0.08);
    color: #22ab94;
    border-radius: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }
  .judge-feedback {
    font-size: 10px;
    color: rgba(255,255,255,0.42);
    font-family: var(--sc-font-mono, monospace);
  }
  .judge-feedback strong { color: rgba(255,255,255,0.72); }
</style>
