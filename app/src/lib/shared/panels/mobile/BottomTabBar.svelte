<script lang="ts">
  import { mobileMode, type MobileMode } from '$lib/stores/mobileMode';

  // Icons for each tab (inline SVG paths for zero-dependency)
  const TABS: { id: MobileMode; label: string }[] = [
    { id: 'chart',  label: 'Chart' },
    { id: 'detail', label: 'Detail' },
    { id: 'scan',   label: 'Scan' },
    { id: 'judge',  label: 'Judge' },
  ];
</script>

<nav class="bottom-tab-bar" aria-label="Mobile navigation">
  {#each TABS as tab}
    <button
      class="tab-btn"
      class:active={$mobileMode.active === tab.id}
      onclick={() => mobileMode.setActive(tab.id)}
      aria-label={tab.label}
      aria-current={$mobileMode.active === tab.id ? 'page' : undefined}
    >
      {#if tab.id === 'chart'}
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <polyline points="3 17 9 11 13 15 21 7"/>
          <line x1="3" y1="21" x2="21" y2="21"/>
        </svg>
      {:else if tab.id === 'detail'}
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      {:else if tab.id === 'scan'}
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      {:else if tab.id === 'judge'}
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      {/if}
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .bottom-tab-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--sc-bg-1, #0a0c10);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .tab-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 56px;
    border: none;
    background: none;
    color: var(--sc-text-3, rgba(255,255,255,0.35));
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
    /* Ensure 44pt touch target per spec */
    min-width: 44px;
  }

  .tab-btn.active {
    color: rgba(247, 242, 234, 0.95);
  }

  .tab-btn:active {
    opacity: 0.7;
  }

  .tab-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .tab-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1;
  }
</style>
