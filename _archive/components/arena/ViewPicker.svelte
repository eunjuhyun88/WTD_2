<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ArenaView } from '$lib/stores/gameState';

  export let current: ArenaView = 'chart';

  const dispatch = createEventDispatcher<{ select: ArenaView }>();

  const views: Array<{ id: ArenaView; name: string; icon: string; desc: string }> = [
    { id: 'chart',   name: 'CHART WAR',       icon: '◎', desc: 'Chart is the game board' },
    { id: 'arena',   name: 'AGENT ARENA',     icon: '⚔', desc: 'RPG boss battle' },
    { id: 'mission', name: 'MISSION CONTROL', icon: '▦', desc: 'Trading desk dashboard' },
    { id: 'card',    name: 'CARD DUEL',       icon: '▧', desc: 'Card game mechanics' },
  ];
</script>

<div class="vp">
  <div class="vp-title">SELECT VIEW</div>
  <div class="vp-grid">
    {#each views as v}
      <button
        class="vp-card"
        class:active={current === v.id}
        on:click={() => { dispatch('select', v.id); }}
      >
        <span class="vp-icon">{v.icon}</span>
        <span class="vp-name">{v.name}</span>
        <span class="vp-desc">{v.desc}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .vp { padding: 12px 0; }
  .vp-title {
    font-size: 9px; letter-spacing: 2px; color: rgba(240,237,228,.4);
    font-family: var(--fm, 'JetBrains Mono', monospace);
    margin-bottom: 8px;
  }
  .vp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .vp-card {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 12px 8px; border-radius: 8px;
    background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
    color: #F0EDE4; cursor: pointer; transition: all .15s;
    font-family: var(--fm, 'JetBrains Mono', monospace);
  }
  .vp-card:hover { background: rgba(232,150,125,.08); border-color: rgba(232,150,125,.2); }
  .vp-card.active { background: rgba(232,150,125,.12); border-color: #E8967D; }
  .vp-icon { font-size: 20px; }
  .vp-name { font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .vp-desc { font-size: 7px; color: rgba(240,237,228,.4); text-align: center; }
</style>
