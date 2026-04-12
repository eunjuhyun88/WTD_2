<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import WebGLAsciiBackground from '../components/home/WebGLAsciiBackground.svelte';
  import { trackHomeFunnel } from '../components/home/homeData';

  const proofPillars = [
    { label: 'PERSONAL', value: 'One adapter per user' },
    { label: 'PROOF', value: 'Improve before trust' },
    { label: 'SAFETY', value: 'Rollback if worse' }
  ];

  const pathChoices = [
    {
      id: 'terminal',
      label: 'Observe',
      title: 'Search the market in Terminal',
      copy: 'Type the setup you care about, inspect the chart, and save the pattern without leaving the workspace.',
      path: '/terminal',
      action: 'OPEN TERMINAL'
    },
    {
      id: 'lab',
      label: 'Evaluate',
      title: 'Review saved challenges in Lab',
      copy: 'Open what you saved, run the evaluation loop, and inspect whether the pattern deserves another pass.',
      path: '/lab',
      action: 'OPEN LAB'
    },
    {
      id: 'dashboard',
      label: 'Return',
      title: 'Pick up from your inbox',
      copy: 'Jump back into your saved challenges, watches, and recent runs without hunting through old screens.',
      path: '/dashboard',
      action: 'OPEN DASHBOARD'
    }
  ];

  const learningSteps = [
    {
      id: '01',
      title: 'Capture',
      copy: 'Save the setup you care about instead of hoping you remember it tomorrow.'
    },
    {
      id: '02',
      title: 'Watch',
      copy: 'Saved challenges stay live so the system can surface the moments worth your attention.'
    },
    {
      id: '03',
      title: 'Judge',
      copy: 'Every verdict tells the system what your edge actually looks like in the wild.'
    },
    {
      id: '04',
      title: 'Deploy',
      copy: 'Lab ships the stronger adapter and rejects the weaker one automatically.'
    }
  ];

  const surfaces = [
    {
      label: 'Terminal',
      title: 'See and judge the signal',
      copy: 'This is where context becomes a decision and every verdict feeds the learning loop.'
    },
    {
      label: 'Lab',
      title: 'Improve the model with evidence',
      copy: 'Runs, comparisons, and gates live here. It is the workbench, not the stage prop.'
    },
    {
      label: 'Dashboard',
      title: 'Return to the work that matters',
      copy: 'Saved challenges, watching context, and recent run status live in one inbox instead of scattered routes.'
    }
  ];

  const footerGroups = [
    {
      title: 'Start',
      links: [
        { label: 'Open Terminal', path: '/terminal', cta: 'footer_terminal_start' },
        { label: 'Open Lab', path: '/lab', cta: 'footer_lab_start' }
      ]
    },
    {
      title: 'Product',
      links: [
        { label: 'Terminal', path: '/terminal', cta: 'footer_terminal' },
        { label: 'Lab', path: '/lab', cta: 'footer_lab' },
        { label: 'Dashboard', path: '/dashboard', cta: 'footer_dashboard_product' }
      ]
    },
    {
      title: 'Return',
      links: [
        { label: 'Dashboard', path: '/dashboard', cta: 'footer_dashboard' },
        { label: 'Settings', path: '/settings', cta: 'footer_settings' }
      ]
    }
  ];

  const footerSignals = [
    { label: 'MEMORY', value: 'One model per trader' },
    { label: 'VERDICTS', value: 'Judgment becomes training signal' },
    { label: 'DEPLOY', value: 'Rollback if validation slips' }
  ];

  const proofRows = [
    {
      stage: 'PATTERN',
      title: 'BTC reclaim saved',
      detail: 'Funding stretched. CVD still climbing. Wait for reclaim.'
    },
    {
      stage: 'SCAN HIT',
      title: '3 matches surfaced overnight',
      detail: 'Scanner found conditions close enough to your saved judgment.'
    },
    {
      stage: 'VERDICT',
      title: '2 good · 1 bad',
      detail: 'Your yes and no become usable training signal instead of disappearing.'
    },
    {
      stage: 'DEPLOY',
      title: 'Adapter v4 shipped',
      detail: 'Validation improved, so the stronger version becomes the new default.'
    }
  ];

  let mounted = $state(false);
  let mouseX = $state(50);
  let mouseY = $state(50);
  let targetMouseX = 50;
  let targetMouseY = 50;

  const mx = $derived((mouseX - 50) / 50);
  const my = $derived((mouseY - 50) / 50);

  function clamp01(v: number) {
    return Math.min(1, Math.max(0, v));
  }

  let lastInputTime = 0;
  let driftRaf = 0;
  const IDLE_DRIFT_DELAY_MS = 1600;
  const IDLE_DRIFT_SPEED = 0.00028;
  const IDLE_DRIFT_X = 18;
  const IDLE_DRIFT_Y = 12;
  const IDLE_DRIFT_X_DETAIL = 4;
  const IDLE_DRIFT_Y_DETAIL = 3;
  const POINTER_EASE = 0.11;
  const POINTER_DEADZONE = 0.07;
  const POINTER_CURVE = 0.82;
  const POINTER_EDGE_GAIN = 1.06;

  function shapePointerAxis(raw: number) {
    const sign = Math.sign(raw);
    const magnitude = Math.abs(raw);
    if (magnitude <= POINTER_DEADZONE) return 0;
    const normalized = (magnitude - POINTER_DEADZONE) / (1 - POINTER_DEADZONE);
    return sign * Math.min(Math.pow(normalized, POINTER_CURVE) * POINTER_EDGE_GAIN, 1);
  }

  function setCursor(clientX: number, clientY: number) {
    if (typeof window === 'undefined') return;
    const rawX = clamp01(clientX / window.innerWidth) * 2 - 1;
    const rawY = clamp01(clientY / window.innerHeight) * 2 - 1;
    targetMouseX = 50 + shapePointerAxis(rawX) * 50;
    targetMouseY = 50 + shapePointerAxis(rawY) * 50;
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
      trackHomeFunnel('hero_view', 'view', { story: 'learned-you-proof-first' });
    });

    function onPointer(e: PointerEvent) {
      setCursor(e.clientX, e.clientY);
    }

    function onTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (t) setCursor(t.clientX, t.clientY);
    }

    function driftLoop(time: number) {
      if (time - lastInputTime > IDLE_DRIFT_DELAY_MS) {
        const t = time * IDLE_DRIFT_SPEED;
        targetMouseX = 50 + Math.sin(t) * IDLE_DRIFT_X + Math.sin(t * 1.9) * IDLE_DRIFT_X_DETAIL;
        targetMouseY = 50 + Math.cos(t * 0.78) * IDLE_DRIFT_Y + Math.cos(t * 1.35) * IDLE_DRIFT_Y_DETAIL;
      }
      mouseX += (targetMouseX - mouseX) * POINTER_EASE;
      mouseY += (targetMouseY - mouseY) * POINTER_EASE;
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
  <title>Cogochi — The AI That Learns Your Judgment</title>
  <meta
    name="description"
    content="Save the patterns you trust, let Cogochi scan while you sleep, judge the hits, and deploy a model that gets closer to how you think."
  />
  <meta property="og:title" content="Cogochi — The AI That Learns Your Judgment" />
  <meta
    property="og:description"
    content="Per-user market memory for retail crypto traders. Capture a pattern, judge the signal, and ship a better adapter."
  />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="/" />
</svelte:head>

<WebGLAsciiBackground {mouseX} {mouseY} />

<div class="page">
  <section class="hero">
    <div class="hero-shell">
      <div class="hero-copy">
        <div class="eyebrow">COGOCHI</div>
        <h1 class:visible={mounted}>The AI that learns your judgment.</h1>
        <p class:visible={mounted} class="hero-lead">
          Type a setup. Save it from Terminal. Review the run in Lab. Return through Dashboard when the system has something worth your judgment.
        </p>

        <div class="hero-actions">
          <button type="button" class="primary" onclick={() => openPath('/terminal', 'primary_terminal')}>
            OPEN TERMINAL
          </button>
          <button type="button" class="secondary" onclick={() => openPath('/lab', 'secondary_lab')}>
            VIEW LAB
          </button>
        </div>

        <div class="proof-rail">
          {#each proofPillars as item}
            <article class="proof-pill">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          {/each}
        </div>

        <div class="entry-grid">
          {#each pathChoices as card}
            <button type="button" class="entry-card" onclick={() => selectPath(card.id, card.path)}>
              <span class="entry-label">{card.label}</span>
              <h2>{card.title}</h2>
              <p>{card.copy}</p>
              <span class="entry-action">{card.action}</span>
            </button>
          {/each}
        </div>

        <div class="return-actions">
          <button type="button" class="text-link" onclick={() => openPath('/dashboard', 'return_dashboard')}>
            RETURN TO DASHBOARD
          </button>
          <button type="button" class="text-link" onclick={() => openPath('/lab', 'return_lab')}>
            OPEN LAB
          </button>
        </div>
      </div>

      <div class="hero-visual">
        <div
          class="panel-aura"
          aria-hidden="true"
          style:transform={`translate(-50%, -50%) translate3d(${mx * 12}px, ${my * 8}px, 0)`}
        ></div>

        <article
          class="proof-panel"
          style:transform={`perspective(1100px) rotateY(${mx * -1.08}deg) rotateX(${my * 0.82}deg) translate3d(${mx * 8}px, ${my * 4.5}px, 0)`}
        >
          <div class="panel-topline">
            <span class="panel-chip">Learning Loop</span>
            <span class="panel-chip subtle">Per-user adapter</span>
          </div>

          <div class="panel-head">
            <p class="panel-kicker">Proof before trust</p>
            <h2>Your edge becomes system behavior.</h2>
            <p>
              Cogochi does not ask you to trust a generic market bot. It ties saved setups, verdicts, and deployment gates back to one trader and one evolving record.
            </p>
          </div>

          <div class="timeline">
            {#each proofRows as row}
              <div class="timeline-row">
                <span class="timeline-stage">{row.stage}</span>
                <div class="timeline-body">
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                </div>
              </div>
            {/each}
          </div>

          <div class="panel-foot">
            <div class="foot-stat">
              <span>Gate</span>
              <strong>Only ships if val improves</strong>
            </div>
            <div class="foot-stat">
              <span>Fallback</span>
              <strong>Automatic rollback if worse</strong>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="section section-learning">
    <div class="section-head">
      <span class="section-label">HOW IT LEARNS</span>
      <h2>A sharper model is earned, not assumed.</h2>
      <p>
        The home page should make the mechanism feel real in one pass. Not feature soup. Not route labels. Just the loop that turns judgment into a better model.
      </p>
    </div>

    <div class="learning-grid">
      {#each learningSteps as step}
        <article class="learning-card">
          <span class="learning-id">{step.id}</span>
          <h3>{step.title}</h3>
          <p>{step.copy}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="section section-surfaces">
    <div class="section-head narrow">
      <span class="section-label">SURFACES</span>
      <h2>Three places. One proof system.</h2>
      <p>
        Terminal is where you search and save. Lab is where the pattern earns another run. Dashboard is where you come back to what changed.
      </p>
    </div>

    <div class="surface-grid">
      {#each surfaces as surface}
        <article class="surface-card">
          <span class="surface-label">{surface.label}</span>
          <h3>{surface.title}</h3>
          <p>{surface.copy}</p>
        </article>
      {/each}
    </div>
  </section>

  <footer class="home-footer">
    <div class="footer-shell">
      <div class="footer-intro">
        <span class="section-label">COGOCHI</span>
        <h2>Judgment, remembered.</h2>
        <p>
          Cogochi is not another generic market assistant. It is the system that keeps your patterns, your verdicts, and the model behavior they produce.
        </p>
      </div>

      <div class="footer-grid">
        {#each footerGroups as group}
          <div class="footer-group">
            <h3>{group.title}</h3>
            <div class="footer-links">
              {#each group.links as link}
                <button type="button" class="footer-link" onclick={() => openPath(link.path, link.cta)}>
                  {link.label}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="footer-signal-row">
      {#each footerSignals as signal}
        <article class="footer-signal">
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
        </article>
      {/each}
    </div>

    <div class="footer-bottom">
      <p class="footer-note">
        Built for traders who want evidence before trust, and a model that learns from their actual calls instead of generic prompts.
      </p>

      <div class="footer-bottom-actions">
        <button type="button" class="footer-cta footer-cta-primary" onclick={() => openPath('/terminal', 'footer_open_terminal')}>
          OPEN TERMINAL
        </button>
        <button type="button" class="footer-cta footer-cta-secondary" onclick={() => openPath('/dashboard', 'footer_open_dashboard')}>
          OPEN DASHBOARD
        </button>
      </div>
    </div>
  </footer>
</div>

<style>
  :global(html) {
    -webkit-text-size-adjust: 100%;
    height: 100%;
  }

  :global(body) {
    min-height: 100%;
    background: #000;
  }

  .page {
    position: relative;
    z-index: 2;
    overflow: visible;
    color: var(--sc-text-0);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.025), transparent 34%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.16) 42%, rgba(0, 0, 0, 0.34) 100%);
  }

  .hero {
    position: relative;
    min-height: clamp(720px, calc(100dvh - 96px), 920px);
    padding: clamp(28px, 4vw, 46px) clamp(22px, 4vw, 48px) clamp(42px, 6vw, 72px);
  }

  .hero-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.03fr) minmax(360px, 0.97fr);
    gap: clamp(22px, 3vw, 42px);
    align-items: center;
  }

  .hero-copy {
    display: grid;
    gap: 18px;
    align-content: start;
  }

  .eyebrow,
  .section-label,
  .entry-label,
  .surface-label,
  .panel-kicker,
  .timeline-stage,
  .proof-pill span,
  .foot-stat span {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
  }

  .eyebrow {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid rgba(247, 242, 234, 0.14);
    background: rgba(10, 10, 12, 0.6);
    color: rgba(247, 242, 234, 0.78);
  }

  h1,
  .section-head h2,
  .panel-head h2,
  .entry-card h2 {
    margin: 0;
    letter-spacing: -0.045em;
    line-height: 0.96;
    font-weight: 650;
  }

  h1 {
    max-width: 10ch;
    font-size: clamp(3.3rem, 8vw, 7.4rem);
    color: rgba(247, 242, 234, 0.97);
    opacity: 0;
    transform: translateY(26px);
    transition:
      opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
  }

  h1.visible,
  .hero-lead.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .hero-lead {
    max-width: 38rem;
    margin: 0;
    color: rgba(247, 242, 234, 0.68);
    font-size: clamp(1.02rem, 1.5vw, 1.18rem);
    line-height: 1.62;
    opacity: 0;
    transform: translateY(18px);
    transition:
      opacity 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.14s,
      transform 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.14s;
  }

  .hero-actions,
  .return-actions {
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
    border-radius: 14px;
    border: 1px solid transparent;
    font-weight: 700;
    letter-spacing: 0.045em;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast),
      box-shadow var(--sc-duration-fast),
      color var(--sc-duration-fast);
  }

  .hero-actions .primary {
    color: #050505;
    background: linear-gradient(180deg, #e3b4b9, #c78f95);
    border-color: rgba(227, 180, 185, 0.45);
    box-shadow: 0 12px 40px rgba(199, 143, 149, 0.16);
  }

  .hero-actions .secondary {
    color: rgba(247, 242, 234, 0.92);
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(247, 242, 234, 0.14);
  }

  .hero-actions button:hover,
  .entry-card:hover,
  .surface-card:hover,
  .learning-card:hover {
    transform: translateY(-1px);
  }

  .hero-actions .primary:hover {
    background: linear-gradient(180deg, #ecbcc1, #cf969c);
    box-shadow: 0 18px 48px rgba(199, 143, 149, 0.22);
  }

  .hero-actions .secondary:hover {
    border-color: rgba(227, 180, 185, 0.28);
    color: rgba(247, 242, 234, 1);
  }

  .proof-rail {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .proof-pill,
  .entry-card,
  .learning-card,
  .surface-card,
  .proof-panel {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 14, 20, 0.66);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 22px 60px rgba(0, 0, 0, 0.26);
    backdrop-filter: blur(28px) saturate(1.1);
    -webkit-backdrop-filter: blur(28px) saturate(1.1);
  }

  .proof-pill {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 18px;
  }

  .proof-pill span,
  .section-label,
  .panel-kicker,
  .timeline-stage {
    color: rgba(227, 180, 185, 0.84);
  }

  .proof-pill strong,
  .foot-stat strong {
    font-size: 0.95rem;
    line-height: 1.3;
    color: rgba(247, 242, 234, 0.92);
  }

  .entry-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .entry-card {
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: 22px;
    text-align: left;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .entry-card:hover {
    border-color: rgba(227, 180, 185, 0.18);
    background: rgba(14, 17, 23, 0.74);
  }

  .entry-label {
    color: rgba(247, 242, 234, 0.42);
  }

  .entry-card h2 {
    font-size: clamp(1.28rem, 2.3vw, 1.8rem);
    line-height: 1.02;
    color: rgba(247, 242, 234, 0.95);
  }

  .entry-card p,
  .section-head p,
  .learning-card p,
  .surface-card p,
  .panel-head p,
  .timeline-body p {
    margin: 0;
    color: rgba(247, 242, 234, 0.62);
    line-height: 1.58;
  }

  .entry-action {
    margin-top: 2px;
    color: rgba(247, 242, 234, 0.84);
    font-size: 0.82rem;
    letter-spacing: 0.08em;
  }

  .text-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(247, 242, 234, 0.52);
    font-size: 0.84rem;
    letter-spacing: 0.05em;
  }

  .text-link:hover {
    color: rgba(227, 180, 185, 0.92);
  }

  .hero-visual {
    position: relative;
    min-height: 640px;
    display: grid;
    place-items: center;
  }

  .panel-aura {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(44rem, 88%);
    aspect-ratio: 1;
    border-radius: 50%;
    opacity: 0.14;
    background:
      radial-gradient(circle, rgba(227, 180, 185, 0.18), rgba(227, 180, 185, 0.05) 36%, transparent 72%);
    filter: blur(48px);
    pointer-events: none;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
    transform: translate(-50%, -50%);
  }

  .proof-panel {
    position: relative;
    z-index: 2;
    width: min(520px, 100%);
    padding: 22px;
    border-radius: 28px;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .panel-topline,
  .panel-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .panel-chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(227, 180, 185, 0.16);
    background: rgba(227, 180, 185, 0.08);
    color: rgba(247, 242, 234, 0.88);
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .panel-chip.subtle {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .panel-head {
    display: grid;
    gap: 10px;
    padding: 18px 0 20px;
  }

  .panel-head h2 {
    font-size: clamp(1.9rem, 4vw, 3rem);
    color: rgba(247, 242, 234, 0.97);
  }

  .timeline {
    display: grid;
    gap: 12px;
  }

  .timeline-row {
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 14px;
    padding: 14px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .timeline-body {
    display: grid;
    gap: 4px;
  }

  .timeline-body strong,
  .learning-card h3,
  .surface-card h3 {
    margin: 0;
    font-size: 1.12rem;
    line-height: 1.24;
    color: rgba(247, 242, 234, 0.94);
  }

  .panel-foot {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .foot-stat {
    display: grid;
    gap: 4px;
  }

  .foot-stat span {
    color: rgba(247, 242, 234, 0.4);
  }

  .section {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) clamp(44px, 6vw, 72px);
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

  .section-head h2 {
    font-size: clamp(2rem, 4.8vw, 4rem);
    color: rgba(247, 242, 234, 0.96);
  }

  .learning-grid {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .learning-card,
  .surface-card {
    display: grid;
    gap: 10px;
    padding: 20px;
    border-radius: 22px;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .learning-card:hover,
  .surface-card:hover {
    border-color: rgba(227, 180, 185, 0.16);
    background: rgba(14, 17, 23, 0.72);
  }

  .learning-id {
    color: rgba(227, 180, 185, 0.88);
    font-size: 0.84rem;
    letter-spacing: 0.12em;
  }

  .surface-grid {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .surface-label {
    color: rgba(247, 242, 234, 0.42);
  }

  .home-footer {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) calc(40px + env(safe-area-inset-bottom, 0px));
    display: grid;
    gap: 18px;
  }

  .footer-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 26px 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 24px;
  }

  .footer-intro {
    display: grid;
    gap: 10px;
  }

  .footer-intro h2,
  .footer-group h3 {
    margin: 0;
    color: rgba(247, 242, 234, 0.94);
  }

  .footer-intro h2 {
    font-size: clamp(1.6rem, 2.8vw, 2.4rem);
    letter-spacing: -0.04em;
  }

  .footer-intro p {
    margin: 0;
    max-width: 34rem;
    color: rgba(247, 242, 234, 0.58);
    line-height: 1.6;
  }

  .footer-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .footer-signal-row {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .footer-signal,
  .footer-bottom {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 14, 20, 0.58);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 16px 40px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(22px) saturate(1.06);
    -webkit-backdrop-filter: blur(22px) saturate(1.06);
  }

  .footer-signal {
    display: grid;
    gap: 6px;
    padding: 16px 18px;
    border-radius: 20px;
  }

  .footer-signal span {
    color: rgba(227, 180, 185, 0.84);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
  }

  .footer-signal strong {
    color: rgba(247, 242, 234, 0.92);
    font-size: 0.98rem;
    line-height: 1.32;
  }

  .footer-bottom {
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 18px;
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }

  .footer-note {
    margin: 0;
    max-width: 48rem;
    color: rgba(247, 242, 234, 0.64);
    line-height: 1.6;
  }

  .footer-bottom-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .footer-cta {
    min-height: 46px;
    padding: 0 16px;
    border-radius: 14px;
    font: inherit;
    font-weight: 700;
    letter-spacing: 0.05em;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast),
      color var(--sc-duration-fast);
  }

  .footer-cta-primary {
    border: 1px solid rgba(227, 180, 185, 0.42);
    background: linear-gradient(180deg, #e3b4b9, #c78f95);
    color: #050505;
  }

  .footer-cta-secondary {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(247, 242, 234, 0.9);
  }

  .footer-cta:hover {
    transform: translateY(-1px);
  }

  .footer-group {
    display: grid;
    gap: 10px;
    padding: 4px 0;
  }

  .footer-group h3 {
    font-size: 0.96rem;
    letter-spacing: 0.04em;
  }

  .footer-links {
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  .footer-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(247, 242, 234, 0.54);
    font-size: 0.94rem;
    line-height: 1.4;
    text-align: left;
    transition: color var(--sc-duration-fast), transform var(--sc-duration-fast);
  }

  .footer-link:hover {
    color: rgba(227, 180, 185, 0.92);
    transform: translateX(2px);
  }

  @media (max-width: 1180px) {
    .hero-shell {
      grid-template-columns: 1fr;
      gap: 28px;
    }

    .hero-copy {
      justify-items: center;
      text-align: center;
    }

    h1,
    .hero-lead {
      max-width: none;
    }

    .hero-visual {
      min-height: 560px;
    }
  }

  @media (max-width: 960px) {
    .proof-rail,
    .entry-grid,
    .learning-grid,
    .surface-grid,
    .footer-grid,
    .footer-shell,
    .footer-signal-row {
      grid-template-columns: 1fr;
    }

    .proof-panel {
      width: min(640px, 100%);
    }
  }

  @media (max-width: 720px) {
    .hero {
      min-height: auto;
      padding-top: 18px;
      padding-bottom: 34px;
    }

    .hero-actions,
    .return-actions,
    .footer-bottom-actions {
      flex-direction: column;
    }

    .hero-actions button,
    .footer-cta {
      width: 100%;
    }

    .timeline-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .hero-visual {
      min-height: 420px;
    }

    .proof-panel {
      padding: 18px;
    }

    .footer-bottom {
      align-items: stretch;
    }

    .footer-links {
      justify-items: stretch;
    }

    .proof-panel,
    .entry-card,
    .learning-card,
    .surface-card {
      border-radius: 20px;
    }
  }

  @media (max-width: 540px) {
    h1 {
      font-size: clamp(2.7rem, 13vw, 4.4rem);
    }

    .hero-lead {
      font-size: 0.98rem;
      line-height: 1.56;
    }

    .section {
      padding-left: 18px;
      padding-right: 18px;
      padding-bottom: 40px;
    }

    .hero,
    .home-footer {
      padding-left: 18px;
      padding-right: 18px;
    }

    .entry-card,
    .learning-card,
    .surface-card,
    .footer-signal {
      padding: 16px;
    }

    .panel-topline,
    .panel-foot {
      align-items: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    h1,
    .hero-lead {
      opacity: 1;
      transform: none;
      transition: none;
    }

    .panel-aura,
    .proof-panel {
      transition: none;
      transform: none !important;
    }
  }
</style>
