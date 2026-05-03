<script lang="ts">
  import { page } from '$app/stores';
  import { inboxCount } from '$lib/stores/inboxCountStore';

  const activePath = $derived($page.url.pathname);
  const pendingCount = $derived($inboxCount);

  function active(href: string) {
    if (href === '/cogochi') return activePath.startsWith('/terminal') || activePath.startsWith('/cogochi');
    return activePath === href || activePath.startsWith(href + '/');
  }

  const primary = [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/cogochi', label: 'Terminal', icon: 'terminal' },
    { href: '/patterns', label: 'Patterns', icon: 'patterns' },
    { href: '/lab', label: 'Lab', icon: 'lab' },
  ];

  const util = [
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];
</script>

<nav class="nav-rail" aria-label="App navigation">
  <a class="rail-logo" href="/" title="Cogochi Home" aria-label="Home">
    <span class="logo-mark">C</span>
  </a>

  <div class="rail-sep"></div>

  <div class="rail-primary">
    {#each primary as item}
      <a
        class="rail-item"
        class:active={active(item.href)}
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={active(item.href) ? 'page' : undefined}
      >
        <span class="rail-icon" aria-hidden="true">
          {#if item.icon === 'home'}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 7L8 2L14 7V14H10V10H6V14H2V7Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            </svg>
          {:else if item.icon === 'terminal'}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <polyline points="2,5 6,8 2,11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="8" y1="11" x2="14" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          {:else if item.icon === 'patterns'}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <polygon points="8,2 14,8 8,14 2,8" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            {#if pendingCount >= 10}
              <span class="inbox-dot" aria-label="{pendingCount} pending verdicts"></span>
            {/if}
          {:else if item.icon === 'lab'}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2V7.5L2.5 13.5H13.5L10 7.5V2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="5" y1="2" x2="11" y2="2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <circle cx="6.5" cy="11" r="1" fill="currentColor" opacity="0.6"/>
            </svg>
          {/if}
        </span>
        <span class="rail-label">{item.label}</span>
      </a>
    {/each}
  </div>

  <div class="rail-bottom">
    {#each util as item}
      <a
        class="rail-item"
        class:active={active(item.href)}
        href={item.href}
        title={item.label}
        aria-label={item.label}
      >
        <span class="rail-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="rail-label">{item.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  .nav-rail {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: var(--sc-z-header, 180);
    width: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    background:
      radial-gradient(circle at 50% 0%, rgba(219, 154, 159, 0.04), transparent 50%),
      linear-gradient(180deg, rgba(10, 10, 11, 0.98), rgba(6, 6, 7, 0.98));
    border-right: 1px solid rgba(249, 216, 194, 0.07);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    padding: 8px 0;
    gap: 0;
  }

  .rail-logo {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    text-decoration: none;
    margin-bottom: 4px;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .rail-logo:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .logo-mark {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 15px;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.9);
    letter-spacing: 0.02em;
  }

  .rail-sep {
    width: 20px;
    height: 1px;
    background: rgba(249, 216, 194, 0.08);
    margin: 4px 0 6px;
    flex-shrink: 0;
  }

  .rail-primary {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
    width: 100%;
    padding: 0 8px;
    overflow: hidden;
  }

  .rail-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    padding: 8px 8px 0;
    border-top: 1px solid rgba(249, 216, 194, 0.06);
    margin-top: 4px;
    flex-shrink: 0;
  }

  .rail-item {
    position: relative;
    width: 36px;
    height: 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: 10px;
    color: rgba(250, 247, 235, 0.32);
    text-decoration: none;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .rail-item:hover {
    color: rgba(250, 247, 235, 0.72);
    background: rgba(255, 255, 255, 0.05);
  }

  .rail-item.active {
    color: rgba(250, 247, 235, 0.96);
    background: rgba(255, 255, 255, 0.07);
  }

  .rail-item.active::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 16px;
    border-radius: 0 2px 2px 0;
    background: linear-gradient(180deg, rgba(219, 154, 159, 0.9), rgba(249, 216, 194, 0.7));
  }

  .rail-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .rail-label {
    display: none;
  }

  .inbox-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(219, 154, 159, 0.9);
    box-shadow: 0 0 5px rgba(219, 154, 159, 0.5);
    pointer-events: none;
  }

  @media (max-width: 768px) {
    .nav-rail {
      display: none;
    }
  }
</style>
