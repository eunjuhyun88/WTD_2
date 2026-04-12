<!-- ═══════════════════════════════════════════
  PartyTray.svelte — 3-slot party tray
  Vertical (Battle) or horizontal (Draft)
  Mini sprites + energy bar per agent
═══════════════════════════════════════════ -->
<script lang="ts">
  import HPBar from './HPBar.svelte';

  interface PartyAgent {
    agentId: string;
    name: string;
    icon: string;
    imgSrc: string;
    energy: number;
    maxEnergy: number;
    isActive?: boolean;
    isExhausted?: boolean;
  }

  const {
    agents = [],
    activeIndex = 0,
    orientation = 'vertical',
  }: {
    agents: PartyAgent[];
    activeIndex?: number;
    orientation?: 'vertical' | 'horizontal';
  } = $props();
</script>

<div class="party-tray {orientation}">
  {#each agents as agent, i}
    <div
      class="party-slot"
      class:active={i === activeIndex}
      class:exhausted={agent.isExhausted}
    >
      <div class="slot-sprite">
        <img src={agent.imgSrc} alt={agent.name} class="slot-img" />
        {#if agent.isExhausted}
          <div class="slot-faint">X</div>
        {/if}
      </div>
      <div class="slot-info">
        <span class="slot-name">{agent.icon} {agent.agentId}</span>
        <HPBar value={agent.energy} max={agent.maxEnergy} label="" showValue={false} size="sm" />
      </div>
    </div>
  {/each}

  {#each { length: Math.max(0, 3 - agents.length) } as _}
    <div class="party-slot empty">
      <div class="slot-sprite empty-sprite">—</div>
    </div>
  {/each}
</div>

<style>
  .party-tray {
    display: flex;
    gap: 4px;
  }
  .party-tray.vertical {
    flex-direction: column;
    width: 72px;
  }
  .party-tray.horizontal {
    flex-direction: row;
  }

  .party-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border: 2px solid #2a2a44;
    border-radius: 6px;
    background: #12121e;
    transition: all 200ms;
  }
  .party-slot.active {
    border-color: #e8967d;
    background: rgba(232,150,125,0.08);
    box-shadow: 0 0 8px rgba(232,150,125,0.2);
  }
  .party-slot.exhausted {
    opacity: 0.4;
    filter: grayscale(0.8);
  }
  .party-slot.empty {
    border-style: dashed;
    border-color: #1e1e34;
    opacity: 0.3;
  }

  .slot-sprite {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255,255,255,0.03);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .slot-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }
  .slot-faint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.6);
    color: #ff4444;
    font-weight: 900;
    font-size: 16px;
  }
  .empty-sprite {
    font-size: 14px;
    color: rgba(255,255,255,0.15);
  }

  .slot-info {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .slot-name {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(224,224,224,0.6);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
  }
</style>
