<script lang="ts">
  import { page } from '$app/stores';

  const activePath = $derived($page.url.pathname);

  const items = [
    { label: 'Home',      href: '/',          icon: 'home'      },
    { label: 'Terminal',  href: '/cogochi',   icon: 'terminal'  },
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Lab',       href: '/lab',       icon: 'lab'       },
    { label: 'Market',    href: '/market',    icon: 'market'    },
  ];

  function active(href: string) {
    if (href === '/') return activePath === '/';
    if (href === '/cogochi') return activePath.startsWith('/terminal') || activePath.startsWith('/cogochi');
    return activePath === href || activePath.startsWith(href + '/');
  }
</script>

<nav class="mobile-nav" aria-label="Mobile navigation">
  {#each items as item}
    <a
      class="nav-item"
      class:active={active(item.href)}
      href={item.href}
      aria-label={item.label}
      aria-current={active(item.href) ? 'page' : undefined}
    >
      <span class="nav-icon" aria-hidden="true">
        {#if item.icon === 'home'}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 8L9 2L16 8V16H12V12H6V16H2V8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
        {:else if item.icon === 'terminal'}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <polyline points="3,6 7,9 3,12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        {:else if item.icon === 'dashboard'}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          </svg>
        {:else if item.icon === 'lab'}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M7 2V8.5L3 15H15L11 8.5V2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="6" y1="2" x2="12" y2="2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        {:else if item.icon === 'market'}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="5" y="7" width="2.5" height="7" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
            <rect x="10.5" y="4" width="2.5" height="10" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
            <line x1="6.25" y1="5" x2="6.25" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <line x1="11.75" y1="2" x2="11.75" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        {/if}
      </span>
      <span class="nav-label">{item.label}</span>
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
    height: calc(56px + env(safe-area-inset-bottom, 0px));
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    background:
      linear-gradient(180deg, rgba(8, 8, 10, 0.96), rgba(5, 5, 7, 0.98));
    border-top: 1px solid rgba(249, 216, 194, 0.07);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: 10px;
    color: rgba(250, 247, 235, 0.3);
    text-decoration: none;
    transition: color 0.12s, background 0.12s;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    padding: 4px 2px;
  }

  .nav-item:active {
    transform: scale(0.94);
  }

  .nav-item.active {
    color: rgba(250, 247, 235, 0.95);
    background: rgba(255, 255, 255, 0.06);
  }

  .nav-item.active .nav-icon::after {
    content: '';
    display: block;
    width: 16px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(219, 154, 159, 0.9), rgba(249, 216, 194, 0.6));
    margin: 2px auto 0;
  }

  .nav-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }

  .nav-label {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
