<!-- ═══════════════════════════════════════════
  VSMeterBar.svelte — 포켓몬 배틀 스타일 VS 줄다리기 미터
  50에서 시작, 좌(human)↔우(ai) 밀당
═══════════════════════════════════════════ -->
<script lang="ts">
  const {
    value = 50,
    humanLabel = 'YOU',
    aiLabel = 'AI',
    showSparkline = false,
    history = [],
  }: {
    value: number;        // 0-100 (50 = neutral)
    humanLabel?: string;
    aiLabel?: string;
    showSparkline?: boolean;
    history?: number[];
  } = $props();

  const humanPct = $derived(value);
  const aiPct = $derived(100 - value);

  const barColor = $derived(() => {
    if (value >= 70) return '#48d868';   // human winning big
    if (value >= 55) return '#a0e8a0';   // human leading
    if (value <= 30) return '#f85858';   // ai winning big
    if (value <= 45) return '#f8a0a0';   // ai leading
    return '#f8d030';                     // neutral/close
  });

  const statusText = $derived(() => {
    if (value >= 75) return '압도적 우세!';
    if (value >= 60) return '유리';
    if (value <= 25) return '위험!';
    if (value <= 40) return '불리';
    return '접전';
  });
</script>

<div class="vs-meter-container">
  <!-- Labels -->
  <div class="vs-labels">
    <span class="vs-label human">👤 {humanLabel}</span>
    <span class="vs-status">{statusText()}</span>
    <span class="vs-label ai">🤖 {aiLabel}</span>
  </div>

  <!-- Main bar -->
  <div class="vs-track">
    <!-- Human side (green) -->
    <div
      class="vs-fill human-fill"
      style:width="{humanPct}%"
      style:background={barColor()}
    >
      {#if humanPct > 15}
        <span class="vs-pct">{Math.round(humanPct)}%</span>
      {/if}
    </div>

    <!-- Center marker -->
    <div class="vs-center-marker" style:left="{humanPct}%"></div>

    <!-- AI side (red) -->
    <div
      class="vs-fill ai-fill"
      style:width="{aiPct}%"
    >
      {#if aiPct > 15}
        <span class="vs-pct">{Math.round(aiPct)}%</span>
      {/if}
    </div>
  </div>

  <!-- Tick marks -->
  <div class="vs-ticks">
    <span class="tick" style:left="25%"></span>
    <span class="tick center" style:left="50%"></span>
    <span class="tick" style:left="75%"></span>
  </div>

  <!-- Sparkline (optional history) -->
  {#if showSparkline && history.length > 1}
    <div class="sparkline">
      <svg viewBox="0 0 {history.length} 40" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#4FC3F7"
          stroke-width="1.5"
          points={history.map((v, i) => `${i},${40 - (v / 100) * 40}`).join(' ')}
        />
        <!-- 50% baseline -->
        <line x1="0" y1="20" x2={history.length} y2="20" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2" />
      </svg>
    </div>
  {/if}
</div>

<style>
  .vs-meter-container {
    width: 100%;
    padding: 4px 0;
  }

  .vs-labels {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    padding: 0 2px;
  }

  .vs-label {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.5px;
    font-family: 'JetBrains Mono', monospace;
  }
  .vs-label.human { color: #48d868; }
  .vs-label.ai { color: #f85858; }

  .vs-status {
    font-size: 8px;
    font-weight: 700;
    color: #f8d030;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .vs-track {
    position: relative;
    display: flex;
    height: 16px;
    background: #1a1a2e;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .vs-fill {
    height: 100%;
    transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    position: relative;
  }

  .human-fill {
    justify-content: flex-start;
    padding-left: 4px;
  }

  .ai-fill {
    background: linear-gradient(90deg, #c62828, #f85858);
    justify-content: flex-end;
    padding-right: 4px;
  }

  .vs-pct {
    font-size: 8px;
    font-weight: 900;
    color: rgba(0,0,0,0.7);
    font-family: 'JetBrains Mono', monospace;
  }

  .vs-center-marker {
    position: absolute;
    top: 0;
    width: 2px;
    height: 100%;
    background: white;
    transform: translateX(-50%);
    z-index: 2;
    opacity: 0.8;
    transition: left 600ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .vs-ticks {
    position: relative;
    height: 4px;
  }
  .tick {
    position: absolute;
    top: 0;
    width: 1px;
    height: 3px;
    background: rgba(255,255,255,0.15);
    transform: translateX(-50%);
  }
  .tick.center {
    background: rgba(255,255,255,0.3);
    height: 4px;
  }

  .sparkline {
    height: 20px;
    margin-top: 4px;
    opacity: 0.6;
  }
  .sparkline svg {
    width: 100%;
    height: 100%;
  }
</style>
