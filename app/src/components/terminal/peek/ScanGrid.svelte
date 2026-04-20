<script lang="ts">
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface AlertRow {
    id: string;
    symbol: string;
    timeframe: string;
    blocks_triggered: string[];
    p_win: number | null;
    created_at: string;
    preview?: { price?: number; rsi14?: number; funding_rate?: number; regime?: string };
  }

  interface Props {
    alerts?: AlertRow[];
    similar?: PatternCaptureRecord[];
    activeSymbol?: string;
    loadingSimilar?: boolean;
    onOpenCapture?: (record: PatternCaptureRecord) => void;
  }

  let {
    alerts = [],
    similar = [],
    activeSymbol = '',
    loadingSimilar = false,
    onOpenCapture,
  }: Props = $props();

  // Fixed MiniChart points (from prototype, 180x60 viewBox)
  const CHART_PTS: [number, number][] = [
    [0,14],[8,22],[16,30],[24,38],[32,32],[40,36],[48,40],[56,44],
    [64,52],[72,48],[80,44],[88,42],[96,40],[104,38],[112,36],[120,34],
    [128,30],[136,28],[144,26],[152,22],[160,18],[168,14],[176,10],[180,8]
  ];
  const NOW_X = 128;

  // Build SVG polyline points string
  const chartPolyline = CHART_PTS.map(([x,y]) => `${x},${y}`).join(' ');

  // Past samples expanded state
  let expandedId = $state<string | null>(null);

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function sym(s: string): string {
    return s.replace(/USDT$/, '');
  }

  function outcomePct(record: PatternCaptureRecord): number | null {
    const r = record as Record<string, unknown>;
    const decision = r['decision'] as Record<string, unknown> | undefined;
    const outcome = r['outcome'] as Record<string, unknown> | undefined;
    const v = (decision?.['outcomePct'] ?? outcome?.['pnlPct']) as number | undefined;
    return v != null ? v : null;
  }

  function outcomePctStr(record: PatternCaptureRecord): string {
    const pnl = outcomePct(record);
    if (pnl == null) return '—';
    return `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`;
  }

  function outcomeTone(record: PatternCaptureRecord): 'win' | 'loss' | 'pending' {
    const pnl = outcomePct(record);
    if (pnl == null) return 'pending';
    return pnl > 0 ? 'win' : 'loss';
  }

  function cardTone(record: PatternCaptureRecord): 'pos' | 'amb' | 'neutral' {
    const conf = record.decision?.confidence;
    if (conf != null) {
      if (conf >= 0.75) return 'pos';
      if (conf >= 0.58) return 'amb';
    }
    return 'neutral';
  }

  function simPct(record: PatternCaptureRecord, idx: number): number {
    // Synthetic similarity score based on index (prototype fallback)
    const r = record as Record<string, unknown>;
    const v = (r['similarity'] ?? r['simScore']) as number | undefined;
    if (v != null) return Math.round(v * 100);
    // Fallback: descending from 94
    return Math.max(60, 94 - idx * 3);
  }

  // PastSamplesStrip stats
  const stripStats = $derived.by(() => {
    const wins = similar.filter(r => outcomeTone(r) === 'win').length;
    const losses = similar.filter(r => outcomeTone(r) === 'loss').length;
    const pnls = similar.map(r => outcomePct(r)).filter((v): v is number => v != null);
    const avgWin = pnls.filter(v => v > 0).reduce((s, v) => s + v, 0) / (wins || 1);
    return { wins, losses, avgWin };
  });

  // Synthetic fallback strip data when similar is empty
  const SYNTHETIC_STRIP = [
    { sym: 'TRADOOR', pnl: 6.2, tone: 'win' as const },
    { sym: 'PTB', pnl: 2.1, tone: 'win' as const },
    { sym: 'JUP', pnl: -1.4, tone: 'loss' as const },
    { sym: 'SOL', pnl: 4.8, tone: 'win' as const },
    { sym: 'DOGE', pnl: -0.9, tone: 'loss' as const },
  ];
</script>

<div class="scan-grid">
  <!-- Header bar -->
  <div class="header-bar">
    <span class="step">STEP 03</span>
    <span class="sep">·</span>
    <span class="title">SIMILAR NOW</span>
    <span class="sep">·</span>
    <span class="count">{similar.length} candidates</span>
    <span class="sort-label">SORT: similarity</span>
  </div>

  <!-- WideGridView: 5-col grid -->
  <div class="grid-area">
    {#if loadingSimilar}
      <div class="empty-state">Searching similar setups…</div>
    {:else if similar.length === 0}
      <div class="empty-state">No similar setups found. Save more judgments to build history.</div>
    {:else}
      <div class="wide-grid">
        {#each similar as rec, i}
          {@const tone = cardTone(rec)}
          {@const ot = outcomeTone(rec)}
          {@const sp = simPct(rec, i)}
          <button
            class="grid-card"
            data-tone={tone}
            data-outcome={ot}
            onclick={() => onOpenCapture?.(rec)}
          >
            <!-- Top row: symbol / tf / alpha -->
            <div class="card-top">
              <span class="card-sym">{sym(rec.symbol)}</span>
              <span class="card-tf">{rec.timeframe.toUpperCase()}</span>
              <span class="card-alpha" data-tone={tone}>
                {rec.decision?.confidence != null
                  ? `α${Math.round(rec.decision.confidence * 100)}`
                  : rec.decision?.verdict?.toUpperCase() ?? '—'}
              </span>
            </div>

            <!-- MiniChart SVG -->
            <svg class="mini-chart" viewBox="0 0 180 60" preserveAspectRatio="none">
              <!-- Phase highlight band -->
              <rect x={NOW_X - 32} y="0" width="64" height="60"
                fill={tone === 'pos' ? 'rgba(173,202,124,0.07)' : tone === 'amb' ? 'rgba(233,193,103,0.07)' : 'rgba(247,242,234,0.04)'}
              />
              <!-- Price line -->
              <polyline
                points={chartPolyline}
                fill="none"
                stroke={tone === 'pos' ? 'var(--pos, #adca7c)' : tone === 'amb' ? 'var(--amb, #e9c167)' : 'var(--g6, #6b7280)'}
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <!-- Entry dot at nowX -->
              <circle cx={NOW_X} cy="30" r="3"
                fill={tone === 'pos' ? 'var(--pos, #adca7c)' : tone === 'amb' ? 'var(--amb, #e9c167)' : 'var(--g5, #9ca3af)'}
              />
            </svg>

            <!-- Sim% bar + age -->
            <div class="card-bot">
              <div class="sim-bar-wrap">
                <div class="sim-bar" style="width: {sp}%;" data-tone={tone}></div>
              </div>
              <span class="sim-pct">{sp}%</span>
              <span class="card-age">{relativeTime(rec.updatedAt)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- PastSamplesStrip -->
  <div class="strip-area">
    <div class="strip-header">
      <span class="strip-star">★</span>
      <span class="strip-label">PAST</span>
      <span class="strip-count">
        {similar.length > 0 ? similar.length : SYNTHETIC_STRIP.length} similar
      </span>
      {#if similar.length > 0}
        <span class="strip-stats">
          {stripStats.wins}W {stripStats.losses}L
          avg win {stripStats.avgWin >= 0 ? '+' : ''}{stripStats.avgWin.toFixed(1)}%
        </span>
      {/if}
      <span class="strip-hint">click →</span>
    </div>

    <!-- Horizontal scroll pills -->
    <div class="strip-scroll">
      {#if similar.length > 0}
        {#each similar as rec}
          {@const pnl = outcomePct(rec)}
          {@const ot = outcomeTone(rec)}
          <button
            class="strip-pill"
            data-tone={ot}
            class:expanded={expandedId === rec.id}
            onclick={() => { expandedId = expandedId === rec.id ? null : rec.id; }}
          >
            <span class="pill-sym">{sym(rec.symbol)}</span>
            <span class="pill-pnl" data-tone={ot}>
              {pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%` : '—'}
            </span>
          </button>
        {/each}
      {:else}
        {#each SYNTHETIC_STRIP as s}
          <div class="strip-pill" data-tone={s.tone}>
            <span class="pill-sym">{s.sym}</span>
            <span class="pill-pnl" data-tone={s.tone}>
              {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}%
            </span>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Expanded sample overlay -->
    {#if expandedId != null}
      {@const rec = similar.find(r => r.id === expandedId)}
      {#if rec}
        {@const ot = outcomeTone(rec)}
        {@const tone = cardTone(rec)}
        <div class="expanded-sample">
          <div class="exp-top">
            <strong class="exp-sym">{sym(rec.symbol)}</strong>
            <span class="exp-tf">{rec.timeframe.toUpperCase()}</span>
            <span class="exp-verdict v-{rec.decision?.verdict ?? 'neutral'}">
              {(rec.decision?.verdict ?? '—').toUpperCase()}
            </span>
            <span class="exp-pnl" data-tone={ot}>{outcomePctStr(rec)}</span>
            <button class="exp-close" onclick={() => { expandedId = null; }}>✕</button>
          </div>
          <!-- Mini chart in expanded view -->
          <svg class="exp-chart" viewBox="0 0 180 60" preserveAspectRatio="none">
            <rect x={NOW_X - 32} y="0" width="64" height="60"
              fill={tone === 'pos' ? 'rgba(173,202,124,0.09)' : 'rgba(247,242,234,0.04)'}
            />
            <polyline
              points={chartPolyline}
              fill="none"
              stroke={tone === 'pos' ? 'var(--pos, #adca7c)' : tone === 'amb' ? 'var(--amb, #e9c167)' : 'var(--g6, #6b7280)'}
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx={NOW_X} cy="30" r="3"
              fill={tone === 'pos' ? 'var(--pos, #adca7c)' : 'var(--g5, #9ca3af)'}
            />
          </svg>
          {#if rec.note}
            <p class="exp-note">{rec.note}</p>
          {/if}
          <div class="exp-actions">
            <button class="exp-open" onclick={() => { onOpenCapture?.(rec); expandedId = null; }}>
              Open full →
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .scan-grid {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--sc-bg-0, #0b0e14);
    font-family: var(--sc-font-mono, monospace);
    color: var(--sc-text-0, #f7f2ea);
  }

  /* Header */
  .header-bar {
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
  .sep {
    font-size: 9px;
    color: rgba(247,242,234,0.22);
  }
  .title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.85);
  }
  .count {
    font-size: 9px;
    color: rgba(247,242,234,0.45);
    letter-spacing: 0.06em;
  }
  .sort-label {
    margin-left: auto;
    font-size: 9px;
    color: rgba(247,242,234,0.32);
    letter-spacing: 0.08em;
  }

  /* Grid area */
  .grid-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 80px;
    font-size: 11px;
    color: rgba(247,242,234,0.38);
    text-align: center;
    padding: 16px;
  }

  .wide-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }

  @media (max-width: 900px) {
    .wide-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 600px) {
    .wide-grid { grid-template-columns: repeat(2, 1fr); }
  }

  /* Grid card */
  .grid-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 7px 8px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 3px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, border-color 0.1s, transform 0.1s;
  }
  .grid-card:hover {
    background: rgba(255,255,255,0.05);
    transform: translateY(-1px);
  }
  .grid-card[data-tone='pos'] { border-top: 2px solid var(--pos, #adca7c); }
  .grid-card[data-tone='amb'] { border-top: 2px solid var(--amb, #e9c167); }
  .grid-card[data-tone='neutral'] { border-top: 2px solid rgba(247,242,234,0.15); }

  .card-top {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .card-sym {
    font-size: 11px;
    font-weight: 700;
    color: rgba(247,242,234,0.95);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-tf {
    font-size: 8px;
    padding: 1px 4px;
    background: rgba(255,255,255,0.07);
    border-radius: 2px;
    color: rgba(247,242,234,0.5);
    flex-shrink: 0;
  }
  .card-alpha {
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
    color: rgba(247,242,234,0.5);
  }
  .card-alpha[data-tone='pos'] { color: var(--pos, #adca7c); }
  .card-alpha[data-tone='amb'] { color: var(--amb, #e9c167); }

  /* MiniChart */
  .mini-chart {
    width: 100%;
    height: 38px;
    display: block;
    border-radius: 2px;
    overflow: hidden;
  }

  /* Sim bar + age */
  .card-bot {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .sim-bar-wrap {
    flex: 1;
    height: 3px;
    background: rgba(255,255,255,0.07);
    border-radius: 2px;
    overflow: hidden;
  }
  .sim-bar {
    height: 100%;
    border-radius: 2px;
    background: rgba(247,242,234,0.25);
    transition: width 0.3s;
  }
  .sim-bar[data-tone='pos'] { background: var(--pos, #adca7c); opacity: 0.7; }
  .sim-bar[data-tone='amb'] { background: var(--amb, #e9c167); opacity: 0.7; }
  .sim-pct {
    font-size: 8px;
    color: rgba(247,242,234,0.45);
    flex-shrink: 0;
  }
  .card-age {
    font-size: 8px;
    color: rgba(247,242,234,0.32);
    flex-shrink: 0;
  }

  /* Strip area */
  .strip-area {
    flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,0.06);
    background: rgba(0,0,0,0.15);
  }

  .strip-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px 4px;
  }
  .strip-star {
    font-size: 9px;
    color: var(--amb, #e9c167);
  }
  .strip-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.6);
  }
  .strip-count {
    font-size: 9px;
    color: rgba(247,242,234,0.4);
  }
  .strip-stats {
    font-size: 9px;
    color: rgba(247,242,234,0.38);
  }
  .strip-hint {
    margin-left: auto;
    font-size: 9px;
    color: rgba(247,242,234,0.25);
  }

  .strip-scroll {
    display: flex;
    gap: 5px;
    padding: 0 10px 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .strip-scroll::-webkit-scrollbar { display: none; }

  .strip-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s, border-color 0.1s;
    font-family: inherit;
  }
  .strip-pill:hover,
  .strip-pill.expanded {
    background: rgba(255,255,255,0.09);
    border-color: rgba(255,255,255,0.18);
  }
  .strip-pill[data-tone='win'] { border-color: rgba(173,202,124,0.3); }
  .strip-pill[data-tone='loss'] { border-color: rgba(207,127,143,0.3); }

  .pill-sym {
    font-size: 9px;
    font-weight: 700;
    color: rgba(247,242,234,0.78);
  }
  .pill-pnl {
    font-size: 9px;
    color: rgba(247,242,234,0.5);
  }
  .pill-pnl[data-tone='win'] { color: var(--pos, #adca7c); }
  .pill-pnl[data-tone='loss'] { color: var(--neg, #cf7f8f); }

  /* Expanded sample */
  .expanded-sample {
    margin: 0 8px 8px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
  }
  .exp-top {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
  }
  .exp-sym {
    font-size: 11px;
    font-weight: 700;
    color: rgba(247,242,234,0.95);
  }
  .exp-tf {
    font-size: 8px;
    padding: 1px 5px;
    background: rgba(255,255,255,0.07);
    border-radius: 2px;
    color: rgba(247,242,234,0.5);
  }
  .exp-verdict {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: rgba(247,242,234,0.6);
  }
  .exp-verdict.v-bullish { color: var(--pos, #adca7c); }
  .exp-verdict.v-bearish { color: var(--neg, #cf7f8f); }
  .exp-pnl {
    font-size: 10px;
    font-weight: 700;
    color: rgba(247,242,234,0.6);
  }
  .exp-pnl[data-tone='win'] { color: var(--pos, #adca7c); }
  .exp-pnl[data-tone='loss'] { color: var(--neg, #cf7f8f); }
  .exp-close {
    margin-left: auto;
    background: transparent;
    border: none;
    color: rgba(247,242,234,0.4);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 4px;
    font-family: inherit;
  }
  .exp-close:hover { color: rgba(247,242,234,0.8); }

  .exp-chart {
    width: 100%;
    height: 50px;
    display: block;
    margin-bottom: 6px;
  }
  .exp-note {
    font-size: 10px;
    color: rgba(247,242,234,0.5);
    margin: 0 0 6px;
    font-style: italic;
  }
  .exp-actions { display: flex; gap: 6px; }
  .exp-open {
    font-family: inherit;
    font-size: 9px;
    padding: 3px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 2px;
    color: rgba(247,242,234,0.75);
    cursor: pointer;
    letter-spacing: 0.06em;
  }
  .exp-open:hover {
    background: rgba(255,255,255,0.1);
    color: rgba(247,242,234,0.95);
  }
</style>
