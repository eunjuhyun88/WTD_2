<script lang="ts">
  import { walletStore, disconnectWallet, clearAuthenticatedUser, closeWalletModal } from '$lib/stores/walletStore';
  import { logoutAuth } from '$lib/api/auth';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  async function handleDisconnect() {
    disconnectWallet();
    onClose();
  }

  async function handleLogout() {
    try {
      await logoutAuth();
    } catch {
      // best-effort
    }
    clearAuthenticatedUser();
    onClose();
  }
</script>

{#if open}
  <div class="drawer-backdrop" role="presentation" onclick={onClose}></div>
  <aside class="profile-drawer" aria-label="Profile">
    <div class="drawer-header">
      <span class="drawer-title">WALLET</span>
      <button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
    </div>

    <div class="drawer-body">
      <div class="field-row">
        <span class="field-label">ADDRESS</span>
        <span class="field-value mono">{$walletStore.shortAddr ?? '—'}</span>
      </div>
      <div class="field-row">
        <span class="field-label">TIER</span>
        <span class="field-value tier-badge" data-tier={$walletStore.tier}>{$walletStore.tier.toUpperCase()}</span>
      </div>
      <div class="field-row">
        <span class="field-label">CHAIN</span>
        <span class="field-value mono">{$walletStore.chain}</span>
      </div>
      <div class="field-row">
        <span class="field-label">PHASE</span>
        <span class="field-value mono">P{$walletStore.phase}</span>
      </div>
      <div class="field-row">
        <span class="field-label">EMAIL</span>
        <span class="field-value">{$walletStore.email ?? '—'}</span>
      </div>
      <div class="field-row">
        <span class="field-label">NICK</span>
        <span class="field-value">{$walletStore.nickname ?? '—'}</span>
      </div>
    </div>

    <div class="drawer-actions">
      <button class="action-btn danger" onclick={handleDisconnect}>DISCONNECT WALLET</button>
      {#if $walletStore.email}
        <button class="action-btn" onclick={handleLogout}>LOG OUT</button>
      {/if}
      <button class="action-btn ghost" onclick={onClose}>CLOSE</button>
    </div>
  </aside>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 280;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
  }

  .profile-drawer {
    position: fixed;
    top: 0;
    left: 52px;
    bottom: 0;
    z-index: 290;
    width: 260px;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, rgba(10, 10, 12, 0.99), rgba(8, 8, 10, 0.99));
    border-right: 1px solid rgba(249, 216, 194, 0.1);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 12px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.07);
  }

  .drawer-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.12em;
    color: rgba(249, 216, 194, 0.5);
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(250, 247, 235, 0.4);
    font-size: 12px;
    line-height: 1;
    padding: 4px;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: rgba(250, 247, 235, 0.8);
  }

  .drawer-body {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.1em;
    color: rgba(249, 216, 194, 0.35);
  }

  .field-value {
    font-family: var(--sc-font-body, sans-serif);
    font-size: 13px;
    color: rgba(250, 247, 235, 0.75);
    word-break: break-all;
  }

  .field-value.mono {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
  }

  .tier-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  .tier-badge[data-tier='verified'] { color: rgba(130, 220, 160, 0.9); }
  .tier-badge[data-tier='connected'] { color: rgba(130, 180, 255, 0.9); }
  .tier-badge[data-tier='registered'] { color: rgba(249, 216, 194, 0.75); }
  .tier-badge[data-tier='guest'] { color: rgba(250, 247, 235, 0.35); }

  .drawer-actions {
    padding: 12px 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid rgba(249, 216, 194, 0.07);
  }

  .action-btn {
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid rgba(249, 216, 194, 0.15);
    background: rgba(249, 216, 194, 0.05);
    color: rgba(250, 247, 235, 0.75);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    text-align: center;
  }

  .action-btn:hover {
    background: rgba(249, 216, 194, 0.1);
    color: rgba(250, 247, 235, 0.95);
  }

  .action-btn.danger {
    border-color: rgba(219, 100, 100, 0.3);
    background: rgba(219, 100, 100, 0.06);
    color: rgba(219, 140, 140, 0.85);
  }

  .action-btn.danger:hover {
    background: rgba(219, 100, 100, 0.12);
    color: rgba(240, 160, 160, 0.95);
  }

  .action-btn.ghost {
    border-color: rgba(249, 216, 194, 0.07);
    background: none;
    color: rgba(250, 247, 235, 0.35);
  }

  .action-btn.ghost:hover {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.6);
  }

  @media (max-width: 768px) {
    .profile-drawer {
      left: 0;
      width: 100%;
      max-width: 320px;
    }
  }
</style>
