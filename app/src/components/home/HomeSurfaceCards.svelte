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
  <div class="section-shell">
    <div class="section-head">
      <span class="section-label">SURFACES</span>
      <h2>Three surfaces are enough.</h2>
      <p>Start in Terminal, validate in Lab, return in Dashboard. Home only needs to make those three moves obvious.</p>
    </div>

    <div class="surface-list">
      {#each surfaces as surface}
        <button type="button" class="surface-row" onclick={() => onOpen(surface.path, surface.cta)}>
          <span class="surface-label">{surface.label}</span>
          <div class="surface-body">
            <h3>{surface.title}</h3>
            <p>{surface.copy}</p>
          </div>
          <span class="surface-action">{surface.actionLabel}</span>
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .section {
    position: relative;
    z-index: 3;
    padding: 2px clamp(22px, 4vw, 48px) 34px;
    font-family: var(--sc-font-body);
  }

  .section-shell {
    width: min(1160px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 18px;
  }

  .section-head {
    display: grid;
    gap: 10px;
    max-width: 39rem;
  }

  .section-label,
  .surface-label,
  .surface-action {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.7rem;
  }

  .section-label,
  .surface-action {
    color: rgba(var(--home-accent-rgb), 0.84);
  }

  .surface-label {
    color: rgba(255, 247, 244, 0.46);
  }

  .section-head h2,
  .surface-body h3 {
    margin: 0;
    letter-spacing: -0.045em;
  }

  .section-head h2 {
    font-size: clamp(1.7rem, 2.4vw, 2.3rem);
    color: rgba(250, 247, 235, 0.96);
  }

  .section-head p,
  .surface-body p {
    margin: 0;
    color: rgba(255, 247, 244, 0.68);
    line-height: 1.62;
  }

  .section-head p {
    font-size: 1rem;
  }

  .surface-list {
    display: grid;
    gap: 0;
    border-top: 1px solid rgba(250, 247, 235, 0.1);
  }

  .surface-row {
    display: grid;
    grid-template-columns: minmax(120px, 0.32fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    min-height: 102px;
    padding: 14px 0;
    text-align: left;
    border: 0;
    border-bottom: 1px solid rgba(250, 247, 235, 0.08);
    background: transparent;
    transition:
      transform var(--sc-duration-fast),
      color var(--sc-duration-fast);
  }

  .surface-row:hover {
    transform: translateY(-1px);
  }

  .surface-body {
    display: grid;
    gap: 8px;
    max-width: 34rem;
  }

  .surface-body h3 {
    font-size: 1.08rem;
    line-height: 1.22;
    color: rgba(250, 247, 235, 0.96);
  }

  .surface-body p {
    font-size: 0.94rem;
  }

  .surface-action {
    justify-self: end;
    white-space: nowrap;
  }

  @media (max-width: 960px) {
    .surface-row {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 8px;
      padding: 16px 0;
    }

    .surface-action {
      justify-self: start;
    }
  }

  @media (max-width: 540px) {
    .section {
      padding-left: 18px;
      padding-right: 18px;
      padding-bottom: 28px;
    }
  }
</style>
