<script lang="ts">
  import { terminalMode, type TerminalMode } from '$lib/stores/terminalMode';

  const modes: { id: TerminalMode; label: string }[] = [
    { id: 'observe', label: 'Observe' },
    { id: 'analyze', label: 'Analyze' },
    { id: 'execute', label: 'Execute' },
  ];
</script>

<div class="mode-toggle" role="group" aria-label="Terminal mode">
  {#each modes as m}
    <button
      class="mode-btn"
      class:active={$terminalMode === m.id}
      class:observe={m.id === 'observe' && $terminalMode === 'observe'}
      class:execute={m.id === 'execute' && $terminalMode === 'execute'}
      onclick={() => terminalMode.set(m.id)}
      aria-pressed={$terminalMode === m.id}
    >
      {m.label}
    </button>
  {/each}
</div>

<style>
  .mode-toggle {
    display: flex;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    overflow: hidden;
  }
  .mode-btn {
    background: transparent;
    border: none;
    border-right: 1px solid rgba(255,255,255,0.08);
    color: rgba(209,212,220,0.55);
    padding: 4px 12px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .mode-btn:last-child { border-right: none; }
  .mode-btn:hover { background: rgba(255,255,255,0.04); color: rgba(209,212,220,0.8); }
  .mode-btn.active { background: rgba(255,255,255,0.07); color: rgba(209,212,220,0.92); }
  .mode-btn.observe.active { background: rgba(99,179,237,0.09); color: #63b3ed; }
  .mode-btn.execute.active { background: rgba(104,211,145,0.09); color: #68d391; }
</style>
