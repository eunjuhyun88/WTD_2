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
    <h2>Three places. One proof system.</h2>
    <p>
      Terminal is where you search and save. Lab is where the pattern earns another run. Dashboard is where you come back to what changed.
    </p>
  </div>

  <div class="surface-grid">
    {#each surfaces as surface}
      <button type="button" class="surface-card" onclick={() => onOpen(surface.path, surface.cta)}>
        <span class="surface-label">{surface.label}</span>
        <h3>{surface.title}</h3>
        <p>{surface.copy}</p>
      </button>
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

  .section-head.narrow {
    width: min(760px, 100%);
  }

  .section-label,
  .surface-label {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
  }

  .section-label {
    color: rgba(227, 180, 185, 0.84);
  }

  .section-head h2,
  .surface-card h3 {
    margin: 0;
    letter-spacing: -0.045em;
  }

  .section-head h2 {
    font-size: clamp(2rem, 4.8vw, 4rem);
    color: rgba(247, 242, 234, 0.96);
  }

  .section-head p,
  .surface-card p {
    margin: 0;
    color: rgba(247, 242, 234, 0.62);
    line-height: 1.58;
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
    gap: 10px;
    padding: 20px;
    text-align: left;
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

  .surface-card:hover {
    transform: translateY(-1px);
    border-color: rgba(227, 180, 185, 0.18);
    background: rgba(14, 17, 23, 0.74);
  }

  .surface-label {
    color: rgba(247, 242, 234, 0.42);
  }

  .surface-card h3 {
    font-size: 1.16rem;
    line-height: 1.2;
    color: rgba(247, 242, 234, 0.95);
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
      padding: 16px;
    }
  }
</style>
