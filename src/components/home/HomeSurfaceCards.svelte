<script lang="ts">
  import type { SurfaceCard } from '$lib/home/homeLanding';

  let {
    surfaces = [],
    onOpen
  }: {
    surfaces?: SurfaceCard[];
    onOpen: (path: string, cta: string) => void;
  } = $props();
</script>

<section class="section">
  <div class="section-head narrow">
    <span class="section-label">SURFACES</span>
    <h2>Three places. One working loop.</h2>
    <p>
      Terminal is where you start fast. Lab is where the model proves itself. Dashboard is where the changed state waits for you.
    </p>
  </div>

  <div class="surface-grid">
    {#each surfaces as surface}
      <button type="button" class="surface-card" onclick={() => onOpen(surface.path, surface.cta)}>
        <div class="surface-window-bar">
          <div class="surface-window-controls" aria-hidden="true">
            <span class="surface-window-dot red"></span>
            <span class="surface-window-dot amber"></span>
            <span class="surface-window-dot green"></span>
          </div>
          <span class="surface-label">{surface.label}</span>
        </div>
        <div class="surface-body">
          <h3>{surface.title}</h3>
          <p>{surface.copy}</p>
          <span class="surface-action">{surface.actionLabel} -></span>
        </div>
      </button>
    {/each}
  </div>
</section>

<style>
  .section {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) clamp(42px, 6vw, 68px);
    font-family: var(--sc-font-body);
  }

  .section-head {
    width: min(820px, 100%);
    margin: 0 auto 18px;
    text-align: left;
    display: grid;
    gap: 10px;
  }

  .section-head.narrow {
    width: min(760px, 100%);
  }

  .section-label,
  .surface-label,
  .surface-action {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
  }

  .section-label {
    color: rgba(255, 79, 163, 0.88);
  }

  .section-head h2,
  .surface-card h3 {
    margin: 0;
    font-family: var(--sc-font-body);
    letter-spacing: -0.045em;
  }

  .section-head h2 {
    font-size: clamp(2.2rem, 3.3vw, 3.3rem);
    color: rgba(255, 247, 244, 0.97);
  }

  .section-head p,
  .surface-card p {
    margin: 0;
    color: rgba(255, 247, 244, 0.76);
    font-size: 1.05rem;
    line-height: 1.6;
  }

  .surface-grid {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .surface-card {
    display: grid;
    align-content: start;
    min-height: 220px;
    padding: 0;
    text-align: left;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(34, 34, 36, 0.9), rgba(16, 16, 18, 0.88));
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .surface-card:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 79, 163, 0.22);
    background: rgba(14, 17, 23, 0.74);
  }

  .surface-label {
    color: rgba(255, 255, 255, 0.62);
  }

  .surface-window-bar {
    min-height: 42px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: linear-gradient(180deg, rgba(72, 72, 74, 0.95), rgba(46, 46, 48, 0.95));
    border-bottom: 1px solid rgba(0, 0, 0, 0.35);
  }

  .surface-window-controls {
    display: inline-flex;
    gap: 7px;
  }

  .surface-window-dot {
    width: 11px;
    height: 11px;
    border-radius: 999px;
    background: #777;
  }

  .surface-window-dot.red {
    background: #ff5f57;
  }

  .surface-window-dot.amber {
    background: #febc2e;
  }

  .surface-window-dot.green {
    background: #28c840;
  }

  .surface-body {
    display: grid;
    gap: 10px;
    align-content: start;
    min-height: 178px;
    padding: 18px;
  }

  .surface-card h3 {
    font-size: 1.24rem;
    line-height: 1.2;
    color: rgba(255, 247, 244, 0.95);
  }

  .surface-action {
    margin-top: auto;
    padding-top: 8px;
    font-size: 0.8rem;
    color: rgba(255, 79, 163, 0.9);
  }

  @media (max-width: 960px) {
    .surface-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 540px) {
    .section {
      padding-left: 18px;
      padding-right: 18px;
      padding-bottom: 40px;
    }

    .surface-card {
      min-height: 0;
    }

    .surface-body {
      padding: 16px;
    }
  }
</style>
