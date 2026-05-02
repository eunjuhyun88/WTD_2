<script lang="ts">
  /**
   * JudgePanel — JUDGE tab content.
   *
   * Three sections stacked vertically:
   *  1. 직후 판정 bar — verdict/entry/stop/target/R:R + Y/N 버튼 (즉시 기록)
   *  2. 최근 판정 리스트 — fetchPatternCaptures 결과
   *  3. 재판정 — 결과 나온 판정에 대해 "맞았는지/왜 틀렸는지" 라벨링
   *
   * Reuses SaveSetupModal's save flow (fetchPatternCaptures + backend persist).
   * Passes a `onSaveJudgment` callback up to parent — parent calls the persist API.
   * (Keeps this component pure/presentational.)
   */
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { TerminalVerdict } from '$lib/types/terminal';

  type JudgmentVerdict = 'bullish' | 'bearish' | 'neutral';
  type OutcomeLabel = 'correct' | 'wrong' | 'partial' | 'timeout';

  interface Props {
    symbol?: string;
    timeframe?: string;
    verdict?: TerminalVerdict | null;
    entry?: number | null;
    stop?: number | null;
    target?: number | null;
    pWin?: number | null;
    lastPrice?: number | null;
    captures?: PatternCaptureRecord[];
    saving?: boolean;
    onSaveJudgment?: (input: {
      verdict: JudgmentVerdict;
      note: string;
    }) => void;
    onRejudge?: (input: { captureId: string; outcome: OutcomeLabel; note: string }) => void;
    onOpenCapture?: (record: PatternCaptureRecord) => void;
  }

  let {
    symbol = '',
    timeframe = '4h',
    verdict = null,
    entry = null,
    stop = null,
    target = null,
    pWin = null,
    lastPrice = null,
    captures = [],
    saving = false,
    onSaveJudgment,
    onRejudge,
    onOpenCapture,
  }: Props = $props();

  let note = $state('');
  let rejudgeNote = $state('');
  let rejudgeFor = $state<string | null>(null);

  function fmt(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toFixed(4);
  }

  function pctFromPrice(target: number | null, ref: number | null): string {
    if (target == null || ref == null || !Number.isFinite(target) || !Number.isFinite(ref) || ref === 0) return '—';
    const p = ((target - ref) / ref) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  }

  const rr = $derived.by(() => {
    if (entry == null || stop == null || target == null) return null;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (risk === 0) return null;
    return reward / risk;
  });

  function submit(v: JudgmentVerdict) {
    if (saving) return;
    onSaveJudgment?.({ verdict: v, note: note.trim() });
    note = '';
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600_000);
    if (h < 1) return `${Math.floor(diff / 60_000)}m`;
    if (h < 48) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function outcomeOf(r: PatternCaptureRecord): { label: string; tone: 'win' | 'loss' | 'pending' | 'partial' } {
    const any: any = r;
    const out = any?.outcome?.label ?? any?.decision?.outcomeLabel ?? null;
    const pnl = any?.outcome?.pnlPct ?? any?.decision?.outcomePct ?? null;
    if (out === 'correct' || (pnl != null && pnl > 2)) return { label: 'WIN', tone: 'win' };
    if (out === 'wrong' || (pnl != null && pnl < -2)) return { label: 'LOSS', tone: 'loss' };
    if (out === 'partial') return { label: 'PARTIAL', tone: 'partial' };
    return { label: 'PENDING', tone: 'pending' };
  }

  function needsRejudge(r: PatternCaptureRecord): boolean {
    const any: any = r;
    const hasOutcome = any?.outcome?.label || any?.decision?.outcomeLabel;
    if (hasOutcome) return false;
    // If >= 24h old and no outcome, surface for rejudge
    const age = Date.now() - new Date(r.updatedAt).getTime();
    return age > 24 * 3600_000;
  }

  function startRejudge(id: string) {
    rejudgeFor = rejudgeFor === id ? null : id;
    rejudgeNote = '';
  }
  function submitRejudge(id: string, outcome: OutcomeLabel) {
    onRejudge?.({ captureId: id, outcome, note: rejudgeNote.trim() });
    rejudgeFor = null;
    rejudgeNote = '';
  }

  const rejudgeList = $derived(captures.filter(needsRejudge).slice(0, 8));
  const recentList = $derived(captures.slice(0, 12));
</script>

<div class="judge">
  <!-- SECTION 1: 직후 판정 bar -->
  <section class="now">
    <header>
      <h3>Current Judge</h3>
      <span class="ctx">{symbol ? symbol.replace(/USDT$/, '') : '—'} · {timeframe.toUpperCase()}</span>
    </header>

    <div class="now-bar">
      <div class="cell">
        <span class="k">Direction</span>
        <strong class="v-{verdict?.direction ?? 'neutral'}">
          {verdict?.direction?.toUpperCase() ?? '—'}
        </strong>
      </div>
      <div class="cell">
        <span class="k">Entry</span>
        <strong>{fmt(entry)}</strong>
      </div>
      <div class="cell">
        <span class="k">Stop</span>
        <strong class="bad">{fmt(stop)} <small>{pctFromPrice(stop, entry)}</small></strong>
      </div>
      <div class="cell">
        <span class="k">Target</span>
        <strong class="good">{fmt(target)} <small>{pctFromPrice(target, entry)}</small></strong>
      </div>
      <div class="cell">
        <span class="k">R:R</span>
        <strong>{rr ? `1:${rr.toFixed(1)}` : '—'}</strong>
      </div>
      {#if pWin != null}
        <div class="cell">
          <span class="k">P(win)</span>
          <strong class:good={pWin >= 0.58}>{(pWin * 100).toFixed(0)}%</strong>
        </div>
      {/if}
      {#if lastPrice != null}
        <div class="cell last">
          <span class="k">Price</span>
          <strong>{fmt(lastPrice)}</strong>
        </div>
      {/if}
    </div>

    <div class="note-row">
      <input
        class="note"
        placeholder="Note — why this judgment? (optional)"
        bind:value={note}
        disabled={saving}
      />
      <div class="actions">
        <button class="btn yes" onclick={() => submit('bullish')} disabled={saving || !symbol}>
          <span>Y · Bull</span>
        </button>
        <button class="btn no" onclick={() => submit('bearish')} disabled={saving || !symbol}>
          <span>N · Bear</span>
        </button>
        <button class="btn neu" onclick={() => submit('neutral')} disabled={saving || !symbol}>
          <span>Skip</span>
        </button>
      </div>
    </div>
  </section>

  <!-- SECTION 2: 재판정 큐 -->
  {#if rejudgeList.length > 0}
    <section class="rejudge">
      <header>
        <h3>Needs Re-judge <small>({rejudgeList.length})</small></h3>
        <span class="ctx">24h elapsed · no outcome label</span>
      </header>
      <div class="rj-list">
        {#each rejudgeList as r}
          <div class="rj-item">
            <div class="rj-top">
              <button class="rj-open" onclick={() => onOpenCapture?.(r)}>
                <strong>{r.symbol.replace(/USDT$/, '')}</strong>
                <span class="tf">{r.timeframe.toUpperCase()}</span>
                <span class="v-{r.decision?.verdict ?? 'neutral'}">
                  {(r.decision?.verdict ?? '—').toUpperCase()}
                </span>
                <span class="age">{relativeTime(r.updatedAt)} ago</span>
              </button>
              {#if rejudgeFor !== r.id}
                <button class="btn-sm" onclick={() => startRejudge(r.id)}>Judge</button>
              {/if}
            </div>
            {#if rejudgeFor === r.id}
              <div class="rj-form">
                <input
                  class="rj-note"
                  placeholder="What was right / wrong"
                  bind:value={rejudgeNote}
                />
                <div class="rj-actions">
                  <button class="btn-sm good" onclick={() => submitRejudge(r.id, 'correct')}>Correct</button>
                  <button class="btn-sm partial" onclick={() => submitRejudge(r.id, 'partial')}>Partial</button>
                  <button class="btn-sm bad" onclick={() => submitRejudge(r.id, 'wrong')}>Wrong</button>
                  <button class="btn-sm neu" onclick={() => submitRejudge(r.id, 'timeout')}>Timeout</button>
                  <button class="btn-sm cancel" onclick={() => startRejudge(r.id)}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- SECTION 3: 최근 판정 -->
  <section class="recent">
    <header>
      <h3>최근 판정 <small>({captures.length})</small></h3>
    </header>
    {#if recentList.length === 0}
      <p class="empty">저장된 판정 없음.</p>
    {:else}
      <div class="rec-list">
        {#each recentList as r}
          {@const oc = outcomeOf(r)}
          <button class="rec-item" data-tone={oc.tone} onclick={() => onOpenCapture?.(r)}>
            <div class="rec-left">
              <strong>{r.symbol.replace(/USDT$/, '')}</strong>
              <span class="tf">{r.timeframe.toUpperCase()}</span>
              <span class="v-{r.decision?.verdict ?? 'neutral'}">
                {(r.decision?.verdict ?? '—').toUpperCase()}
              </span>
            </div>
            <div class="rec-right">
              <span class="oc">{oc.label}</span>
              <span class="age">{relativeTime(r.updatedAt)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .judge {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(255,255,255,0.06);
    height: 100%;
    overflow: hidden;
  }
  section {
    background: var(--sc-bg-0, #0b0e14);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }
  h3 {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.78);
    margin: 0;
  }
  h3 small {
    font-weight: 400;
    font-size: 10px;
    color: rgba(247,242,234,0.4);
    letter-spacing: 0;
  }
  .ctx {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247,242,234,0.35);
    letter-spacing: 0.06em;
  }
  .empty {
    padding: 16px 12px;
    font-size: 11px;
    color: rgba(247,242,234,0.4);
    text-align: center;
  }

  /* SECTION 1 — now bar */
  .now-bar {
    display: flex;
    gap: 1px;
    background: rgba(255,255,255,0.04);
    flex-shrink: 0;
  }
  .cell {
    flex: 1;
    min-width: 70px;
    padding: 8px 10px;
    background: var(--sc-bg-0, #0b0e14);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cell.last { background: rgba(99,179,237,0.04); }
  .cell .k {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247,242,234,0.4);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .cell strong {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: rgba(247,242,234,0.92);
    display: flex;
    align-items: baseline;
    gap: 5px;
  }
  .cell strong small {
    font-size: 9px;
    font-weight: 400;
    color: rgba(247,242,234,0.4);
  }
  .cell strong.good { color: var(--sc-good, #adca7c); }
  .cell strong.bad  { color: var(--sc-bad, #cf7f8f); }
  .cell strong.v-bullish { color: var(--sc-good, #adca7c); }
  .cell strong.v-bearish { color: var(--sc-bad, #cf7f8f); }

  .note-row {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.05);
    align-items: center;
  }
  .note {
    flex: 1;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(247,242,234,0.9);
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
  }
  .note:focus {
    outline: none;
    border-color: rgba(99,179,237,0.4);
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  .btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 12px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: rgba(247,242,234,0.85);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.08);
    color: rgba(247,242,234,1);
  }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn.yes { background: rgba(173,202,124,0.14); border-color: rgba(173,202,124,0.4); color: var(--sc-good, #adca7c); }
  .btn.no  { background: rgba(207,127,143,0.14); border-color: rgba(207,127,143,0.4); color: var(--sc-bad, #cf7f8f); }
  .btn.neu { background: rgba(255,255,255,0.04); }

  /* SECTION 2 — rejudge queue */
  .rj-list {
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
  }
  .rj-item {
    background: rgba(251,191,36,0.03);
    border: 1px solid rgba(251,191,36,0.12);
    border-radius: 3px;
    overflow: hidden;
  }
  .rj-top {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
  }
  .rj-open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: rgba(247,242,234,0.8);
    cursor: pointer;
    text-align: left;
    padding: 2px 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
  }
  .rj-open strong { color: rgba(247,242,234,0.95); font-size: 11px; }
  .rj-open .tf {
    padding: 1px 5px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    font-size: 9px;
  }
  .rj-open .age { margin-left: auto; color: rgba(251,191,36,0.7); font-size: 9px; }
  .rj-open .v-bullish { color: var(--sc-good, #adca7c); }
  .rj-open .v-bearish { color: var(--sc-bad, #cf7f8f); }
  .rj-open .v-neutral { color: rgba(247,242,234,0.6); }

  .rj-form {
    display: flex;
    gap: 6px;
    padding: 6px 8px 8px;
    border-top: 1px dashed rgba(251,191,36,0.15);
    align-items: center;
    flex-wrap: wrap;
  }
  .rj-note {
    flex: 1;
    min-width: 180px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(247,242,234,0.9);
    padding: 4px 8px;
    border-radius: 2px;
    font-size: 10px;
    font-family: inherit;
  }
  .rj-actions { display: flex; gap: 3px; }

  .btn-sm {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    padding: 3px 7px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(247,242,234,0.8);
    border-radius: 2px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .btn-sm:hover { background: rgba(255,255,255,0.08); }
  .btn-sm.good    { color: var(--sc-good, #adca7c); border-color: rgba(173,202,124,0.3); }
  .btn-sm.partial { color: #e9c167; border-color: rgba(233,193,103,0.3); }
  .btn-sm.bad     { color: var(--sc-bad, #cf7f8f); border-color: rgba(207,127,143,0.3); }
  .btn-sm.neu     { color: rgba(247,242,234,0.6); }
  .btn-sm.cancel  { color: rgba(247,242,234,0.4); }

  /* SECTION 3 — recent */
  .recent { flex: 1; min-height: 0; }
  .rec-list {
    overflow-y: auto;
    padding: 4px 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .rec-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    background: rgba(255,255,255,0.015);
    border: 1px solid transparent;
    border-left: 2px solid rgba(255,255,255,0.15);
    border-radius: 2px;
    cursor: pointer;
    text-align: left;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
  }
  .rec-item:hover { background: rgba(255,255,255,0.04); }
  .rec-item[data-tone='win']     { border-left-color: var(--sc-good, #adca7c); }
  .rec-item[data-tone='loss']    { border-left-color: var(--sc-bad, #cf7f8f); }
  .rec-item[data-tone='partial'] { border-left-color: #e9c167; }
  .rec-item[data-tone='pending'] { border-left-color: rgba(247,242,234,0.2); }

  .rec-left { display: flex; align-items: center; gap: 8px; }
  .rec-left strong { font-size: 11px; color: rgba(247,242,234,0.92); }
  .rec-left .tf {
    padding: 1px 5px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    font-size: 9px;
    color: rgba(247,242,234,0.55);
  }
  .rec-left .v-bullish { color: var(--sc-good, #adca7c); font-size: 9px; }
  .rec-left .v-bearish { color: var(--sc-bad, #cf7f8f); font-size: 9px; }
  .rec-left .v-neutral { color: rgba(247,242,234,0.5); font-size: 9px; }

  .rec-right { display: flex; align-items: center; gap: 8px; }
  .rec-right .oc {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: rgba(247,242,234,0.6);
  }
  .rec-item[data-tone='win']  .oc { color: var(--sc-good, #adca7c); }
  .rec-item[data-tone='loss'] .oc { color: var(--sc-bad, #cf7f8f); }
  .rec-item[data-tone='partial'] .oc { color: #e9c167; }

  .rec-right .age { font-size: 9px; color: rgba(247,242,234,0.4); }
</style>
