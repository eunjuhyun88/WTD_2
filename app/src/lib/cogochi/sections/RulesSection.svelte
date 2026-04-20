<script lang="ts">
  import SectionHeader from './SectionHeader.svelte';

  interface Props {
    onOpenTab: (tab: any) => void;
  }

  const { onOpenTab }: Props = $props();

  const rules = [
    { id: 'r1', title: 'Tradoor v2 — 5-phase OI reversal', weight: 0.82, live: true },
    { id: 'r2', title: 'VWAP reclaim + CVD', weight: 0.61, live: true },
    { id: 'r3', title: 'Consecutive higher-lows', weight: 0.54, live: true },
    { id: 'r4', title: 'CVD bearish divergence', weight: 0.31, live: false },
  ];
</script>

<div class="section">
  <SectionHeader label="MY RULES" hint="per-user model" action="+ new" />
  {#each rules as r (r.id)}
    <div
      class="item"
      onclick={() => onOpenTab({ id: r.id, kind: 'rule', title: r.title, rule: r })}
    >
      <div class="header">
        <span class="dot" class:live={r.live} />
        <span class="title">{r.title}</span>
      </div>
      <div class="bar-container">
        <div class="bar">
          <div class="fill" style:width={`${r.weight * 100}%`} class:live={r.live} />
        </div>
        <span class="weight">{r.weight.toFixed(2)}</span>
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
    transition: background 0.1s;
  }

  .item:hover {
    background: var(--g2);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--g4);
  }

  .dot.live {
    background: var(--pos);
  }

  .title {
    font-size: 10px;
    color: var(--g8);
    line-height: 1.3;
    flex: 1;
  }

  .bar-container {
    display: flex;
    gap: 6px;
    margin-left: 12px;
    margin-top: 3px;
    align-items: center;
  }

  .bar {
    flex: 1;
    height: 3px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--g5);
    transition: background 0.2s;
  }

  .fill.live {
    background: var(--pos);
  }

  .weight {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g6);
  }
</style>
