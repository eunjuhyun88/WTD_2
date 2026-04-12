<script lang="ts">
  import type { Phase } from '$lib/stores/gameState';

  interface Props {
    phase?: Phase;
    pair?: string;
    timeframe?: string;
  }

  let { phase = 'DRAFT' as Phase, pair = 'BTC/USDT', timeframe = '4h' }: Props = $props();

  const GUIDE = $derived<Record<Phase, { title: string; desc: string; action: string; icon: string }>>({
    DRAFT:      { title: 'BUILD SQUAD',     desc: 'Select your AI agents and configure risk parameters',  action: 'Pick agents',         icon: '⚙' },
    ANALYSIS:   { title: 'SCANNING',        desc: `Agents analyzing ${pair} ${timeframe} chart`,          action: 'Watch agents report',  icon: '◉' },
    HYPOTHESIS: { title: 'YOUR CALL',       desc: 'Set your direction, entry, TP, and SL on the chart',   action: 'Set TP/SL levels',     icon: '◎' },
    BATTLE:     { title: 'MARKET DECIDES',  desc: 'Live price tracking against your TP and SL levels',    action: 'Watch the chart',      icon: '⚡' },
    RESULT:     { title: 'COMPLETE',        desc: 'Review your performance and agent accuracy',           action: 'Review results',       icon: '■' },
  });

  const g = $derived(GUIDE[phase] || GUIDE.DRAFT);

  let visible = $state(false);
  let prevPhase = $state<Phase>('DRAFT');
  let initialized = $state(false);

  $effect(() => {
    if (!initialized) {
      prevPhase = phase;
      initialized = true;
      return;
    }

    if (phase !== prevPhase) {
      prevPhase = phase;
      visible = true;
      const timer = setTimeout(() => { visible = false; }, 2800);
      return () => clearTimeout(timer);
    }
  });
</script>

{#if visible}
  <div class="pg" class:battle={phase === 'BATTLE'} class:result={phase === 'RESULT'}>
    <div class="pg-icon">{g.icon}</div>
    <div class="pg-content">
      <div class="pg-title">{g.title}</div>
      <div class="pg-desc">{g.desc}</div>
      <div class="pg-action">{g.action}</div>
    </div>
  </div>
{/if}

<style>
  .pg {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    background: rgba(10,9,8,.92);
    border: 1px solid rgba(232,150,125,.2);
    border-radius: 8px;
    backdrop-filter: blur(8px);
    animation: pgSlide .4s ease;
    font-family: var(--fm, 'JetBrains Mono', monospace);
  }
  .pg.battle { border-color: rgba(255,45,85,.3); }
  .pg.result { border-color: rgba(0,255,136,.3); }

  .pg-icon {
    font-size: 20px; width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(232,150,125,.1); border-radius: 8px;
    color: #E8967D;
  }
  .pg-content { flex: 1; min-width: 0; }
  .pg-title { font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #F0EDE4; }
  .pg-desc { font-size: 9px; color: rgba(240,237,228,.5); margin-top: 2px; }
  .pg-action { font-size: 8px; color: #E8967D; margin-top: 3px; letter-spacing: 1px; text-transform: uppercase; }

  @keyframes pgSlide {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
