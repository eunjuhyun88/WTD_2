<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import HomeFinalCta from '../components/home/HomeFinalCta.svelte';
  import HomeHero from '../components/home/HomeHero.svelte';
  import HomeLearningLoop from '../components/home/HomeLearningLoop.svelte';
  import HomeSurfaceCards from '../components/home/HomeSurfaceCards.svelte';
  import WebGLAsciiBackground from '../components/home/WebGLAsciiBackground.svelte';
  import { trackHomeFunnel } from '../components/home/homeData';
  import {
    HOME_EXAMPLE_PROMPTS,
    HOME_LEARNING_STEPS,
    HOME_PROOF_ROWS,
    HOME_SURFACES
  } from '$lib/home/homeLanding';

  let mounted = $state(false);
  let promptText = $state('');
  let mouseX = $state(50);
  let mouseY = $state(50);
  let targetMouseX = 50;
  let targetMouseY = 50;

  const mx = $derived((mouseX - 50) / 50);
  const my = $derived((mouseY - 50) / 50);

  function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
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

  function buildTerminalHref(query: string) {
    const text = query.trim();
    if (!text) return '/terminal';
    const params = new URLSearchParams({ q: text });
    return `/terminal?${params.toString()}`;
  }

  function handlePromptSubmit() {
    const target = buildTerminalHref(promptText);
    trackHomeFunnel('hero_cta_click', 'click', {
      cta: 'hero_start_bar',
      target,
      has_prompt: promptText.trim().length > 0
    });
    void goto(target);
  }

  function handlePromptChip(prompt: string) {
    promptText = prompt;
    trackHomeFunnel('hero_feature_select', 'click', {
      path_id: 'prompt_chip',
      target: '/terminal',
      prompt
    });
  }

  onMount(() => {
    requestAnimationFrame(() => {
      mounted = true;
      trackHomeFunnel('hero_view', 'view', { story: 'clean-hierarchy-immediate-start' });
    });

    function onPointer(event: PointerEvent) {
      setCursor(event.clientX, event.clientY);
    }

    function onTouch(event: TouchEvent) {
      const touch = event.touches[0];
      if (touch) setCursor(touch.clientX, touch.clientY);
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
  <title>Cogochi — Your Personal Market Memory</title>
  <meta
    name="description"
    content="Cogochi stores how you judge the market, watches for similar setups, and only reflects stronger decisions back to you."
  />
  <meta property="og:title" content="Cogochi — Your Personal Market Memory" />
  <meta
    property="og:description"
    content="Per-user market memory for traders. Save your judgment once, then let Cogochi bring similar moments back with proof."
  />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="/" />
</svelte:head>

<WebGLAsciiBackground {mouseX} {mouseY} />

<div class="page">
  <HomeHero
    {mounted}
    promptText={promptText}
    examplePrompts={HOME_EXAMPLE_PROMPTS}
    proofRows={HOME_PROOF_ROWS}
    {mx}
    {my}
    onPromptInput={(value: string) => { promptText = value; }}
    onPromptSubmit={handlePromptSubmit}
    onPickPrompt={handlePromptChip}
    onOpen={openPath}
  />

  <HomeLearningLoop steps={HOME_LEARNING_STEPS} />
  <HomeSurfaceCards surfaces={HOME_SURFACES} onOpen={openPath} />
  <HomeFinalCta onOpen={openPath} />
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
    --home-black: #070707;
    --home-salmon: #ff7f85;
    --home-apricot: #f9d8c2;
    --home-paper: #faf7eb;
    --home-cream: #f9f6f1;
    --home-rose: #ec9393;
    --home-accent: #db9a9f;
    --home-accent-rgb: 219, 154, 159;
    --home-accent-strong-rgb: 255, 127, 133;
    background:
      radial-gradient(circle at 86% 14%, rgba(249, 216, 194, 0.06), transparent 16%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.16) 42%, rgba(0, 0, 0, 0.3) 100%);
  }

  .page::before {
    content: '';
    position: fixed;
    inset: -8%;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(circle at 84% 20%, rgba(249, 216, 194, 0.05), transparent 16%);
    filter: blur(46px) saturate(1);
    opacity: 0.42;
  }

  @media (max-width: 768px) {
    .page {
      background:
        radial-gradient(circle at 84% 14%, rgba(249, 216, 194, 0.05), transparent 16%),
        linear-gradient(180deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.26) 100%);
    }
  }
</style>
