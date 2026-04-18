<script lang="ts">
  import { page } from '$app/stores';
  import { MOBILE_NAV_SURFACES, isAppSurfaceActive } from '$lib/navigation/appSurfaces';

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
</script>

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
</nav>

<style>
  .mobile-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--sc-z-sticky, 140);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    height: calc(var(--sc-mobile-nav-h, 68px) + env(safe-area-inset-bottom, 0px));
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
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
    border: 1px solid rgba(249, 216, 194, 0.06);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.025);
    color: rgba(250, 247, 235, 0.44);
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

  .mobile-nav-item:active {
    transform: scale(0.96);
  }

  /* Highlight tab (LAB) */
  .mobile-nav-item.highlight {
    color: rgba(var(--home-ref-accent-rgb, 219, 154, 159), 0.78);
  }

  /* Active state */
  .mobile-nav-item.active {
    color: rgba(250, 247, 235, 0.96);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025));
    border-color: rgba(249, 216, 194, 0.11);
  }

  .mobile-nav-item.active::after {
    content: '';
    position: absolute;
    top: 7px;
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
    font-size: 15px;
    line-height: 1;
  }

  .label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .star {
    margin-left: 2px;
    font-size: 9px;
  }

  .badge {
    position: absolute;
    top: 7px;
    right: calc(50% - 22px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--sc-accent);
    color: #0f0f12;
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
  }
</style>
