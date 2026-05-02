<script lang="ts">
  interface Props {
    symbolCount: number;
    maxSymbols: number;
    folded: boolean;
    addOpen: boolean;
    addInput: string;
    addError: string;
    onToggleFold: () => void;
    onToggleAdd: () => void;
    onAddConfirm: () => void;
    onAddCancel: () => void;
    onAddKeydown: (e: KeyboardEvent) => void;
  }

  let {
    symbolCount,
    maxSymbols,
    folded,
    addOpen,
    addInput = $bindable(),
    addError,
    onToggleFold,
    onToggleAdd,
    onAddConfirm,
    onAddCancel,
    onAddKeydown,
  }: Props = $props();
</script>

<div class="section-header">
  {#if !folded}
    <span class="section-label">WATCHLIST</span>
    <span class="section-actions">
      <span class="section-count">{symbolCount}/{maxSymbols}</span>
      {#if symbolCount < maxSymbols}
        <button
          class="add-btn"
          onclick={onToggleAdd}
          title="Add symbol"
          aria-label="Add symbol"
        >+</button>
      {/if}
    </span>
  {/if}
  <button
    class="fold-btn"
    onclick={onToggleFold}
    title={folded ? 'Expand watchlist' : 'Collapse watchlist'}
    aria-label={folded ? 'Expand watchlist' : 'Collapse watchlist'}
  >{folded ? '›' : '‹'}</button>
</div>

{#if !folded && addOpen}
  <div class="add-row">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="add-input"
      type="text"
      placeholder="SOLUSDT…"
      bind:value={addInput}
      onkeydown={onAddKeydown}
      maxlength={12}
      autofocus
    />
    <button class="add-confirm" onclick={onAddConfirm} title="Confirm">+</button>
    <button class="add-cancel" onclick={onAddCancel} title="Cancel">✕</button>
  </div>
  {#if addError}
    <div class="add-error">{addError}</div>
  {/if}
{/if}

<style>
  .fold-btn {
    background: none;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .fold-btn:hover { color: var(--g8); }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 4px;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--g4);
    background: var(--g0);
    position: sticky;
    top: 0;
    z-index: 1;
    flex-shrink: 0;
  }

  .section-label { font-weight: 600; }
  .section-count { font-size: 8px; color: var(--g6); }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .add-btn {
    background: none;
    border: 1px solid var(--g4);
    color: var(--g6);
    font-size: 11px;
    line-height: 1;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s, border-color 0.1s;
  }
  .add-btn:hover { color: var(--g9); border-color: var(--g6); }

  .add-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: var(--g1);
    border-bottom: 1px solid var(--g4);
    flex-shrink: 0;
  }

  .add-input {
    flex: 1;
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 4px;
    color: var(--g9);
    font-family: inherit;
    font-size: 10px;
    padding: 3px 6px;
    outline: none;
    text-transform: uppercase;
    min-width: 0;
  }
  .add-input:focus { border-color: var(--brand); }
  .add-input::placeholder { text-transform: none; color: var(--g5); }

  .add-confirm, .add-cancel {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .add-confirm { color: #22AB94; }
  .add-confirm:hover { color: #4ade80; }
  .add-cancel { color: var(--g5); }
  .add-cancel:hover { color: var(--g8); }

  .add-error {
    padding: 2px 8px 4px;
    font-size: 9px;
    color: #F23645;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
</style>
