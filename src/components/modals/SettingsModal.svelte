<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { RESETTABLE_STORAGE_KEYS } from '$lib/stores/storageKeys';
  import { CORE_TIMEFRAME_OPTIONS, normalizeTimeframe } from '$lib/utils/timeframe';

  export let onClose: () => void = () => {};

  let state = $gameState;
  $: state = $gameState;

  let speed = state.speed;
  let audioOn = true;
  let theme = 'comic';

  function setSpeed(s: number) {
    speed = s;
    gameState.update(st => ({ ...st, speed: s }));
  }

  function resetData() {
    if (typeof window !== 'undefined') {
      for (const key of RESETTABLE_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
      window.location.reload();
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={onClose}>
  <div class="settings-panel" on:click|stopPropagation>
    <div class="st-header">
      <span class="st-icon">⚙</span>
      <span class="st-title">SETTINGS</span>
      <div class="st-close" on:click={onClose}>✕</div>
    </div>

    <div class="st-body">
      <!-- Speed -->
      <div class="st-section">
        <div class="st-label">BATTLE SPEED</div>
        <div class="st-btns">
          {#each [1, 2, 3] as s}
            <button class="spd-btn" class:active={speed === s} on:click={() => setSpeed(s)}>
              {s}x
            </button>
          {/each}
        </div>
      </div>

      <!-- Audio -->
      <div class="st-section">
        <div class="st-label">SOUND EFFECTS</div>
        <div class="st-toggle">
          <button class="tg-btn" class:active={audioOn} on:click={() => audioOn = true}>ON</button>
          <button class="tg-btn" class:active={!audioOn} on:click={() => audioOn = false}>OFF</button>
        </div>
      </div>

      <!-- Theme -->
      <div class="st-section">
        <div class="st-label">THEME</div>
        <div class="st-btns">
          <button class="thm-btn active">🎨 COMIC POP</button>
          <button class="thm-btn" disabled>🌙 DARK (soon)</button>
        </div>
      </div>

      <!-- Chart -->
      <div class="st-section">
        <div class="st-label">DEFAULT PAIR</div>
        <div class="st-btns">
          {#each ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] as p}
            <button class="pair-btn" class:active={state.pair === p}
              on:click={() => gameState.update(s => ({...s, pair: p}))}>
              {p.split('/')[0]}
            </button>
          {/each}
        </div>
      </div>

      <!-- Timeframe -->
      <div class="st-section">
        <div class="st-label">DEFAULT TIMEFRAME</div>
        <div class="st-btns">
          {#each CORE_TIMEFRAME_OPTIONS as tf}
            <button class="tf-btn" class:active={normalizeTimeframe(state.timeframe) === tf.value}
              on:click={() => gameState.update(s => ({...s, timeframe: tf.value}))}>
              {tf.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Data API -->
      <div class="st-section">
        <div class="st-label">DATA SOURCE</div>
        <div class="api-info">
          <span class="api-badge">📡 BINANCE API</span>
          <span class="api-status">CONNECTED</span>
        </div>
        <div class="api-endpoints">
          <div class="api-ep">REST: api.binance.com</div>
          <div class="api-ep">WS: stream.binance.com:9443</div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="st-section danger">
        <div class="st-label">DANGER ZONE</div>
        <button class="reset-btn" on:click={resetData}>
          🗑 RESET ALL DATA
        </button>
        <div class="reset-warn">This will clear all match history, agent data, and settings.</div>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.7);
    backdrop-filter: blur(4px);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
  }
  .settings-panel {
    width: 400px; max-height: 80vh;
    border: 4px solid #000; border-radius: 16px;
    overflow: hidden; box-shadow: 8px 8px 0 #000;
    background: #0a0a1a;
  }
  .st-header {
    padding: 12px 16px;
    background: linear-gradient(90deg, #E8967D, #d07a64);
    border-bottom: 4px solid #000;
    display: flex; align-items: center; gap: 8px;
    color: #000;
  }
  .st-icon { font-size: 18px; }
  .st-title { font-size: 14px; font-weight: 900; font-family: var(--fd); letter-spacing: 3px; }
  .st-close { margin-left: auto; font-size: 16px; cursor: pointer; color: #555; }
  .st-close:hover { color: #000; }

  .st-body { padding: 14px; overflow-y: auto; max-height: calc(80vh - 60px); }

  .st-section { margin-bottom: 16px; }
  .st-section.danger { border-top: 2px solid rgba(255,45,85,.2); padding-top: 14px; margin-top: 8px; }
  .st-label { font-size: 8px; font-weight: 900; font-family: var(--fd); color: #888; letter-spacing: 2px; margin-bottom: 6px; }

  .st-btns { display: flex; gap: 4px; }
  .spd-btn, .tg-btn, .pair-btn, .tf-btn, .thm-btn {
    padding: 6px 14px; border-radius: 8px;
    background: rgba(255,255,255,.05); border: 2px solid rgba(255,255,255,.1);
    color: #888; font-size: 9px; font-weight: 700; font-family: var(--fd);
    cursor: pointer; letter-spacing: 1px; transition: all .15s;
  }
  .spd-btn:hover, .tg-btn:hover, .pair-btn:hover, .tf-btn:hover { background: rgba(255,255,255,.1); color: #fff; }
  .spd-btn.active, .tg-btn.active, .pair-btn.active, .tf-btn.active {
    background: #E8967D; color: #000; border-color: #E8967D;
  }
  .thm-btn.active { background: #E8967D; color: #000; border-color: #E8967D; }
  .thm-btn:disabled { opacity: .3; cursor: not-allowed; }

  .st-toggle { display: flex; gap: 4px; }

  .api-info { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .api-badge { font-size: 9px; color: #E8967D; font-weight: 700; }
  .api-status { font-size: 7px; color: #00ff88; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(0,255,136,.1); }
  .api-ep { font-size: 7px; color: #555; font-family: var(--fm); margin: 2px 0; }

  .reset-btn {
    width: 100%; padding: 10px;
    border-radius: 8px;
    background: rgba(255,45,85,.1); border: 2px solid rgba(255,45,85,.3);
    color: #ff2d55; font-size: 10px; font-weight: 900; font-family: var(--fd);
    letter-spacing: 2px; cursor: pointer; transition: all .15s;
  }
  .reset-btn:hover { background: rgba(255,45,85,.2); border-color: #ff2d55; }
  .reset-warn { font-size: 7px; color: #555; font-family: var(--fm); margin-top: 4px; text-align: center; }
</style>
