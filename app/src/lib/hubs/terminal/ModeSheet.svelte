<script lang="ts">
  interface Props {
    activeMode: 'trade' | 'train' | 'flywheel';
    onClose: () => void;
  }

  const { activeMode, onClose }: Props = $props();

  const modes = [
    { id: 'trade',     icon: '◆', label: 'TRADE',    sub: 'Chart · Scan · Judge', locked: false,  color: 'var(--brand)' },
    { id: 'train',     icon: '◈', label: 'TRAIN',    sub: 'PC recommended',       locked: true,   color: 'var(--amb)' },
    { id: 'flywheel',  icon: '◉', label: 'FLYWHEEL', sub: 'PC recommended',       locked: true,   color: '#7aa2e0' },
  ] as const;

  function onBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('ms-backdrop')) onClose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ms-backdrop" onclick={onBackdropClick}>
  <div class="ms-sheet">
    <div class="ms-handle-bar"><div class="ms-handle"></div></div>
    <div class="ms-title">MODE</div>
    <div class="ms-list">
      {#each modes as m}
        <div
          class="ms-row"
          class:active={activeMode === m.id}
          class:locked={m.locked}
          style:--mc={m.color}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && !m.locked && onClose()}
          onclick={() => !m.locked && onClose()}
        >
          <span class="ms-icon" style:color={m.color}>{m.icon}</span>
          <div class="ms-info">
            <span class="ms-label">{m.label}</span>
            <span class="ms-sub">{m.sub}</span>
          </div>
          {#if activeMode === m.id}
            <span class="ms-active-dot"></span>
          {:else if m.locked}
            <span class="ms-lock">PC only</span>
          {/if}
        </div>
      {/each}
    </div>
    <button class="ms-close" onclick={onClose}>Close</button>
  </div>
</div>

<style>
  .ms-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 300;
    display: flex;
    align-items: flex-end;
  }

  .ms-sheet {
    width: 100%;
    background: var(--g1);
    border-top: 1px solid var(--g4);
    border-radius: 10px 10px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    animation: msUp 0.18s ease;
  }

  @keyframes msUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  .ms-handle-bar {
    display: flex;
    justify-content: center;
    padding: 8px 0 4px;
  }
  .ms-handle {
    width: 36px; height: 4px;
    background: var(--g4);
    border-radius: 2px;
  }

  .ms-title {
    padding: 4px 16px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.14em;
  }

  .ms-list {
    display: flex;
    flex-direction: column;
  }

  .ms-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    cursor: pointer;
    border-top: 0.5px solid var(--g3);
    transition: background 0.1s;
  }
  .ms-row:active { background: var(--g2); }
  .ms-row.locked { opacity: 0.5; cursor: default; }
  .ms-row.active { background: color-mix(in srgb, var(--mc) 8%, transparent); }

  .ms-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .ms-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ms-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--g9);
    letter-spacing: 0.06em;
  }
  .ms-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
  }

  .ms-active-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--mc);
    flex-shrink: 0;
  }

  .ms-lock {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    background: var(--g2);
    padding: 2px 6px;
    border-radius: 3px;
    border: 0.5px solid var(--g4);
  }

  .ms-close {
    display: block;
    width: calc(100% - 32px);
    margin: 12px 16px;
    padding: 12px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--g6);
    cursor: pointer;
    text-align: center;
  }
  .ms-close:active { background: var(--g3); }
</style>
