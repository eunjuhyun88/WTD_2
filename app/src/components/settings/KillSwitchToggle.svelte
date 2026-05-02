<script lang="ts">
  import { ADAPTER_MODE } from '$lib/config/personalization';

  interface Props {
    value?: boolean;
    onchange?: (v: boolean) => void;
  }

  const isLive = ADAPTER_MODE === 'live';

  const { value = false, onchange }: Props = $props();

  // When no external store is provided, keep own local state.
  // Svelte 5: use a separate initialised-flag to avoid stale-capture warning.
  let localOn = $state(false);
  $effect(() => { localOn = value; });
  const localValue = $derived(localOn);

  function toggle() {
    if (!isLive) return;
    localOn = !localOn;
    onchange?.(localOn);
  }
</script>

<div class="ks-row" class:ks-disabled={!isLive}>
  <div class="ks-text">
    <span class="ks-label">Use baseline model instead</span>
    <span class="ks-helper">
      {#if isLive}
        Cogochi will use the shared baseline model instead of your LoRA adapter.
      {:else}
        Requires H1 verification — available after per-user adapter is live.
      {/if}
    </span>
  </div>

  <div class="ks-control">
    {#if !isLive}
      <span class="ks-requires-badge">Requires H1</span>
    {/if}
    <button
      class="ks-switch"
      class:ks-switch-on={localValue}
      role="switch"
      aria-checked={localValue}
      aria-label="Use baseline model instead"
      disabled={!isLive}
      onclick={toggle}
    >
      <span class="ks-knob"></span>
    </button>
  </div>
</div>

<style>
  .ks-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  .ks-disabled {
    opacity: 0.5;
  }

  .ks-text {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .ks-label {
    font-size: 0.84rem;
    font-weight: 600;
    color: rgba(250, 247, 235, 0.82);
  }

  .ks-helper {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.4);
    line-height: 1.5;
  }

  .ks-control {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .ks-requires-badge {
    font-size: 0.62rem;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(248, 113, 113, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.25);
    color: #f87171;
    letter-spacing: 0.04em;
    font-weight: 600;
    white-space: nowrap;
  }

  .ks-switch {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    padding: 0;
    transition: background 0.15s, border-color 0.15s;
    flex-shrink: 0;
  }

  .ks-switch:not(:disabled):hover {
    border-color: rgba(255, 255, 255, 0.25);
  }

  .ks-switch:disabled {
    cursor: not-allowed;
  }

  .ks-switch-on {
    background: rgba(74, 222, 128, 0.25);
    border-color: rgba(74, 222, 128, 0.5);
  }

  .ks-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: rgba(250, 247, 235, 0.6);
    transition: transform 0.15s;
    pointer-events: none;
  }

  .ks-switch-on .ks-knob {
    transform: translateX(18px);
    background: #4ade80;
  }
</style>
