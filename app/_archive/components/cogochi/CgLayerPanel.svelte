<script lang="ts">
  let { snapshot }: { snapshot: any } = $props();

  type LayerRow = { id: string; name: string; val: string; score: number; max: number };

  function toLayers(s: any): LayerRow[] {
    if (!s) return [];
    return [
      { id: 'L01', name: 'Wyckoff',  val: s.l1.phase,                          score: s.l1.score,  max: 28 },
      { id: 'L02', name: 'Flow',     val: fmtFr(s.l2.fr),                      score: s.l2.score,  max: 55 },
      { id: 'L03', name: 'V-Surge',  val: s.l3.label ?? (s.l3.v_surge ? '⚡' : '—'), score: s.l3.score, max: 15 },
      { id: 'L04', name: 'OrdBook',  val: s.l4.label ?? `${s.l4.bid_ask_ratio}`, score: s.l4.score, max: 12 },
      { id: 'L05', name: 'LiqEst',   val: s.l5.label ?? `${s.l5.basis_pct}%`,  score: s.l5.score,  max: 12 },
      { id: 'L06', name: 'OnChain',  val: s.l6.detail ?? `${s.l6.n_tx ?? 0}tx`, score: s.l6.score, max: 10 },
      { id: 'L07', name: 'F&G',      val: s.l7.label ?? `${s.l7.fear_greed}`,  score: s.l7.score,  max: 8 },
      { id: 'L08', name: 'Kimchi',   val: s.l8.label ?? `${s.l8.kimchi}%`,     score: s.l8.score,  max: 10 },
      { id: 'L09', name: 'RealLiq',  val: s.l9.label ?? fmtUsd((s.l9.liq_long_usd ?? 0) + (s.l9.liq_short_usd ?? 0)), score: s.l9.score, max: 12 },
      { id: 'L10', name: 'MTF',      val: s.l10.label ?? s.l10.mtf_confluence, score: s.l10.score, max: 20 },
      { id: 'L11', name: 'CVD',      val: s.l11.cvd_state,                     score: s.l11.score, max: 12 },
      { id: 'L12', name: 'Sector',   val: s.l12.sector_flow,                   score: s.l12.score, max: 10 },
      { id: 'L13', name: 'Break',    val: s.l13.label ?? (s.l13.breakout ? '▲' : '—'), score: s.l13.score, max: 12 },
      { id: 'L14', name: 'BB',       val: s.l14.label ?? (s.l14.bb_squeeze ? 'SQZ' : `w${s.l14.bb_width}`), score: s.l14.score, max: 10 },
      { id: 'L15', name: 'ATR',      val: `${s.l15.atr_pct}%`,                score: s.l15.score ?? 0, max: 6 },
      ...(s.l18 ? [{ id: 'L18', name: '5mMom',  val: s.l18.label ?? `${s.l18.momentum_30m}%`, score: s.l18.score, max: 25 }] : []),
      ...(s.l19 ? [{ id: 'L19', name: 'OIAcc',  val: s.l19.label ?? s.l19.signal,             score: s.l19.score, max: 15 }] : []),
    ];
  }

  function fmtFr(fr: number): string { return fr ? `${(fr * 100).toFixed(3)}%` : '—'; }
  function fmtUsd(v: number): string { return !v ? '—' : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`; }
  function barPct(v: number, max: number): number { return max === 0 ? 0 : Math.min(Math.abs(v) / max * 100, 100); }

  function alphaClass(s: number): string {
    if (s >= 60) return 'strong-bull';
    if (s >= 20) return 'bull';
    if (s > -20) return 'neutral';
    if (s > -60) return 'bear';
    return 'strong-bear';
  }
</script>

{#if snapshot}
  {@const layers = toLayers(snapshot)}
  <div class="lp">
    <!-- ━━━ Alpha Header ━━━ -->
    <div class="alpha">
      <div class="alpha-top">
        <span class="alpha-label">ALPHA SCORE</span>
        <span class="alpha-regime">{snapshot.regime}</span>
      </div>
      <div class="alpha-bottom">
        <span class="alpha-val {alphaClass(snapshot.alphaScore)}">{snapshot.alphaScore}</span>
        <span class="alpha-tag {alphaClass(snapshot.alphaScore)}">{snapshot.alphaLabel}</span>
      </div>
    </div>

    <!-- ━━━ Layer Grid ━━━ -->
    <div class="layer-grid">
      {#each layers as l}
        <div class="lr" class:hot={Math.abs(l.score) >= 15}>
          <span class="lr-id">{l.id}</span>
          <span class="lr-name">{l.name}</span>

          <!-- Centered divergence bar -->
          <div class="lr-bar-wrap">
            <div class="lr-bar-track">
              <div class="lr-center"></div>
              {#if l.score !== 0}
                <div
                  class="lr-bar"
                  class:bear={l.score < 0}
                  class:bull={l.score > 0}
                  style="width:{barPct(l.score, l.max) / 2}%;{l.score < 0 ? `right:50%` : `left:50%`}"
                ></div>
              {/if}
            </div>
          </div>

          <span class="lr-val" class:c-bull={l.score > 0} class:c-bear={l.score < 0}>{l.val}</span>
          <span class="lr-score" class:c-bull={l.score > 0} class:c-bear={l.score < 0}>{l.score !== 0 ? (l.score > 0 ? '+' : '') + l.score : '·'}</span>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="empty">
    <div class="empty-icon">◈</div>
    <div class="empty-text">AWAITING SIGNAL</div>
    <div class="empty-hint">Enter symbol + timeframe</div>
  </div>
{/if}

<style>
  .lp {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  /* ━━━ Alpha ━━━ */
  .alpha {
    padding: 10px 12px;
    border-bottom: 1px solid var(--sc-line-soft);
  }

  .alpha-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .alpha-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1.5px;
    color: var(--sc-text-3);
  }

  .alpha-regime {
    font-size: 9px;
    font-weight: 500;
    color: var(--sc-text-2);
    letter-spacing: 0.5px;
  }

  .alpha-bottom {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .alpha-val {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .alpha-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .strong-bull, .bull { color: var(--sc-good); }
  .strong-bear, .bear { color: var(--sc-bad); }
  .neutral { color: var(--sc-text-2); }

  .alpha-tag.strong-bull, .alpha-tag.bull { background: rgba(173, 202, 124, 0.1); }
  .alpha-tag.strong-bear, .alpha-tag.bear { background: rgba(207, 127, 143, 0.1); }
  .alpha-tag.neutral { background: rgba(247, 242, 234, 0.06); }

  /* ━━━ Layer Grid ━━━ */
  .layer-grid {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .lr {
    display: grid;
    grid-template-columns: 28px 50px 1fr auto 30px;
    gap: 4px;
    padding: 3px 12px;
    align-items: center;
    font-size: 10px;
    transition: background 0.1s;
    border-left: 2px solid transparent;
  }

  .lr:hover {
    background: rgba(255, 255, 255, 0.015);
  }

  .lr.hot {
    background: rgba(173, 202, 124, 0.03);
    border-left-color: var(--sc-good);
  }

  .lr-id {
    color: var(--sc-text-3);
    font-size: 9px;
    font-weight: 600;
  }

  .lr-name {
    color: var(--sc-text-2);
    font-size: 10px;
    font-weight: 500;
  }

  /* Centered bar */
  .lr-bar-wrap {
    height: 100%;
    display: flex;
    align-items: center;
    min-width: 60px;
  }

  .lr-bar-track {
    position: relative;
    width: 100%;
    height: 3px;
    background: var(--sc-bg-2);
    border-radius: 1px;
    overflow: hidden;
  }

  .lr-center {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--sc-line-soft);
  }

  .lr-bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 1px;
    transition: width 0.3s ease;
  }

  .lr-bar.bull {
    background: var(--sc-good);
    opacity: 0.7;
  }

  .lr-bar.bear {
    background: var(--sc-bad);
    opacity: 0.7;
  }

  .lr-val {
    font-size: 9px;
    font-weight: 500;
    color: var(--sc-text-2);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70px;
  }

  .lr-score {
    font-size: 9px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--sc-text-2);
  }

  .c-bull { color: var(--sc-good) !important; }
  .c-bear { color: var(--sc-bad) !important; }

  /* ━━━ Empty ━━━ */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    opacity: 0.4;
    font-family: var(--font-mono, monospace);
  }

  .empty-icon {
    font-size: 24px;
    color: var(--sc-good);
    opacity: 0.5;
  }

  .empty-text {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--sc-text-2);
  }

  .empty-hint {
    font-size: 9px;
    color: var(--sc-text-3);
  }

  .layer-grid::-webkit-scrollbar { width: 3px; }
  .layer-grid::-webkit-scrollbar-thumb { background: var(--sc-line-soft); border-radius: 2px; }
</style>
