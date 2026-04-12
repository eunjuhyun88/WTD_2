<script lang="ts">
  import type { V2Phase, V2SubPhase } from '$lib/stores/arenaV2State';

  export let phase: V2Phase = 'LOBBY';
  export let subPhase: V2SubPhase = null;
  export let timer: number = 0;
  export let btcPrice: number = 0;

  const PHASES: Array<{ id: V2Phase; label: string; icon: string; color: string }> = [
    { id: 'LOBBY',      label: 'LOBBY',      icon: '⬡', color: '#8b5cf6' },
    { id: 'DRAFT',      label: 'DRAFT',      icon: '⚙', color: '#8b5cf6' },
    { id: 'ANALYSIS',   label: 'ANALYSIS',   icon: '🔍', color: '#cc6600' },
    { id: 'HYPOTHESIS', label: 'HYPOTHESIS', icon: '🎯', color: '#9900cc' },
    { id: 'BATTLE',     label: 'BATTLE',     icon: '⚔', color: '#cc0033' },
    { id: 'RESULT',     label: 'RESULT',     icon: '🏆', color: '#00aa44' },
  ];

  $: currentIdx = PHASES.findIndex(p => p.id === phase);
  $: currentPhase = PHASES[currentIdx] ?? PHASES[0];
  $: displayTimer = timer > 0 ? Math.ceil(timer) + 's' : '';
  $: subLabel = subPhase ? ` · ${subPhase}` : '';
  $: fmtPrice = btcPrice > 0 ? '$' + btcPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
</script>

<div class="phase-bar">
  <div class="pb-left">
    <span class="pb-logo">STOCKCLAW</span>
    <span class="pb-sep">|</span>
    <span class="pb-price">{fmtPrice}</span>
  </div>

  <div class="pb-center">
    {#each PHASES.slice(1) as p, i}
      <div
        class="pb-dot"
        class:active={p.id === phase}
        class:done={i < currentIdx - 1}
        style="--pc:{p.color}"
      >
        <span class="pb-dot-icon">{p.icon}</span>
        <span class="pb-dot-label">{p.label}{p.id === phase ? subLabel : ''}</span>
      </div>
      {#if i < PHASES.length - 2}
        <div class="pb-line" class:filled={i < currentIdx - 1}></div>
      {/if}
    {/each}
  </div>

  <div class="pb-right">
    {#if displayTimer}
      <span class="pb-timer">{displayTimer}</span>
    {/if}
  </div>
</div>

<style>
  .phase-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    padding: 0 16px;
    background: rgba(15, 14, 12, 0.98);
    border-bottom: 1px solid rgba(240, 237, 228, 0.06);
    flex-shrink: 0;
    z-index: 50;
  }

  .pb-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 180px;
  }
  .pb-logo {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 3px;
    color: #E8967D;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }
  .pb-sep { color: rgba(240, 237, 228, 0.1); font-size: 10px; }
  .pb-price {
    font-size: 12px;
    font-weight: 700;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
    font-family: var(--fm, 'JetBrains Mono', monospace);
  }

  .pb-center {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .pb-dot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-radius: 6px;
    opacity: 0.3;
    transition: all 0.2s;
    min-width: 60px;
  }
  .pb-dot.active {
    opacity: 1;
    background: rgba(232, 150, 125, 0.08);
  }
  .pb-dot.done {
    opacity: 0.6;
  }
  .pb-dot-icon {
    font-size: 12px;
  }
  .pb-dot-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(240, 237, 228, 0.8);
    font-family: var(--fm, 'JetBrains Mono', monospace);
  }
  .pb-dot.active .pb-dot-label {
    color: var(--pc, #E8967D);
  }

  .pb-line {
    width: 20px;
    height: 1px;
    background: rgba(240, 237, 228, 0.08);
  }
  .pb-line.filled {
    background: rgba(232, 150, 125, 0.4);
  }

  .pb-right {
    display: flex;
    align-items: center;
    min-width: 60px;
    justify-content: flex-end;
  }
  .pb-timer {
    font-size: 14px;
    font-weight: 800;
    color: #E8967D;
    font-variant-numeric: tabular-nums;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    animation: timerPulse 1s ease-in-out infinite;
  }

  @keyframes timerPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
