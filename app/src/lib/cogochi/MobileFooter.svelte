<script lang="ts">
  interface Props {
    symCount?: number;
    live?: boolean;
  }

  const { symCount = 300, live = true }: Props = $props();

  function getTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  let currentTime = $state(getTime());
  $effect(() => {
    const interval = setInterval(() => {
      currentTime = getTime();
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="mobile-footer">
  <span class="dot" class:live />
  <span class="label">{live ? 'scanner live' : 'offline'}</span>
  <span class="sep">·</span>
  <span class="label">{symCount} sym</span>
  <span class="spacer" />
  <span class="time">{currentTime}</span>
</div>

<style>
  .mobile-footer {
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    background: var(--g1);
    border-top: 1px solid var(--g4);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
    letter-spacing: 0.04em;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--g5);
    flex-shrink: 0;
  }

  .dot.live {
    background: var(--pos);
  }

  .label {
    color: var(--g7);
  }

  .sep {
    color: var(--g4);
  }

  .spacer {
    flex: 1;
  }

  .time {
    color: var(--g7);
  }
</style>
