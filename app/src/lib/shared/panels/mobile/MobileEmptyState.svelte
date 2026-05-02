<script lang="ts">
  /**
   * MobileEmptyState — reusable empty-state block for all 4 mobile modes.
   * Design rules (W-0087 Terminal Brutalism with Precision):
   *   - Big headline: clamp(24px, 6vw, 32px), mono, bold
   *   - Subline: 14px body grey
   *   - Grid-line ambient background using CSS linear-gradient cross pattern
   *   - Primary CTA: filled accent button, min 56px height
   *   - Secondary: text link
   *   - 44pt touch targets minimum
   */

  interface Cta {
    label: string;
    onClick: () => void;
  }

  interface Props {
    icon?: 'bell' | 'chart' | 'search' | 'refresh';
    headline: string;
    subline: string;
    primaryCta?: Cta;
    secondaryCta?: Cta;
  }

  let { icon, headline, subline, primaryCta, secondaryCta }: Props = $props();
</script>

<div class="empty-state" role="status" aria-label={headline}>
  <!-- Chart-paper ambient background rendered via CSS; no DOM element needed -->

  <div class="inner">
    {#if icon === 'bell'}
      <!-- Bell icon — mono-stroke -->
      <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    {:else if icon === 'chart'}
      <!-- Chart / candlestick stub icon -->
      <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="18" y1="3" x2="18" y2="21"/>
        <line x1="6" y1="3" x2="6" y2="21"/>
        <rect x="4" y="7" width="4" height="10" rx="1"/>
        <rect x="16" y="5" width="4" height="8" rx="1"/>
        <line x1="12" y1="5" x2="12" y2="19"/>
        <rect x="10" y="9" width="4" height="7" rx="1"/>
      </svg>
    {:else if icon === 'search'}
      <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    {:else if icon === 'refresh'}
      <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    {/if}

    <h2 class="headline">{headline}</h2>
    <p class="subline">{subline}</p>

    {#if primaryCta}
      <button class="primary-cta" onclick={primaryCta.onClick} type="button">
        {primaryCta.label}
      </button>
    {/if}

    {#if secondaryCta}
      <button class="secondary-cta" onclick={secondaryCta.onClick} type="button">
        {secondaryCta.label}
      </button>
    {/if}
  </div>
</div>

<style>
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 220px;
    padding: 32px 24px;
    /* Chart-paper ambient: 1px grid lines every 32px at ~4% opacity */
    background-image:
      linear-gradient(rgba(247, 242, 234, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(247, 242, 234, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
    background-color: var(--sc-terminal-bg, #0a0c10);
  }

  .inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
    max-width: 320px;
    width: 100%;
  }

  .state-icon {
    width: 40px;
    height: 40px;
    color: rgba(247, 242, 234, 0.22);
    flex-shrink: 0;
  }

  .headline {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    /* clamp(24px, 6vw, 32px) per spec */
    font-size: clamp(24px, 6vw, 32px);
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--sc-text-0, rgba(247, 242, 234, 0.98));
    margin: 0;
  }

  .subline {
    /* 14px body text, grey */
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--sc-text-2, rgba(247, 242, 234, 0.55));
    margin: 0;
  }

  /* Primary CTA: filled accent, 56px min height, mono font, full width */
  .primary-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 56px;
    margin-top: 8px;
    padding: 0 20px;
    border-radius: 6px;
    border: none;
    /* Brutalism accent: use token with orange fallback per spec */
    background: var(--sc-accent, #FF6B35);
    color: #000;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    /* 44pt touch target already satisfied by min-height: 56px */
    transition: opacity 0.15s;
  }

  .primary-cta:active {
    opacity: 0.82;
  }

  /* Secondary CTA: text-link style */
  .secondary-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 12px;
    background: none;
    border: none;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-2, rgba(247, 242, 234, 0.55));
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 0.15s;
  }

  .secondary-cta:active {
    color: var(--sc-text-0, rgba(247, 242, 234, 0.98));
  }
</style>
