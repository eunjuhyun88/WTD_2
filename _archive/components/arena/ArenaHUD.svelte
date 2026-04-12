<script lang="ts">
  interface Props {
    phaseName?: string;
    timer?: number;
    score?: number;
    streak?: number;
    lp?: number;
    mode?: string;
    phaseProgress?: number;
  }
  let {
    phaseName = 'ANALYSIS',
    timer = 0,
    score = 50,
    streak = 0,
    lp = 0,
    mode = 'PVE',
    phaseProgress = 0,
  }: Props = $props();

  let safeProgress = $derived(Math.max(0, Math.min(1, phaseProgress)));
  let scoreSafe = $derived(Math.max(0, Math.min(100, Math.round(score))));
  let dash = $derived(`${Math.round(safeProgress * 220)} 220`);
  let timerText = $derived(timer > 0 ? `${Math.ceil(timer)}s` : '--');
  let biasLabel = $derived(scoreSafe >= 60 ? 'LONG BIAS' : 'SHORT BIAS');
  let biasColor = $derived(scoreSafe >= 60 ? '#1fff9f' : '#ff637a');
</script>

<section class="arena-hud" aria-label="Arena HUD">
  <div class="hud-left">
    <div class="hud-phase">{phaseName}</div>
    <div class="hud-mode">{mode} MODE</div>
  </div>

  <div class="hud-ring">
    <svg viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r="35" />
      <circle class="progress" cx="38" cy="38" r="35" stroke-dasharray={dash} />
    </svg>
    <div class="hud-time">{timerText}</div>
  </div>

  <div class="hud-right">
    <div class="hud-score">{scoreSafe}</div>
    <div class="hud-bias" style="color:{biasColor}">{biasLabel}</div>
    <div class="hud-meta">🔥 {streak} · ⚡ {lp}</div>
  </div>
</section>

<style>
  .arena-hud {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 22;
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 14px;
    border: 1px solid rgba(232, 150, 125, 0.3);
    background:
      linear-gradient(140deg, rgba(10, 26, 18, 0.92), rgba(8, 19, 13, 0.85)),
      radial-gradient(circle at 80% 0%, rgba(232, 150, 125, 0.12), transparent 52%);
    box-shadow:
      inset 0 1px 0 rgba(232, 150, 125, 0.1),
      0 12px 30px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .hud-left {
    display: grid;
    gap: 2px;
    min-width: 86px;
  }

  .hud-phase {
    font: 900 10px/1 var(--fd);
    letter-spacing: 2px;
    color: #f0ede4;
    text-transform: uppercase;
  }

  .hud-mode {
    font: 700 8px/1 var(--fm);
    letter-spacing: 1px;
    color: rgba(240, 237, 228, 0.6);
  }

  .hud-ring {
    width: 44px;
    height: 44px;
    position: relative;
  }

  .hud-ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .hud-ring circle {
    fill: none;
    stroke: rgba(232, 150, 125, 0.15);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .hud-ring circle.progress {
    stroke: #e8967d;
    filter: drop-shadow(0 0 6px rgba(232, 150, 125, 0.5));
    transition: stroke-dasharray 0.35s ease;
  }

  .hud-time {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font: 800 10px/1 var(--fm);
    color: #f0ede4;
    letter-spacing: .3px;
  }

  .hud-right {
    display: grid;
    gap: 1px;
    min-width: 82px;
    text-align: right;
  }

  .hud-score {
    font: 900 16px/1 var(--fc);
    letter-spacing: 1px;
    color: #ffffff;
    text-shadow: 0 0 16px rgba(232, 150, 125, 0.4);
  }

  .hud-bias {
    font: 800 8px/1 var(--fd);
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }

  .hud-meta {
    font: 700 8px/1 var(--fm);
    color: rgba(240, 237, 228, 0.55);
  }

  @media (max-width: 900px) {
    .arena-hud {
      top: 8px;
      left: 8px;
      gap: 8px;
      padding: 7px 8px;
    }

    .hud-left {
      min-width: 72px;
    }

    .hud-phase {
      font-size: 9px;
      letter-spacing: 1.4px;
    }

    .hud-score {
      font-size: 14px;
    }
  }

  @media (max-width: 640px) {
    .arena-hud {
      grid-template-columns: auto auto;
      grid-template-areas:
        "left ring"
        "right right";
    }

    .hud-left {
      grid-area: left;
    }

    .hud-ring {
      grid-area: ring;
      justify-self: end;
    }

    .hud-right {
      grid-area: right;
      text-align: left;
    }
  }
</style>
