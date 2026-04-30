<script lang="ts">
  /**
   * DogeOSWalletButton — W-0325 DogeOS embedded wallet React island
   *
   * Mounts the DogeOS SDK (React) into this Svelte component's host element.
   * Browser-only: all imports are dynamic to avoid SSR issues.
   *
   * Env: PUBLIC_PRIVY_APP_ID must be set (=Privy/DogeOS client ID)
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
        { WalletConnectProvider, WalletConnectEmbed },
      ] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('@dogeos/dogeos-sdk'),
      ]);

      // Also import CSS (DogeOS SDK stylesheet)
      await import('@dogeos/dogeos-sdk/style.css');

      const config = { clientId };

      const root = createRoot(hostEl);
      root.render(
        React.createElement(
          WalletConnectProvider,
          { config },
          React.createElement(WalletConnectEmbed, { className: 'dogeos-wallet-embed' }),
        ),
      );

      unmountFn = () => root.unmount();
    } catch (err) {
      console.error('[DogeOSWallet] Failed to mount wallet:', err);
    }
  });

  onDestroy(() => {
    unmountFn?.();
  });
</script>

<div bind:this={hostEl} class="wallet-host">
  {#if !clientId}
    <div class="wallet-unavailable">
      <span>Wallet unavailable — PUBLIC_PRIVY_APP_ID not set</span>
    </div>
  {/if}
</div>

<style>
  .wallet-host {
    display: contents; /* passes through layout to React root */
  }

  .wallet-unavailable {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(248, 113, 113, 0.7);
    padding: 6px 10px;
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
  }

  /* DogeOS SDK overrides to match terminal dark theme */
  :global(.dogeos-wallet-embed) {
    --modal-bg: #0d1017;
    --modal-border: rgba(255,255,255,0.08);
    font-family: var(--sc-font-mono, monospace);
  }
</style>
