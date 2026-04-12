<script lang="ts">
  import type { LearningStep } from '$lib/home/homeLanding';

  let {
    steps = []
  }: {
    steps?: LearningStep[];
  } = $props();
</script>

<section class="section">
  <div class="section-head">
    <span class="section-label">HOW IT LEARNS</span>
    <h2>A sharper model is earned, not assumed.</h2>
    <p>
      The loop should feel real in one pass. Not feature soup. Not route labels. Just the system that turns your judgment into a better model.
    </p>
  </div>

  <div class="learning-grid">
    {#each steps as step}
      <article class="learning-card">
        <span class="learning-id">{step.id}</span>
        <h3>{step.title}</h3>
        <p>{step.copy}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .section {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) clamp(42px, 6vw, 68px);
  }

  .section-head {
    width: min(820px, 100%);
    margin: 0 auto 22px;
    text-align: center;
    display: grid;
    gap: 10px;
  }

  .section-label,
  .learning-id {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
    color: rgba(227, 180, 185, 0.84);
  }

  .section-head h2,
  .learning-card h3 {
    margin: 0;
    letter-spacing: -0.045em;
  }

  .section-head h2 {
    font-size: clamp(2rem, 4.8vw, 4rem);
    color: rgba(247, 242, 234, 0.96);
  }

  .section-head p,
  .learning-card p {
    margin: 0;
    color: rgba(247, 242, 234, 0.62);
    line-height: 1.58;
  }

  .learning-grid {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .learning-card {
    display: grid;
    gap: 10px;
    padding: 20px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 14, 20, 0.66);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 22px 60px rgba(0, 0, 0, 0.26);
    backdrop-filter: blur(28px) saturate(1.1);
    -webkit-backdrop-filter: blur(28px) saturate(1.1);
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .learning-card:hover {
    transform: translateY(-1px);
    border-color: rgba(227, 180, 185, 0.16);
    background: rgba(14, 17, 23, 0.72);
  }

  .learning-card h3 {
    font-size: 1.12rem;
    line-height: 1.24;
    color: rgba(247, 242, 234, 0.94);
  }

  @media (max-width: 960px) {
    .learning-grid {
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
      padding: 16px;
    }
  }
</style>
