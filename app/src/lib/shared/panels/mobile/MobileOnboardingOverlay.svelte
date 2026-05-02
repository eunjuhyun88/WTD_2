<script lang="ts">
  /**
   * MobileOnboardingOverlay — first-paint overlay on ChartMode.
   *
   * Shows on first visit (localStorage key: cogochi.mobileOnboarded = 'v1').
   * Dismissed by:
   *   - Clicking the "시작" button
   *   - Clicking X (top-right)
   *   - Tapping the dark scrim outside the sheet
   *
   * Design (W-0087 Terminal Brutalism with Precision):
   *   - Mono grid background (chart-paper pattern)
   *   - Dark scrim overlay
   *   - 200ms slide-up transition
   *   - 3 numbered steps, mono typography
   *   - Full-width 56px "시작" CTA
   *   - No confetti, no emoji, no bounce
   */

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  const STORAGE_KEY = 'cogochi.mobileOnboarded';
  const STORAGE_VERSION = 'v1';

  let visible = $state(false);
  let mounted = $state(false);

  const STEPS = [
    {
      num: '01',
      text: 'View the chart and drag a range',
    },
    {
      num: '02',
      text: 'Capture it with Save Setup',
    },
    {
      num: '03',
      text: 'AI finds the same structure in other coins',
    },
  ];

  onMount(() => {
    mounted = true;
    if (browser) {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== STORAGE_VERSION) {
        // Slight delay so the chart renders first — feels less jarring
        const t = setTimeout(() => { visible = true; }, 120);
        return () => clearTimeout(t);
      }
    }
  });

  function dismiss() {
    visible = false;
    if (browser) {
      localStorage.setItem(STORAGE_KEY, STORAGE_VERSION);
    }
  }

  function handleScrimClick(e: MouseEvent) {
    // Only dismiss if clicking the scrim itself, not the sheet
    if ((e.target as HTMLElement).classList.contains('scrim')) {
      dismiss();
    }
  }

  function handleScrimKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dismiss();
  }
</script>

{#if visible}
  <!-- Scrim: covers full viewport above chart -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="scrim"
    role="dialog"
    aria-modal="true"
    aria-label="Getting started"
    tabindex="-1"
    onclick={handleScrimClick}
    onkeydown={handleScrimKeydown}
  >
    <div class="sheet" role="document">
      <!-- X close button -->
      <button class="close-btn" onclick={dismiss} aria-label="Close" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <!-- App mark -->
      <p class="app-mark">COGOTCHI</p>

      <!-- Steps -->
      <ol class="steps" aria-label="Getting started steps">
        {#each STEPS as step, i}
          <li class="step">
            <span class="step-num" aria-hidden="true">{step.num}</span>
            <span class="step-text">{step.text}</span>
          </li>
        {/each}
      </ol>

      <!-- Primary CTA -->
      <button class="start-btn" onclick={dismiss} type="button">
        Start
      </button>
    </div>
  </div>
{/if}

<style>
  /* ── Scrim ── */
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: flex-end;
    /* Prevent scroll bleed */
    overflow: hidden;
  }

  /* ── Sheet: slides up from bottom ── */
  .sheet {
    width: 100%;
    position: relative;
    /* Chart-paper ambient grid background, matches MobileEmptyState */
    background-image:
      linear-gradient(rgba(247, 242, 234, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(247, 242, 234, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
    background-color: var(--sc-terminal-bg, #0a0c10);
    border-top: 1px solid rgba(247, 242, 234, 0.1);
    border-radius: 12px 12px 0 0;
    padding: 28px 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 0;

    /* 200ms slide-up transition */
    animation: slide-up 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
      opacity: 0.6;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* ── X close button (top-right) ── */
  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.38));
    cursor: pointer;
    padding: 0;
    transition: color 0.12s;
  }

  .close-btn:active {
    color: var(--sc-text-0, rgba(247, 242, 234, 0.98));
  }

  /* ── App mark ── */
  .app-mark {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.38));
    text-transform: uppercase;
    margin: 0 0 24px;
  }

  /* ── Steps ── */
  .steps {
    list-style: none;
    padding: 0;
    margin: 0 0 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .step-num {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--sc-accent, #FF6B35);
    line-height: 1.8;
    flex-shrink: 0;
    width: 24px;
  }

  .step-text {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 16px;
    font-weight: 700;
    line-height: 1.45;
    color: var(--sc-text-0, rgba(247, 242, 234, 0.98));
    letter-spacing: -0.01em;
  }

  /* ── Primary CTA: full-width 56px ── */
  .start-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 56px;
    border: none;
    border-radius: 6px;
    background: var(--sc-accent, #FF6B35);
    color: #000;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .start-btn:active {
    opacity: 0.82;
  }
</style>
