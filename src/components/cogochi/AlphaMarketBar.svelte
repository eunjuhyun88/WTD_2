<script lang="ts">
  /**
   * AlphaMarketBar — 11-cell global market strip
   *
   * Alpha Flow HTML `.mkt-bar` 재구현, --sc-* 팔레트 (핑크/라임/베이지).
   * Header.svelte row 2 에 통합되어 모든 페이지에 표시된다.
   *
   * 셀 구성 (좌→우):
   *  1. F&G           (Fear & Greed index 0-100 + label)
   *  2. BTC 김프       (BTC 김치 프리미엄 %)
   *  3. USD/KRW       (환율)
   *  4. BTC Tx        (일일 온체인 트랜잭션 수)
   *  5. 멤풀 대기      (mempool.space pending tx)
   *  6. 수수료         (fastest fee sat/vB)
   *  7. Strong Bull   (scanned: alphaScore ≥ 55)
   *  8. Bull          (scanned: 25 ≤ score < 55)
   *  9. Neutral       (scanned: |score| ≤ 24)
   *  10. Bear         (scanned: -54 ≤ score ≤ -25)
   *  11. Strong Bear  (scanned: score ≤ -55)
   *  12. Extreme FR   (scanned: |FR| > 0.07%)
   */

  import type { AlphaBuckets } from '$lib/stores/alphaBuckets';

  interface ThermometerData {
    fearGreed: number | null;
    btcDominance: number | null;
    kimchiPremium: number | null;
    usdKrw: number | null;
    btcTx: number | null;
    mempoolPending: number | null;
    fastestFee: number | null;
  }

  let {
    thermo,
    buckets,
  }: {
    thermo: ThermometerData;
    buckets: AlphaBuckets | null;
  } = $props();

  // ─── Fear & Greed helpers ──────────────────────────────────
  let fgLabel = $derived.by(() => {
    const v = thermo.fearGreed;
    if (v == null) return '—';
    if (v <= 15) return '극단 공포';
    if (v <= 30) return '공포';
    if (v <= 45) return '다소 공포';
    if (v <= 55) return '중립';
    if (v <= 70) return '탐욕';
    if (v <= 85) return '과탐욕';
    return '극단 탐욕';
  });

  let fgColor = $derived.by(() => {
    const v = thermo.fearGreed;
    if (v == null) return 'var(--sc-text-3)';
    if (v <= 30) return 'var(--sc-good)';
    if (v >= 70) return 'var(--sc-bad)';
    return 'var(--sc-accent)';
  });

  // ─── Kimchi ───────────────────────────────────────────────
  let kimchiColor = $derived.by(() => {
    const v = thermo.kimchiPremium;
    if (v == null) return 'var(--sc-text-2)';
    if (v > 2) return 'var(--sc-bad)';
    if (v < -1) return 'var(--sc-good)';
    return 'var(--sc-text-0)';
  });

  let kimchiLabel = $derived.by(() => {
    const v = thermo.kimchiPremium;
    if (v == null) return '—';
    if (v > 3) return '과열';
    if (v < -2) return '역발상';
    return '보통';
  });

  // ─── BTC Tx ───────────────────────────────────────────────
  let btcTxColor = $derived.by(() => {
    const v = thermo.btcTx;
    if (v == null) return 'var(--sc-text-2)';
    if (v > 450000) return 'var(--sc-good)';
    if (v < 250000) return 'var(--sc-bad)';
    return 'var(--sc-text-0)';
  });

  let btcTxLabel = $derived.by(() => {
    const v = thermo.btcTx;
    if (v == null) return '네트워크';
    if (v > 450000) return '활발';
    if (v < 250000) return '침체';
    return '보통';
  });

  // ─── Mempool ──────────────────────────────────────────────
  let mempoolColor = $derived.by(() => {
    const v = thermo.mempoolPending;
    if (v == null) return 'var(--sc-text-2)';
    if (v > 80000) return 'var(--sc-bad)';
    if (v < 30000) return 'var(--sc-good)';
    return 'var(--sc-text-0)';
  });

  let mempoolLabel = $derived.by(() => {
    const v = thermo.mempoolPending;
    if (v == null) return '—';
    if (v > 80000) return '혼잡';
    if (v < 30000) return '여유';
    return '보통';
  });

  // ─── Fee ──────────────────────────────────────────────────
  let feeColor = $derived.by(() => {
    const v = thermo.fastestFee;
    if (v == null) return 'var(--sc-text-2)';
    if (v > 80) return 'var(--sc-bad)';
    if (v < 30) return 'var(--sc-good)';
    return 'var(--sc-warn)';
  });

  // ─── Formatters ───────────────────────────────────────────
  function fmtK(v: number | null): string {
    if (v == null) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(v);
  }

  function fmtKrw(v: number | null): string {
    if (v == null) return '—';
    return Math.round(v).toLocaleString('en-US');
  }

  function fmtKimchi(v: number | null): string {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  }

  function bucketNum(n: number | undefined): string {
    return n == null ? '—' : String(n);
  }
</script>

<div class="amb">
  <!-- 1. Fear & Greed -->
  <div class="cell">
    <div class="lbl">공포탐욕</div>
    <div class="val" style="color:{fgColor}">{thermo.fearGreed ?? '—'}</div>
    <div class="sub" style="color:{fgColor}">{fgLabel}</div>
  </div>

  <!-- 2. Kimchi Premium -->
  <div class="cell">
    <div class="lbl">BTC 김프</div>
    <div class="val" style="color:{kimchiColor}">{fmtKimchi(thermo.kimchiPremium)}</div>
    <div class="sub">{kimchiLabel}</div>
  </div>

  <!-- 3. USD/KRW -->
  <div class="cell">
    <div class="lbl">USD/KRW</div>
    <div class="val accent">{fmtKrw(thermo.usdKrw)}</div>
    <div class="sub">환율</div>
  </div>

  <!-- 4. BTC Tx -->
  <div class="cell">
    <div class="lbl">BTC Tx (24h)</div>
    <div class="val" style="color:{btcTxColor}">{fmtK(thermo.btcTx)}</div>
    <div class="sub">{btcTxLabel}</div>
  </div>

  <!-- 5. Mempool -->
  <div class="cell">
    <div class="lbl">멤풀 대기</div>
    <div class="val" style="color:{mempoolColor}">{fmtK(thermo.mempoolPending)}</div>
    <div class="sub">{mempoolLabel}</div>
  </div>

  <!-- 6. Fee -->
  <div class="cell">
    <div class="lbl">수수료</div>
    <div class="val" style="color:{feeColor}">{thermo.fastestFee ?? '—'}</div>
    <div class="sub">sat/vB</div>
  </div>

  <div class="divider"></div>

  <!-- 7. Strong Bull -->
  <div class="cell">
    <div class="lbl">Strong Bull</div>
    <div class="val good">{bucketNum(buckets?.strongBull)}</div>
    <div class="sub">≥ +55</div>
  </div>

  <!-- 8. Bull -->
  <div class="cell">
    <div class="lbl">Bull</div>
    <div class="val good dim">{bucketNum(buckets?.bull)}</div>
    <div class="sub">+25 ~ +54</div>
  </div>

  <!-- 9. Neutral -->
  <div class="cell">
    <div class="lbl">Neutral</div>
    <div class="val accent">{bucketNum(buckets?.neutral)}</div>
    <div class="sub">-24 ~ +24</div>
  </div>

  <!-- 10. Bear -->
  <div class="cell">
    <div class="lbl">Bear</div>
    <div class="val bad dim">{bucketNum(buckets?.bear)}</div>
    <div class="sub">-25 ~ -54</div>
  </div>

  <!-- 11. Strong Bear -->
  <div class="cell">
    <div class="lbl">Strong Bear</div>
    <div class="val bad">{bucketNum(buckets?.strongBear)}</div>
    <div class="sub">≤ -55</div>
  </div>

  <!-- 12. Extreme FR -->
  <div class="cell">
    <div class="lbl">⚡ Extreme FR</div>
    <div class="val warn">{bucketNum(buckets?.extremeFR)}</div>
    <div class="sub">|FR| &gt; 0.07%</div>
  </div>
</div>

<style>
  .amb {
    position: fixed;
    top: var(--sc-header-h, 44px);
    left: 0;
    right: 0;
    height: 52px;
    display: flex;
    align-items: stretch;
    background: var(--sc-bg-1);
    border-bottom: 1px solid var(--sc-line-soft);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    scrollbar-width: thin;
    scrollbar-color: var(--sc-line-soft) transparent;
    z-index: calc(var(--sc-z-header) - 1);
    backdrop-filter: blur(12px);
  }
  .amb::-webkit-scrollbar { height: 4px; }
  .amb::-webkit-scrollbar-thumb { background: var(--sc-line-soft); border-radius: 2px; }
  .amb::-webkit-scrollbar-track { background: transparent; }

  .cell {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    padding: 7px 14px;
    min-width: 96px;
    border-right: 1px solid var(--sc-line-soft);
    flex-shrink: 0;
  }
  .cell:last-child { border-right: none; }

  .lbl {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 16px;
    font-weight: 700;
    color: var(--sc-text-0);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.3px;
  }
  .val.good { color: var(--sc-good); text-shadow: 0 0 8px rgba(173, 202, 124, 0.3); }
  .val.bad { color: var(--sc-bad); text-shadow: 0 0 8px rgba(207, 127, 143, 0.3); }
  .val.accent { color: var(--sc-accent); }
  .val.warn { color: var(--sc-warn); text-shadow: 0 0 8px rgba(242, 209, 147, 0.3); }
  .val.dim { opacity: 0.72; }

  .sub {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8.5px;
    color: var(--sc-text-3);
    letter-spacing: 0.02em;
  }

  .divider {
    width: 1px;
    background: var(--sc-line);
    margin: 6px 4px;
  }

  @media (max-width: 1024px) {
    .cell {
      min-width: 82px;
      padding: 6px 10px;
    }
    .val { font-size: 14px; }
    .lbl, .sub { font-size: 8px; }
  }

  @media (max-width: 768px) {
    .amb {
      top: var(--sc-header-h-mobile, 40px);
      height: 46px;
    }
    .cell {
      min-width: 74px;
      padding: 5px 8px;
    }
    .val { font-size: 12px; }
    .lbl { font-size: 7.5px; }
    .sub { font-size: 7.5px; }
    .divider { display: none; }
  }

  @media (max-width: 480px) {
    .amb {
      top: var(--sc-touch-sm, 36px);
    }
  }
</style>
