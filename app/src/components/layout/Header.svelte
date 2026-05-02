<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { terminalState } from '$lib/stores/terminalState';
  import { walletStore, isWalletConnected } from '$lib/stores/walletStore';
  import { openWalletModal } from '$lib/stores/walletModalStore';
  import { hydrateAuthSession } from '$lib/stores/walletStore';
  import { hydrateDomainStores } from '$lib/stores/hydration';
  import { buildDeepLink } from '$lib/utils/deepLinks';
  import { DESKTOP_NAV_SURFACES, isAppSurfaceActive } from '$lib/navigation/appSurfaces';

  const wallet = $derived($walletStore);
  const connected = $derived($isWalletConnected);
  const activePath = $derived($page.url.pathname);
  const isHomeRoute = $derived(activePath === '/');

  onMount(() => {
    void (async () => {
      await hydrateAuthSession();
      await hydrateDomainStores();
    })();
  });

  function isActive(id: import('$lib/navigation/appSurfaces').AppSurfaceId): boolean {
    return isAppSurfaceActive(id, activePath);
  }

  let profileDropdownOpen = $state(false);

  function toggleProfileDropdown() {
    profileDropdownOpen = !profileDropdownOpen;
  }

  function closeProfileDropdown() {
    profileDropdownOpen = false;
  }

  function handleProfileNav(path: string) {
    closeProfileDropdown();
    goto(path);
  }

  $effect(() => {
    activePath;
    if (profileDropdownOpen) {
      closeProfileDropdown();
    }
  });

  $effect(() => {
    connected;
    if (!connected && profileDropdownOpen) {
      closeProfileDropdown();
    }
  });

  async function handleLogout() {
    closeProfileDropdown();
    const { logoutAuth } = await import('$lib/api/auth');
    const { clearAuthenticatedUser } = await import('$lib/stores/walletStore');
    const { disconnectWallet } = await import('$lib/stores/walletStore');
    await logoutAuth();
    clearAuthenticatedUser();
    disconnectWallet();
  }

  const mobileContextLabel = $derived(
    activePath === '/'
      ? 'Home'
      : activePath.startsWith('/lab')
        ? 'Lab'
        : activePath.startsWith('/dashboard')
          ? 'Dashboard'
          : activePath.startsWith('/passport')
            ? 'Passport'
            : activePath.startsWith('/settings')
              ? 'Settings'
              : 'Terminal'
  );
</script>

<nav id="nav" class:home-mode={isHomeRoute}>
  <div class="nav-main">
    <!-- Logo -->
    <a class="nav-logo" href={buildDeepLink(connected ? '/dashboard' : '/')} aria-label="Home">
      <span class="nav-logo-main">COGOTCHI</span>
    </a>

    {#if !isHomeRoute}
      <div class="mobile-page-chip">{mobileContextLabel}</div>
    {/if}

    <!-- Desktop/Tablet Nav Tabs -->
    {#each DESKTOP_NAV_SURFACES as item}
      <a
        class="nav-tab-desktop"
        class:active={isActive(item.id)}
        class:highlight={item.highlight === true}
        title={`${item.label} · ${item.description}`}
        aria-label={`${item.label}: ${item.description}`}
        aria-current={isActive(item.id) ? 'page' : undefined}
        href={item.href}
      >
        <span class="tab-full">{item.label.toUpperCase()}{#if item.highlight}<span class="tab-star">&#9733;</span>{/if}</span>
        <span class="tab-short">{item.shortLabel}{#if item.highlight}<span class="tab-star">&#9733;</span>{/if}</span>
      </a>
    {/each}
  </div>

  <div class="nav-right">
    <!-- Settings (desktop only) -->
    <a
      class="settings-btn desktop-only"
      title="Settings"
      aria-label="Settings"
      href={buildDeepLink('/settings')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </a>

    <!-- Wallet / Profile -->
    {#if connected}
      <div class="profile-dropdown-wrap">
        <button class="wallet-btn connected" onclick={toggleProfileDropdown}>
          <span class="wallet-dot"></span>
          {wallet.shortAddr}
        </button>
        {#if profileDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="dropdown-backdrop" onclick={closeProfileDropdown}></div>
          <div class="profile-dropdown">
            <button class="dropdown-item" onclick={() => handleProfileNav('/dashboard')}>Dashboard</button>
            <button class="dropdown-item" onclick={() => handleProfileNav('/passport')}>Passport</button>
            <button class="dropdown-item" onclick={() => handleProfileNav('/settings')}>Settings</button>
            <button class="dropdown-item" onclick={() => { closeProfileDropdown(); openWalletModal(); }}>Wallet</button>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item dropdown-item-danger" onclick={handleLogout}>Disconnect</button>
          </div>
        {/if}
      </div>
    {:else}
      <button class="wallet-btn" onclick={openWalletModal}>
        CONNECT
      </button>
    {/if}
  </div>

</nav>

<style>
  #nav {
    background:
      radial-gradient(circle at 12% 0%, rgba(249, 216, 194, 0.08), transparent 28%),
      radial-gradient(circle at 88% 0%, rgba(219, 154, 159, 0.06), transparent 22%),
      linear-gradient(180deg, rgba(10, 10, 11, 0.92), rgba(6, 6, 7, 0.88));
    border-bottom: 1px solid rgba(249, 216, 194, 0.08);
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: var(--sc-z-header);
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    height: var(--sc-header-h, 52px);
    padding: 0 20px;
    font-family: var(--sc-font-body);
    color: var(--sc-text-0);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 1px 0 rgba(249, 216, 194, 0.06), 0 8px 24px rgba(0, 0, 0, 0.18);
  }

  .nav-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    height: 100%;
  }

  .nav-logo {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    color: var(--sc-text-0);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
    text-decoration: none;
    transition: opacity var(--sc-duration-fast);
  }
  .nav-logo:hover { opacity: 0.8; }

  .nav-logo-main {
    font-family: var(--sc-font-body);
    font-size: 1.02rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-shadow: 0 0 10px rgba(219, 154, 159, 0.06);
  }

  .mobile-page-chip {
    display: none;
    align-items: center;
    height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid rgba(249, 216, 194, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.72);
    font-family: var(--sc-font-body);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    flex-shrink: 0;
  }
  /* Desktop Nav Tabs */
  .nav-tab-desktop {
    font-family: var(--sc-font-body);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.14em;
    color: rgba(250, 247, 235, 0.42);
    padding: 0 8px;
    height: 28px;
    display: flex;
    align-items: center;
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: color var(--sc-duration-fast), background var(--sc-duration-fast);
    white-space: nowrap;
    position: relative;
    text-decoration: none;
    margin-right: 3px;
  }
  .nav-tab-desktop:last-of-type { margin-right: 0; }

  .tab-short { display: none; }

  .tab-star {
    margin-left: 3px;
    font-size: var(--ui-text-xs);
    color: var(--sc-accent);
  }

  .nav-tab-desktop:hover {
    color: rgba(250, 247, 235, 0.88);
    background: rgba(255, 255, 255, 0.05);
  }

  /* Highlight tab (LAB) */
  .nav-tab-desktop.highlight {
    color: rgba(var(--home-ref-accent-rgb, 219, 154, 159), 0.88);
    border-color: rgba(219, 154, 159, 0.16);
  }
  .nav-tab-desktop.highlight:hover {
    color: rgba(250, 247, 235, 0.96);
    background: rgba(219, 154, 159, 0.08);
  }

  /* Active tab */
  .nav-tab-desktop.active {
    color: rgba(250, 247, 235, 0.96);
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.08), rgba(255, 255, 255, 0.03));
    text-shadow: none;
  }
  .nav-tab-desktop.active::after {
    content: '';
    position: absolute;
    inset: auto 10px -4px;
    height: 1px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(219, 154, 159, 0.9), rgba(249, 216, 194, 0.62));
    box-shadow: none;
  }
  .nav-tab-desktop.active.highlight {
    color: var(--sc-accent);
    text-shadow: 0 0 12px rgba(219, 154, 159, 0.2);
  }
  .nav-tab-desktop.active.highlight::after {
    background: var(--sc-accent);
  }

  /* Right Section */
  .nav-right {
    margin-left: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* Settings */
  .settings-btn {
    color: rgba(250, 247, 235, 0.58);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: var(--sc-radius-sm);
    cursor: pointer;
    padding: 5px;
    transition:
      color var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast),
      transform var(--sc-duration-fast);
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .settings-btn:hover {
    color: rgba(250, 247, 235, 0.96);
    border-color: rgba(219, 154, 159, 0.28);
    background: rgba(255, 255, 255, 0.05);
  }

  /* Wallet */
  .wallet-btn {
    font-family: var(--sc-font-body);
    font-weight: 600;
    font-size: 11px;
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    color: #0e0e12;
    border: 1px solid rgba(219, 154, 159, 0.34);
    border-radius: 999px;
    padding: 0 11px;
    min-height: 30px;
    min-width: 90px;
    cursor: pointer;
    letter-spacing: 0.06em;
    transition:
      background var(--sc-duration-fast),
      color var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      box-shadow var(--sc-duration-fast),
      transform var(--sc-duration-fast),
      opacity var(--sc-duration-fast);
    box-shadow: 0 10px 20px rgba(219, 154, 159, 0.12);
    display: flex;
    align-items: center;
    gap: var(--sc-sp-1);
  }
  .wallet-btn:hover {
    box-shadow: 0 14px 26px rgba(219, 154, 159, 0.16);
    transform: translateY(-1px);
  }
  .wallet-btn.connected {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.92);
    border: 1px solid rgba(249, 216, 194, 0.08);
    box-shadow: none;
    font-size: var(--ui-text-xs);
  }
  .wallet-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--sc-accent);
    box-shadow: 0 0 6px rgba(219, 154, 159, 0.4);
  }

  #nav.home-mode {
    top: max(8px, calc(var(--sc-safe-top) + 8px));
    left: 50%;
    right: auto;
    width: min(1040px, calc(100vw - 28px));
    height: 40px;
    padding: 0 14px;
    border: 1px solid rgba(249, 216, 194, 0.1);
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(10, 10, 11, 0.76), rgba(6, 6, 7, 0.66)),
      radial-gradient(circle at top right, rgba(219, 154, 159, 0.045), transparent 34%);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
    transform: translateX(-50%);
    backdrop-filter: blur(20px);
  }

  #nav.home-mode .settings-btn {
    display: none;
  }

  #nav.home-mode .nav-main {
    gap: 12px;
  }

  #nav.home-mode .nav-logo-main {
    font-weight: 700;
    font-size: 0.96rem;
    letter-spacing: 0.05em;
  }

  #nav.home-mode .nav-tab-desktop {
    height: 100%;
    padding: 0 6px;
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.14em;
    background: transparent;
    border: 0;
    border-radius: 0;
    color: rgba(250, 247, 235, 0.4);
    margin-right: 0;
  }

  #nav.home-mode .nav-tab-desktop:hover {
    background: transparent;
    color: rgba(250, 247, 235, 0.74);
  }

  #nav.home-mode .nav-tab-desktop.active {
    background: transparent;
    color: rgba(250, 247, 235, 0.96);
    text-shadow: none;
  }

  #nav.home-mode .nav-tab-desktop.active::after {
    inset: auto 6px 7px;
    height: 1px;
    background: rgba(219, 154, 159, 0.9);
    box-shadow: none;
  }

  #nav.home-mode .nav-tab-desktop.highlight,
  #nav.home-mode .nav-tab-desktop.active.highlight {
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.92);
  }

  #nav.home-mode .nav-right {
    margin-left: auto;
  }

  #nav.home-mode .wallet-btn {
    min-height: 28px;
    padding: 0 13px;
    font-size: 11px;
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    border-color: rgba(219, 154, 159, 0.24);
    box-shadow: 0 6px 14px rgba(219, 154, 159, 0.1);
  }

  /* Profile Dropdown */
  .profile-dropdown-wrap {
    position: relative;
  }
  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }
  .profile-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 100;
    min-width: 150px;
    background:
      linear-gradient(180deg, rgba(18, 18, 20, 0.94), rgba(10, 10, 12, 0.92)),
      radial-gradient(circle at top right, rgba(249, 216, 194, 0.05), transparent 36%);
    border: 1px solid rgba(249, 216, 194, 0.1);
    border-radius: 18px;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.2);
    padding: 6px 0;
    display: flex;
    flex-direction: column;
  }
  .dropdown-item {
    font-family: var(--sc-font-body);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.01em;
    color: rgba(250, 247, 235, 0.78);
    background: none;
    border: none;
    padding: var(--sc-sp-2) var(--sc-sp-3);
    text-align: left;
    cursor: pointer;
    transition: background var(--sc-duration-fast), color var(--sc-duration-fast);
  }
  .dropdown-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(250, 247, 235, 0.96);
  }
  .dropdown-item-danger:hover {
    background: rgba(255, 89, 89, 0.1);
    color: #ff6b6b;
  }
  .dropdown-sep {
    height: 1px;
    background: var(--sc-line-soft);
    margin: var(--sc-sp-1) 0;
  }

  /* Active States (touch feedback) */
  .nav-logo:active { opacity: 0.6; transform: scale(0.95); }
  .nav-tab-desktop:active { background: var(--sc-accent-bg); }
  .settings-btn:active {
    background: var(--sc-accent-bg);
    transform: scale(0.92);
  }
  .wallet-btn:active {
    transform: scale(0.96);
    opacity: 0.85;
  }

  /* ═══ COMPACT DESKTOP / TABLET (769-1024px) ═══ */
  @media (max-width: 1024px) and (min-width: 769px) {
    .desktop-only { display: none; }
    #nav { padding: 0 16px; }
    .nav-tab-desktop {
      padding: 0 var(--sc-sp-2);
      font-size: var(--sc-fs-xs);
      letter-spacing: 0.5px;
    }
    .tab-full { display: none; }
    .tab-short { display: inline; }
    .nav-logo-main { font-size: 1.02rem; }
    .nav-right { gap: var(--sc-sp-1); }
    #nav.home-mode { width: calc(100vw - 20px); }
    #nav.home-mode .nav-tab-desktop:nth-of-type(3) { display: none; }
  }

  /* ═══ MOBILE (<=768px) — compact top chrome, tabs move to bottom nav ═══ */
  @media (max-width: 768px) {
    #nav {
      height: var(--sc-header-h-mobile, 48px);
      flex-wrap: nowrap;
      padding: 0 14px;
      transition: none;
    }
    #nav.home-mode {
      width: calc(100vw - 20px);
      height: 42px;
      padding: 0 12px;
      border-radius: 6px;
    }
    #nav.home-mode .nav-tab-desktop:nth-of-type(3) { display: none; }
    .desktop-only { display: none; }
    .nav-tab-desktop { display: none; }
    .nav-logo-main { font-size: 0.92rem; letter-spacing: 1px; }
    .mobile-page-chip {
      display: inline-flex;
      padding: 0 10px;
      height: 28px;
      font-size: 11px;
      border-radius: 6px;
    }
    .wallet-btn {
      padding: 0 14px;
      border-radius: 6px;
      min-width: auto;
      min-height: 32px;
      font-size: 11px;
    }
    #nav.home-mode .profile-dropdown-wrap { display: none; }
    #nav.home-mode .wallet-btn {
      min-height: 28px;
      padding: 0 12px;
      font-size: var(--ui-text-xs);
      border-radius: 6px;
    }
  }

  /* ═══ SMALL MOBILE (<=480px) ═══ */
  @media (max-width: 480px) {
    #nav { padding: 0 10px; }
    #nav.home-mode {
      width: calc(100vw - 16px);
      height: 40px;
      padding: 0 10px;
    }
    .mobile-page-chip { padding: 0 8px; font-size: var(--ui-text-xs); height: 26px; }
    .wallet-btn { padding: 0 10px; min-height: 30px; font-size: var(--ui-text-xs); }
  }
</style>
