<script lang="ts">
  /**
   * MobileHomeHero — mobile-only hero page.
   * Single column, no WebGL, H1 at 28px.
   * Empty submit → goto('/terminal'); filled → goto('/terminal?q=...')
   *
   * Layout per W-0087:
   *   - slim app mark + sign-in at 44px
   *   - H1 28px thesis + 18px sub
   *   - full-width start input + Open Terminal CTA + text link secondary
   *   - vertical 3-step loop (01 Capture / 02 Scan / 03 Judge★)
   *   - surface map vertical list
   *   - NO WebGL background
   */

  import { goto } from '$app/navigation';
  import type { SurfaceCard } from '$lib/home/homeLanding';

  interface Props {
    mounted?: boolean;
    promptText?: string;
    surfaces?: SurfaceCard[];
    onPromptInput?: (value: string) => void;
  }

  let {
    mounted = false,
    promptText = '',
    surfaces = [],
    onPromptInput,
  }: Props = $props();

  let inputText = $state('');

  $effect(() => {
    inputText = promptText;
  });

  function handleInput(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value;
    inputText = val;
    onPromptInput?.(val);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const text = inputText.trim();
    if (!text) {
      void goto('/terminal');
    } else {
      void goto(`/terminal?q=${encodeURIComponent(text)}`);
    }
  }

  const LOOP_STEPS = [
    { num: '01', label: 'Capture', desc: 'Save a setup from the chart', emphasized: false },
    { num: '02', label: 'Scan',    desc: 'Auto-detect similar setups', emphasized: false },
    { num: '03', label: 'Judge',   desc: 'Record your verdict — and the next opportunity comes first', emphasized: true },
  ] as const;
</script>

<div class="mobile-hero" class:mounted>
  <!-- Thesis -->
  <div class="thesis-block">
    <h1 class="thesis-h1">Markets move on.<br/>Your judgment<br/>should stay.</h1>
    <p class="thesis-sub">
      Cogochi saves the way you judge setups,
      and surfaces them first when a similar moment comes back.
    </p>
  </div>

  <!-- Start input + CTA -->
  <form class="start-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <div class="input-row">
      <span class="input-prefix">&gt;</span>
      <input
        class="start-input"
        type="text"
        value={inputText}
        oninput={handleInput}
        onkeydown={handleKeydown}
        placeholder="btc 4h retest breakout"
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
      />
    </div>

    <button type="submit" class="cta-primary">
      Open Terminal
    </button>

    <button
      type="button"
      class="cta-secondary"
      onclick={() => void goto('/lab')}
    >
      View strategy evaluation in Lab
    </button>
  </form>

  <!-- 3-step loop -->
  <div class="loop-section">
    <p class="loop-eyebrow">CORE LOOP</p>
    <div class="loop-steps">
      {#each LOOP_STEPS as step}
        <div class="loop-step" class:emphasized={step.emphasized}>
          <div class="step-num">{step.num}</div>
          <div class="step-body">
            <strong class="step-label">
              {step.label}
              {#if step.emphasized}
                <span class="star-badge">★</span>
              {/if}
            </strong>
            <p class="step-desc">{step.desc}</p>
          </div>
          {#if step.num !== '03'}
            <div class="step-arrow">↓</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Surface map -->
  {#if surfaces.length > 0}
    <div class="surface-section">
      <p class="surface-eyebrow">SURFACES</p>
      <div class="surface-list">
        {#each surfaces as surface}
          <button
            class="surface-row"
            onclick={() => void goto(surface.path)}
          >
            <div class="surface-left">
              <span class="surface-label">{surface.label}</span>
              <span class="surface-title">{surface.title}</span>
            </div>
            <svg class="surface-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .mobile-hero {
    display: flex;
    flex-direction: column;
    min-height: 100svh;
    padding: 0 0 env(safe-area-inset-bottom);
    background: transparent;
    font-family: var(--sc-font-body);
    color: var(--sc-text-0, rgba(247, 242, 234, 0.98));
  }

  /* Thesis */
  .thesis-block {
    padding: 20px 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .thesis-h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1.14;
    letter-spacing: -0.04em;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.98);
  }

  .thesis-sub {
    margin: 0;
    font-size: 18px;
    line-height: 1.6;
    color: rgba(250, 247, 235, 0.7);
  }

  /* Start form */
  .start-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 18px 28px;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(249, 216, 194, 0.28);
    background: rgba(255, 255, 255, 0.05);
  }

  .input-prefix {
    font-family: var(--sc-font-mono);
    font-size: 14px;
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.9);
    flex-shrink: 0;
  }

  .start-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    font-family: var(--sc-font-body);
    font-size: 15px;
    color: rgba(255, 247, 244, 0.96);
    /* Match min touch target height */
    min-height: 24px;
    -webkit-appearance: none;
    appearance: none;
  }

  .start-input::placeholder {
    color: rgba(255, 247, 244, 0.35);
  }

  .cta-primary {
    width: 100%;
    height: 54px;
    border-radius: 14px;
    border: 1px solid rgba(236, 147, 147, 0.36);
    background: linear-gradient(180deg, rgba(249, 216, 194, 0.96), rgba(219, 154, 159, 0.92));
    color: #171214;
    font-family: var(--sc-font-body);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .cta-secondary {
    background: none;
    border: none;
    font-family: var(--sc-font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: rgba(250, 247, 235, 0.45);
    cursor: pointer;
    text-align: center;
    padding: 8px 0;
    min-height: 44px;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(250, 247, 235, 0.2);
  }

  /* Loop section */
  .loop-section {
    padding: 0 18px 28px;
  }

  .loop-eyebrow,
  .surface-eyebrow {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.5);
    margin: 0 0 14px;
  }

  .loop-steps {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .loop-step {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 14px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    margin-bottom: 8px;
    position: relative;
  }

  .loop-step.emphasized {
    border-color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.28);
    background: rgba(var(--home-accent-rgb, 219, 154, 159), 0.04);
  }

  .step-num {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.6);
    flex-shrink: 0;
    padding-top: 1px;
  }

  .step-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
  }

  .step-label {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(250, 247, 235, 0.95);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .star-badge {
    font-size: 13px;
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.9);
  }

  .step-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(250, 247, 235, 0.55);
  }

  .step-arrow {
    font-size: 14px;
    color: rgba(250, 247, 235, 0.25);
    position: absolute;
    bottom: -16px;
    left: 18px;
    z-index: 1;
  }

  /* Surface map */
  .surface-section {
    padding: 0 18px calc(28px + env(safe-area-inset-bottom));
  }

  .surface-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }

  .surface-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(10, 12, 16, 0.96);
    border: none;
    cursor: pointer;
    text-align: left;
    /* 44pt touch target */
    min-height: 56px;
    width: 100%;
    transition: background 0.1s;
  }

  .surface-row:active {
    background: rgba(255, 255, 255, 0.04);
  }

  .surface-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .surface-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.55);
  }

  .surface-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(250, 247, 235, 0.88);
  }

  .surface-arrow {
    width: 16px;
    height: 16px;
    color: rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }
</style>
