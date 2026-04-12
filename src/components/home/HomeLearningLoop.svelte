<script lang="ts">
  import type { LearningStep } from '$lib/home/homeLanding';

  let {
    steps = []
  }: {
    steps?: LearningStep[];
  } = $props();
</script>

<section class="section">
  <div class="section-shell">
    <div class="section-head">
      <span class="section-label">HOW IT LEARNS</span>
      <h2>The system should read in one pass.</h2>
      <p>
        Home should explain the loop quickly: save the setup, watch for it, judge the hit, and only keep the stronger adapter.
      </p>
    </div>

    <div class="learning-grid">
      <div class="learning-window">
        <div class="window-bar">
          <div class="window-controls" aria-hidden="true">
            <span class="window-dot red"></span>
            <span class="window-dot amber"></span>
            <span class="window-dot green"></span>
          </div>
          <div class="window-title">learning.loop</div>
        </div>

        <div class="learning-list">
          {#each steps as step}
            <article class="learning-card">
              <span class="learning-id">{step.id}</span>
              <div class="learning-copy">
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
            </article>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .section {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) clamp(42px, 6vw, 68px);
    font-family: var(--sc-font-body);
  }

  .section-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr);
    gap: clamp(20px, 3vw, 36px);
    align-items: start;
  }

  .section-head {
    display: grid;
    gap: 10px;
    margin: 0;
    text-align: left;
  }

  .section-label,
  .learning-id {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
    color: rgba(255, 79, 163, 0.88);
  }

  .section-head h2,
  .learning-card h3 {
    margin: 0;
    font-family: var(--sc-font-body);
    letter-spacing: -0.045em;
  }

  .section-head h2 {
    max-width: 12ch;
    font-size: clamp(2.2rem, 3.4vw, 3.35rem);
    color: rgba(255, 247, 244, 0.97);
  }

  .section-head p,
  .learning-card p {
    margin: 0;
    color: rgba(255, 247, 244, 0.76);
    font-size: 1.05rem;
    line-height: 1.6;
  }

  .learning-grid {
    display: block;
  }

  .learning-window {
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(34, 34, 36, 0.9), rgba(16, 16, 18, 0.88));
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
  }

  .window-bar {
    min-height: 42px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(180deg, rgba(72, 72, 74, 0.95), rgba(46, 46, 48, 0.95));
    border-bottom: 1px solid rgba(0, 0, 0, 0.35);
  }

  .window-controls {
    display: inline-flex;
    gap: 7px;
  }

  .window-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #777;
  }

  .window-dot.red {
    background: #ff5f57;
  }

  .window-dot.amber {
    background: #febc2e;
  }

  .window-dot.green {
    background: #28c840;
  }

  .window-title {
    margin-left: auto;
    color: rgba(255, 255, 255, 0.62);
    font-family: var(--sc-font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
  }

  .learning-list {
    display: grid;
    grid-template-columns: 1fr;
  }

  .learning-card {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    padding: 16px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }

  .learning-card h3 {
    font-size: 1.22rem;
    line-height: 1.24;
    color: rgba(255, 247, 244, 0.95);
  }

  .learning-copy {
    display: grid;
    gap: 6px;
  }

  @media (max-width: 960px) {
    .section-shell {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 540px) {
    .section {
      padding-left: 18px;
      padding-right: 18px;
      padding-bottom: 40px;
    }

    .learning-card {
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 14px 16px;
    }
  }
</style>
