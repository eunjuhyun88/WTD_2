<script lang="ts">
  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    verdicts: number;
    modelDelta: number;
    onSwitchMode: (mode: 'trade' | 'train' | 'flywheel') => void;
    sidebarVisible: boolean;
  }

  const { mode, verdicts, modelDelta, onSwitchMode, sidebarVisible }: Props = $props();

  const modes = [
    { id: 'trade', label: 'TRADE', color: 'var(--pos)' },
    { id: 'train', label: 'TRAIN', color: 'var(--amb)' },
    { id: 'flywheel', label: 'FLYWHEEL', color: '#7aa2e0' },
  ];

  function getTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  let currentTime = $state(getTime());
  $effect(() => {
    const interval = setInterval(() => {
      currentTime = getTime();
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="status-bar">
  <div class="mode-selector">
    {#each modes as m (m.id)}
      <button
        class="mode-btn"
        class:active={mode === m.id}
        style:--mode-color={m.color}
        onclick={() => onSwitchMode(m.id as any)}
      >
        {m.label}
      </button>
    {/each}
  </div>

  <span class="divider">│</span>
  <span class="status-item">
    <span class="dot" />
    scanner live · 300 sym · 14s
  </span>

  <span class="divider">│</span>
  <span class="status-item">
    verdicts <strong>{verdicts}</strong>
  </span>

  <span class="divider">│</span>
  <span class="status-item">
    drift <strong class:positive={modelDelta >= 0} class:negative={modelDelta < 0}>
      {modelDelta >= 0 ? '+' : ''}{modelDelta.toFixed(3)}
    </strong>
  </span>

  <span class="spacer" />

  <span class="status-item">⌘B <span class="divider">·</span> sidebar</span>
  <span class="divider">│</span>
  <span class="status-item">⌘K <span class="divider">·</span> prompt</span>
  <span class="divider">│</span>
  <span class="status-item">⌘T <span class="divider">·</span> new tab</span>
  <span class="divider">│</span>
  <span class="time">{currentTime}</span>
</div>

<style>
  .status-bar {
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 10px;
    background: var(--g1);
    border-top: 1px solid var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g7);
    letter-spacing: 0.04em;
  }

  .mode-selector {
    display: flex;
    gap: 1px;
    background: var(--g2);
    border-radius: 3px;
    padding: 1px;
  }

  .mode-btn {
    padding: 2px 10px;
    border-radius: 2px;
    font-size: 9px;
    background: transparent;
    color: var(--g7);
    letter-spacing: 0.1em;
    font-weight: 400;
    cursor: pointer;
    border: 0.5px solid transparent;
    transition: all 0.15s;
  }

  .mode-btn.active {
    background: var(--g0);
    color: var(--mode-color);
    font-weight: 600;
    border-color: color-mix(in srgb, var(--mode-color) 27%, transparent);
  }

  .divider {
    color: var(--g4);
    margin: 0 3px;
  }

  .status-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .status-item strong {
    color: var(--g8);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pos);
    display: inline-block;
  }

  .positive {
    color: var(--pos);
  }

  .negative {
    color: var(--neg);
  }

  .spacer {
    flex: 1;
  }

  .time {
    color: var(--g7);
  }
</style>
