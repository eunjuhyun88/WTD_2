<script lang="ts">
  // ═══════════════════════════════════════════════════════════
  // Cogochi Layer Panel — 15-layer signal visualization
  // ═══════════════════════════════════════════════════════════

  let { snapshot }: { snapshot: any } = $props();

  type LayerRow = { id: string; name: string; val: string; score: number; max: number };

  function toLayers(s: any): LayerRow[] {
    if (!s) return [];
    return [
      { id: 'L1',  name: 'Wyckoff',  val: s.l1.phase,            score: s.l1.score,  max: 30 },
      { id: 'L2',  name: 'Supply',   val: fmtFr(s.l2.fr),        score: s.l2.score,  max: 20 },
      { id: 'L3',  name: 'V-Surge',  val: s.l3.v_surge ? '⚡' : '—', score: s.l3.score, max: 15 },
      { id: 'L4',  name: 'OrdBook',  val: `${s.l4.bid_ask_ratio}`, score: s.l4.score, max: 10 },
      { id: 'L5',  name: 'Basis',    val: `${s.l5.basis_pct}%`,   score: s.l5.score,  max: 10 },
      { id: 'L6',  name: 'OnChain',  val: `${s.l6.exchange_netflow}`, score: s.l6.score, max: 8 },
      { id: 'L7',  name: 'F&G',      val: `${s.l7.fear_greed}`,   score: s.l7.score,  max: 10 },
      { id: 'L8',  name: 'Kimchi',   val: `${s.l8.kimchi}%`,      score: s.l8.score,  max: 5 },
      { id: 'L9',  name: 'Liq',      val: fmtUsd(s.l9.liq_1h),   score: s.l9.score,  max: 10 },
      { id: 'L10', name: 'MTF',      val: s.l10.mtf_confluence,   score: s.l10.score, max: 20 },
      { id: 'L11', name: 'CVD',      val: s.l11.cvd_state,        score: s.l11.score, max: 25 },
      { id: 'L12', name: 'Sector',   val: s.l12.sector_flow,      score: s.l12.score, max: 5 },
      { id: 'L13', name: 'Break',    val: s.l13.breakout ? '⬆' : '—', score: s.l13.score, max: 15 },
      { id: 'L14', name: 'BB',       val: s.l14.bb_squeeze ? 'SQZ' : `${s.l14.bb_width}`, score: s.l14.score, max: 5 },
      { id: 'L15', name: 'ATR',      val: `${s.l15.atr_pct}%`,    score: 0,           max: 0 },
    ];
  }

  function fmtFr(fr: number): string {
    return fr ? `FR ${(fr * 100).toFixed(3)}%` : 'N/A';
  }
  function fmtUsd(v: number): string {
    if (!v) return '—';
    return v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`;
  }
  function sc(v: number): string {
    if (v > 5) return 'bull';
    if (v > 0) return 'bull-d';
    if (v === 0) return 'flat';
    if (v > -5) return 'bear-d';
    return 'bear';
  }
  function barPct(v: number, max: number): number {
    if (max === 0) return 0;
    return Math.min(Math.abs(v) / max * 100, 100);
  }
</script>

{#if snapshot}
  {@const layers = toLayers(snapshot)}
  <div class="lp">
    <!-- Alpha Score header -->
    <div class="alpha-row">
      <span class="alpha-label">ALPHA</span>
      <span class="alpha-score {sc(snapshot.alphaScore)}">{snapshot.alphaScore}</span>
      <span class="alpha-tag {sc(snapshot.alphaScore)}">{snapshot.alphaLabel}</span>
      <span class="alpha-regime">{snapshot.regime}</span>
    </div>

    <!-- Layer rows -->
    {#each layers as l}
      <div class="lr" class:highlight={Math.abs(l.score) >= 15}>
        <span class="lr-id">{l.id}</span>
        <span class="lr-name">{l.name}</span>
        <span class="lr-val {sc(l.score)}">{l.val}</span>
        <div class="lr-bar-wrap">
          {#if l.score < 0}
            <div class="lr-bar-track">
              <div class="lr-bar bear" style="width:{barPct(l.score,l.max)}%;margin-left:{100-barPct(l.score,l.max)}%"></div>
            </div>
          {:else if l.score > 0}
            <div class="lr-bar-track">
              <div class="lr-bar bull" style="width:{barPct(l.score,l.max)}%"></div>
            </div>
          {:else}
            <div class="lr-bar-track"><div class="lr-bar flat" style="width:3%"></div></div>
          {/if}
        </div>
        <span class="lr-score {sc(l.score)}">{l.score !== 0 ? (l.score > 0 ? '+' : '') + l.score : '·'}</span>
      </div>
    {/each}
  </div>
{:else}
  <div class="loading">분석 대기 중...</div>
{/if}

<style>
  .lp { display: flex; flex-direction: column; }
  .alpha-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-bottom: 1px solid #181828;
  }
  .alpha-label { color: #4a5568; font-size: 10px; letter-spacing: 1px; }
  .alpha-score { font-size: 20px; font-weight: 800; }
  .alpha-tag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
  .alpha-tag.bull, .alpha-tag.bull-d { background: #22d3ee15; }
  .alpha-tag.bear, .alpha-tag.bear-d { background: #f43f5e15; }
  .alpha-tag.flat { background: #33415515; }
  .alpha-regime { color: #64748b; font-size: 10px; margin-left: auto; }

  .lr {
    display: grid; grid-template-columns: 28px 52px 1fr 90px 32px;
    gap: 4px; padding: 2px 10px; align-items: center;
    font-size: 11px; transition: background 0.1s;
  }
  .lr:hover { background: #0c0c16; }
  .lr.highlight { background: #0a0a14; }
  .lr-id { color: #334155; font-size: 10px; }
  .lr-name { color: #64748b; }
  .lr-val { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lr-bar-wrap { height: 100%; display: flex; align-items: center; }
  .lr-bar-track { width: 100%; height: 4px; background: #111820; border-radius: 2px; overflow: hidden; }
  .lr-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .lr-bar.bull { background: linear-gradient(90deg, #22d3ee80, #22d3ee); }
  .lr-bar.bear { background: linear-gradient(270deg, #f43f5e80, #f43f5e); }
  .lr-bar.flat { background: #334155; }
  .lr-score { text-align: right; font-weight: 600; font-size: 10px; }

  .bull { color: #22d3ee; }
  .bull-d { color: #0e7490; }
  .bear { color: #f43f5e; }
  .bear-d { color: #9f1239; }
  .flat { color: #334155; }

  .loading { padding: 20px; color: #334155; text-align: center; }
</style>
