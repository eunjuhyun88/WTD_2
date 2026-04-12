<script lang="ts">
  import { AGDEFS } from '$lib/data/agents';
  import type { SquadConfig, RiskLevel, SquadTimeframe } from '$lib/stores/gameState';
  import { CORE_TIMEFRAME_OPTIONS } from '$lib/utils/timeframe';

  interface Props {
    selectedAgents?: string[];
    ondeploy?: (config: { config: SquadConfig }) => void;
    onback?: () => void;
  }
  let {
    selectedAgents = [],
    ondeploy,
    onback,
  }: Props = $props();

  // Squad-wide config (v2 parameters)
  let riskLevel: RiskLevel = $state('mid');
  let timeframe: SquadTimeframe = $state('4h');
  let leverageBias = $state(5);
  let confidenceWeight = $state(5);

  let activeAgents = $derived(AGDEFS.filter(a => selectedAgents.includes(a.id)));

  const RISK_OPTIONS: { value: RiskLevel; label: string; emoji: string; desc: string; color: string }[] = [
    { value: 'low', label: 'LOW', emoji: '🛡', desc: 'Conservative. Tight SL, low leverage.', color: '#00cc66' },
    { value: 'mid', label: 'MID', emoji: '⚖️', desc: 'Balanced risk/reward.', color: '#E8967D' },
    { value: 'aggro', label: 'AGGRO', emoji: '🔥', desc: 'High risk, high reward. Wide SL.', color: '#ff2d55' }
  ];

  const TF_DESCRIPTIONS: Record<SquadTimeframe, string> = {
    '1m': 'Ultra scalp',
    '5m': 'Scalp',
    '15m': 'Fast intraday',
    '30m': 'Intraday',
    '1h': 'Session trend',
    '4h': 'Swing',
    '1d': 'Macro',
    '1w': 'Position',
  };

  const TF_OPTIONS: { value: SquadTimeframe; label: string; desc: string }[] = CORE_TIMEFRAME_OPTIONS.map((tf) => ({
    value: tf.value,
    label: tf.label,
    desc: TF_DESCRIPTIONS[tf.value],
  }));

  function handleDeploy() {
    ondeploy?.({
      config: { riskLevel, timeframe, leverageBias, confidenceWeight }
    });
  }

  function handleBack() {
    onback?.();
  }
</script>

<div class="squad-config">
  <div class="sc-header">
    <button class="sc-back" onclick={handleBack}>← BACK</button>
    <h2 class="sc-title">CONFIGURE SQUAD</h2>
    <div class="sc-count">{activeAgents.length} AGENTS</div>
  </div>

  <!-- Agent roster preview -->
  <div class="sc-roster">
    {#each activeAgents as ag (ag.id)}
      <div class="roster-chip" style="--agent-color:{ag.color}">
        <span class="rc-icon">{ag.icon}</span>
        <span class="rc-name">{ag.name}</span>
        <span class="rc-role">{ag.role}</span>
      </div>
    {/each}
  </div>

  <div class="sc-params">
    <!-- Risk Level -->
    <div class="param-section">
      <div class="param-label">
        <span class="pl-emoji">⚠️</span>
        <span class="pl-text">RISK LEVEL</span>
      </div>
      <div class="pill-group risk">
        {#each RISK_OPTIONS as opt}
          <button
            class="pill"
            class:sel={riskLevel === opt.value}
            style="--pill-color:{opt.color}"
            onclick={() => riskLevel = opt.value}
          >
            <span class="pill-emoji">{opt.emoji}</span>
            <span class="pill-label">{opt.label}</span>
          </button>
        {/each}
      </div>
      <div class="param-desc">
        {RISK_OPTIONS.find(o => o.value === riskLevel)?.desc}
      </div>
    </div>

    <!-- Timeframe -->
    <div class="param-section">
      <div class="param-label">
        <span class="pl-emoji">⏱</span>
        <span class="pl-text">TIMEFRAME</span>
      </div>
      <div class="pill-group tf">
        {#each TF_OPTIONS as opt}
          <button
            class="pill tf-pill"
            class:sel={timeframe === opt.value}
            onclick={() => timeframe = opt.value}
          >
            <span class="pill-label">{opt.label}</span>
            <span class="pill-sub">{opt.desc}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Leverage Bias -->
    <div class="param-section">
      <div class="param-label">
        <span class="pl-emoji">📈</span>
        <span class="pl-text">LEVERAGE BIAS</span>
        <span class="pl-val">{leverageBias}</span>
      </div>
      <div class="slider-wrap">
        <span class="slider-min">1</span>
        <input type="range" class="sc-slider" min="1" max="10" step="1" bind:value={leverageBias} />
        <span class="slider-max">10</span>
      </div>
      <div class="slider-ticks">
        {#each Array(10) as _, i}
          <div class="tick" class:active={i + 1 <= leverageBias}></div>
        {/each}
      </div>
      <div class="param-desc">
        {leverageBias <= 3 ? 'Low leverage — safer but smaller gains' : leverageBias <= 6 ? 'Moderate leverage — balanced exposure' : 'High leverage — amplified gains & losses'}
      </div>
    </div>

    <!-- Confidence Weight -->
    <div class="param-section">
      <div class="param-label">
        <span class="pl-emoji">🎯</span>
        <span class="pl-text">CONFIDENCE WEIGHT</span>
        <span class="pl-val">{confidenceWeight}</span>
      </div>
      <div class="slider-wrap">
        <span class="slider-min">1</span>
        <input type="range" class="sc-slider conf" min="1" max="10" step="1" bind:value={confidenceWeight} />
        <span class="slider-max">10</span>
      </div>
      <div class="slider-ticks">
        {#each Array(10) as _, i}
          <div class="tick" class:active={i + 1 <= confidenceWeight}></div>
        {/each}
      </div>
      <div class="param-desc">
        {confidenceWeight <= 3 ? 'Low weight — agents decide more freely' : confidenceWeight <= 6 ? 'Balanced — agents weigh your conviction' : 'High weight — your conviction strongly influences agents'}
      </div>
    </div>
  </div>

  <!-- Config Summary -->
  <div class="sc-summary">
    <div class="sum-row">
      <span class="sum-label">RISK</span>
      <span class="sum-val" style="color:{RISK_OPTIONS.find(o => o.value === riskLevel)?.color}">{riskLevel.toUpperCase()}</span>
    </div>
    <div class="sum-divider"></div>
    <div class="sum-row">
      <span class="sum-label">TF</span>
      <span class="sum-val">{timeframe}</span>
    </div>
    <div class="sum-divider"></div>
    <div class="sum-row">
      <span class="sum-label">LEV</span>
      <span class="sum-val">{leverageBias}x</span>
    </div>
    <div class="sum-divider"></div>
    <div class="sum-row">
      <span class="sum-label">CONF</span>
      <span class="sum-val">{confidenceWeight}/10</span>
    </div>
  </div>

  <button class="sc-deploy-btn" onclick={handleDeploy}>
    🚀 DEPLOY SQUAD 🚀
  </button>
</div>

<style>
  .squad-config {
    position: absolute;
    inset: 0;
    z-index: 45;
    background: #08130d;
    background-image:
      radial-gradient(ellipse 600px 400px at 70% 10%, rgba(232,150,125,.08) 0%, transparent 70%),
      radial-gradient(ellipse 400px 400px at 20% 80%, rgba(0,212,255,.04) 0%, transparent 70%);
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .sc-header {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 520px;
    margin-bottom: 8px;
  }
  .sc-back {
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 700;
    padding: 4px 10px;
    border: 1px solid rgba(232,150,125,.4);
    border-radius: 4px;
    background: rgba(232,150,125,.06);
    color: #e8967d;
    cursor: pointer;
    transition: background .2s;
    letter-spacing: .5px;
  }
  .sc-back:hover { background: rgba(232,150,125,.15); }
  .sc-title {
    font-family: var(--fc);
    font-size: 22px;
    color: #f0ede4;
    -webkit-text-stroke: 0;
    letter-spacing: 3px;
    flex: 1;
    text-align: center;
    margin: 0;
    text-shadow: 0 0 20px rgba(232,150,125,.2);
  }
  .sc-count {
    font-family: var(--fd);
    font-size: 12px;
    color: #e8967d;
    background: rgba(232,150,125,.1);
    border: 1px solid rgba(232,150,125,.3);
    padding: 3px 10px;
    border-radius: 10px;
    letter-spacing: 2px;
  }

  /* Agent Roster */
  .sc-roster {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    max-width: 520px;
    margin-bottom: 14px;
  }
  .roster-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(10,26,18,.9);
    border: 1px solid rgba(232,150,125,.25);
    border-radius: 20px;
    padding: 4px 10px 4px 6px;
    transition: border-color .2s;
  }
  .roster-chip:hover { border-color: var(--agent-color); }
  .rc-icon { font-size: 14px; }
  .rc-name {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #f0ede4;
  }
  .rc-role {
    font-family: var(--fm);
    font-size: 6px;
    font-weight: 700;
    color: var(--agent-color);
    letter-spacing: .5px;
  }

  /* Params Container */
  .sc-params {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 16px;
  }

  .param-section {
    background: rgba(10,26,18,.92);
    border: 1px solid rgba(232,150,125,.2);
    border-radius: 10px;
    padding: 12px 14px;
  }

  .param-label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .pl-emoji { font-size: 14px; }
  .pl-text {
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #e8967d;
  }
  .pl-val {
    margin-left: auto;
    font-family: var(--fd);
    font-size: 16px;
    font-weight: 900;
    color: #f0ede4;
    background: rgba(232,150,125,.12);
    border: 1px solid rgba(232,150,125,.4);
    border-radius: 6px;
    padding: 1px 10px;
    min-width: 32px;
    text-align: center;
  }

  .param-desc {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(240,237,228,.45);
    margin-top: 6px;
    text-align: center;
    letter-spacing: .5px;
  }

  /* Pill Groups */
  .pill-group {
    display: flex;
    gap: 6px;
  }
  .pill {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border: 1px solid rgba(240,237,228,.12);
    border-radius: 8px;
    background: rgba(240,237,228,.03);
    cursor: pointer;
    transition: all .15s;
    position: relative;
    overflow: hidden;
    color: #f0ede4;
  }
  .pill:hover:not(.sel) { border-color: rgba(232,150,125,.4); background: rgba(232,150,125,.06); }
  .pill.sel {
    border-color: var(--pill-color, #e8967d);
    background: color-mix(in srgb, var(--pill-color, #e8967d) 18%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--pill-color, #e8967d) 25%, transparent);
    transform: scale(1.03);
  }
  .pill-emoji { font-size: 16px; }
  .pill-label {
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #f0ede4;
  }
  .pill-sub {
    font-family: var(--fm);
    font-size: 7px;
    color: rgba(240,237,228,.4);
    letter-spacing: .5px;
  }
  .pill.sel .pill-sub { color: rgba(240,237,228,.7); }

  .tf-pill { padding: 10px 4px; }

  /* Slider */
  .slider-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slider-min, .slider-max {
    font-family: var(--fd);
    font-size: 9px;
    font-weight: 900;
    color: rgba(240,237,228,.35);
    width: 16px;
    text-align: center;
  }
  .sc-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: rgba(232,150,125,.15);
    outline: none;
    border: none;
  }
  .sc-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #e8967d;
    border: 2px solid rgba(10,26,18,.8);
    cursor: pointer;
    box-shadow: 0 0 10px rgba(232,150,125,.4);
    transition: transform .1s;
  }
  .sc-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 0 16px rgba(232,150,125,.6);
  }
  .sc-slider::-webkit-slider-thumb:active {
    transform: scale(.95);
  }
  .sc-slider.conf::-webkit-slider-thumb {
    background: #66cce6;
    box-shadow: 0 0 10px rgba(102,204,230,.4);
  }

  .slider-ticks {
    display: flex;
    gap: 2px;
    margin-top: 4px;
    padding: 0 24px;
  }
  .tick {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: rgba(240,237,228,.08);
    transition: background .15s;
  }
  .tick.active { background: #e8967d; }

  /* Summary Bar */
  .sc-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(10,26,18,.95);
    border: 1px solid rgba(232,150,125,.2);
    border-radius: 8px;
    padding: 8px 16px;
    margin-bottom: 14px;
    max-width: 520px;
    width: 100%;
  }
  .sum-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    flex: 1;
  }
  .sum-label {
    font-family: var(--fm);
    font-size: 6px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240,237,228,.4);
  }
  .sum-val {
    font-family: var(--fd);
    font-size: 12px;
    font-weight: 900;
    color: #e8967d;
    letter-spacing: 1px;
  }
  .sum-divider {
    width: 1px;
    height: 24px;
    background: rgba(232,150,125,.15);
  }

  /* Deploy Button */
  .sc-deploy-btn {
    font-family: var(--fc);
    font-size: 22px;
    letter-spacing: 3px;
    color: #f0ede4;
    background: linear-gradient(180deg, #00cc88, #00aa66);
    border: 1px solid rgba(0,204,136,.5);
    border-radius: 30px;
    padding: 12px 50px;
    cursor: pointer;
    box-shadow: 0 0 20px rgba(0,204,136,.25);
    transition: all .2s;
    text-shadow: 0 1px 4px rgba(0,0,0,.4);
  }
  .sc-deploy-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 0 32px rgba(0,204,136,.4);
    background: linear-gradient(180deg, #00dd99, #00bb77);
  }
  .sc-deploy-btn:active {
    transform: translateY(1px);
    box-shadow: 0 0 8px rgba(0,204,136,.2);
  }
</style>
