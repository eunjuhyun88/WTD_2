<script lang="ts">
  import { onMount } from 'svelte';

  interface ApiKeyRow {
    id: string;
    exchange: string;
    api_key: string;
    permissions: string[];
    is_read_only: boolean;
    created_at: string;
    last_verified_at: string | null;
  }

  let keys = $state<ApiKeyRow[]>([]);
  let loading = $state(true);
  let submitting = $state(false);
  let errorMsg = $state('');
  let successMsg = $state('');

  // Form state
  let formExchange = $state<'binance' | 'bybit'>('binance');
  let formApiKey = $state('');
  let formSecret = $state('');

  async function loadKeys() {
    loading = true;
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        keys = data.keys ?? [];
      } else {
        keys = [];
      }
    } catch {
      keys = [];
    } finally {
      loading = false;
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    errorMsg = '';
    successMsg = '';

    if (!formApiKey.trim() || !formSecret.trim()) {
      errorMsg = 'API Key와 Secret을 모두 입력해주세요.';
      return;
    }

    submitting = true;
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          exchange: formExchange,
          api_key: formApiKey.trim(),
          secret: formSecret.trim(),
          permissions: [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        errorMsg = data.error ?? '등록에 실패했습니다.';
      } else {
        successMsg = `${formExchange.toUpperCase()} API 키가 등록되었습니다.`;
        formApiKey = '';
        formSecret = '';
        await loadKeys();
      }
    } catch {
      errorMsg = '네트워크 오류가 발생했습니다.';
    } finally {
      submitting = false;
    }
  }

  async function handleDelete(id: string, exchange: string) {
    errorMsg = '';
    successMsg = '';
    try {
      const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        successMsg = `${exchange.toUpperCase()} 키가 삭제되었습니다.`;
        await loadKeys();
      } else {
        const data = await res.json();
        errorMsg = data.error ?? '삭제에 실패했습니다.';
      }
    } catch {
      errorMsg = '네트워크 오류가 발생했습니다.';
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  onMount(loadKeys);
</script>

<div class="api-keys-panel">
  <!-- Register Form -->
  <div class="section-card">
    <div class="section-head">
      <span class="section-label">거래소 API 키 등록</span>
      <span class="section-note">READ-ONLY 키만 허용 (조회 전용)</span>
    </div>

    <form class="key-form" onsubmit={handleSubmit}>
      <div class="form-row">
        <label class="form-label" for="exchange-select">거래소</label>
        <select id="exchange-select" class="form-select" bind:value={formExchange}>
          <option value="binance">Binance</option>
          <option value="bybit">Bybit</option>
        </select>
      </div>

      <div class="form-row">
        <label class="form-label" for="api-key-input">API Key</label>
        <input
          id="api-key-input"
          type="text"
          class="form-input"
          placeholder="API Key (공개 키)"
          autocomplete="off"
          spellcheck="false"
          bind:value={formApiKey}
        />
      </div>

      <div class="form-row">
        <label class="form-label" for="secret-input">Secret</label>
        <input
          id="secret-input"
          type="password"
          class="form-input"
          placeholder="Secret Key (비공개 키)"
          autocomplete="new-password"
          bind:value={formSecret}
        />
      </div>

      {#if errorMsg}
        <div class="msg-error" role="alert">{errorMsg}</div>
      {/if}

      {#if successMsg}
        <div class="msg-success" role="status">{successMsg}</div>
      {/if}

      <div class="form-footer">
        <p class="security-note">
          Secret은 서버에서 AES-256-GCM으로 암호화 저장됩니다. 평문은 절대 반환되지 않습니다.
        </p>
        <button type="submit" class="submit-btn" disabled={submitting}>
          {submitting ? '등록 중...' : '키 등록'}
        </button>
      </div>
    </form>
  </div>

  <!-- Registered Keys List -->
  <div class="section-card">
    <div class="section-head">
      <span class="section-label">등록된 키</span>
    </div>

    {#if loading}
      <div class="skeleton"></div>
    {:else if keys.length === 0}
      <div class="empty-state">등록된 API 키가 없습니다.</div>
    {:else}
      <ul class="key-list">
        {#each keys as key (key.id)}
          <li class="key-row">
            <div class="key-info">
              <span class="key-exchange">{key.exchange.toUpperCase()}</span>
              <span class="key-value">{key.api_key}</span>
              <span class="key-badge" class:read-only={key.is_read_only} class:not-safe={!key.is_read_only}>
                {key.is_read_only ? 'READ-ONLY' : '⚠ 위험 권한'}
              </span>
            </div>
            <div class="key-meta">
              <span class="key-date">{formatDate(key.created_at)}</span>
              <button
                class="delete-btn"
                onclick={() => handleDelete(key.id, key.exchange)}
                aria-label="{key.exchange} 키 삭제"
              >
                삭제
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .api-keys-panel {
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-card {
    background: var(--g2, #141210);
    border: 1px solid var(--g3, #1c1918);
    border-radius: 8px;
    overflow: hidden;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--g3, #1c1918);
    background: rgba(255, 255, 255, 0.02);
  }

  .section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    font-weight: 700;
    color: var(--g7, #9d9690);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .section-note {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--amb, #f5a623);
    opacity: 0.7;
  }

  .key-form {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .form-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g7, #9d9690);
    width: 64px;
    flex-shrink: 0;
  }

  .form-select,
  .form-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--g9, #eceae8);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-sm, 12px);
    outline: none;
    transition: border-color 0.15s;
  }

  .form-select:focus,
  .form-input:focus {
    border-color: rgba(245, 166, 35, 0.4);
  }

  .msg-error {
    margin: 0;
    padding: 10px 16px;
    background: rgba(255, 80, 80, 0.08);
    border-bottom: 1px solid rgba(255, 80, 80, 0.15);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: #ff9ca0;
    line-height: 1.5;
  }

  .msg-success {
    margin: 0;
    padding: 10px 16px;
    background: rgba(100, 200, 120, 0.08);
    border-bottom: 1px solid rgba(100, 200, 120, 0.15);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--pos, #6cc47e);
  }

  .form-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    gap: 12px;
  }

  .security-note {
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g5, #3d3830);
    line-height: 1.5;
    flex: 1;
  }

  .submit-btn {
    padding: 7px 20px;
    border-radius: 4px;
    border: 1px solid rgba(245, 166, 35, 0.35);
    background: rgba(245, 166, 35, 0.1);
    color: var(--amb, #f5a623);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .submit-btn:hover:not(:disabled) {
    background: rgba(245, 166, 35, 0.18);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Key list */
  .key-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .key-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    gap: 12px;
  }

  .key-row:last-child {
    border-bottom: none;
  }

  .key-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .key-exchange {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    font-weight: 700;
    color: var(--amb, #f5a623);
    flex-shrink: 0;
  }

  .key-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g7, #9d9690);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid;
    flex-shrink: 0;
  }

  .key-badge.read-only {
    color: var(--pos, #6cc47e);
    border-color: rgba(108, 196, 126, 0.3);
    background: rgba(108, 196, 126, 0.07);
  }

  .key-badge.not-safe {
    color: #ff9ca0;
    border-color: rgba(255, 100, 100, 0.3);
    background: rgba(255, 100, 100, 0.07);
  }

  .key-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .key-date {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g5, #3d3830);
  }

  .delete-btn {
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255, 80, 80, 0.25);
    background: rgba(255, 80, 80, 0.06);
    color: #ff9ca0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    cursor: pointer;
    transition: background 0.15s;
  }

  .delete-btn:hover {
    background: rgba(255, 80, 80, 0.14);
  }

  .skeleton {
    height: 60px;
    margin: 16px;
    background: var(--g3, #1c1918);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .empty-state {
    padding: 32px;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g5, #3d3830);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
