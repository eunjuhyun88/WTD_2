<script lang="ts">
  import type { LearningStep } from '$lib/home/homeLanding';

  let {
    steps = []
  }: {
    steps?: LearningStep[];
  } = $props();
</script>

<section class="section">
  <div class="section-shell rail-shell">
    <div class="section-head">
      <span class="section-label">HOW IT WORKS</span>
      <h2>Keep the mechanism short. Keep the promise clear.</h2>
      <p>Store it, watch it, keep the judgment, and only ship the stronger version.</p>
    </div>

    <div class="learning-rail">
      {#each steps as step}
        <article class="learning-step">
          <span class="learning-id">{step.id}</span>
          <div class="learning-body">
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>

<style>
  .section {
    position: relative;
    z-index: 3;
    padding: 10px clamp(22px, 4vw, 48px) 30px;
    font-family: var(--sc-font-body);
  }

  .section-shell {
    width: min(1160px, 100%);
    margin: 0 auto;
  }

  .rail-shell {
    display: grid;
    grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }

  .section-head {
    display: grid;
    gap: 10px;
  }

  .section-label,
  .learning-id {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.7rem;
  }

  .section-label {
    color: rgba(var(--home-accent-rgb), 0.84);
  }

  .section-head h2,
  .learning-body h3 {
    margin: 0;
    letter-spacing: -0.045em;
    color: rgba(255, 247, 244, 0.96);
  }

  .section-head h2 {
    font-size: clamp(1.7rem, 2.4vw, 2.4rem);
    line-height: 1.06;
  }

  .section-head p,
  .learning-body p {
    margin: 0;
    color: rgba(255, 247, 244, 0.68);
    line-height: 1.62;
  }

  .section-head p {
    max-width: 31rem;
    font-size: 1.02rem;
  }

  .learning-rail {
    display: grid;
    gap: 0;
    border-top: 1px solid rgba(250, 247, 235, 0.1);
  }

  .learning-step {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid rgba(250, 247, 235, 0.08);
  }

  .learning-id {
    color: rgba(var(--home-accent-rgb), 0.82);
    padding-top: 2px;
  }

  .learning-body {
    display: grid;
    gap: 6px;
  }

  .learning-body h3 {
    font-size: 1rem;
    line-height: 1.24;
  }

  .learning-body p {
    font-size: 0.92rem;
  }

  @media (max-width: 900px) {
    .rail-shell {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 540px) {
    .section {
      padding-left: 18px;
      padding-right: 18px;
      padding-bottom: 28px;
    }

    .learning-step {
      grid-template-columns: 1fr;
      gap: 6px;
    }
  }
</style>
