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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    height: calc(var(--sc-mobile-nav-h, 74px) + env(safe-area-inset-bottom, 0px));
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    background:
      linear-gradient(180deg, rgba(10, 10, 11, 0.9), rgba(6, 6, 7, 0.92)),
      radial-gradient(circle at center top, rgba(249, 216, 194, 0.04), transparent 42%);
    border-top: 1px solid rgba(249, 216, 194, 0.08);
    backdrop-filter: blur(18px);
  }

  .mobile-nav-item {
    position: relative;
    display: grid;
    place-items: center;
    gap: 6px;
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.52);
    font-family: var(--sc-font-body);
    font-weight: 600;
    cursor: pointer;
    min-height: 56px;
    text-decoration: none;
    transition: color var(--sc-duration-fast), background var(--sc-duration-fast), transform var(--sc-duration-fast);
  }

  /* Highlight tab (LAB) — accent color even when inactive */
  .mobile-nav-item.highlight {
    color: rgba(var(--home-ref-accent-rgb, 219, 154, 159), 0.88);
  }

  /* Active state */
  .mobile-nav-item.active {
    color: rgba(250, 247, 235, 0.96);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
    transform: translateY(-1px);
  }

  .mobile-nav-item.active::before {
    content: '';
    position: absolute;
    top: 6px;
    left: 22%;
    right: 22%;
    height: 1px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--sc-accent), var(--sc-accent-3));
    box-shadow: none;
  }

  /* Active + highlight = accent color text */
  .mobile-nav-item.active.highlight {
    color: var(--sc-accent);
  }
  .mobile-nav-item.active.highlight::before {
    background: var(--sc-accent);
  }

  .icon {
    font-size: 14px;
    line-height: 1;
  }

  .label {
    font-size: 11px;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }

  .star {
    margin-left: 2px;
    font-size: 9px;
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
    background: var(--sc-accent-3);
    color: #182015;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
  }
</style>
