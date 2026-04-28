<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { walletStore, isWalletConnected } from '$lib/stores/walletStore';
  import { openWalletModal } from '$lib/stores/walletModalStore';
  import { buildDeepLink } from '$lib/utils/deepLinks';
  import LocaleToggle from '$lib/components/LocaleToggle.svelte';

  const wallet = $derived($walletStore);
  const connected = $derived($isWalletConnected);
  const activePath = $derived($page.url.pathname);

  const pageLabel = $derived(
    activePath.startsWith('/dashboard') ? 'Dashboard'
    : activePath.startsWith('/lab') ? 'Lab'
    : activePath.startsWith('/patterns') ? 'Patterns'
    : activePath.startsWith('/agent') ? 'Agent'
    : activePath.startsWith('/market') ? 'Market'
    : activePath.startsWith('/passport') ? 'Passport'
    : activePath.startsWith('/settings') ? 'Settings'
    : ''
  );

  let profileOpen = $state(false);

  function toggleProfile() { profileOpen = !profileOpen; }
  function closeProfile() { profileOpen = false; }
  function navTo(path: string) { closeProfile(); goto(path); }

  $effect(() => { activePath; closeProfile(); });

  async function handleLogout() {
    closeProfile();
    const { logoutAuth } = await import('$lib/api/auth');
    const { clearAuthenticatedUser, disconnectWallet } = await import('$lib/stores/walletStore');
    await logoutAuth();
    clearAuthenticatedUser();
    disconnectWallet();
  }
</script>

<header class="app-topbar">
  <div class="topbar-left">
    <a class="topbar-logo" href="/" aria-label="Cogotchi Home">COGOTCHI</a>
    {#if pageLabel}
      <span class="topbar-divider" aria-hidden="true">/</span>
      <span class="topbar-page">{pageLabel}</span>
    {/if}
  </div>

  <div class="topbar-right">
    <LocaleToggle />
    {#if connected}
      <div class="profile-wrap">
        <button class="wallet-btn connected" onclick={toggleProfile}>
          <span class="wallet-dot"></span>
          {wallet.shortAddr}
        </button>
        {#if profileOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="profile-backdrop" onclick={closeProfile}></div>
          <div class="profile-dropdown">
            <button class="dd-item" onclick={() => navTo('/dashboard')}>Dashboard</button>
            <button class="dd-item" onclick={() => navTo('/passport')}>Passport</button>
            <button class="dd-item" onclick={() => navTo('/settings')}>Settings</button>
            <div class="dd-sep"></div>
            <button class="dd-item dd-danger" onclick={handleLogout}>Disconnect</button>
          </div>
        {/if}
      </div>
    {:else}
      <button class="wallet-btn" onclick={openWalletModal}>CONNECT</button>
    {/if}
  </div>
</header>

<style>
  .app-topbar {
    position: fixed;
    top: 0;
    left: 52px;
    right: 0;
    z-index: var(--sc-z-header, 180);
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px 0 20px;
    background:
      radial-gradient(circle at 0% 0%, rgba(219, 154, 159, 0.04), transparent 30%),
      linear-gradient(180deg, rgba(10, 10, 11, 0.96), rgba(6, 6, 7, 0.94));
    border-bottom: 1px solid rgba(249, 216, 194, 0.07);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .topbar-logo {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(250, 247, 235, 0.9);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .topbar-logo:hover {
    opacity: 0.7;
  }

  .topbar-divider {
    color: rgba(250, 247, 235, 0.2);
    font-size: 12px;
    font-weight: 300;
  }

  .topbar-page {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: rgba(250, 247, 235, 0.55);
    text-transform: uppercase;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .wallet-btn {
    font-family: var(--sc-font-body, sans-serif);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.06em;
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    color: #0e0e12;
    border: 1px solid rgba(219, 154, 159, 0.3);
    border-radius: 999px;
    padding: 0 14px;
    height: 30px;
    cursor: pointer;
    transition: box-shadow 0.15s, transform 0.1s;
    box-shadow: 0 6px 14px rgba(219, 154, 159, 0.1);
  }

  .wallet-btn:hover {
    box-shadow: 0 10px 20px rgba(219, 154, 159, 0.16);
    transform: translateY(-1px);
  }

  .wallet-btn.connected {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.88);
    border: 1px solid rgba(249, 216, 194, 0.08);
    box-shadow: none;
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .wallet-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(219, 154, 159, 0.9);
    box-shadow: 0 0 6px rgba(219, 154, 159, 0.4);
  }

  .profile-wrap {
    position: relative;
  }

  .profile-backdrop {
    position: fixed;
    inset: 0;
    z-index: 98;
  }

  .profile-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 99;
    min-width: 150px;
    background: linear-gradient(180deg, rgba(14, 14, 16, 0.97), rgba(8, 8, 10, 0.97));
    border: 1px solid rgba(249, 216, 194, 0.1);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
    padding: 6px 0;
  }

  .dd-item {
    width: 100%;
    font-family: var(--sc-font-body, sans-serif);
    font-size: 12px;
    font-weight: 600;
    color: rgba(250, 247, 235, 0.72);
    background: none;
    border: none;
    padding: 8px 14px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .dd-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(250, 247, 235, 0.96);
  }

  .dd-danger:hover {
    background: rgba(255, 89, 89, 0.08);
    color: #ff6b6b;
  }

  .dd-sep {
    height: 1px;
    background: rgba(249, 216, 194, 0.07);
    margin: 4px 0;
  }

  @media (max-width: 768px) {
    .app-topbar {
      left: 0;
      height: 48px;
    }
  }
</style>
