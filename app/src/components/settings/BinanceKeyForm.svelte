<script lang="ts">
  import { onMount } from 'svelte';
  import { exchangeKeys } from '$lib/stores/exchangeKeys';
  import {
    trackExchangeKeyRegistered,
    trackExchangeKeyDeleted,
    trackExchangeKeyValidationFailed,
  } from '$lib/telemetry/exchange';

  export let onSaved: () => void = () => {};

  onMount(() => { void exchangeKeys.fetchStatus(); });

  let apiKey = '';
  let secret = '';
  let saving = false;
  let toast = '';
  let toastTimer: ReturnType<typeof setTimeout>;
  let reenter = false;

  $: saved = $exchangeKeys;

  function validateApiKey(k: string) { return /^[A-Za-z0-9]{64}$/.test(k); }
  function validateSecret(s: string) { return s.length >= 30; }

  $: apiKeyError = apiKey.length > 0 && !validateApiKey(apiKey)
    ? `64자 영숫자여야 합니다 (현재 ${apiKey.length}자)` : '';
  $: secretError = secret.length > 0 && !validateSecret(secret)
    ? '최소 30자 이상이어야 합니다' : '';

  function showToast(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = ''; }, 2500);
  }

  async function handleSave() {
    if (!validateApiKey(apiKey) || !validateSecret(secret)) return;
    saving = true;
    try {
      const result = await exchangeKeys.save(apiKey, secret);
      if (result.ok) {
        trackExchangeKeyRegistered('binance', result.ipRestrict ?? false);
        showToast(`✓ 저장됨 (****${apiKey.slice(-4)})`);
        apiKey = '';
        secret = '';
        reenter = false;
        onSaved();
      } else {
        if (result.code) {
          trackExchangeKeyValidationFailed('binance', result.code as import('$lib/telemetry/exchange').ExchangeEventCode);
        }
        if (result.code === 'trading_enabled') {
          showToast('❌ Trading 권한이 있는 키는 허용되지 않습니다');
        } else if (result.code === 'invalid_key') {
          showToast('❌ 유효하지 않은 API Key입니다');
        } else {
          showToast(`❌ ${result.error ?? '저장 실패'}`);
        }
      }
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    const result = await exchangeKeys.remove();
    if (result.ok) {
      trackExchangeKeyDeleted('binance');
      showToast('키가 삭제됐습니다');
    } else {
      showToast(`❌ ${result.error ?? '삭제 실패'}`);
    }
  }
</script>

<div class="key-form">
  {#if toast}
    <div class="toast">{toast}</div>
  {/if}

  {#if saved && !reenter}
    <!-- 등록된 상태 -->
    <div class="saved-info">
      <span class="saved-label">등록됨</span>
      <span class="saved-key">BINANCE ****{saved.apiKeyLast4}</span>
      <span class="saved-date">{new Date(saved.savedAt).toLocaleDateString('ko-KR')}</span>
    </div>
    <div class="saved-actions">
      <button type="button" class="action-btn reenter" onclick={() => reenter = true}>재입력</button>
      <button type="button" class="action-btn delete" onclick={handleDelete}>삭제</button>
    </div>
  {:else}
    <!-- 입력 폼 -->
    <div class="field">
      <label class="field-label" for="binance-api-key">API KEY</label>
      <input
        id="binance-api-key"
        class="field-input"
        class:error={!!apiKeyError}
        type="text"
        bind:value={apiKey}
        placeholder="64자 영숫자"
        autocomplete="off"
        spellcheck="false"
      />
      {#if apiKeyError}<div class="field-error">{apiKeyError}</div>{/if}
    </div>

    <div class="field">
      <label class="field-label" for="binance-secret">SECRET KEY</label>
      <input
        id="binance-secret"
        class="field-input"
        class:error={!!secretError}
        type="password"
        bind:value={secret}
        placeholder="Secret Key"
        autocomplete="new-password"
      />
      {#if secretError}<div class="field-error">{secretError}</div>{/if}
    </div>

    <div class="form-actions">
      {#if reenter}
        <button type="button" class="action-btn cancel" onclick={() => { reenter = false; apiKey = ''; secret = ''; }}>취소</button>
      {/if}
      <button
        type="button"
        class="save-btn"
        onclick={handleSave}
        disabled={saving || !validateApiKey(apiKey) || !validateSecret(secret)}
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </div>
  {/if}
</div>

<style>
.key-form { display: flex; flex-direction: column; gap: 8px; }
.toast {
  padding: 6px 10px; border-radius: 4px;
  background: rgba(0,255,136,.1); border: 1px solid rgba(0,255,136,.2);
  color: #00ff88; font-size: var(--ui-text-xs); font-family: var(--fm); text-align: center;
}
.saved-info {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 10px; background: #0d0d1e; border: 1px solid #2a2a3a; border-radius: 6px;
}
.saved-label { font-size: var(--ui-text-xs); color: #00ff88; font-weight: 700; font-family: var(--fd); }
.saved-key { font-size: var(--ui-text-xs); color: #c8ccd4; font-family: var(--fm); }
.saved-date { font-size: var(--ui-text-xs); color: #555; font-family: var(--fm); margin-left: auto; }
.saved-actions { display: flex; gap: 6px; }

.field { display: flex; flex-direction: column; gap: 3px; }
.field-label { font-size: var(--ui-text-xs); color: #888; font-weight: 900; font-family: var(--fd); letter-spacing: 1px; }
.field-input {
  background: #0d0d1e; border: 1px solid #2a2a3a; border-radius: 4px;
  color: #c8ccd4; font-size: var(--ui-text-xs); font-family: var(--fm);
  padding: 6px 8px; outline: none; width: 100%;
}
.field-input:focus { border-color: #E8967D; }
.field-input.error { border-color: #ff6680; }
.field-error { font-size: var(--ui-text-xs); color: #ff6680; font-family: var(--fm); }

.form-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }

.save-btn {
  padding: 7px 18px; border-radius: 6px;
  background: #E8967D; border: none; color: #000;
  font-size: var(--ui-text-xs); font-weight: 900; font-family: var(--fd);
  letter-spacing: 1px; cursor: pointer;
}
.save-btn:hover:not(:disabled) { background: #f0a88f; }
.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.action-btn {
  padding: 5px 12px; border-radius: 4px;
  font-size: var(--ui-text-xs); font-weight: 700; font-family: var(--fd); letter-spacing: 1px; cursor: pointer;
}
.action-btn.reenter { background: rgba(255,255,255,.05); border: 1px solid #2a2a3a; color: #888; }
.action-btn.reenter:hover { color: #c8ccd4; background: rgba(255,255,255,.1); }
.action-btn.cancel { background: rgba(255,255,255,.05); border: 1px solid #2a2a3a; color: #888; }
.action-btn.cancel:hover { color: #c8ccd4; }
.action-btn.delete { background: rgba(255,45,85,.1); border: 1px solid rgba(255,45,85,.3); color: #ff2d55; }
.action-btn.delete:hover { background: rgba(255,45,85,.2); }
</style>
