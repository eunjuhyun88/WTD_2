<script lang="ts">
  import SectionHeader from './SectionHeader.svelte';

  interface Props {
    onOpenTab: (tab: any) => void;
  }

  const { onOpenTab }: Props = $props();

  const suggestions = [
    { text: 'OI 급증 후 번지대 3시간 · accumulation', tag: 'tradoor_v2', matches: 8 },
    { text: 'real_dump 후 higher-lows + funding 플립', tag: 'ptb', matches: 5 },
    { text: 'VWAP reclaim + CVD 양전환', tag: 'vwap', matches: 11 },
    { text: 'BB squeeze 해제 · 15m', tag: 'squeeze', matches: 3 },
  ];

  const items = [];
</script>

<div class="section">
  <SectionHeader label="SAVED SETUPS" hint={`${suggestions.length} patterns`} />
  {#each suggestions as s, i (i)}
    <div
      class="item"
      onclick={() => onOpenTab({ id: `setup_${i}`, kind: 'trade', title: `/ ${s.tag}`, prompt: s.text })}
    >
      <div class="item-header">
        <span class="tag">/{s.tag}</span>
        <span class="matches">{s.matches}</span>
      </div>
      <div class="item-text">{s.text}</div>
    </div>
  {/each}

  <SectionHeader label="RAW CAPTURES" hint={`${items.length}`} />
  {#if items.length === 0}
    <div class="empty">No captures yet</div>
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
  }

  .item {
    padding: 6px 12px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: all 0.1s;
  }

  .item:hover {
    background: var(--g2);
    border-left-color: var(--g7);
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g8);
    font-weight: 500;
  }

  .matches {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--pos);
    margin-left: auto;
  }

  .item-text {
    font-size: 10px;
    color: var(--g6);
    line-height: 1.4;
    margin-top: 2px;
    margin-left: 14px;
  }

  .empty {
    padding: 12px;
    font-size: 10px;
    color: var(--g7);
    text-align: center;
  }
</style>
