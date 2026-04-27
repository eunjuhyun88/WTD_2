<script lang="ts">
  /**
   * WatchToggle — small corner toggle for capture cards.
   *
   * Optimistic update: immediately changes UI state on click,
   * reverts if API call fails. Idempotent (engine handles duplicate POSTs).
   */

  interface Props {
    captureId: string;
    isWatching?: boolean;
    expiryHours?: number | null;
    onToggle?: (newState: boolean) => void;
  }

  let { captureId, isWatching = false, expiryHours = null, onToggle }: Props = $props();

  let watching = $state(isWatching);
  let busy = $state(false);
  let pulsing = $state(false);

  async function handleClick() {
    if (busy) return;
    const previous = watching;
    busy = true;
    // Optimistic update
    watching = !previous;

    try {
      const res = await fetch(`/api/captures/${captureId}/watch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(expiryHours ? { expiry_hours: expiryHours } : {}),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      onToggle?.(watching);
      // Pulse on success
      pulsing = true;
      setTimeout(() => { pulsing = false; }, 320);
    } catch {
      // Revert on failure
      watching = previous;
    } finally {
      busy = false;
    }
  }
</script>

<button
  class="watch-toggle"
  class:active={watching}
  class:busy
  class:pulsing
  onclick={handleClick}
  disabled={busy}
  title={watching ? 'Watching — click to unwatch' : 'Click to watch this capture'}
  aria-pressed={watching}
  aria-label={watching ? 'Stop watching' : 'Start watching'}
>
  <span class="icon">👁</span>
</button>

<style>
  .watch-toggle {
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 4px;
    background: transparent;
    border: 1px solid rgba(102, 102, 102, 0.4);
    color: rgba(247, 242, 234, 0.5);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    line-height: 1;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }

  .watch-toggle:hover:not(:disabled) {
    border-color: rgba(74, 222, 128, 0.5);
    color: rgba(247, 242, 234, 0.9);
  }

  .watch-toggle.active {
    background: rgba(74, 222, 128, 0.15);
    border-color: rgba(74, 222, 128, 0.6);
    color: #4ade80;
  }

  .watch-toggle.active:hover:not(:disabled) {
    background: rgba(74, 222, 128, 0.25);
  }

  .watch-toggle.busy {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .watch-toggle.pulsing {
    animation: pulse 320ms ease-out;
  }

  @keyframes pulse {
    0%   { transform: scale(1.0); }
    50%  { transform: scale(1.2); }
    100% { transform: scale(1.0); }
  }

  .icon {
    pointer-events: none;
  }
</style>
