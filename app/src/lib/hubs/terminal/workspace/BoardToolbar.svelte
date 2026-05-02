<script lang="ts">
  interface Props {
    name?: string;
    layout?: 'hero3' | 'compare2x2' | 'focus';
    assetsCount?: number;
    onLayout?: (l: 'hero3' | 'compare2x2' | 'focus') => void;
    onCompare?: () => void;
    onClear?: () => void;
  }

  let {
    name = 'Board',
    layout = 'hero3',
    assetsCount = 0,
    onLayout,
    onCompare,
    onClear,
  }: Props = $props();

  const LAYOUTS: { id: 'hero3' | 'compare2x2' | 'focus'; label: string; icon: string }[] = [
    { id: 'focus',      label: 'Focus',   icon: '▣' },
    { id: 'hero3',      label: 'Hero+3',  icon: '⊞' },
    { id: 'compare2x2', label: '2×2',     icon: '⊟' },
  ];
</script>

<div class="board-toolbar">
  <div class="toolbar-left">
    <span class="board-name">{name}</span>
    {#if assetsCount > 0}
      <span class="asset-count">{assetsCount}</span>
    {/if}
  </div>

  <div class="toolbar-center">
    <div class="layout-pills">
      {#each LAYOUTS as l}
        <button
          class="layout-pill"
          class:active={layout === l.id}
          onclick={() => onLayout?.(l.id)}
          title={l.label}
        >
          <span class="pill-icon">{l.icon}</span>
          <span class="pill-label">{l.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="toolbar-right">
    {#if assetsCount >= 2}
      <button class="toolbar-btn" onclick={onCompare} title="Switch to compare mode">
        Compare
      </button>
    {/if}
    {#if assetsCount > 0}
      <button class="toolbar-btn danger" onclick={onClear} title="Clear board">
        Clear
      </button>
    {/if}
  </div>
</div>

<style>
  .board-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 32px;
    padding: 0 16px;
    background: var(--sc-terminal-bg);
    border-bottom: 1px solid var(--sc-terminal-border-soft);
    flex-shrink: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .board-name {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sc-text-2);
  }

  .asset-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-2);
  }

  .toolbar-center {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .layout-pills {
    display: flex;
    gap: 1px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 4px;
    padding: 2px;
  }

  .layout-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: none;
    border-radius: 3px;
    background: none;
    cursor: pointer;
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 600;
    transition: all var(--sc-duration-fast);
  }

  .layout-pill:hover {
    color: var(--sc-text-1);
    background: rgba(255, 255, 255, 0.06);
  }

  .layout-pill.active {
    color: var(--sc-text-0);
    background: rgba(255, 255, 255, 0.12);
  }

  .pill-icon {
    font-size: 11px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .toolbar-btn {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: none;
    color: var(--sc-text-2);
    cursor: pointer;
    transition: all var(--sc-duration-fast);
  }

  .toolbar-btn:hover {
    color: var(--sc-text-0);
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.04);
  }

  .toolbar-btn.danger:hover {
    color: var(--sc-bad);
    border-color: rgba(248, 113, 113, 0.3);
  }
</style>
