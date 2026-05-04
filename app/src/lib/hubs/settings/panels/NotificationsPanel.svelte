<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchPreferencesApi, updatePreferencesApi } from '$lib/api/preferencesApi';
  import TelegramConnectWidget from '$lib/components/settings/TelegramConnectWidget.svelte';

  let signals = $state(true);
  let sfx = $state(true);
  let loaded = $state(false);

  onMount(async () => {
    const remote = await fetchPreferencesApi();
    if (remote) {
      signals = Boolean(remote.signalsEnabled);
      sfx = Boolean(remote.sfxEnabled);
    }
    loaded = true;
  });

  async function persist() {
    await updatePreferencesApi({
      signalsEnabled: signals,
      sfxEnabled: sfx,
    });
  }

  function toggle(field: 'signals' | 'sfx') {
    if (field === 'signals') signals = !signals;
    else sfx = !sfx;
    persist();
  }
</script>

<div class="notif-panel">

  <section class="settings-section">
    <div class="ss-head">
      <span class="surface-kicker">Alerts</span>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Signal Alerts</div>
        <div class="sr-desc">Receive trade signal notifications</div>
      </div>
      <button
        class="toggle-btn"
        class:on={signals}
        aria-label="Toggle signal alerts"
        onclick={() => toggle('signals')}
      >
        <div class="toggle-dot"></div>
      </button>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Alert Patterns</div>
        <div class="sr-desc">Pattern scan match alerts</div>
      </div>
      <button
        class="toggle-btn"
        class:on={signals}
        aria-label="Toggle pattern alerts"
        onclick={() => toggle('signals')}
      >
        <div class="toggle-dot"></div>
      </button>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Sound Effects</div>
        <div class="sr-desc">Arena SFX and notifications</div>
      </div>
      <button
        class="toggle-btn"
        class:on={sfx}
        aria-label="Toggle sound effects"
        onclick={() => toggle('sfx')}
      >
        <div class="toggle-dot"></div>
      </button>
    </div>
  </section>

  <section class="settings-section">
    <div class="ss-head">
      <span class="surface-kicker">Channels</span>
    </div>

    <div class="setting-row tg-row">
      <div class="sr-info">
        <div class="sr-label">Telegram Bot</div>
        <div class="sr-desc">Receive pattern alerts via Telegram</div>
      </div>
      <TelegramConnectWidget />
    </div>
  </section>

  <section class="settings-section">
    <div class="ss-head">
      <span class="surface-kicker">Email Digest</span>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Daily Summary</div>
        <div class="sr-desc">Receive daily performance digest via email — manage delivery in your inbox</div>
      </div>
      <a class="sr-link-btn" href="/lab/ledger">View Ledger →</a>
    </div>
  </section>

</div>

<style>
  .notif-panel {
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-section {
    background: rgba(255, 255, 255, 0.026);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    overflow: hidden;
  }

  .ss-head {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .setting-row:last-child { border-bottom: none; }

  .sr-info { flex: 1; min-width: 0; }
  .sr-label {
    font-family: var(--sc-font-body);
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--sc-text-0);
  }
  .sr-desc {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    color: var(--sc-text-2);
    margin-top: 2px;
  }

  .sr-link-btn {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-accent);
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .sr-link-btn:hover { background: rgba(255, 255, 255, 0.08); }

  .toggle-btn {
    width: 44px;
    height: 24px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    position: relative;
    transition: background 0.2s, border-color 0.2s;
    padding: 0;
    flex-shrink: 0;
  }
  .toggle-btn.on {
    background: var(--sc-good, #adca7c);
    border-color: rgba(173, 202, 124, 0.4);
  }
  .toggle-dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(250, 247, 235, 0.96);
    border: 1px solid rgba(0, 0, 0, 0.12);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: left 0.2s;
  }
  .toggle-btn.on .toggle-dot { left: 22px; }

  .tg-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 4px;
  }
</style>
