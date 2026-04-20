<script lang="ts">
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
    onSaveJudgment?: (input: { verdict: JudgmentVerdict; note: string }) => void;
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

  // Local state
  let judgeVerdict = $state<'bullish' | 'bearish' | null>(null);
  let outcome = $state<'win' | 'loss' | 'flat' | null>(null);
  let rejudged = $state<'right' | 'wrong' | null>(null);
  let note = $state('');
  let rejudgeNote = $state('');
  let rejudgeFor = $state<string | null>(null);

  const TAG_CHIPS = ['확증부족', 'R:R낮음', 'regime안맞음', 'FOMO', '크기초과'];
  let activeChips = $state<Set<string>>(new Set());

  function toggleChip(tag: string) {
    const next = new Set(activeChips);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    activeChips = next;
  }

  // Derived R:R
  const rr = $derived.by(() => {
    if (entry == null || stop == null || target == null) return null;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (risk === 0) return null;
    return reward / risk;
  });

  // R:R visual bar ratio
  const rrBarRed = $derived.by(() => {
    if (rr == null) return 50;
    const total = 1 + rr;
    return Math.round((1 / total) * 100);
  });
  const rrBarGreen = $derived.by(() => 100 - rrBarRed);

  function fmt(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toFixed(4);
  }

  function pctFromPrice(t: number | null, ref: number | null): string {
    if (t == null || ref == null || !Number.isFinite(t) || !Number.isFinite(ref) || ref === 0) return '';
    const p = ((t - ref) / ref) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  }

  function alphaDisplay(): string {
    if (pWin != null) {
      const v = pWin > 1 ? pWin : pWin * 100;
      return `α${Math.round(v)}`;
    }
    return '—';
  }

  function directionLabel(): string {
    const d = verdict?.direction;
    if (!d) return '—';
    if (d === 'bullish') return 'LONG';
    if (d === 'bearish') return 'SHORT';
    return 'NEUTRAL';
  }

  function submitJudge(v: 'bullish' | 'bearish') {
    if (saving || !symbol) return;
    judgeVerdict = v;
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
    const any = r as Record<string, unknown>;
    const out = (any['outcome'] as Record<string, unknown> | undefined)?.['label']
      ?? (any['decision'] as Record<string, unknown> | undefined)?.['outcomeLabel'] ?? null;
    const pnl = (any['outcome'] as Record<string, unknown> | undefined)?.['pnlPct']
      ?? (any['decision'] as Record<string, unknown> | undefined)?.['outcomePct'] ?? null;
    if (out === 'correct' || (pnl != null && (pnl as number) > 2)) return { label: 'WIN', tone: 'win' };
    if (out === 'wrong' || (pnl != null && (pnl as number) < -2)) return { label: 'LOSS', tone: 'loss' };
    if (out === 'partial') return { label: 'PARTIAL', tone: 'partial' };
    return { label: 'PENDING', tone: 'pending' };
  }

  function needsRejudge(r: PatternCaptureRecord): boolean {
    const any = r as Record<string, unknown>;
    const hasOutcome = (any['outcome'] as Record<string, unknown> | undefined)?.['label']
      || (any['decision'] as Record<string, unknown> | undefined)?.['outcomeLabel'];
    if (hasOutcome) return false;
    return Date.now() - new Date(r.updatedAt).getTime() > 24 * 3600_000;
  }

  function startRejudge(id: string) {
    rejudgeFor = rejudgeFor === id ? null : id;
    rejudgeNote = '';
  }

  function submitRejudge(id: string, ol: OutcomeLabel) {
    onRejudge?.({ captureId: id, outcome: ol, note: rejudgeNote.trim() });
    rejudgeFor = null;
    rejudgeNote = '';
  }

  const recentCaptures = $derived(captures.slice(0, 5));
  const rejudgeList = $derived(captures.filter(needsRejudge).slice(0, 5));

  // Consistency feedback
  const consistencyMsg = $derived.by(() => {
    if (!judgeVerdict || !outcome) return null;
    if (judgeVerdict === 'bullish' && outcome === 'win') return { txt: '판단과 결과 일치 — 강화 학습', tone: 'pos' };
    if (judgeVerdict === 'bearish' && outcome === 'loss') return { txt: '판단과 결과 일치 — 강화 학습', tone: 'pos' };
    if (judgeVerdict === 'bullish' && outcome === 'loss') return { txt: '불일치 — 반대 시그널 점검', tone: 'neg' };
    if (judgeVerdict === 'bearish' && outcome === 'win') return { txt: '불일치 — 반대 시그널 점검', tone: 'neg' };
    return { txt: '중립 결과', tone: 'neu' };
  });
</script>

<div class="act-panel">
  <!-- Panel header -->
  <div class="panel-header">
    <span class="step">STEP 04</span>
    <span class="sep">·</span>
    <span class="title">ACT &amp; JUDGE</span>
    <span class="sep">·</span>
    <span class="ctx-sym">{symbol ? symbol.replace(/USDT$/, '') : '—'}</span>
    <span class="ctx-tf">{timeframe.toUpperCase()}</span>
    {#if verdict?.direction}
      <span class="ctx-dir" class:dir-long={verdict.direction === 'bullish'} class:dir-short={verdict.direction === 'bearish'}>
        {directionLabel()}
      </span>
    {/if}
    <span class="ctx-lbl">pattern</span>
    <span class="alpha-badge">{alphaDisplay()}</span>
  </div>

  <!-- 3 columns -->
  <div class="cols">
    <!-- Column A: Trade Plan -->
    <div class="col col-a">
      <div class="col-label">A · TRADE PLAN</div>

      <!-- 2x2 level grid -->
      <div class="level-grid">
        <div class="level-cell">
          <span class="lk">ENTRY</span>
          <span class="lv">{fmt(entry)}</span>
          {#if lastPrice && entry}
            <span class="lv-sub">{pctFromPrice(entry, lastPrice)}</span>
          {/if}
        </div>
        <div class="level-cell level-stop">
          <span class="lk">STOP</span>
          <span class="lv lv-neg">{fmt(stop)}</span>
          {#if stop && entry}
            <span class="lv-sub lv-neg-sub">{pctFromPrice(stop, entry)}</span>
          {/if}
        </div>
        <div class="level-cell level-target">
          <span class="lk">TARGET</span>
          <span class="lv lv-pos">{fmt(target)}</span>
          {#if target && entry}
            <span class="lv-sub lv-pos-sub">{pctFromPrice(target, entry)}</span>
          {/if}
        </div>
        <div class="level-cell">
          <span class="lk">R:R</span>
          <span class="lv">{rr ? `1:${rr.toFixed(1)}` : '—'}</span>
        </div>
      </div>

      <!-- R:R visual bar -->
      {#if rr != null}
        <div class="rr-bar-wrap">
          <div class="rr-seg rr-red" style="width: {rrBarRed}%;"></div>
          <div class="rr-seg rr-green" style="width: {rrBarGreen}%;"></div>
        </div>
        <div class="rr-labels">
          <span class="rr-risk">Risk {rrBarRed}%</span>
          <span class="rr-reward">Reward {rrBarGreen}%</span>
        </div>
      {/if}

      <!-- Size chip -->
      <div class="size-row">
        <span class="size-chip">1.2% · 3x</span>
      </div>

      <!-- Exchange button -->
      <button class="exchange-btn" disabled={!symbol}>
        OPEN IN EXCHANGE ↗
      </button>
    </div>

    <!-- Column B: Judge Now -->
    <div class="col col-b">
      <div class="col-label">B · JUDGE NOW</div>

      <div class="judge-q">이 셋업에 동의하는가?</div>

      <!-- Hero Y/N buttons -->
      <div class="hero-btns">
        <button
          class="hero-btn hero-y"
          class:active={judgeVerdict === 'bullish'}
          onclick={() => submitJudge('bullish')}
          disabled={saving || !symbol}
        >
          <span class="hero-key">Y</span>
          <span class="hero-lbl">AGREE</span>
          <span class="hero-sub">bullish</span>
        </button>
        <button
          class="hero-btn hero-n"
          class:active={judgeVerdict === 'bearish'}
          onclick={() => submitJudge('bearish')}
          disabled={saving || !symbol}
        >
          <span class="hero-key">N</span>
          <span class="hero-lbl">DISAGREE</span>
          <span class="hero-sub">bearish</span>
        </button>
      </div>

      <!-- Note input -->
      <input
        class="note-input"
        placeholder="메모 (선택)"
        bind:value={note}
        disabled={saving}
      />

      <!-- Tag chips -->
      <div class="tag-chips">
        {#each TAG_CHIPS as tag}
          <button
            class="tag-chip"
            class:tag-active={activeChips.has(tag)}
            onclick={() => toggleChip(tag)}
          >{tag}</button>
        {/each}
      </div>
    </div>

    <!-- Column C: After Result -->
    <div class="col col-c">
      <div class="col-label">C · AFTER RESULT</div>

      <!-- WIN/LOSS/FLAT selector -->
      <div class="outcome-btns">
        <button
          class="outcome-btn out-win"
          class:active={outcome === 'win'}
          onclick={() => { outcome = outcome === 'win' ? null : 'win'; }}
        >WIN</button>
        <button
          class="outcome-btn out-loss"
          class:active={outcome === 'loss'}
          onclick={() => { outcome = outcome === 'loss' ? null : 'loss'; }}
        >LOSS</button>
        <button
          class="outcome-btn out-flat"
          class:active={outcome === 'flat'}
          onclick={() => { outcome = outcome === 'flat' ? null : 'flat'; }}
        >FLAT</button>
      </div>

      <!-- Result PnL display when selected -->
      {#if outcome != null}
        <div class="result-display" data-outcome={outcome}>
          <span class="result-label">
            {#if outcome === 'win'}+결과 기록됨{:else if outcome === 'loss'}−결과 기록됨{:else}→ 중립 기록됨{/if}
          </span>
        </div>
      {/if}

      <!-- Rejudge buttons -->
      <div class="rejudge-row">
        <button
          class="rj-btn rj-right"
          class:active={rejudged === 'right'}
          onclick={() => { rejudged = rejudged === 'right' ? null : 'right'; }}
        >옳았다 +보강</button>
        <button
          class="rj-btn rj-wrong"
          class:active={rejudged === 'wrong'}
          onclick={() => { rejudged = rejudged === 'wrong' ? null : 'wrong'; }}
        >틀렸다 뒤집기</button>
      </div>

      <!-- Consistency feedback -->
      {#if consistencyMsg}
        <div class="consistency" data-tone={consistencyMsg.tone}>
          {consistencyMsg.txt}
        </div>
      {/if}

      <!-- Rejudge queue -->
      {#if rejudgeList.length > 0}
        <div class="rjq-label">재판정 필요 <span class="rjq-cnt">({rejudgeList.length})</span></div>
        <div class="rjq-list">
          {#each rejudgeList as r}
            <div class="rjq-item">
              <button class="rjq-open" onclick={() => onOpenCapture?.(r)}>
                <strong>{r.symbol.replace(/USDT$/, '')}</strong>
                <span class="rjq-tf">{r.timeframe.toUpperCase()}</span>
                <span class="rjq-age">{relativeTime(r.updatedAt)}</span>
              </button>
              {#if rejudgeFor !== r.id}
                <button class="btn-xs" onclick={() => startRejudge(r.id)}>판정</button>
              {:else}
                <div class="rjq-form">
                  <input class="rjq-note" placeholder="메모" bind:value={rejudgeNote} />
                  <div class="rjq-acts">
                    <button class="btn-xs btn-win" onclick={() => submitRejudge(r.id, 'correct')}>맞음</button>
                    <button class="btn-xs btn-loss" onclick={() => submitRejudge(r.id, 'wrong')}>틀림</button>
                    <button class="btn-xs btn-part" onclick={() => submitRejudge(r.id, 'partial')}>부분</button>
                    <button class="btn-xs btn-cancel" onclick={() => startRejudge(r.id)}>취소</button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Recent captures mini list (below columns) -->
  {#if recentCaptures.length > 0}
    <div class="recent-strip">
      <div class="recent-label">RECENT</div>
      <div class="recent-list">
        {#each recentCaptures as r}
          {@const oc = outcomeOf(r)}
          <button class="recent-item" data-tone={oc.tone} onclick={() => onOpenCapture?.(r)}>
            <span class="ri-sym">{r.symbol.replace(/USDT$/, '')}</span>
            <span class="ri-tf">{r.timeframe.toUpperCase()}</span>
            <span class="ri-v v-{r.decision?.verdict ?? 'neutral'}">{(r.decision?.verdict ?? '—').slice(0,4).toUpperCase()}</span>
            <span class="ri-oc" data-tone={oc.tone}>{oc.label}</span>
            <span class="ri-age">{relativeTime(r.updatedAt)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .act-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--sc-bg-0, #0b0e14);
    font-family: var(--sc-font-mono, monospace);
    color: var(--sc-text-0, #f7f2ea);
  }

  /* Panel header */
  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .step {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(247,242,234,0.38);
  }
  .sep { font-size: 9px; color: rgba(247,242,234,0.22); }
  .title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.85);
  }
  .ctx-sym {
    font-size: 11px;
    font-weight: 700;
    color: rgba(247,242,234,0.92);
  }
  .ctx-tf {
    font-size: 9px;
    padding: 1px 5px;
    background: rgba(255,255,255,0.07);
    border-radius: 2px;
    color: rgba(247,242,234,0.55);
  }
  .ctx-dir {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 1px 6px;
    border-radius: 2px;
    background: rgba(255,255,255,0.05);
    color: rgba(247,242,234,0.6);
  }
  .ctx-dir.dir-long { background: rgba(173,202,124,0.14); color: var(--pos, #adca7c); }
  .ctx-dir.dir-short { background: rgba(207,127,143,0.14); color: var(--neg, #cf7f8f); }
  .ctx-lbl {
    font-size: 9px;
    color: rgba(247,242,234,0.3);
    letter-spacing: 0.06em;
  }
  .alpha-badge {
    margin-left: auto;
    font-size: 10px;
    font-weight: 700;
    color: rgba(247,242,234,0.55);
  }

  /* 3 columns */
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    flex: 1;
    min-height: 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    gap: 0;
  }
  .col {
    padding: 10px 12px;
    border-right: 1px solid rgba(255,255,255,0.05);
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
  }
  .col:last-child { border-right: none; }

  .col-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.4);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  /* Column A — Trade Plan */
  .level-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .level-cell {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 3px;
    padding: 6px 7px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lk {
    font-size: 8px;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.38);
    text-transform: uppercase;
  }
  .lv {
    font-size: 12px;
    font-weight: 700;
    color: rgba(247,242,234,0.92);
  }
  .lv-neg { color: var(--neg, #cf7f8f); }
  .lv-pos { color: var(--pos, #adca7c); }
  .lv-sub {
    font-size: 9px;
    color: rgba(247,242,234,0.4);
  }
  .lv-neg-sub { color: rgba(207,127,143,0.7); }
  .lv-pos-sub { color: rgba(173,202,124,0.7); }

  /* R:R bar */
  .rr-bar-wrap {
    display: flex;
    height: 5px;
    border-radius: 3px;
    overflow: hidden;
    gap: 1px;
  }
  .rr-seg { height: 100%; }
  .rr-red { background: rgba(207,127,143,0.7); border-radius: 2px 0 0 2px; }
  .rr-green { background: rgba(173,202,124,0.7); border-radius: 0 2px 2px 0; }
  .rr-labels {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: rgba(247,242,234,0.35);
  }
  .rr-risk { color: rgba(207,127,143,0.75); }
  .rr-reward { color: rgba(173,202,124,0.75); }

  .size-row {
    display: flex;
    gap: 6px;
  }
  .size-chip {
    font-size: 9px;
    padding: 2px 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: rgba(247,242,234,0.65);
  }

  .exchange-btn {
    font-family: inherit;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 7px 10px;
    background: rgba(173,202,124,0.15);
    border: 1px solid rgba(173,202,124,0.4);
    border-radius: 3px;
    color: var(--pos, #adca7c);
    cursor: pointer;
    text-align: center;
    transition: background 0.12s;
    margin-top: auto;
  }
  .exchange-btn:hover:not(:disabled) {
    background: rgba(173,202,124,0.25);
  }
  .exchange-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  /* Column B — Judge Now */
  .judge-q {
    font-size: 10px;
    color: rgba(247,242,234,0.55);
    line-height: 1.4;
  }

  .hero-btns {
    display: flex;
    gap: 6px;
  }
  .hero-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 8px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, transform 0.1s;
    font-family: inherit;
  }
  .hero-btn:hover:not(:disabled) { transform: translateY(-1px); }
  .hero-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .hero-y { border-color: rgba(173,202,124,0.25); }
  .hero-y:hover:not(:disabled), .hero-y.active {
    background: rgba(173,202,124,0.15);
    border-color: rgba(173,202,124,0.6);
  }
  .hero-n { border-color: rgba(207,127,143,0.25); }
  .hero-n:hover:not(:disabled), .hero-n.active {
    background: rgba(207,127,143,0.15);
    border-color: rgba(207,127,143,0.6);
  }

  .hero-key {
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
  }
  .hero-y .hero-key { color: var(--pos, #adca7c); }
  .hero-n .hero-key { color: var(--neg, #cf7f8f); }

  .hero-lbl {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.7);
  }
  .hero-sub {
    font-size: 8px;
    color: rgba(247,242,234,0.35);
    letter-spacing: 0.06em;
  }

  .note-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(247,242,234,0.88);
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-family: inherit;
  }
  .note-input:focus { outline: none; border-color: rgba(99,179,237,0.35); }
  .note-input:disabled { opacity: 0.4; }

  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag-chip {
    font-family: inherit;
    font-size: 8px;
    padding: 2px 7px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px;
    color: rgba(247,242,234,0.5);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    letter-spacing: 0.04em;
  }
  .tag-chip:hover { background: rgba(255,255,255,0.08); color: rgba(247,242,234,0.8); }
  .tag-chip.tag-active {
    background: rgba(233,193,103,0.12);
    border-color: rgba(233,193,103,0.4);
    color: var(--amb, #e9c167);
  }

  /* Column C — After Result */
  .outcome-btns {
    display: flex;
    gap: 4px;
  }
  .outcome-btn {
    flex: 1;
    padding: 6px 4px;
    font-family: inherit;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    color: rgba(247,242,234,0.55);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .out-win.active, .out-win:hover {
    background: rgba(173,202,124,0.15);
    border-color: rgba(173,202,124,0.5);
    color: var(--pos, #adca7c);
  }
  .out-loss.active, .out-loss:hover {
    background: rgba(207,127,143,0.15);
    border-color: rgba(207,127,143,0.5);
    color: var(--neg, #cf7f8f);
  }
  .out-flat.active, .out-flat:hover {
    background: rgba(255,255,255,0.07);
    border-color: rgba(255,255,255,0.25);
    color: rgba(247,242,234,0.8);
  }

  .result-display {
    padding: 5px 8px;
    border-radius: 3px;
    background: rgba(255,255,255,0.04);
    font-size: 9px;
  }
  .result-display[data-outcome='win'] { background: rgba(173,202,124,0.08); }
  .result-display[data-outcome='loss'] { background: rgba(207,127,143,0.08); }
  .result-label { color: rgba(247,242,234,0.65); }

  .rejudge-row {
    display: flex;
    gap: 4px;
  }
  .rj-btn {
    flex: 1;
    padding: 5px 4px;
    font-family: inherit;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 3px;
    color: rgba(247,242,234,0.5);
    cursor: pointer;
    transition: all 0.12s;
  }
  .rj-right.active, .rj-right:hover {
    background: rgba(173,202,124,0.12);
    border-color: rgba(173,202,124,0.4);
    color: var(--pos, #adca7c);
  }
  .rj-wrong.active, .rj-wrong:hover {
    background: rgba(207,127,143,0.12);
    border-color: rgba(207,127,143,0.4);
    color: var(--neg, #cf7f8f);
  }

  .consistency {
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 9px;
    letter-spacing: 0.04em;
    color: rgba(247,242,234,0.65);
    background: rgba(255,255,255,0.04);
  }
  .consistency[data-tone='pos'] { background: rgba(173,202,124,0.08); color: var(--pos, #adca7c); }
  .consistency[data-tone='neg'] { background: rgba(207,127,143,0.08); color: var(--neg, #cf7f8f); }

  /* Rejudge queue */
  .rjq-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.4);
    margin-top: 2px;
  }
  .rjq-cnt { font-weight: 400; color: rgba(247,242,234,0.3); }
  .rjq-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-y: auto;
  }
  .rjq-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(251,191,36,0.04);
    border: 1px solid rgba(251,191,36,0.12);
    border-radius: 3px;
    overflow: hidden;
  }
  .rjq-open {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    background: transparent;
    border: none;
    color: rgba(247,242,234,0.75);
    cursor: pointer;
    font-family: inherit;
    font-size: 9px;
    text-align: left;
  }
  .rjq-open strong { font-size: 10px; color: rgba(247,242,234,0.9); }
  .rjq-tf {
    padding: 1px 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    font-size: 8px;
  }
  .rjq-age { margin-left: auto; font-size: 8px; color: rgba(251,191,36,0.65); }
  .rjq-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 7px 6px;
    border-top: 1px dashed rgba(251,191,36,0.15);
  }
  .rjq-note {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    color: rgba(247,242,234,0.85);
    padding: 3px 6px;
    font-size: 9px;
    font-family: inherit;
    border-radius: 2px;
  }
  .rjq-acts { display: flex; gap: 3px; }

  /* Tiny buttons */
  .btn-xs {
    font-family: inherit;
    font-size: 8px;
    padding: 2px 6px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(247,242,234,0.7);
    border-radius: 2px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .btn-xs:hover { background: rgba(255,255,255,0.08); }
  .btn-win { color: var(--pos, #adca7c); border-color: rgba(173,202,124,0.3); }
  .btn-loss { color: var(--neg, #cf7f8f); border-color: rgba(207,127,143,0.3); }
  .btn-part { color: var(--amb, #e9c167); border-color: rgba(233,193,103,0.3); }
  .btn-cancel { color: rgba(247,242,234,0.4); }

  /* Recent strip */
  .recent-strip {
    flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,0.05);
    padding: 5px 12px 6px;
    background: rgba(0,0,0,0.1);
  }
  .recent-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(247,242,234,0.3);
    margin-bottom: 4px;
  }
  .recent-list {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .recent-list::-webkit-scrollbar { display: none; }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: inherit;
    font-size: 9px;
    transition: background 0.1s;
  }
  .recent-item:hover { background: rgba(255,255,255,0.06); }
  .recent-item[data-tone='win']  { border-color: rgba(173,202,124,0.25); }
  .recent-item[data-tone='loss'] { border-color: rgba(207,127,143,0.25); }
  .ri-sym { font-weight: 700; color: rgba(247,242,234,0.85); }
  .ri-tf  { color: rgba(247,242,234,0.4); font-size: 8px; }
  .ri-v   { font-size: 8px; color: rgba(247,242,234,0.5); }
  .ri-v.v-bullish { color: var(--pos, #adca7c); }
  .ri-v.v-bearish { color: var(--neg, #cf7f8f); }
  .ri-oc  { font-size: 8px; color: rgba(247,242,234,0.45); }
  .ri-oc[data-tone='win']  { color: var(--pos, #adca7c); }
  .ri-oc[data-tone='loss'] { color: var(--neg, #cf7f8f); }
  .ri-age { font-size: 8px; color: rgba(247,242,234,0.3); }

  /* Responsive */
  @media (max-width: 800px) {
    .cols { grid-template-columns: 1fr; }
    .col { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .col:last-child { border-bottom: none; }
  }
</style>
