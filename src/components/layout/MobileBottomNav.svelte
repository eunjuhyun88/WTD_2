<script lang="ts">
  import { page } from '$app/stores';
  import { openTradeCount } from '$lib/stores/quickTradeStore';
  import { MOBILE_NAV_SURFACES, isAppSurfaceActive } from '$lib/navigation/appSurfaces';

  type NavItem = {
    id: import('$lib/navigation/appSurfaces').AppSurfaceId;
    label: string;
    icon: string;
    href: string;
    badge?: number;
  };

  const activePath = $derived($page.url.pathname);
  const openPositions = $derived($openTradeCount);

  const items = $derived<NavItem[]>(
    MOBILE_NAV_SURFACES.map((surface) => ({
      id: surface.id,
      label: surface.label,
      icon: surface.mobileIcon,
      href: surface.href,
      badge: surface.id === 'agent' ? (openPositions > 0 ? openPositions : undefined) : undefined,
    }))
  );
</script>

<nav class="mobile-nav" aria-label="Primary mobile navigation">
  {#each items as item (item.id)}
    <a
      class="mobile-nav-item"
      class:active={isAppSurfaceActive(item.id, activePath)}
      aria-current={isAppSurfaceActive(item.id, activePath) ? 'page' : undefined}
      href={item.href}
    >
      <span class="icon" aria-hidden="true">{item.icon}</span>
      <span class="label">{item.label}</span>
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
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0;
    height: calc(var(--sc-mobile-nav-h, 64px) + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background:
      radial-gradient(circle at 15% 100%, rgba(255, 118, 181, 0.14), transparent 34%),
      radial-gradient(circle at 85% 100%, rgba(186, 240, 106, 0.12), transparent 32%),
      linear-gradient(180deg, rgba(12, 18, 30, 0.96), rgba(9, 14, 24, 0.96));
    border-top: 1px solid rgba(255, 127, 186, 0.18);
    backdrop-filter: blur(18px);
  }

  .mobile-nav-item {
    position: relative;
    display: grid;
    place-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-family: var(--sc-font-body);
    font-weight: 600;
    cursor: pointer;
    min-height: var(--sc-mobile-nav-h, 64px);
    text-decoration: none;
    transition: color var(--sc-duration-fast), background var(--sc-duration-fast);
  }

  .mobile-nav-item.active {
    color: #fff3dc;
    background: rgba(255, 118, 181, 0.08);
  }

  .mobile-nav-item.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 18%;
    right: 18%;
    height: 2px;
    border-radius: 0 0 999px 999px;
    background: linear-gradient(90deg, rgba(255, 118, 181, 0.82), rgba(255, 217, 122, 0.62), rgba(186, 240, 106, 0.68));
    box-shadow: 0 0 8px rgba(255, 118, 181, 0.18);
  }

  .icon {
    font-size: 13px;
    line-height: 1;
  }

  .label {
    font-size: 8px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .badge {
    position: absolute;
    top: 8px;
    right: calc(50% - 22px);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ffe57d;
    color: #182015;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
  }
</style>
