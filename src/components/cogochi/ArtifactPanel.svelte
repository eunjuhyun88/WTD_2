<script lang="ts">
  // ─── Props ───────────────────────────────────────────────
  let {
    symbol = 'BTCUSDT',
    timeframe = '4H',
    alphaScore = 0,
    regime = 'RANGE',
  }: {
    symbol?: string;
    timeframe?: string;
    alphaScore?: number;
    regime?: string;
  } = $props();

  // ─── Tabs ────────────────────────────────────────────────
  type ArtifactTab = 'chart' | 'layers' | 'position';
  let activeTab = $state<ArtifactTab>('chart');

  // ─── Mock Layer Data ─────────────────────────────────────
  const layers = [
    { id: 'L1',  name: '와이코프', value: 'DISTRIBUTION', score: -20 },
    { id: 'L2',  name: '수급',     value: 'FR 0.12%',     score: -15 },
    { id: 'L3',  name: 'V-Surge',  value: '없음',         score: 0 },
    { id: 'L4',  name: '호가창',   value: 'Bid/Ask 0.6',  score: -5 },
    { id: 'L5',  name: '청산존',   value: 'Basis 0.08%',  score: -3 },
    { id: 'L6',  name: '온체인',   value: 'Outflow -1.2K', score: -5 },
    { id: 'L7',  name: '공포/탐욕', value: '28 Fear',      score: -8 },
    { id: 'L8',  name: '김치P',    value: '+1.2%',        score: 0 },
    { id: 'L9',  name: '강제청산',  value: '$4.2M',        score: -5 },
    { id: 'L10', name: 'MTF',      value: 'BEAR_ALIGNED',  score: -20 },
    { id: 'L11', name: 'CVD',      value: 'BEARISH_DIV',   score: -25 },
    { id: 'L12', name: '섹터',     value: 'NEUTRAL',       score: 0 },
    { id: 'L13', name: '돌파',     value: '없음',          score: 0 },
    { id: 'L14', name: 'BB스퀴즈',  value: 'width 0.012',  score: -5 },
    { id: 'L15', name: 'ATR',      value: '3.2%',         score: 0 },
  ];

  function scoreColor(score: number): string {
    if (score <= -15) return '#ef4444';
    if (score < 0) return '#f97316';
    if (score === 0) return '#6b7280';
    if (score < 15) return '#22c55e';
    return '#10b981';
  }

  function alphaColor(score: number): string {
    if (score >= 60) return '#10b981';
    if (score >= 20) return '#22c55e';
    if (score <= -60) return '#ef4444';
    if (score <= -20) return '#f97316';
    return '#6b7280';
  }

  function alphaLabel(score: number): string {
    if (score >= 60) return 'STRONG BULL';
    if (score >= 20) return 'BULL';
    if (score <= -60) return 'STRONG BEAR';
    if (score <= -20) return 'BEAR';
    return 'NEUTRAL';
  }
</script>

<div class="artifact-panel">
  <!-- Header -->
  <div class="artifact-header">
    <div class="symbol-info">
      <span class="symbol">{symbol}</span>
      <span class="timeframe">{timeframe}</span>
      <span class="regime-badge" style="color: {alphaColor(alphaScore)}">{regime}</span>
    </div>
    <div class="alpha-score" style="color: {alphaColor(alphaScore)}">
      <span class="alpha-label">{alphaLabel(alphaScore)}</span>
      <span class="alpha-value">{alphaScore}</span>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab" class:active={activeTab === 'chart'} onclick={() => activeTab = 'chart'}>
      📈 차트
    </button>
    <button class="tab" class:active={activeTab === 'layers'} onclick={() => activeTab = 'layers'}>
      🔬 15레이어
    </button>
    <button class="tab" class:active={activeTab === 'position'} onclick={() => activeTab = 'position'}>
      📊 포지션
    </button>
  </div>

  <!-- Content -->
  <div class="artifact-content">
    {#if activeTab === 'chart'}
      <div class="chart-placeholder">
        <div class="chart-mock">
          <!-- Mock candlestick chart -->
          <svg viewBox="0 0 400 200" class="chart-svg">
            <!-- Grid -->
            {#each [40, 80, 120, 160] as y}
              <line x1="0" y1={y} x2="400" y2={y} stroke="#1a1a2e" stroke-width="0.5" />
            {/each}

            <!-- Mock candles -->
            {#each [
              { x: 20, o: 100, c: 85, h: 80, l: 105, bull: true },
              { x: 40, o: 85, c: 90, h: 82, l: 95, bull: false },
              { x: 60, o: 90, c: 80, h: 75, l: 95, bull: true },
              { x: 80, o: 80, c: 95, h: 75, l: 100, bull: false },
              { x: 100, o: 95, c: 88, h: 82, l: 100, bull: true },
              { x: 120, o: 88, c: 92, h: 82, l: 96, bull: false },
              { x: 140, o: 92, c: 85, h: 80, l: 96, bull: true },
              { x: 160, o: 85, c: 98, h: 80, l: 102, bull: false },
              { x: 180, o: 98, c: 105, h: 95, l: 108, bull: false },
              { x: 200, o: 105, c: 95, h: 90, l: 110, bull: true },
              { x: 220, o: 95, c: 100, h: 90, l: 105, bull: false },
              { x: 240, o: 100, c: 108, h: 95, l: 112, bull: false },
              { x: 260, o: 108, c: 115, h: 105, l: 120, bull: false },
              { x: 280, o: 115, c: 105, h: 100, l: 120, bull: true },
              { x: 300, o: 105, c: 112, h: 100, l: 115, bull: false },
              { x: 320, o: 112, c: 120, h: 108, l: 125, bull: false },
              { x: 340, o: 120, c: 130, h: 118, l: 135, bull: false },
              { x: 360, o: 130, c: 125, h: 120, l: 135, bull: true },
              { x: 380, o: 125, c: 135, h: 122, l: 140, bull: false },
            ] as candle}
              <!-- Wick -->
              <line
                x1={candle.x} y1={candle.h} x2={candle.x} y2={candle.l}
                stroke={candle.bull ? '#22c55e' : '#ef4444'} stroke-width="1"
              />
              <!-- Body -->
              <rect
                x={candle.x - 5}
                y={Math.min(candle.o, candle.c)}
                width="10"
                height={Math.max(Math.abs(candle.c - candle.o), 2)}
                fill={candle.bull ? '#22c55e' : '#ef4444'}
                rx="1"
              />
            {/each}

            <!-- Alert line -->
            <line x1="340" y1="0" x2="340" y2="200" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 2" opacity="0.6" />
            <text x="342" y="15" fill="#ef4444" font-size="8">Alert</text>
          </svg>
          <div class="chart-label">TradingView Lightweight Charts (Week 3~4 연동)</div>
        </div>
      </div>

    {:else if activeTab === 'layers'}
      <div class="layers-grid">
        {#each layers as layer}
          <div class="layer-row">
            <span class="layer-id">{layer.id}</span>
            <span class="layer-name">{layer.name}</span>
            <span class="layer-value">{layer.value}</span>
            <div class="layer-bar-container">
              <div
                class="layer-bar"
                style="width: {Math.abs(layer.score) * 2}%; background: {scoreColor(layer.score)}; {layer.score < 0 ? 'margin-left: auto;' : ''}"
              ></div>
            </div>
            <span class="layer-score" style="color: {scoreColor(layer.score)}">
              {layer.score > 0 ? '+' : ''}{layer.score}
            </span>
          </div>
        {/each}
      </div>

    {:else}
      <div class="position-placeholder">
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>아직 포지션이 없어.</p>
          <p class="empty-sub">분석 후 방향을 정하면 여기에 표시돼.</p>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .artifact-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #08080d;
  }

  /* Header */
  .artifact-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid #1a1a2e;
    background: #0a0a12;
  }
  .symbol-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .symbol {
    font-size: 18px;
    font-weight: 800;
    color: #e0e0ff;
    letter-spacing: 0.5px;
  }
  .timeframe {
    font-size: 12px;
    color: #5858a0;
    background: #1a1a2e;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }
  .regime-badge {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .alpha-score {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .alpha-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    opacity: 0.8;
  }
  .alpha-value {
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
  }

  /* Tabs */
  .tabs {
    display: flex;
    border-bottom: 1px solid #1a1a2e;
    background: #0a0a12;
  }
  .tab {
    flex: 1;
    padding: 10px;
    background: transparent;
    border: none;
    color: #5858a0;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab.active {
    color: #d0d0ff;
    border-bottom-color: #3b82f6;
  }
  .tab:hover {
    color: #a0a0d0;
  }

  /* Content */
  .artifact-content {
    flex: 1;
    overflow-y: auto;
  }

  /* Chart */
  .chart-placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .chart-mock {
    width: 100%;
    max-width: 600px;
  }
  .chart-svg {
    width: 100%;
    height: auto;
    background: #0a0a12;
    border-radius: 8px;
    border: 1px solid #1a1a2e;
  }
  .chart-label {
    text-align: center;
    font-size: 11px;
    color: #3a3a5e;
    margin-top: 12px;
  }

  /* Layers */
  .layers-grid {
    padding: 12px 16px;
  }
  .layer-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #0f0f1a;
  }
  .layer-id {
    font-size: 10px;
    font-weight: 700;
    color: #5858a0;
    min-width: 28px;
    font-family: monospace;
  }
  .layer-name {
    font-size: 12px;
    color: #a0a0c0;
    min-width: 60px;
  }
  .layer-value {
    flex: 1;
    font-size: 11px;
    color: #7878a0;
    font-family: monospace;
  }
  .layer-bar-container {
    width: 60px;
    height: 6px;
    background: #12121e;
    border-radius: 3px;
    overflow: hidden;
  }
  .layer-bar {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s;
  }
  .layer-score {
    font-size: 12px;
    font-weight: 700;
    min-width: 32px;
    text-align: right;
    font-family: monospace;
  }

  /* Empty State */
  .position-placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .empty-state {
    text-align: center;
    color: #5858a0;
  }
  .empty-icon {
    font-size: 48px;
    opacity: 0.3;
  }
  .empty-state p {
    margin: 8px 0 0;
    font-size: 14px;
  }
  .empty-sub {
    font-size: 12px !important;
    opacity: 0.6;
  }

  /* Scrollbar */
  .artifact-content::-webkit-scrollbar { width: 4px; }
  .artifact-content::-webkit-scrollbar-thumb { background: #2a2a4e; border-radius: 2px; }
</style>
