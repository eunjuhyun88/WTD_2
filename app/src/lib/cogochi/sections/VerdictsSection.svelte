<script lang="ts">
  import SectionHeader from './SectionHeader.svelte';

  interface Props {
    onOpenTab: (tab: any) => void;
  }

  const { onOpenTab }: Props = $props();

  const verdicts = [
    { sym: 'BTCUSDT', setup: 'tradoor_v2', v: 'agree', when: '09:12', alpha: 82, pnl: null },
    { sym: 'ETHUSDT', setup: 'vwap', v: 'disagree', when: '08:58', alpha: 68, pnl: null },
    { sym: 'AVAXUSDT', setup: 'tradoor_v2', v: 'agree', when: '07:58', alpha: 74, pnl: '+2.4%' },
    { sym: 'DOGEUSDT', setup: 'cvd_div', v: 'disagree', when: '08:31', alpha: -32, pnl: null },
    { sym: 'SOLUSDT', setup: 'tradoor_v2', v: 'agree', when: '06:14', alpha: 71, pnl: '+1.1%' },
  ];
</script>

<div class="section">
  <SectionHeader label="RECENT VERDICTS" hint="learning signal" />
  {#each verdicts as v, i (i)}
    <div
      class="item"
      class:agree={v.v === 'agree'}
      class:disagree={v.v === 'disagree'}
      onclick={() => onOpenTab({ id: `v_${i}`, kind: 'rejudge', title: `${v.sym} · rejudge`, verdict: v })}
    >
      <div class="header">
        <span class="verdict">{v.v === 'agree' ? 'Y' : 'N'}</span>
        <span class="symbol">{v.sym}</span>
        <span class="time">{v.when}</span>
      </div>
      <div class="meta">
        <span class="setup">#{v.setup}</span>
        <span class="alpha">α{v.alpha}</span>
        {#if v.pnl}
          <span class="pnl" class:positive={v.pnl.startsWith('+')}>{v.pnl}</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
  }

  .item {
    padding: 7px 12px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: all 0.1s;
  }

  .item.agree {
    border-left-color: var(--pos-d);
  }

  .item.disagree {
    border-left-color: var(--neg-d);
  }

  .item:hover {
    background: var(--g2);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .verdict {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--pos);
  }

  .item.disagree .verdict {
    color: var(--neg);
  }

  .symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g9);
    font-weight: 500;
  }

  .time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    margin-left: auto;
  }

  .meta {
    display: flex;
    gap: 6px;
    margin-left: 16px;
    margin-top: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
  }

  .setup {
    color: var(--g6);
  }

  .alpha {
    color: var(--g5);
  }

  .pnl {
    color: var(--neg);
    margin-left: auto;
  }

  .pnl.positive {
    color: var(--pos);
  }
</style>
