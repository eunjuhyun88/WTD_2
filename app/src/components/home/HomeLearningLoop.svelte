<script lang="ts">
  import type { LearningStep } from '$lib/home/homeLanding';

  let {
    steps = [],
    onOpen = undefined
  }: {
    steps?: LearningStep[];
    onOpen?: (path: string, cta: string) => void;
  } = $props();
</script>

<section class="section">
  <div class="section-shell rail-shell">
    <div class="section-head">
      <span class="section-label">HOW IT WORKS</span>
      <h2>Keep the mechanism short. Keep the promise clear.</h2>
      <p>Store it, watch it, keep the judgment, and only ship the stronger version.</p>
      {#if onOpen}
        <button
          type="button"
          class="loop-cta"
          onclick={() => onOpen!('/cogochi', 'loop_try')}
        >
          Try it
        </button>
      {/if}
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
    padding: 18px clamp(22px, 4vw, 48px) 42px;
    font-family: var(--sc-font-body);
  }

  .section-shell {
    width: min(1160px, 100%);
    margin: 0 auto;
  }

  .rail-shell {
    display: grid;
    grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr);
    gap: 40px;
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

  .loop-cta {
    align-self: start;
    background: none;
    border: 1px solid rgba(var(--home-accent-rgb), 0.3);
    border-radius: 4px;
    color: rgba(var(--home-accent-rgb), 0.9);
    cursor: pointer;
    font-family: var(--sc-font-mono);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    padding: 6px 14px;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    width: fit-content;
  }

  .loop-cta:hover {
    background: rgba(var(--home-accent-rgb), 0.08);
    border-color: rgba(var(--home-accent-rgb), 0.6);
    color: rgba(255, 247, 244, 0.96);
  }

  .learning-rail {
    display: grid;
    gap: 0;
    border-top: 1px solid rgba(250, 247, 235, 0.1);
  }

  .learning-step {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid rgba(250, 247, 235, 0.08);
  }

  .learning-id {
    color: rgba(var(--home-accent-rgb), 0.82);
    padding-top: 2px;
  }

  .learning-body {
    display: grid;
    gap: 8px;
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
      padding-bottom: 34px;
    }

    .section-head {
      gap: 12px;
    }

    .section-head h2 {
      font-size: clamp(1.94rem, 8.5vw, 2.36rem);
      line-height: 1.02;
    }

    .section-head p {
      font-size: 0.98rem;
      line-height: 1.68;
    }

    .learning-step {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 18px 0;
    }
  }
</style>
