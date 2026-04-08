<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let mounted = $state(false);
  let now = $state(new Date());
  let tickerOffset = $state(0);

  // Simulated live data (will be replaced with real API later)
  const coins = [
    { sym: 'BTC', price: 68342.1, chg: -2.19, alpha: 52 },
    { sym: 'ETH', price: 2083.4, chg: -3.66, alpha: 38 },
    { sym: 'SOL', price: 87.62, chg: +1.24, alpha: 61 },
    { sym: 'XRP', price: 1.37, chg: -0.82, alpha: 15 },
    { sym: 'DOGE', price: 0.0921, chg: +4.51, alpha: 44 },
    { sym: 'BNB', price: 581.3, chg: -1.05, alpha: 22 },
    { sym: 'ADA', price: 0.412, chg: +0.93, alpha: -8 },
    { sym: 'AVAX', price: 24.18, chg: -2.44, alpha: 31 },
  ];

  const layers = [
    { id: 'L1', name: 'WYCKOFF', desc: 'ACC/DIST structure detection' },
    { id: 'L2', name: 'FLOW', desc: 'FR + OI + L/S + Taker' },
    { id: 'L3', name: 'V-SURGE', desc: 'Volume spike detection' },
    { id: 'L4', name: 'ORDERBOOK', desc: 'Bid/Ask wall imbalance' },
    { id: 'L5', name: 'LIQUIDATION', desc: 'Cascade risk estimation' },
    { id: 'L6', name: 'ON-CHAIN', desc: 'Tx + Mempool + Whale' },
    { id: 'L7', name: 'FEAR/GREED', desc: 'Sentiment index' },
    { id: 'L8', name: 'KIMCHI', desc: 'KRW premium spread' },
    { id: 'L9', name: 'FORCE LIQ', desc: '1H real liquidations' },
    { id: 'L10', name: 'MTF', desc: 'Multi-TF confluence' },
    { id: 'L11', name: 'CVD', desc: 'Cumulative volume delta' },
    { id: 'L12', name: 'SECTOR', desc: 'Sector capital flow' },
    { id: 'L13', name: 'BREAKOUT', desc: '7D/30D range escape' },
    { id: 'L14', name: 'BB SQUEEZE', desc: 'Bollinger compression' },
    { id: 'L15', name: 'ATR VOL', desc: 'Volatility regime' },
  ];

  const apis = [
    'BINANCE FUTURES', 'BINANCE SPOT', 'UPBIT', 'BITHUMB',
    'ALTERNATIVE.ME', 'BLOCKCHAIN.INFO', 'MEMPOOL.SPACE',
    'COINGECKO', 'EXCHANGERATE'
  ];

  onMount(() => {
    requestAnimationFrame(() => { mounted = true; });
    const clockInterval = setInterval(() => { now = new Date(); }, 1000);
    const tickerInterval = setInterval(() => { tickerOffset -= 0.5; }, 30);
    return () => { clearInterval(clockInterval); clearInterval(tickerInterval); };
  });

  function formatTime(d: Date): string {
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  function formatPrice(p: number): string {
    return p >= 1 ? p.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                   : p.toFixed(4);
  }
</script>

<svelte:head><title>COGOTCHI — Signal Engine</title></svelte:head>

<div class="root" class:mounted>
  <!-- ═══ TICKER STRIP (글로벌 Header 바로 아래) ═══ -->
  <div class="ticker-strip">
    <div class="ticker-track" style="transform:translateX({tickerOffset}px)">
      {#each [...coins, ...coins, ...coins] as coin}
        <span class="ticker-item">
          <span class="ti-sym">{coin.sym}</span>
          <span class="ti-price">${formatPrice(coin.price)}</span>
          <span class="ti-chg" class:up={coin.chg >= 0} class:dn={coin.chg < 0}>
            {coin.chg >= 0 ? '+' : ''}{coin.chg.toFixed(2)}%
          </span>
          <span class="ti-alpha" class:bull={coin.alpha > 20} class:bear={coin.alpha < -20}>
            a:{coin.alpha > 0 ? '+' : ''}{coin.alpha}
          </span>
          <span class="ti-dot"></span>
        </span>
      {/each}
    </div>
  </div>

  <!-- ═══ HERO ═══ -->
  <main class="hero">
    <div class="hero-left">
      <div class="hero-badge">15-LAYER SIGNAL ENGINE</div>
      <h1 class="hero-title">
        <span class="ht-line">REAL DATA.</span>
        <span class="ht-line">REAL SIGNALS.</span>
        <span class="ht-line ht-accent">NO GUESSING.</span>
      </h1>
      <p class="hero-sub">
        15 layers of market analysis. 9 free data sources.
        Wyckoff, CVD, on-chain, orderbook, liquidations — all computed server-side from Binance raw data.
      </p>
      <div class="hero-cta">
        <button class="cta-primary" onclick={() => goto('/terminal')}>
          OPEN TERMINAL
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="cta-secondary" onclick={() => goto('/scanner')}>
          SCANNER
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="hero-right">
      <!-- Live Alpha Preview Panel -->
      <div class="alpha-panel">
        <div class="ap-header">
          <span class="ap-title">ALPHA PREVIEW</span>
          <span class="ap-live"><span class="live-dot sm"></span>LIVE</span>
        </div>
        <div class="ap-main">
          <span class="ap-sym">BTC</span>
          <span class="ap-tf">4H</span>
          <span class="ap-score bull">+52</span>
          <span class="ap-verdict bull">BULL</span>
        </div>
        <div class="ap-layers">
          <div class="apl" style="--w:71%;--c:var(--sc-good)"><span>L1 WYCKOFF</span><span>MARKUP +20</span></div>
          <div class="apl" style="--w:71%;--c:var(--sc-good)"><span>L10 MTF</span><span>ALIGNED +20</span></div>
          <div class="apl" style="--w:53%;--c:var(--sc-good)"><span>L11 CVD</span><span>BULLISH +15</span></div>
          <div class="apl" style="--w:14%;--c:var(--sc-bad)"><span>L2 FLOW</span><span>FR HOT -4</span></div>
        </div>
        <div class="ap-footer">
          <span>FR: 0.0084%</span>
          <span>OI: 89K</span>
          <span>L/S: 1.51</span>
          <span>F&G: 11</span>
        </div>
      </div>
    </div>
  </main>

  <!-- ═══ STATS BAR ═══ -->
  <div class="stats-bar">
    <div class="stat-item">
      <span class="si-val">15</span>
      <span class="si-label">ANALYSIS LAYERS</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <span class="si-val">9</span>
      <span class="si-label">DATA SOURCES</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <span class="si-val">200+</span>
      <span class="si-label">SUPPORTED COINS</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <span class="si-val">RT</span>
      <span class="si-label">REAL-TIME</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <span class="si-val">$0</span>
      <span class="si-label">ALL FREE APIs</span>
    </div>
  </div>

  <!-- ═══ FEATURES ═══ -->
  <section class="features">
    <div class="feat-card" onclick={() => goto('/terminal')}>
      <div class="fc-icon">T</div>
      <div class="fc-body">
        <h3 class="fc-title">TERMINAL</h3>
        <p class="fc-desc">Single-coin deep analysis. 15-layer signal engine with real-time chart, S/R levels, BB bands, CVD overlay, and AI commentary.</p>
      </div>
      <div class="fc-arrow">→</div>
    </div>
    <div class="feat-card" onclick={() => goto('/scanner')}>
      <div class="fc-icon">S</div>
      <div class="fc-body">
        <h3 class="fc-title">SCANNER</h3>
        <p class="fc-desc">Multi-coin market scan. Top 100 by volume + movers + breakout candidates. 8 filters, presets, watchlists.</p>
      </div>
      <div class="fc-arrow">→</div>
    </div>
    <div class="feat-card" onclick={() => goto('/cogochi')}>
      <div class="fc-icon">L</div>
      <div class="fc-body">
        <h3 class="fc-title">LAB</h3>
        <p class="fc-desc">AI agent training ground. Teach doctrine, backtest on historical data, prove edge before real capital.</p>
      </div>
      <div class="fc-arrow">→</div>
    </div>
  </section>

  <!-- ═══ LAYER MAP ═══ -->
  <section class="layer-section">
    <h2 class="section-title">15-LAYER SIGNAL ENGINE</h2>
    <div class="layer-grid">
      {#each layers as layer, i}
        <div class="layer-cell" style="animation-delay:{i * 40}ms">
          <span class="lc-id">{layer.id}</span>
          <span class="lc-name">{layer.name}</span>
          <span class="lc-desc">{layer.desc}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ═══ DATA SOURCES ═══ -->
  <section class="api-section">
    <h2 class="section-title">9 DATA SOURCES — ALL FREE</h2>
    <div class="api-grid">
      {#each apis as api, i}
        <span class="api-tag" style="animation-delay:{i * 60}ms">{api}</span>
      {/each}
    </div>
  </section>

  <!-- ═══ FOOTER ═══ -->
  <footer class="foot">
    <span class="foot-left">COGOTCHI SIGNAL ENGINE</span>
    <span class="foot-right">DATA: BINANCE · NO API KEY · {now.getFullYear()}</span>
  </footer>
</div>

<style>
  /* ═══ RESET & ROOT ═══ */
  .root {
    min-height: 100vh;
    background: var(--sc-bg-0, #050914);
    color: var(--sc-text-0, #f7f2ea);
    font-family: 'Space Grotesk', sans-serif;
    overflow-x: hidden;
    opacity: 0;
    transition: opacity 0.6s ease;
  }
  .root.mounted { opacity: 1; }

  .live-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--sc-good); box-shadow: 0 0 8px var(--sc-good);
    animation: pulse-dot 2s ease-in-out infinite;
  }
  .live-dot.sm { width: 5px; height: 5px; }
  @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }

  /* ═══ TICKER STRIP ═══ */
  .ticker-strip {
    height: 32px;
    overflow: hidden;
    border-bottom: 1px solid rgba(219,154,159,0.06);
    background: rgba(11,18,32,0.6);
  }
  .ticker-track {
    display: flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    will-change: transform;
  }
  .ticker-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
  }
  .ti-sym { color: var(--sc-text-0); font-weight: 700; letter-spacing: 0.5px; }
  .ti-price { color: rgba(247,242,234,0.6); }
  .ti-chg { font-weight: 700; }
  .ti-chg.up { color: var(--sc-good); }
  .ti-chg.dn { color: var(--sc-bad); }
  .ti-alpha { color: rgba(247,242,234,0.3); font-size: 9px; }
  .ti-alpha.bull { color: rgba(173,202,124,0.6); }
  .ti-alpha.bear { color: rgba(207,127,143,0.6); }
  .ti-dot {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: rgba(247,242,234,0.1);
  }

  /* ═══ HERO ═══ */
  .hero {
    display: flex;
    align-items: center;
    gap: 48px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 64px 32px 48px;
  }
  .hero-left { flex: 1; min-width: 0; }
  .hero-right { flex: 0 0 380px; }

  .hero-badge {
    display: inline-block;
    padding: 4px 12px;
    border: 1px solid rgba(219,154,159,0.3);
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: var(--sc-accent, #db9a9f);
    margin-bottom: 24px;
    background: rgba(219,154,159,0.05);
  }

  .hero-title {
    margin: 0;
    line-height: 1;
  }
  .ht-line {
    display: block;
    font-family: 'Bebas Neue', sans-serif;
    font-size: clamp(48px, 7vw, 80px);
    letter-spacing: 4px;
    color: var(--sc-text-0);
  }
  .ht-accent {
    color: var(--sc-accent, #db9a9f);
    text-shadow: 0 0 40px rgba(219,154,159,0.25);
  }

  .hero-sub {
    margin: 20px 0 32px;
    font-size: 14px;
    line-height: 1.7;
    color: rgba(247,242,234,0.45);
    max-width: 480px;
  }

  .hero-cta { display: flex; gap: 12px; }
  .cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 28px;
    border: 1px solid var(--sc-accent, #db9a9f);
    background: rgba(219,154,159,0.1);
    color: var(--sc-accent, #db9a9f);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 2px;
  }
  .cta-primary:hover {
    background: rgba(219,154,159,0.2);
    box-shadow: 0 0 24px rgba(219,154,159,0.25);
    transform: translateY(-2px);
  }
  .cta-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border: 1px solid rgba(247,242,234,0.1);
    background: transparent;
    color: rgba(247,242,234,0.5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 2px;
  }
  .cta-secondary:hover {
    border-color: rgba(247,242,234,0.25);
    color: var(--sc-text-0);
  }

  /* ═══ ALPHA PANEL (hero right) ═══ */
  .alpha-panel {
    border: 1px solid rgba(219,154,159,0.12);
    background: var(--sc-bg-1);
    border-radius: 3px;
    overflow: hidden;
  }
  .ap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(219,154,159,0.08);
    background: rgba(11,18,32,0.5);
  }
  .ap-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(247,242,234,0.4);
  }
  .ap-live {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 1px;
    color: var(--sc-good);
  }
  .ap-main {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 16px 14px 12px;
  }
  .ap-sym {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px;
    letter-spacing: 2px;
    color: var(--sc-text-0);
  }
  .ap-tf {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: rgba(247,242,234,0.35);
    padding: 2px 6px;
    border: 1px solid rgba(247,242,234,0.08);
    border-radius: 2px;
  }
  .ap-score {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 36px;
    letter-spacing: 1px;
    margin-left: auto;
  }
  .ap-score.bull { color: var(--sc-good); text-shadow: 0 0 20px rgba(173,202,124,0.3); }
  .ap-score.bear { color: var(--sc-bad); }
  .ap-verdict {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
  }
  .ap-verdict.bull { color: var(--sc-good); }
  .ap-verdict.bear { color: var(--sc-bad); }

  .ap-layers { padding: 0 14px 12px; display: flex; flex-direction: column; gap: 4px; }
  .apl {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: rgba(247,242,234,0.6);
    border-left: 2px solid var(--c);
    background: linear-gradient(90deg, rgba(173,202,124,0.04) 0%, transparent var(--w));
  }

  .ap-footer {
    display: flex;
    gap: 0;
    border-top: 1px solid rgba(219,154,159,0.08);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: rgba(247,242,234,0.35);
  }
  .ap-footer span {
    flex: 1;
    padding: 8px 10px;
    text-align: center;
    border-right: 1px solid rgba(219,154,159,0.06);
  }
  .ap-footer span:last-child { border-right: none; }

  /* ═══ STATS BAR ═══ */
  .stats-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0 32px;
    height: 56px;
    border-top: 1px solid rgba(219,154,159,0.06);
    border-bottom: 1px solid rgba(219,154,159,0.06);
    background: rgba(11,18,32,0.4);
  }
  .stat-item { display: flex; align-items: baseline; gap: 8px; padding: 0 32px; }
  .si-val {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 26px;
    letter-spacing: 1px;
    color: var(--sc-text-0);
  }
  .si-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 2px;
    color: rgba(247,242,234,0.3);
  }
  .stat-sep {
    width: 1px;
    height: 24px;
    background: rgba(219,154,159,0.1);
  }

  /* ═══ FEATURES ═══ */
  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    max-width: 1200px;
    margin: 48px auto;
    padding: 0 32px;
  }
  .feat-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px 20px;
    border: 1px solid rgba(219,154,159,0.08);
    background: var(--sc-bg-1);
    cursor: pointer;
    transition: all 0.2s;
  }
  .feat-card:hover {
    border-color: rgba(219,154,159,0.2);
    background: rgba(11,18,32,0.8);
  }
  .fc-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(219,154,159,0.25);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px;
    color: var(--sc-accent, #db9a9f);
    flex-shrink: 0;
  }
  .fc-body { flex: 1; min-width: 0; }
  .fc-title {
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--sc-text-0);
  }
  .fc-desc {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 1.5;
    color: rgba(247,242,234,0.35);
  }
  .fc-arrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    color: rgba(247,242,234,0.15);
    transition: all 0.2s;
  }
  .feat-card:hover .fc-arrow { color: var(--sc-accent); transform: translateX(4px); }

  /* ═══ LAYER GRID ═══ */
  .layer-section, .api-section {
    max-width: 1200px;
    margin: 0 auto;
    padding: 48px 32px;
  }
  .section-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba(247,242,234,0.3);
    margin: 0 0 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(219,154,159,0.08);
  }
  .layer-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1px;
  }
  .layer-cell {
    padding: 12px 14px;
    border: 1px solid rgba(219,154,159,0.06);
    background: var(--sc-bg-1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: all 0.15s;
    animation: cell-in 0.4s ease backwards;
  }
  .layer-cell:hover {
    border-color: rgba(219,154,159,0.15);
    background: rgba(219,154,159,0.03);
  }
  @keyframes cell-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .lc-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    color: var(--sc-accent, #db9a9f);
    letter-spacing: 1px;
  }
  .lc-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--sc-text-0);
    letter-spacing: 0.5px;
  }
  .lc-desc {
    font-size: 9px;
    color: rgba(247,242,234,0.3);
    line-height: 1.4;
  }

  /* ═══ API TAGS ═══ */
  .api-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .api-tag {
    padding: 6px 14px;
    border: 1px solid rgba(219,154,159,0.1);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 1.5px;
    color: rgba(247,242,234,0.4);
    animation: cell-in 0.4s ease backwards;
    transition: all 0.15s;
  }
  .api-tag:hover {
    border-color: rgba(219,154,159,0.2);
    color: var(--sc-accent);
  }

  /* ═══ FOOTER ═══ */
  .foot {
    display: flex;
    justify-content: space-between;
    padding: 16px 32px;
    border-top: 1px solid rgba(219,154,159,0.06);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 2px;
    color: rgba(247,242,234,0.2);
  }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 900px) {
    .hero { flex-direction: column; padding: 40px 20px; gap: 32px; }
    .hero-right { flex: none; width: 100%; }
    .features { grid-template-columns: 1fr; }
    .layer-grid { grid-template-columns: repeat(3, 1fr); }
    .stats-bar { flex-wrap: wrap; height: auto; padding: 12px; }
    .stat-sep { display: none; }
    .tb-nav { display: none; }
  }
  @media (max-width: 600px) {
    .layer-grid { grid-template-columns: repeat(2, 1fr); }
    .ht-line { font-size: 40px; }
  }
</style>
