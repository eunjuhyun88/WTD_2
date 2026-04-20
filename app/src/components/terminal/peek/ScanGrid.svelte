<script lang="ts">
  /**
   * ScanGrid — SCAN tab content.
   * Wide grid layout: 5-col candidate cards + PastSamplesStrip at bottom.
   */
  import { setActivePair } from '$lib/stores/activePairStore';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface AlertRow {
    id: string;
    symbol: string;
    timeframe: string;
    blocks_triggered: string[];
    p_win: number | null;
    created_at: string;
  }

  interface CandidateItem {
    id: string;
    symbol: string;
    tf: string;
    pattern: string;
    phase: number;
    alpha: number;
    age: string;
    sim: number;
    dir: 'long' | 'short';
  }

  interface PastSample {
    sym: string;
    when: string;
    sim: number;
    pnl: number;
    bars: number;
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

  let expandedSample = $state<number | null>(null);
  let selectedId = $state<string | null>(null);

  // Static demo candidates (will be API-driven)
  const candidates: CandidateItem[] = [
    { id: 'c1', symbol: 'BTCUSDT',  tf: '4H',  pattern: 'OI +18% · accum',    phase: 4, alpha: 82, age: '09:14', sim: 0.95, dir: 'long' },
    { id: 'c2', symbol: 'ETHUSDT',  tf: '1M',  pattern: 'VWAP reclaim',       phase: 4, alpha: 68, age: '09:01', sim: 0.91, dir: 'long' },
    { id: 'c3', symbol: 'SOLUSDT',  tf: '15m', pattern: 'Higher lows 5/5',    phase: 4, alpha: 71, age: '08:52', sim: 0.87, dir: 'long' },
    { id: 'c4', symbol: 'ARBUSDT',  tf: '1M',  pattern: 'Funding flip',       phase: 3, alpha: 66, age: '08:44', sim: 0.83, dir: 'long' },
    { id: 'c5', symbol: 'LINKUSDT', tf: '1M',  pattern: 'BB squeeze',         phase: 3, alpha: 59, age: '07:33', sim: 0.79, dir: 'long' },
    { id: 'c6', symbol: 'INJUSDT',  tf: '4H',  pattern: '번지대 4h · CVD 양', phase: 4, alpha: 73, age: '07:48', sim: 0.76, dir: 'long' },
    { id: 'c7', symbol: 'FETUSDT',  tf: '1H',  pattern: 'Higher lows 6/6',    phase: 4, alpha: 70, age: '07:22', sim: 0.73, dir: 'long' },
    { id: 'c8', symbol: 'SEIUSDT',  tf: '1H',  pattern: 'OI + accum',         phase: 3, alpha: 64, age: '06:58', sim: 0.70, dir: 'long' },
    { id: 'c9', symbol: 'LDOUSDT',  tf: '1H',  pattern: 'CVD divergence',     phase: 4, alpha: 77, age: '08:12', sim: 0.68, dir: 'long' },
  ];

  const pastSamples: PastSample[] = [
    { sym: 'TRADOOR', when: '2024-11-12', sim: 94, pnl: +6.2, bars: 12 },
    { sym: 'PTB',     when: '2025-01-03', sim: 91, pnl: +2.1, bars: 9  },
    { sym: 'JUP',     when: '2025-02-18', sim: 88, pnl: -1.4, bars: 14 },
    { sym: 'ARB',     when: '2025-03-11', sim: 86, pnl: +4.7, bars: 8  },
    { sym: 'AVAX',    when: '2025-04-02', sim: 83, pnl: +1.8, bars: 11 },
    { sym: 'SUI',     when: '2025-05-19', sim: 80, pnl: +3.3, bars: 10 },
    { sym: 'ONDO',    when: '2025-06-24', sim: 78, pnl: -0.6, bars: 13 },
    { sym: 'WIF',     when: '2025-07-08', sim: 76, pnl: +2.9, bars: 9  },
  ];

  const wins = pastSamples.filter(s => s.pnl > 0).length;
  const losses = pastSamples.length - wins;
  const avgWin = pastSamples.filter(s => s.pnl > 0).reduce((a, s) => a + s.pnl, 0) / wins;

  // Chart path helper
  function miniPath(phase: number): string {
    const pts = [
      [0,14],[8,22],[16,30],[24,38],[32,32],[40,36],[48,40],[56,44],
      [64,52],[72,48],[80,44],[88,42],[96,40],[104,38],[112,36],[120,34],
      [128,30],[136,28],[144,26],[152,22],[160,18],[168,14],[176,10],[180,8],
    ];
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y + 8}`).join(' ');
  }

  function nowX(phase: number): number {
    return phase === 3 ? 72 : phase === 4 ? 128 : phase === 5 ? 170 : 40;
  }

  function alphaColor(a: number): string {
    return a >= 75 ? 'var(--pos)' : a >= 60 ? 'var(--amb)' : 'var(--g7)';
  }
</script>

<div class="scan">
  <!-- Header -->
  <div class="header">
    <span class="step">STEP 03 · SIMILAR NOW</span>
    <span class="hdiv"></span>
    <span class="count">{candidates.length} candidates</span>
    <span class="spacer"></span>
    <span class="meta">matching hypothesis · 300 sym · 14s</span>
    <span class="sort-label">SORT</span>
    <span class="sort-val">similarity ▾</span>
  </div>

  <!-- Candidate grid -->
  <div class="grid-wrap">
    <div class="grid">
      {#each candidates as c}
        {@const ac = alphaColor(c.alpha)}
        <button
          class="card"
          class:selected={selectedId === c.id}
          style:--ac={ac}
          onclick={() => {
            selectedId = c.id;
            setActivePair(c.symbol.replace(/USDT$/, '') + '/USDT');
          }}
        >
          <div class="card-top">
            <span class="card-sym">{c.symbol.replace('USDT', '')}</span>
            <span class="card-tf">{c.tf}</span>
            <span class="spacer"></span>
            <span class="card-alpha">α{c.alpha}</span>
          </div>

          <!-- Mini chart SVG -->
          <svg viewBox="0 0 180 68" preserveAspectRatio="none" class="mini-chart">
            <rect x={nowX(c.phase) - 8} y={0} width={16} height={68} fill={ac} opacity="0.08"/>
            <path d={`${miniPath(c.phase)} L180,68 L0,68 Z`} fill={ac} opacity="0.05"/>
            <path d={miniPath(c.phase)} fill="none" stroke="var(--g6)" stroke-width="1"/>
            <line x1={nowX(c.phase)} y1={0} x2={nowX(c.phase)} y2={68} stroke={ac} stroke-width="0.5" stroke-dasharray="2 2" opacity="0.7"/>
            <circle cx={nowX(c.phase)} cy="38" r="2.5" fill={ac}/>
          </svg>

          <!-- Similarity bar -->
          <div class="sim-row">
            <div class="sim-bar">
              <div class="sim-fill" style:width="{c.sim * 100}%" style:background={ac}></div>
            </div>
            <span class="sim-pct">{Math.round(c.sim * 100)}%</span>
          </div>

          <div class="card-age">{c.age}</div>
        </button>
      {/each}
    </div>
  </div>

  <!-- Past samples strip -->
  <div class="past-strip">
    <div class="past-header">
      <span class="past-title">★ PAST · 14 similar</span>
      <span class="past-div">│</span>
      <span class="past-wins">{wins}W</span>
      <span class="past-losses">{losses}L</span>
      <span class="past-avg">avg win +{avgWin.toFixed(1)}%</span>
      <span class="spacer"></span>
      <span class="past-hint">클릭 → 차트로 보기</span>
    </div>
    <div class="past-tiles">
      {#each pastSamples as s, i}
        {@const color = s.pnl >= 0 ? 'var(--pos)' : 'var(--neg)'}
        <button
          class="past-tile"
          class:expanded={expandedSample === i}
          style:--pc={color}
          onclick={() => expandedSample = expandedSample === i ? null : i}
        >
          <span class="pt-sym">{s.sym}</span>
          <span class="pt-pnl">{s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}%</span>
          <span class="pt-sim">{s.sim}%</span>
        </button>
      {/each}
    </div>

    {#if expandedSample !== null}
      {@const s = pastSamples[expandedSample]}
      {@const color = s.pnl >= 0 ? 'var(--pos)' : 'var(--neg)'}
      <div class="expanded-sample" style:border-color="{color}44">
        <div class="exp-top">
          <span class="exp-sym">{s.sym}</span>
          <span class="exp-when">{s.when}</span>
          <span class="exp-meta">sim {s.sim}%</span>
          <span class="exp-meta">{s.bars} bars</span>
          <span class="spacer"></span>
          <span class="exp-pnl" style:color={color}>{s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}%</span>
          <button class="exp-close" onclick={() => expandedSample = null}>×</button>
        </div>
        <div class="exp-chart">
          <svg viewBox="0 0 360 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">
            <path d="M0,70 L20,65 L40,58 L60,72 L80,60 L100,45 L120,40 L140,35 L160,30 L180,28 L200,25 L220,22 L240,20 L260,18 L280,15 L300,12 L320,10 L340,8 L360,6 L360,100 L0,100 Z"
              fill={color} opacity="0.06"/>
            <path d="M0,70 L20,65 L40,58 L60,72 L80,60 L100,45 L120,40 L140,35 L160,30 L180,28 L200,25 L220,22 L240,20 L260,18 L280,15 L300,12 L320,10 L340,8 L360,6"
              fill="none" stroke="var(--g6)" stroke-width="1.5"/>
            <line x1="100" y1="0" x2="100" y2="100" stroke={color} stroke-width="0.5" stroke-dasharray="3 2" opacity="0.5"/>
          </svg>
        </div>
        <div class="exp-note">
          이 케이스는 <code>real_dump 후 번지대 {Math.round(s.bars / 2)}h</code>,
          OI +{(Math.random() * 12 + 10).toFixed(1)}%, accum {s.bars} bars.
          Entry에서 {s.pnl > 0 ? '목표 도달' : 'STOP 히트'}.
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .scan {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
    background: var(--g1);
  }

  .header {
    padding: 7px 12px;
    border-bottom: 0.5px solid var(--g3);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--g0);
    flex-shrink: 0;
  }
  .step { font-size: 7px; color: #7aa2e0; letter-spacing: 0.22em; }
  .hdiv { width: 1px; height: 12px; background: var(--g3); }
  .count { font-size: 13px; color: var(--g9); font-weight: 600; }
  .spacer { flex: 1; }
  .meta { font-size: 9px; color: var(--g6); letter-spacing: 0.06em; }
  .sort-label { font-size: 9px; color: var(--g5); letter-spacing: 0.14em; }
  .sort-val {
    font-size: 10px;
    color: var(--g8);
    font-weight: 500;
    padding: 3px 8px;
    background: var(--g2);
    border-radius: 3px;
  }

  /* Grid */
  .grid-wrap {
    flex: 1;
    overflow: auto;
    padding: 10px 12px;
    min-height: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 7px;
  }
  .card {
    padding: 7px 8px 6px;
    border-radius: 4px;
    cursor: pointer;
    background: var(--g0);
    border: 0.5px solid var(--g3);
    transition: all 0.12s;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }
  .card:hover { background: var(--g2); border-color: var(--ac); }
  .card.selected { background: var(--g2); border-color: var(--ac); }

  .card-top {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .card-sym {
    font-size: 11px;
    color: var(--g9);
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-tf {
    font-size: 7.5px;
    color: var(--g6);
    padding: 1px 4px;
    background: var(--g2);
    border-radius: 2px;
  }
  .card-alpha {
    font-size: 10px;
    color: var(--ac);
    font-weight: 600;
  }

  .mini-chart {
    width: 100%;
    height: 44px;
    display: block;
  }

  .sim-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sim-bar {
    flex: 1;
    height: 2.5px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }
  .sim-fill { height: 100%; opacity: 0.85; border-radius: 2px; }
  .sim-pct {
    font-size: 8.5px;
    color: var(--g8);
    width: 24px;
    text-align: right;
  }
  .card-age { font-size: 8.5px; color: var(--g5); font-family: 'Geist', sans-serif; }

  /* Past strip */
  .past-strip {
    border-top: 0.5px solid var(--g3);
    background: var(--g0);
    padding: 9px 12px;
    flex-shrink: 0;
  }
  .past-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 7px;
    font-size: 8px;
    color: var(--amb);
    letter-spacing: 0.22em;
    font-weight: 500;
  }
  .past-div { color: var(--g4); }
  .past-wins { color: var(--pos); }
  .past-losses { color: var(--neg); }
  .past-avg { color: var(--g6); }
  .past-hint { color: var(--g5); letter-spacing: 0.04em; text-transform: none; font-family: 'Geist', sans-serif; }

  .past-tiles {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .past-tile {
    padding: 6px 9px;
    border-radius: 3px;
    cursor: pointer;
    min-width: 62px;
    flex-shrink: 0;
    background: var(--g1);
    border: 0.5px solid var(--g3);
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    transition: all 0.12s;
  }
  .past-tile.expanded { background: var(--g2); border-color: var(--pc); }
  .pt-sym { font-size: 10px; color: var(--g9); font-weight: 500; font-family: 'JetBrains Mono', monospace; }
  .pt-pnl { font-size: 9.5px; color: var(--pc); font-weight: 600; font-family: 'JetBrains Mono', monospace; margin-top: 1px; }
  .pt-sim { font-size: 8px; color: var(--g5); font-family: 'JetBrains Mono', monospace; }

  /* Expanded sample */
  .expanded-sample {
    margin-top: 9px;
    padding: 11px;
    background: var(--g1);
    border: 0.5px solid;
    border-radius: 4px;
  }
  .exp-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-family: 'JetBrains Mono', monospace;
  }
  .exp-sym { font-size: 11px; color: var(--g9); font-weight: 600; }
  .exp-when, .exp-meta { font-size: 9px; color: var(--g6); }
  .exp-pnl { font-size: 13px; font-weight: 600; }
  .exp-close { color: var(--g5); font-size: 14px; padding: 0 5px; background: none; border: none; cursor: pointer; }

  .exp-chart {
    height: 80px;
    background: var(--g0);
    border-radius: 2px;
    overflow: hidden;
  }
  .exp-note {
    margin-top: 8px;
    font-size: 10px;
    color: var(--g6);
    line-height: 1.6;
    font-family: 'Geist', sans-serif;
  }
  .exp-note code {
    color: var(--g9);
    font-family: 'JetBrains Mono', monospace;
  }
</style>
