<script lang="ts">
  import SectionHeader from './SectionHeader.svelte';

  interface Props {
    onOpenTab: (tab: any) => void;
  }

  const { onOpenTab }: Props = $props();

  const suggestions = [
    { text: 'OI spike + range 3h · accumulation', tag: 'tradoor_v2', matches: 8 },
    { text: 'real_dump + higher-lows + funding flip', tag: 'ptb', matches: 5 },
    { text: 'VWAP reclaim + CVD positive flip', tag: 'vwap', matches: 11 },
    { text: 'BB squeeze release · 15m', tag: 'squeeze', matches: 3 },
  ];

  const items = [];

  function openSetup(index: number): void {
    const setup = suggestions[index];
    onOpenTab({ id: `setup_${index}`, kind: 'trade', title: `/ ${setup.tag}`, prompt: setup.text });
  }

  function onItemKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSetup(index);
    }
  }
</script>

<div class="section">
  <SectionHeader label="SAVED SETUPS" hint={`${suggestions.length} patterns`} />
  {#each suggestions as s, i (i)}
    <div
      class="item"
      onclick={() => openSetup(i)}
      onkeydown={(event) => onItemKeyDown(event, i)}
      role="button"
      tabindex="0"
    >
      <div class="item-header">
        <span class="slash">/</span>
        <span class="tag">{s.tag}</span>
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

  .slash {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--brand);
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g8);
    font-weight: 500;
  }

  .matches {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--amb);
    margin-left: auto;
  }

  .item-text {
    font-size: var(--ui-text-xs);
    color: var(--g6);
    line-height: 1.4;
    margin-top: 2px;
    margin-left: 14px;
  }

  .empty {
    padding: 12px;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    text-align: center;
  }
</style>
