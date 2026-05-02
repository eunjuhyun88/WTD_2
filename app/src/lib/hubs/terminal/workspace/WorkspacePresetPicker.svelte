<script lang="ts">
  /**
   * Compact workspace preset picker dropdown.
   *
   * Mounts in the layout-strip nav — shows current preset name (or "custom")
   * and opens a small menu to switch / save / delete.
   */

  import {
    presets,
    activePresetName,
    apply as applyPreset,
    saveCurrentAs,
    remove as removePreset,
  } from './workspacePresets';

  let open = $state(false);
  let savingAs = $state(false);
  let newName = $state('');
  let rootEl: HTMLDivElement | undefined = $state();

  const activeLabel = $derived($activePresetName ?? 'custom');

  function toggle() {
    open = !open;
    if (!open) savingAs = false;
  }

  function pick(name: string) {
    applyPreset(name);
    open = false;
  }

  function startSave() {
    savingAs = true;
    newName = $activePresetName && !isBuiltin($activePresetName) ? $activePresetName : '';
    queueMicrotask(() => {
      const input = rootEl?.querySelector<HTMLInputElement>('input.save-input');
      input?.focus();
      input?.select();
    });
  }

  function isBuiltin(name: string): boolean {
    return $presets.some(p => p.name === name && p.builtin);
  }

  function commitSave() {
    const name = newName.trim();
    if (!name) { savingAs = false; return; }
    saveCurrentAs(name);
    savingAs = false;
    open = false;
    newName = '';
  }

  function del(e: MouseEvent, name: string) {
    e.stopPropagation();
    if (confirm(`Delete preset "${name}"?`)) removePreset(name);
  }

  function onDocClick(e: MouseEvent) {
    if (!rootEl) return;
    if (!rootEl.contains(e.target as Node)) {
      open = false;
      savingAs = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; savingAs = false; }
    if (e.key === 'Enter' && savingAs) commitSave();
  }

  function onItemKeyDown(event: KeyboardEvent, name: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(name);
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }
  });
</script>

<div class="wsp-root" bind:this={rootEl}>
  <button
    class="wsp-trigger"
    class:open
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    title="Workspace Presets"
  >
    <span class="wsp-icon">◱</span>
    <span class="wsp-label">{activeLabel}</span>
    <span class="wsp-chev">{open ? '▾' : '▸'}</span>
  </button>

  {#if open}
    <div class="wsp-menu" role="menu">
      <div class="wsp-header">WORKSPACE PRESETS</div>
      {#each $presets as p}
        <div
          class="wsp-item"
          class:active={$activePresetName === p.name}
          onclick={() => pick(p.name)}
          role="menuitemradio"
          aria-checked={$activePresetName === p.name}
          tabindex="0"
          onkeydown={(event) => onItemKeyDown(event, p.name)}
        >
          <span class="wsp-marker" aria-hidden="true">{$activePresetName === p.name ? '●' : '○'}</span>
          <span class="wsp-name">{p.name}</span>
          {#if p.builtin}
            <span class="wsp-tag builtin">built-in</span>
          {:else}
            <button class="wsp-del" onclick={(e) => del(e, p.name)} aria-label="Delete {p.name}">✕</button>
          {/if}
        </div>
      {/each}

      <div class="wsp-sep"></div>

      {#if savingAs}
        <div class="wsp-save-row">
          <input
            class="save-input"
            type="text"
            bind:value={newName}
            placeholder="preset name"
            maxlength="24"
          />
          <button class="wsp-btn save" onclick={commitSave}>save</button>
          <button class="wsp-btn cancel" onclick={() => savingAs = false}>cancel</button>
        </div>
      {:else}
        <button class="wsp-item action" onclick={startSave}>
          <span class="wsp-marker" aria-hidden="true">+</span>
          <span class="wsp-name">save current as…</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wsp-root {
    position: relative;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }
  .wsp-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    background: var(--g0, #0a0a0a);
    border: 0.5px solid var(--g4, rgba(255,255,255,0.15));
    color: var(--g7, rgba(255,255,255,0.6));
    border-radius: 4px;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .wsp-trigger:hover,
  .wsp-trigger.open {
    background: var(--g1, rgba(255,255,255,0.04));
    color: var(--g9, rgba(255,255,255,0.85));
  }
  .wsp-icon {
    font-size: 11px;
    color: var(--brand, #5b8dee);
  }
  .wsp-label {
    font-weight: 600;
    min-width: 40px;
  }
  .wsp-chev {
    font-size: var(--ui-text-xs);
    color: var(--g5);
  }
  .wsp-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 200px;
    background: var(--g1, rgba(20,20,20,0.98));
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
    z-index: 100;
  }
  .wsp-header {
    font-size: var(--ui-text-xs);
    letter-spacing: 0.12em;
    color: var(--g5);
    padding: 4px 8px 3px;
    text-transform: uppercase;
  }
  .wsp-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    background: transparent;
    border: none;
    color: var(--g8);
    cursor: pointer;
    font-size: var(--ui-text-xs);
    font-family: inherit;
    letter-spacing: 0.02em;
    border-radius: 3px;
    text-align: left;
  }
  .wsp-item:hover { background: var(--g2, rgba(255,255,255,0.06)); }
  .wsp-item.active { color: var(--g9); }
  .wsp-item.active .wsp-marker { color: var(--brand); }
  .wsp-item.action { color: var(--brand, #5b8dee); }
  .wsp-marker {
    display: inline-block;
    width: 10px;
    text-align: center;
    font-size: var(--ui-text-xs);
    color: var(--g5);
  }
  .wsp-name { flex: 1; }
  .wsp-tag.builtin {
    font-size: var(--ui-text-xs);
    color: var(--g5);
    padding: 1px 4px;
    background: var(--g2);
    border-radius: 2px;
    letter-spacing: 0.08em;
  }
  .wsp-del {
    background: transparent;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: var(--ui-text-xs);
    padding: 0 3px;
    line-height: 1;
  }
  .wsp-del:hover { color: var(--neg, #e05c5c); }
  .wsp-sep {
    height: 1px;
    background: var(--g3);
    margin: 4px 2px;
  }
  .wsp-save-row {
    display: flex;
    gap: 3px;
    padding: 4px;
  }
  .save-input {
    flex: 1;
    min-width: 0;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    color: var(--g9);
    padding: 3px 6px;
    font-family: inherit;
    font-size: var(--ui-text-xs);
    border-radius: 3px;
    outline: none;
  }
  .save-input:focus { border-color: var(--brand); }
  .wsp-btn {
    padding: 3px 7px;
    border: 0.5px solid var(--g4);
    background: var(--g2);
    color: var(--g8);
    font-family: inherit;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.05em;
    border-radius: 3px;
    cursor: pointer;
  }
  .wsp-btn:hover { background: var(--g3); }
  .wsp-btn.save {
    background: var(--brand, #5b8dee);
    color: var(--g0, #0a0a0a);
    border-color: var(--brand);
    font-weight: 600;
  }
</style>
