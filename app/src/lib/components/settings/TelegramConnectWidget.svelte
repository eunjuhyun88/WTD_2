<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let code = $state<string | null>(null);
  let connected = $state(false);
  let loading = $state(true);
  let generating = $state(false);
  let expiresAt = $state<number | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    await checkStatus();
    loading = false;
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  async function checkStatus() {
    try {
      const r = await fetch('/api/notifications/telegram/status');
      if (r.ok) {
        const d = await r.json();
        connected = d.connected;
      }
    } catch {}
  }

  async function generateCode() {
    generating = true;
    try {
      const r = await fetch('/api/notifications/telegram/connect', { method: 'POST' });
      if (r.ok) {
        const d = await r.json();
        code = d.code;
        expiresAt = Date.now() + d.expires_in * 1000;
        startPolling();
      }
    } finally {
      generating = false;
    }
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      await checkStatus();
      if (connected) {
        clearInterval(pollInterval!);
        pollInterval = null;
        code = null;
      }
      if (expiresAt && Date.now() > expiresAt) {
        clearInterval(pollInterval!);
        pollInterval = null;
        code = null;
      }
    }, 3000);
  }

  const botUsername = 'cogochi_bot';
</script>

<div class="tg-widget">
  {#if loading}
    <div class="tg-loading">확인 중…</div>
  {:else if connected}
    <div class="tg-connected">
      <span class="tg-icon">&#10003;</span>
      <span>Telegram 연결됨</span>
    </div>
  {:else if code}
    <div class="tg-code-view">
      <p class="tg-instruction">
        Telegram에서 <strong>@{botUsername}</strong>에 아래 명령어를 전송하세요:
      </p>
      <div class="tg-code-box">
        <code>/connect {code}</code>
      </div>
      <p class="tg-hint">연결 대기 중… (최대 10분)</p>
    </div>
  {:else}
    <div class="tg-unconnected">
      <p class="tg-desc">Telegram Bot을 연결하면 패턴 알림을 Telegram으로 받을 수 있습니다.</p>
      <button class="tg-btn" onclick={generateCode} disabled={generating}>
        {generating ? '생성 중…' : 'Telegram 연결'}
      </button>
    </div>
  {/if}
</div>

<style>
  .tg-widget {
    padding: 12px 0;
    font-size: 0.875rem;
    color: rgba(209, 212, 220, 0.8);
  }
  .tg-connected {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #68d391;
  }
  .tg-icon {
    font-size: 1rem;
  }
  .tg-code-box {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 10px 14px;
    margin: 8px 0;
    font-family: monospace;
    font-size: 1rem;
    letter-spacing: 0.05em;
    color: #63b3ed;
  }
  .tg-instruction { margin-bottom: 4px; }
  .tg-hint { font-size: 0.75rem; color: rgba(209, 212, 220, 0.5); margin-top: 4px; }
  .tg-btn {
    background: rgba(49, 130, 206, 0.15);
    border: 1px solid rgba(49, 130, 206, 0.4);
    color: #63b3ed;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .tg-btn:hover { background: rgba(49, 130, 206, 0.25); }
  .tg-btn:disabled { opacity: 0.5; cursor: default; }
  .tg-desc { margin-bottom: 10px; color: rgba(209, 212, 220, 0.6); }
  .tg-loading { color: rgba(209, 212, 220, 0.4); font-size: 0.8rem; }
</style>
