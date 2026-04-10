<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import WebGLAsciiBackground from '../components/home/WebGLAsciiBackground.svelte';
  import { trackHomeFunnel } from '../components/home/homeData';

  const orbitCards = [
    { src: '/cogochi/chart-tools/scanner-grid.svg', title: 'Scanner', angle: 20, dist: 300, size: 100 },
    { src: '/cogochi/chart-tools/breakout-arrow.svg', title: 'Breakout', angle: 80, dist: 315, size: 84 },
    { src: '/cogochi/chart-tools/trend-map.svg', title: 'Trend Map', angle: 140, dist: 290, size: 96 },
    { src: '/cogochi/chart-tools/vwap-band.svg', title: 'VWAP', angle: 200, dist: 310, size: 88 },
    { src: '/cogochi/chart-tools/risk-ratio.svg', title: 'Risk', angle: 260, dist: 300, size: 80 },
    { src: '/cogochi/chart-tools/support-zones.svg', title: 'Zones', angle: 320, dist: 312, size: 84 },
    { src: '/cogochi/chart-tools/volume-feed.svg', title: 'Volume', angle: 50, dist: 410, size: 84 },
    { src: '/cogochi/chart-tools/orderbook-ladder.svg', title: 'Orderbook', angle: 110, dist: 425, size: 80 },
    { src: '/cogochi/chart-tools/liquidity-heatmap.svg', title: 'Heatmap', angle: 170, dist: 420, size: 76 },
    { src: '/cogochi/chart-tools/divergence-oscillator.svg', title: 'Divergence', angle: 230, dist: 415, size: 76 },
    { src: '/cogochi/chart-tools/momentum-stack.svg', title: 'Momentum', angle: 290, dist: 425, size: 88 },
    { src: '/cogochi/chart-tools/session-clock.svg', title: 'Session', angle: 350, dist: 410, size: 74 },
  ];

  const pathCards = [
    {
      id: 'builder',
      label: 'Builder',
      title: 'Train your own agent',
      copy: 'Start in onboarding, inspect context in Terminal only when needed, and spend the real work time in Lab.',
      path: '/onboard?path=builder',
      accent: 'good',
    },
    {
      id: 'copier',
      label: 'Copier',
      title: 'Browse proven specialists',
      copy: 'Go straight to the market, review proof first, and decide later whether you want to build one yourself.',
      path: '/market',
      accent: 'warn',
    },
  ];

  const loopSteps = [
    { id: '01', title: 'Onboard', desc: 'Create the first usable agent and get the first battle taste.' },
    { id: '02', title: 'Terminal', desc: 'Inspect chart context and form a doctrine hypothesis when needed.' },
    { id: '03', title: 'Lab', desc: 'Compare versions, rerun, and refine. This is the main workbench.' },
    { id: '04', title: 'Battle', desc: 'Pressure-test the doctrine against historical context and visible stakes.' },
    { id: '05', title: 'Agent', desc: 'Keep doctrine, memory, and the record in one durable home.' },
  ];

  const surfaceCards = [
    {
      label: 'Terminal',
      title: 'Optional, not the front door',
      copy: 'Terminal should sharpen context, not act as the only entry into the product.',
    },
    {
      label: 'Lab',
      title: 'The longest-dwell surface',
      copy: 'The retention loop lives in rerun, comparison, and iteration, not in hero theatrics.',
    },
    {
      label: 'Battle',
      title: 'Proof before monetization',
      copy: 'Market language only matters after the doctrine survives visible proof.',
    },
  ];

  let mounted = $state(false);
  let mouseX = $state(50);
  let mouseY = $state(50);

  const mx = $derived((mouseX - 50) / 50);
  const my = $derived((mouseY - 50) / 50);
  const cameraOrbit = $derived(`${(mx * 25).toFixed(1)}deg ${(75 + my * 15).toFixed(1)}deg 1.8m`);

  function clamp01(v: number) {
    return Math.min(1, Math.max(0, v));
  }

  let lastInputTime = 0;
  let driftRaf = 0;

  function setCursor(clientX: number, clientY: number) {
    if (typeof window === 'undefined') return;
    mouseX = Math.round(clamp01(clientX / window.innerWidth) * 100);
    mouseY = Math.round(clamp01(clientY / window.innerHeight) * 100);
    lastInputTime = performance.now();
  }

  function openPath(path: string, cta: string) {
    trackHomeFunnel('hero_cta_click', 'click', { cta, target: path });
    void goto(path);
  }

  function selectPath(id: string, path: string) {
    trackHomeFunnel('hero_feature_select', 'click', { path_id: id, target: path });
    void goto(path);
  }

  onMount(() => {
    requestAnimationFrame(() => {
      mounted = true;
      trackHomeFunnel('hero_view', 'view', { story: 'builder-copier-split' });
    });

    function onPointer(e: PointerEvent) {
      setCursor(e.clientX, e.clientY);
    }

    function onTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (t) setCursor(t.clientX, t.clientY);
    }

    function driftLoop(time: number) {
      if (time - lastInputTime > 1500) {
        const t = time * 0.0004;
        mouseX = Math.round(50 + Math.sin(t) * 28 + Math.sin(t * 2.3) * 6);
        mouseY = Math.round(50 + Math.cos(t * 0.8) * 18 + Math.cos(t * 1.7) * 5);
      }
      driftRaf = requestAnimationFrame(driftLoop);
    }

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    driftRaf = requestAnimationFrame(driftLoop);

    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchstart', onTouch);
      cancelAnimationFrame(driftRaf);
    };
  });
</script>

<svelte:head>
  <title>Cogotchi — Turn Judgment Into Proof</title>
  <meta
    name="description"
    content="Choose the builder or copier path, then move through Terminal, Lab, Battle, and Agent with proof-first progression."
  />
  <meta property="og:title" content="Cogotchi — Turn Judgment Into Proof" />
  <meta
    property="og:description"
    content="Build an agent, inspect chart context, iterate in Lab, prove it in Battle, and keep the record in Agent."
  />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="/" />
  <script
    type="module"
    src="https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js"
  ></script>
</svelte:head>

<WebGLAsciiBackground {mouseX} {mouseY} />

<div class="page">
  <section class="hero">
    <div
      class="model-shell"
      aria-hidden="true"
      style:transform={`translate(-50%, -50%) translate3d(${mx * 16}px, ${my * 10}px, 0)`}
    >
      <model-viewer
        src="/cogochi/logo.glb"
        class="model-el"
        alt=""
        camera-orbit={cameraOrbit}
        min-camera-orbit="auto auto 0.5m"
        field-of-view="30deg"
        interaction-prompt="none"
        shadow-intensity="0"
        environment-image="neutral"
        loading="eager"
        interpolation-decay="120"
      ></model-viewer>
    </div>

    <div class="orbit-layer" aria-hidden="true">
      {#each orbitCards as card, i}
        {@const rad = (card.angle * Math.PI) / 180}
        {@const baseX = Math.cos(rad) * card.dist}
        {@const baseY = Math.sin(rad) * card.dist}
        {@const parallax = card.dist / 400}
        {@const px = mx * 12 * parallax}
        {@const py = my * 8 * parallax}
        <div
          class="orbit-card"
          style:--size={`${card.size}px`}
          style:--delay={`${-(i * 0.9)}s`}
          style:--tx={`${(baseX + px).toFixed(1)}px`}
          style:--ty={`${(baseY + py).toFixed(1)}px`}
        >
          <img src={card.src} alt="" class="orbit-img" loading="lazy" />
        </div>
      {/each}
    </div>

    <div class="hero-copy">
      <div class="eyebrow">COGOTCHI</div>
      <h1 class:visible={mounted}>Turn Judgment Into Proof.</h1>
      <p class:visible={mounted}>
        Build an agent, inspect context in Terminal, iterate in Lab, prove it in Battle, and keep
        the record in Agent.
      </p>
    </div>

    <div
      class="center-card"
      style:transform={`perspective(800px) rotateY(${mx * -1.5}deg) rotateX(${my * 1.5}deg)`}
    >
      <div class="card-chrome">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="card-body">
        <div class="card-kicker">Choose your first path</div>
        <h2>Builder or Copier.</h2>
        <p>
          The home surface should split intent first. Builder onboarding goes to a guided start.
          Copier flow goes to the public market. Terminal is part of the loop, not the front door.
        </p>
        <div class="hero-actions">
          <button type="button" class="primary" onclick={() => openPath('/onboard?path=builder', 'builder_primary')}>
            BUILD AN AGENT
          </button>
          <button type="button" class="secondary" onclick={() => openPath('/market', 'copier_secondary')}>
            BROWSE MARKET
          </button>
        </div>
        <div class="resume-actions">
          <button type="button" class="text-link" onclick={() => openPath('/dashboard', 'dashboard_return')}>
            RETURN TO DASHBOARD
          </button>
          <button type="button" class="text-link" onclick={() => openPath('/lab', 'lab_return')}>
            OPEN LAB
          </button>
        </div>
      </div>
    </div>

    <div class="side-label left-top">
      <strong>Builder Loop</strong>
      <span>Onboard, iterate, prove, remember.</span>
    </div>
    <div class="side-label left-bottom">
      <strong>Terminal Is Optional</strong>
      <span>Useful for context, never the only start.</span>
    </div>
    <div class="side-label right-top">
      <strong>Proof Before Hype</strong>
      <span>Market access comes after evidence.</span>
    </div>
    <div class="side-label right-bottom">
      <strong>Agent Is The Record</strong>
      <span>Doctrine, memory, and history stay durable.</span>
    </div>
  </section>

  <section class="path-section">
    <div class="section-head">
      <span class="section-label">PATHS</span>
      <h2>Split intent before dense trading UI.</h2>
      <p>Home exists to route the first decision correctly, not to overwhelm the user with analysis chrome.</p>
    </div>
    <div class="path-grid">
      {#each pathCards as card}
        <button
          type="button"
          class={`path-card ${card.accent}`}
          onclick={() => selectPath(card.id, card.path)}
        >
          <span class="path-label">{card.label}</span>
          <h3>{card.title}</h3>
          <p>{card.copy}</p>
          <span class="path-cta">Open path</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="loop-section">
    <div class="section-head narrow">
      <span class="section-label">CORE LOOP</span>
      <h2>The message order is fixed.</h2>
      <p>Home must explain the product in the official sequence. If this order breaks, the landing loses the product thesis.</p>
    </div>
    <div class="loop-grid">
      {#each loopSteps as step}
        <article class="loop-card">
          <span class="loop-id">{step.id}</span>
          <h3>{step.title}</h3>
          <p>{step.desc}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="surface-section">
    <div class="section-head narrow">
      <span class="section-label">SURFACE PRIORITY</span>
      <h2>Home, Terminal, and proof now read as one product.</h2>
      <p>The visual shell comes from `cogochi_2`; the information architecture stays aligned to the canonical docs in this repo.</p>
    </div>
    <div class="surface-grid">
      {#each surfaceCards as card}
        <article class="surface-card">
          <span class="surface-label">{card.label}</span>
          <h3>{card.title}</h3>
          <p>{card.copy}</p>
        </article>
      {/each}
    </div>
  </section>
</div>

<style>
  :global(html) {
    -webkit-text-size-adjust: 100%;
    height: 100%;
  }

  :global(body) {
    min-height: 100%;
    background: #05070c;
  }

  .page {
    position: relative;
    z-index: 2;
    color: var(--sc-text-0);
    overflow: clip;
    background:
      radial-gradient(circle at 20% 18%, rgba(207, 127, 143, 0.08), transparent 24%),
      radial-gradient(circle at 80% 24%, rgba(173, 202, 124, 0.08), transparent 26%),
      linear-gradient(180deg, rgba(5, 7, 12, 0.84), rgba(5, 7, 12, 0.96) 42%, #05070c 100%);
  }

  .hero {
    position: relative;
    min-height: calc(100vh - 136px);
    min-height: calc(100dvh - 136px);
    display: grid;
    place-items: center;
    padding: clamp(48px, 8vw, 96px) clamp(20px, 4vw, 48px) clamp(72px, 8vw, 108px);
    overflow: hidden;
  }

  .model-shell {
    position: absolute;
    left: 50%;
    top: 45%;
    width: min(46vw, 34rem);
    height: min(46vw, 34rem);
    z-index: 0;
    pointer-events: none;
    opacity: 0.34;
    transition: transform 400ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .model-el {
    width: 100%;
    height: 100%;
    background: transparent !important;
    border: 0;
    outline: 0;
    box-shadow: none;
    --poster-color: transparent;
    animation: breathe 7s ease-in-out infinite;
  }

  .orbit-layer {
    position: absolute;
    left: 50%;
    top: 45%;
    width: 0;
    height: 0;
    z-index: 1;
    pointer-events: none;
  }

  .orbit-card {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    margin-top: calc(var(--size) / -2);
    opacity: 0.9;
    filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.6));
    animation: orbit-float 10s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .orbit-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .hero-copy {
    position: absolute;
    top: clamp(32px, 6vw, 54px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    width: min(820px, calc(100vw - 40px));
    text-align: center;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    border: 1px solid rgba(242, 209, 147, 0.25);
    border-radius: 999px;
    background: rgba(9, 12, 18, 0.58);
    color: var(--sc-warn);
    font-size: 0.74rem;
    letter-spacing: 0.18em;
  }

  h1 {
    margin: 18px 0 0;
    font-size: clamp(2.9rem, 7vw, 5.8rem);
    line-height: 0.98;
    letter-spacing: -0.04em;
    color: rgba(247, 242, 234, 0.96);
    opacity: 0;
    transform: translateY(26px);
    transition:
      opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
  }

  h1.visible,
  .hero-copy p.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .hero-copy p {
    max-width: 700px;
    margin: 18px auto 0;
    color: rgba(247, 242, 234, 0.64);
    font-size: clamp(1rem, 1.6vw, 1.14rem);
    line-height: 1.65;
    opacity: 0;
    transform: translateY(18px);
    transition:
      opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s,
      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s;
  }

  .center-card {
    position: relative;
    z-index: 3;
    width: min(480px, calc(100vw - 32px));
    margin-top: clamp(110px, 14vw, 160px);
    background: rgba(10, 13, 20, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    overflow: hidden;
    backdrop-filter: blur(40px) saturate(1.2);
    -webkit-backdrop-filter: blur(40px) saturate(1.2);
    box-shadow:
      0 32px 80px rgba(0, 0, 0, 0.56),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .card-chrome {
    display: flex;
    gap: 6px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .card-chrome span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 28px;
  }

  .card-kicker,
  .section-label,
  .path-label,
  .surface-label {
    font-size: 0.76rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .card-kicker,
  .section-label {
    color: var(--sc-warn);
  }

  .card-body h2,
  .section-head h2 {
    margin: 0;
    font-size: clamp(1.6rem, 2.4vw, 2.4rem);
    line-height: 1.05;
    letter-spacing: -0.03em;
  }

  .card-body p,
  .section-head p,
  .path-card p,
  .loop-card p,
  .surface-card p {
    margin: 0;
    color: rgba(247, 242, 234, 0.6);
    line-height: 1.6;
  }

  .hero-actions,
  .resume-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  .hero-actions button {
    min-height: 48px;
    padding: 0 18px;
    border-radius: 12px;
    border: 1px solid transparent;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .hero-actions .primary {
    background: linear-gradient(135deg, rgba(173, 202, 124, 0.22), rgba(173, 202, 124, 0.08));
    border-color: rgba(173, 202, 124, 0.45);
    color: var(--sc-good);
  }

  .hero-actions .secondary {
    background: linear-gradient(135deg, rgba(242, 209, 147, 0.18), rgba(242, 209, 147, 0.06));
    border-color: rgba(242, 209, 147, 0.34);
    color: var(--sc-warn);
  }

  .resume-actions {
    gap: 16px;
  }

  .text-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(247, 242, 234, 0.55);
    font-size: 0.9rem;
    letter-spacing: 0.04em;
  }

  .side-label {
    position: absolute;
    z-index: 2;
    display: grid;
    gap: 6px;
    max-width: 220px;
    color: rgba(247, 242, 234, 0.44);
  }

  .side-label strong {
    color: rgba(247, 242, 234, 0.84);
    font-size: 0.92rem;
    letter-spacing: 0.04em;
  }

  .side-label span {
    line-height: 1.5;
    font-size: 0.86rem;
  }

  .left-top { left: clamp(22px, 4vw, 54px); top: 22%; }
  .left-bottom { left: clamp(22px, 4vw, 54px); bottom: 14%; }
  .right-top { right: clamp(22px, 4vw, 54px); top: 20%; text-align: right; }
  .right-bottom { right: clamp(22px, 4vw, 54px); bottom: 16%; text-align: right; }

  .path-section,
  .loop-section,
  .surface-section {
    position: relative;
    z-index: 3;
    padding: 0 clamp(20px, 4vw, 48px) clamp(40px, 6vw, 72px);
  }

  .section-head {
    width: min(860px, 100%);
    margin: 0 auto 28px;
    text-align: center;
  }

  .section-head.narrow {
    width: min(760px, 100%);
  }

  .path-grid,
  .surface-grid {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .loop-grid {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
  }

  .path-card,
  .loop-card,
  .surface-card {
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(9, 12, 18, 0.66);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .path-card {
    padding: 24px;
    text-align: left;
    display: grid;
    gap: 14px;
    transition:
      transform 180ms ease,
      border-color 180ms ease,
      background 180ms ease;
  }

  .path-card.good:hover {
    transform: translateY(-2px);
    border-color: rgba(173, 202, 124, 0.34);
  }

  .path-card.warn:hover {
    transform: translateY(-2px);
    border-color: rgba(242, 209, 147, 0.32);
  }

  .path-card h3,
  .loop-card h3,
  .surface-card h3 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.2;
  }

  .path-label { color: rgba(247, 242, 234, 0.42); }
  .path-cta {
    color: rgba(247, 242, 234, 0.76);
    font-size: 0.92rem;
    letter-spacing: 0.03em;
  }

  .loop-card {
    padding: 18px;
    display: grid;
    gap: 12px;
  }

  .loop-id {
    color: var(--sc-warn);
    font-size: 0.84rem;
    letter-spacing: 0.08em;
  }

  .surface-card {
    padding: 22px;
    display: grid;
    gap: 12px;
  }

  .surface-label {
    color: rgba(247, 242, 234, 0.42);
  }

  @keyframes breathe {
    0%, 100% { translate: 0 0; }
    40% { translate: 2px -5px; }
    70% { translate: -1px -3px; }
  }

  @keyframes orbit-float {
    0%, 100% { transform: translate(var(--tx, 0), var(--ty, 0)) translateZ(0); }
    50% { transform: translate(var(--tx, 0), calc(var(--ty, 0) - 8px)) translateZ(0); }
  }

  @media (max-width: 1200px) {
    .side-label {
      display: none;
    }

    .loop-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .model-shell,
    .orbit-layer {
      display: none;
    }

    .hero {
      min-height: auto;
      padding-top: 56px;
    }

    .hero-copy {
      position: relative;
      top: auto;
      left: auto;
      transform: none;
      width: 100%;
      margin-bottom: 22px;
    }

    .center-card {
      margin-top: 0;
    }

    .path-grid,
    .surface-grid,
    .loop-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .card-body {
      padding: 22px;
    }

    .hero-actions,
    .resume-actions {
      flex-direction: column;
    }

    .hero-actions button {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    h1,
    .hero-copy p {
      opacity: 1;
      transform: none;
      transition: none;
    }

    .model-el,
    .orbit-card {
      animation: none;
    }
  }
</style>
