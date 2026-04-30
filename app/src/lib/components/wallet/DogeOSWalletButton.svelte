<script lang="ts">
  /**
   * DogeOSWalletButton — W-0325 DogeOS embedded wallet React island
   *
   * Renders a compact "Connect Wallet" button (sidebar footer or command bar).
   * On click, opens the DogeOS wallet modal (useWalletConnect().openModal()).
   * When connected, shows a shortened address.
   *
   * Uses React island pattern: browser-only, dynamically imported.
   * Env: PUBLIC_PRIVY_APP_ID (= DogeOS clientId)
   */
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  const clientId = import.meta.env.PUBLIC_PRIVY_APP_ID as string | undefined;

  let hostEl: HTMLDivElement;
  let unmountFn: (() => void) | null = null;

  onMount(async () => {
    if (!browser || !clientId) {
      console.warn('[DogeOSWallet] PUBLIC_PRIVY_APP_ID not set — wallet disabled');
      return;
    }

    try {
      const [
        React,
        { createRoot },
        { WalletConnectProvider, useWalletConnect, useAccount },
      ] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('@dogeos/dogeos-sdk'),
      ]);

      await import('@dogeos/dogeos-sdk/style.css');

      const config = { clientId };

      /** Inner button — lives inside WalletConnectProvider so hooks work */
      function WalletBtn() {
        // Hooks must always be called unconditionally
        const { isConnected, openModal } = useWalletConnect();
        const account = useAccount();

        const addr = account?.address
          ? `${account.address.slice(0, 4)}…${account.address.slice(-4)}`
          : null;

        return React.createElement(
          'button',
          {
            onClick: openModal,
            className: `dogeos-connect-btn ${isConnected ? 'connected' : ''}`,
            title: isConnected ? (account?.address ?? '') : 'Connect wallet',
          },
          React.createElement('span', { className: 'dot' }),
          isConnected && addr ? addr : 'CONNECT',
        );
      }

      const root = createRoot(hostEl);
      // @ts-expect-error — children via 3rd arg
      root.render(React.createElement(WalletConnectProvider, { config }, React.createElement(WalletBtn)));

      unmountFn = () => root.unmount();
    } catch (err) {
      console.error('[DogeOSWallet] mount error:', err);
    }
  });

  onDestroy(() => unmountFn?.());
</script>

<div bind:this={hostEl} class="wallet-host">
  {#if !clientId}
    <span class="no-key">NO PRIVY KEY</span>
  {/if}
</div>

<style>
  .wallet-host {
    display: inline-flex;
    align-items: center;
  }

  .no-key {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: rgba(248, 113, 113, 0.6);
    letter-spacing: 0.08em;
  }

  /* React-rendered button styles — must be :global */
  :global(.dogeos-connect-btn) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    border: 0.5px solid var(--g4, rgba(255,255,255,0.1));
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--g6, rgba(200,200,200,0.6));
    cursor: pointer;
    transition: all 0.15s;
  }

  :global(.dogeos-connect-btn:hover) {
    background: var(--g2, rgba(255,255,255,0.04));
    color: var(--g9, #eceae8);
    border-color: var(--g5, rgba(255,255,255,0.2));
  }

  :global(.dogeos-connect-btn.connected) {
    background: var(--pos-dd, rgba(13, 62, 34, 0.5));
    border-color: var(--pos-d, rgba(52, 196, 112, 0.3));
    color: var(--pos, #34c470);
  }

  :global(.dogeos-connect-btn .dot) {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--g5, rgba(150,150,150,0.4));
    transition: background 0.15s;
  }

  :global(.dogeos-connect-btn.connected .dot) {
    background: var(--pos, #34c470);
  }
</style>
