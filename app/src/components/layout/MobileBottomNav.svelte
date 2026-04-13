<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { MOBILE_NAV_SURFACES, isAppSurfaceActive } from '$lib/navigation/appSurfaces';
  import { buildDeepLink } from '$lib/utils/deepLinks';

  type NavItem = {
    id: import('$lib/navigation/appSurfaces').AppSurfaceId;
    label: string;
    icon: string;
    href: string;
    badge?: number;
    highlight?: boolean;
  };

  const activePath = $derived($page.url.pathname);

  const items = $derived<NavItem[]>(
    MOBILE_NAV_SURFACES.map((surface) => ({
      id: surface.id,
      label: surface.label,
      icon: surface.mobileIcon,
      href: surface.href,
      badge: undefined,
      highlight: surface.highlight === true,
    }))
  );

  // "More" sheet state
  let moreOpen = $state(false);

  const moreItems = [
    { label: 'Lab', icon: '⚗', href: '/lab', highlight: true },
    { label: 'Scanner', icon: '⊞', href: '/terminal' },
    { label: 'Settings', icon: '⚙', href: '/settings' },
  ];

  function handleMore() {
    moreOpen = !moreOpen;
  }

  function closeMore() {
    moreOpen = false;
  }

  function handleMoreNav(href: string) {
    closeMore();
    goto(buildDeepLink(href));
  }

  // Close more sheet on route change
  $effect(() => {
    activePath;
    moreOpen = false;
  });

  const isMoreActive = $derived(
    activePath.startsWith('/lab') || activePath.startsWith('/settings') || activePath.startsWith('/scanner')
  );
</script>

<!-- Bottom sheet backdrop -->
{#if moreOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="more-backdrop" onclick={closeMore}></div>
  <div class="more-sheet">
    <div class="more-sheet-handle"></div>
    <div class="more-sheet-title">More</div>
    <div class="more-sheet-items">
      {#each moreItems as item}
        <button class="more-sheet-item" class:highlight={item.highlight} onclick={() => handleMoreNav(item.href)}>
          <span class="more-icon">{item.icon}</span>
          <span class="more-label">{item.label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<nav class="mobile-nav" aria-label="Primary mobile navigation">
  {#each items as item (item.id)}
    <a
      class="mobile-nav-item"
      class:active={isAppSurfaceActive(item.id, activePath)}
      class:highlight={item.highlight}
      aria-current={isAppSurfaceActive(item.id, activePath) ? 'page' : undefined}
      href={item.href}
    >
      <span class="icon" aria-hidden="true">{item.icon}</span>
      <span class="label">{item.label}{#if item.highlight}<span class="star">&#9733;</span>{/if}</span>
      {#if item.badge}
        <span class="badge">{item.badge > 99 ? '99+' : item.badge}</span>
      {/if}
    </a>
  {/each}
  <!-- More button -->
  <button
    class="mobile-nav-item more-btn"
    class:active={isMoreActive}
    onclick={handleMore}
    aria-label="More options"
  >
    <span class="icon" aria-hidden="true">···</span>
    <span class="label">More</span>
  </button>
</nav>

<style>
  /* ── Bottom Sheet ── */
  .more-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--sc-z-sticky, 140) + 10);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .more-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--sc-mobile-nav-h, 68px) + env(safe-area-inset-bottom, 0px));
    z-index: calc(var(--sc-z-sticky, 140) + 11);
    background:
      linear-gradient(180deg, rgba(14, 14, 16, 0.98), rgba(8, 8, 10, 0.99));
    border: 1px solid rgba(249, 216, 194, 0.09);
    border-bottom: none;
    border-radius: 20px 20px 0 0;
    padding: 8px 16px 20px;
    animation: sc-slide-up 180ms var(--sc-ease) both;
  }

  .more-sheet-handle {
    width: 32px;
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    margin: 4px auto 12px;
  }

  .more-sheet-title {
    font-family: var(--sc-font-body);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sc-text-3);
    margin-bottom: 8px;
    padding: 0 4px;
  }

  .more-sheet-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .more-sheet-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    border: none;
    background: none;
    color: var(--sc-text-1);
    font-family: var(--sc-font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--sc-duration-fast), color var(--sc-duration-fast);
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .more-sheet-item:hover,
  .more-sheet-item:active {
    background: rgba(255, 255, 255, 0.05);
    color: var(--sc-text-0);
  }

  .more-sheet-item.highlight {
    color: var(--sc-accent);
  }

  .more-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  /* ── Nav ── */
  .mobile-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--sc-z-sticky, 140);
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    height: calc(var(--sc-mobile-nav-h, 68px) + env(safe-area-inset-bottom, 0px));
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
    background:
      linear-gradient(180deg, rgba(8, 8, 10, 0.94), rgba(5, 5, 7, 0.96)),
      radial-gradient(circle at center top, rgba(249, 216, 194, 0.035), transparent 40%);
    border-top: 1px solid rgba(249, 216, 194, 0.07);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  .mobile-nav-item {
    position: relative;
    display: grid;
    place-items: center;
    gap: 4px;
    border: 1px solid rgba(249, 216, 194, 0.05);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.02);
    color: rgba(250, 247, 235, 0.38);
    font-family: var(--sc-font-body);
    font-weight: 600;
    cursor: pointer;
    min-height: 48px;
    text-decoration: none;
    transition:
      color 100ms ease,
      background 100ms ease,
      border-color 100ms ease,
      transform 80ms ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .more-btn {
    border: none;
    background: none;
  }

  .mobile-nav-item:active {
    transform: scale(0.95);
  }

  /* Highlight tab (LAB) */
  .mobile-nav-item.highlight {
    color: rgba(var(--home-ref-accent-rgb, 219, 154, 159), 0.78);
  }

  /* Active state */
  .mobile-nav-item.active {
    color: rgba(250, 247, 235, 0.96);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025));
    border-color: rgba(249, 216, 194, 0.10);
  }

  .mobile-nav-item.active::after {
    content: '';
    position: absolute;
    top: 6px;
    left: 28%;
    right: 28%;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(219, 154, 159, 0.9), rgba(249, 216, 194, 0.7));
  }

  .mobile-nav-item.active.highlight {
    color: var(--sc-accent);
  }
  .mobile-nav-item.active.highlight::after {
    background: var(--sc-accent);
  }

  .icon {
    font-size: 14px;
    line-height: 1;
  }

  .label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .star {
    margin-left: 2px;
    font-size: 8px;
  }

  .badge {
    position: absolute;
    top: 6px;
    right: calc(50% - 20px);
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--sc-accent);
    color: #0f0f12;
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
  }
</style>
