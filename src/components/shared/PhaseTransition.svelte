<!-- ═══════════════════════════════════════════
  PhaseTransition.svelte — Black-bar transition
  Bars close from top/bottom → text → bars open
  Total ~1400ms
═══════════════════════════════════════════ -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const { text = 'BATTLE!', onComplete = undefined }: {
    text: string;
    onComplete?: (() => void) | undefined;
  } = $props();

  let phase = $state<'closing' | 'showing' | 'opening' | 'done'>('closing');
  let timer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    // closing: 300ms → showing: 800ms → opening: 300ms → done
    timer = setTimeout(() => {
      phase = 'showing';
      timer = setTimeout(() => {
        phase = 'opening';
        timer = setTimeout(() => {
          phase = 'done';
          onComplete?.();
        }, 300);
      }, 800);
    }, 300);
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if phase !== 'done'}
  <div class="phase-transition">
    <div class="pt-bar pt-top" class:closed={phase === 'showing'} class:opening={phase === 'opening'} />
    <div class="pt-bar pt-bottom" class:closed={phase === 'showing'} class:opening={phase === 'opening'} />

    {#if phase === 'showing'}
      <div class="pt-text">{text}</div>
    {/if}
  </div>
{/if}

<style>
  .phase-transition {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: all;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pt-bar {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    background: #0a0a0a;
    transition: height 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pt-top { top: 0; }
  .pt-bottom { bottom: 0; }
  .pt-bar.closed { height: 50%; }
  .pt-bar.opening { height: 0; }

  .pt-text {
    position: relative;
    z-index: 1;
    font-family: 'Space Grotesk', 'JetBrains Mono', monospace;
    font-size: 42px;
    font-weight: 900;
    letter-spacing: 12px;
    color: #f0ede4;
    text-shadow: 0 0 40px rgba(232,150,125,0.6), 0 0 80px rgba(232,150,125,0.3);
    animation: textPop 800ms ease forwards;
  }
  @keyframes textPop {
    0% { opacity: 0; transform: scale(0.5); }
    30% { opacity: 1; transform: scale(1.15); }
    50% { transform: scale(1.0); }
    100% { opacity: 1; transform: scale(1.0); }
  }
</style>
