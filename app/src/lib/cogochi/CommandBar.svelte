<script lang="ts">
  import CommandPalette from './CommandPalette.svelte';

  interface Props {
    sessionName: string;
    onRangeSelect: () => void;
    hasRange: boolean;
    aiVisible?: boolean;
    toggleAI?: () => void;
    paletteOpen: boolean;
    setPaletteOpen: (open: boolean) => void;
    onIndicators?: () => void;
  }

  // `onIndicators` reserved for future use (currently the indicator sheet is opened via cogochi:cmd).
  const { sessionName, onRangeSelect, hasRange, aiVisible, toggleAI, paletteOpen, setPaletteOpen, onIndicators: _onIndicators }: Props = $props();
  let q = $state('');

  $effect(() => {
    if (!paletteOpen) q = '';
  });
</script>

<div class="command-bar">
  <span class="logo">COGOTCHI</span>
  <span class="divider"></span>

  <div class="session-chip">
    <span class="pos">▸</span>
    <span class="dim">tab</span>
    <span class="text">{sessionName}</span>
  </div>

  <button class="palette-btn" class:open={paletteOpen} onclick={() => setPaletteOpen(!paletteOpen)}>
    <span class="dim">/</span>
    <span>command</span>
    <span class="kbd">⌘P</span>
  </button>

  <span class="spacer"></span>

  <button
    class="range-btn"
    class:active={hasRange}
    onclick={onRangeSelect}
  >
    ◈ {hasRange ? 'RANGE 12 bars' : 'SELECT RANGE'}
  </button>

  {#if toggleAI}
    <span class="divider"></span>

    <button
      class="ai-btn"
      class:active={aiVisible}
      title="Toggle AI panel"
      onclick={toggleAI}
    >
      <span class="dot" class:active={aiVisible}></span>
      AI
    </button>
  {/if}

  {#if paletteOpen}
    <CommandPalette
      {q}
      onClose={() => setPaletteOpen(false)}
      onChange={(newQ) => q = newQ}
    />
  {/if}
</div>

<style>
  .command-bar {
    position: relative;
    z-index: 40;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: var(--g1);
    border-bottom: 1px solid var(--g5);
    flex-shrink: 0;
  }

  .logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--brand);
    font-weight: 600;
    letter-spacing: 0.14em;
    margin-right: 2px;
  }

  .divider {
    width: 1px;
    height: 14px;
    background: var(--g4);
  }

  .session-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    background: var(--g2);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g7);
  }

  .pos {
    color: var(--brand);
  }

  .dim {
    color: var(--g5);
  }

  .text {
    color: var(--g9);
  }

  .palette-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g6);
    cursor: pointer;
    transition: all 0.15s;
  }

  .palette-btn:hover,
  .palette-btn.open {
    background: var(--g3);
    color: var(--g8);
    border-color: var(--g5);
  }

  .kbd {
    margin-left: 6px;
    padding: 1px 4px;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 2px;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.1em;
  }

  .spacer {
    flex: 1;
  }

  .range-btn {
    padding: 3px 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g6);
    background: transparent;
    border: 0.5px dashed var(--g4);
    border-radius: 3px;
    letter-spacing: 0.06em;
    height: 22px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .range-btn.active {
    color: var(--amb);
    background: var(--amb-dd);
    border-color: var(--amb-d);
  }

  .ai-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    color: var(--g6);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ai-btn.active {
    background: var(--brand-dd);
    color: var(--brand);
    border-color: var(--brand-d);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--g5);
    transition: background 0.15s;
  }

  .dot.active {
    background: var(--brand);
  }

  @media (max-width: 900px) {
    .session-chip { display: none; }
    .kbd { display: none; }
  }
</style>
