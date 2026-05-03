<script lang="ts">
  /**
   * RangeSelectionPanel.svelte — W-0392
   *
   * Chart bottom-dock panel that appears when a range (anchorA..anchorB)
   * is selected. Shows OHLCV summary, indicator snapshot, pattern matches,
   * and Judge / Save controls.
   *
   * Props follow the W-0392 spec. All layout uses CSS design tokens.
   */

  import type { RangeSelectionBar } from '$lib/terminal/rangeSelectionCapture';

  /** Local alias for JudgeResponse shape from engine-openapi. */
  export interface JudgeVerdict {
    verdict: string;
    entry: number | null;
    stop: number | null;
    target: number | null;
    p_win: number | null;
    rr: number | null;
    rationale: string;
    text: string;
  }

  interface Props {
    symbol: string;
    tf: string;
    bars: RangeSelectionBar[];
    snapshot: Record<string, number> | null;
    onJudge: () => void;
    onSaveOnly: () => void;
    onSave?: () => void;
    loading: boolean;
    verdict: JudgeVerdict | null;
  }

  let { symbol, tf, bars, snapshot, onJudge, onSaveOnly, onSave, loading, verdict }: Props = $props();

  // ── OHLCV summary ─────────────────────────────────────────────────────────
  const summary = $derived.by(() => {
    if (bars.length === 0) return null;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const high = Math.max(...bars.map((b) => b.high));
    const low = Math.min(...bars.map((b) => b.low));
    const vol = bars.reduce((s, b) => s + (b.volume ?? 0), 0);
    const pct = first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : null;
    return { open: first.open, high, low, close: last.close, vol, pct };
  });

  // ── Date labels ───────────────────────────────────────────────────────────
  const dateLabel = $derived.by(() => {
    if (bars.length === 0) return '';
    const fmt = (ts: number) => {
      const d = new Date(ts * 1000);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    return `${fmt(bars[0].time)} ~ ${fmt(bars[bars.length - 1].time)}`;
  });

  // ── Button states ─────────────────────────────────────────────────────────
  const tooShort = $derived(bars.length < 3);
  const judgeDisabled = $derived(tooShort || snapshot === null || loading);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmt2(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toFixed(2);
  }

  function fmtPct(v: number | null | undefined): string {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function fmtPrice(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function fmtLargeVol(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toFixed(0);
  }

  function verdictColorClass(v: JudgeVerdict): string {
    const dir = v.verdict.toUpperCase();
    if (dir === 'LONG') return 'pos';
    if (dir === 'SHORT') return 'neg';
    return 'amb';
  }
</script>

<div class="rsp-panel" role="region" aria-label="Range selection panel">
  <!-- Row 1: header -->
  <div class="rsp-header">
    <span class="rsp-title">{symbol} · {tf} · {bars.length}봉</span>
    <span class="rsp-date">{dateLabel}</span>
  </div>

  {#if tooShort}
    <div class="rsp-warn">구간 너무 짧음 — 최소 3봉 선택</div>
  {:else if summary}
    <!-- Row 2: OHLCV summary -->
    <div class="rsp-ohlcv">
      <span>O:<strong>{fmtPrice(summary.open)}</strong></span>
      <span>H:<strong>{fmtPrice(summary.high)}</strong></span>
      <span>L:<strong>{fmtPrice(summary.low)}</strong></span>
      <span>C:<strong>{fmtPrice(summary.close)}</strong></span>
      {#if summary.pct !== null}
        <span class="rsp-pct" class:pos={summary.pct >= 0} class:neg={summary.pct < 0}>
          {fmtPct(summary.pct)}
        </span>
      {/if}
      <span class="rsp-vol">Vol:{fmtLargeVol(summary.vol)}</span>
    </div>

    <!-- Row 3: indicator snapshot -->
    {#if snapshot}
      <div class="rsp-indicators">
        {#if snapshot.rsi_14 != null}
          <span>RSI:<strong>{fmt2(snapshot.rsi_14)}</strong></span>
        {/if}
        {#if snapshot.vol_z_20 != null}
          <span>vol_z:<strong>{fmt2(snapshot.vol_z_20)}</strong></span>
        {/if}
        {#if snapshot.atr_pct_14 != null}
          <span>ATR%:<strong>{fmt2(snapshot.atr_pct_14)}</strong></span>
        {/if}
        {#if snapshot.macd_hist != null}
          <span>MACD:<strong>{fmt2(snapshot.macd_hist)}</strong></span>
        {/if}
        {#if snapshot.bb_width != null}
          <span>BB_w:<strong>{fmt2(snapshot.bb_width)}</strong></span>
        {/if}
      </div>
    {:else}
      <div class="rsp-warn">지표 부족 — 구간을 더 넓게 선택하세요</div>
    {/if}
  {/if}

  <!-- Verdict display (appears after judge) -->
  {#if verdict}
    <div class="rsp-verdict">
      <span class="rsp-verdict-dir {verdictColorClass(verdict)}">{verdict.verdict.toUpperCase()}</span>
      {#if verdict.entry != null}
        <span>Entry:<strong>{fmtPrice(verdict.entry)}</strong></span>
      {/if}
      {#if verdict.stop != null}
        <span>Stop:<strong>{fmtPrice(verdict.stop)}</strong></span>
      {/if}
      {#if verdict.target != null}
        <span>Target:<strong>{fmtPrice(verdict.target)}</strong></span>
      {/if}
      {#if verdict.rr != null}
        <span>RR:<strong>{fmt2(verdict.rr)}</strong></span>
      {/if}
      {#if verdict.rationale}
        <p class="rsp-rationale">"{verdict.rationale}"</p>
      {/if}
    </div>
  {/if}

  <!-- Actions -->
  <div class="rsp-actions">
    <button
      class="rsp-btn rsp-btn--judge"
      onclick={onJudge}
      disabled={judgeDisabled}
      aria-busy={loading}
    >
      {#if loading}
        <span class="rsp-spinner" aria-hidden="true"></span>
        판정 중…
      {:else}
        판정
      {/if}
    </button>

    <button class="rsp-btn rsp-btn--save" onclick={onSaveOnly}>
      구간만 저장
    </button>

    {#if verdict}
      <button class="rsp-btn rsp-btn--save-verdict" onclick={onSave}>
        저장
      </button>
    {/if}
  </div>
</div>

<style>
  .rsp-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1, 4px);
    padding: var(--sp-2, 6px) var(--sp-3, 8px);
    background: var(--surface-1, #1a1d27);
    border-top: 1px solid var(--border-1, rgba(255,255,255,0.08));
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: var(--text-1, rgba(177,181,189,0.9));
  }

  .rsp-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2, 6px);
  }

  .rsp-title {
    font-weight: 600;
    color: var(--text-0, #fff);
    font-size: var(--ui-text-xs);
  }

  .rsp-date {
    color: var(--text-2, rgba(177,181,189,0.55));
    font-size: var(--ui-text-xs);
  }

  .rsp-ohlcv,
  .rsp-indicators {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2, 6px) var(--sp-3, 12px);
    font-size: var(--ui-text-xs);
  }

  .rsp-ohlcv strong,
  .rsp-indicators strong {
    color: var(--text-0, #fff);
  }

  .rsp-pct.pos { color: var(--pos); }
  .rsp-pct.neg { color: var(--neg); }

  .rsp-vol {
    color: var(--text-2, rgba(177,181,189,0.55));
  }

  .rsp-warn {
    color: var(--amb);
    font-size: var(--ui-text-xs);
    font-style: italic;
  }

  .rsp-verdict {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2, 6px) var(--sp-3, 12px);
    padding: var(--sp-1, 4px) 0;
    border-top: 1px solid var(--border-1, rgba(255,255,255,0.06));
    font-size: var(--ui-text-xs);
  }

  .rsp-verdict strong { color: var(--text-0, #fff); }

  .rsp-verdict-dir {
    font-weight: 700;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.05em;
  }
  .rsp-verdict-dir.pos { color: var(--pos); }
  .rsp-verdict-dir.neg { color: var(--neg); }
  .rsp-verdict-dir.amb { color: var(--amb); }

  .rsp-rationale {
    width: 100%;
    margin: 0;
    color: var(--text-2, rgba(177,181,189,0.6));
    font-style: italic;
    font-size: var(--ui-text-xs);
  }

  .rsp-actions {
    display: flex;
    gap: var(--sp-2, 6px);
    margin-top: var(--sp-1, 4px);
  }

  .rsp-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1, 4px);
    padding: var(--sp-1, 3px) var(--sp-3, 10px);
    border: 1px solid var(--border-1, rgba(255,255,255,0.12));
    border-radius: var(--radius-sm, 4px);
    background: var(--surface-2, rgba(255,255,255,0.04));
    color: var(--text-1, rgba(177,181,189,0.9));
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    cursor: pointer;
    transition: background 0.12s;
  }

  .rsp-btn:hover:not(:disabled) {
    background: var(--surface-3, rgba(255,255,255,0.08));
  }

  .rsp-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .rsp-btn--judge {
    border-color: var(--amb);
    color: var(--amb);
  }

  .rsp-btn--save-verdict {
    border-color: var(--pos);
    color: var(--pos);
  }

  .rsp-spinner {
    display: inline-block;
    width: var(--sp-2, 8px);
    height: var(--sp-2, 8px);
    border: 1px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: rsp-spin 0.6s linear infinite;
  }

  @keyframes rsp-spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile: full-width bottom sheet style */
  @media (max-width: 768px) {
    .rsp-panel {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0 0;
      box-shadow: 0 -4px var(--sp-3, 12px) rgba(0,0,0,0.4);
    }
  }
</style>
