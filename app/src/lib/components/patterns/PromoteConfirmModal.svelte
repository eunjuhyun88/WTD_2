<script lang="ts">
  /**
   * PromoteConfirmModal — W-0308 F-14
   *
   * Confirmation dialog before pattern lifecycle transition.
   * Shows from_status → to_status, requires reason for archive.
   * Emits 'confirm' with reason string or 'cancel'.
   */
  import { STATUS_LABEL, type LifecycleStatus } from '$lib/api/lifecycleApi';

  interface Props {
    slug: string;
    from_status: LifecycleStatus;
    to_status: LifecycleStatus;
    onconfirm: (reason: string) => void;
    oncancel: () => void;
  }

  let { slug, from_status, to_status, onconfirm, oncancel }: Props = $props();

  let reason = $state('');
  let busy = $state(false);

  const isArchive = $derived(to_status === 'archived');
  const reasonRequired = $derived(isArchive);

  const actionLabel = $derived(
    to_status === 'archived' ? 'Archive' : `Promote to ${STATUS_LABEL[to_status]}`
  );

  const colorClass = $derived(
    to_status === 'archived' ? 'btn-danger' :
    to_status === 'object'   ? 'btn-success' : 'btn-primary'
  );

  function handleConfirm() {
    if (reasonRequired && !reason.trim()) return;
    busy = true;
    onconfirm(reason.trim());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div class="modal-backdrop" role="presentation" onclick={oncancel}></div>

<!-- Dialog -->
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal-header">
    <h3 id="modal-title">Confirm Lifecycle Transition</h3>
    <button class="close-btn" onclick={oncancel} aria-label="Cancel">✕</button>
  </div>

  <div class="modal-body">
    <p class="transition-summary">
      <span class="status-chip from">{STATUS_LABEL[from_status]}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="status-chip to to-{to_status}">{STATUS_LABEL[to_status]}</span>
    </p>

    <p class="slug-label">Pattern: <code>{slug}</code></p>

    {#if isArchive}
      <p class="warning">
        ⚠ Archiving is final — the pattern will no longer appear in active scans.
      </p>
    {/if}

    <label class="reason-label" for="reason-input">
      Reason {reasonRequired ? '(required)' : '(optional)'}
    </label>
    <textarea
      id="reason-input"
      class="reason-input"
      placeholder={isArchive ? 'Why are you archiving this pattern?' : 'Optional note…'}
      rows="3"
      bind:value={reason}
      disabled={busy}
    ></textarea>
  </div>

  <div class="modal-footer">
    <button class="btn btn-ghost" onclick={oncancel} disabled={busy}>Cancel</button>
    <button
      class="btn {colorClass}"
      onclick={handleConfirm}
      disabled={busy || (reasonRequired && !reason.trim())}
    >
      {#if busy}
        Applying…
      {:else}
        {actionLabel}
      {/if}
    </button>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 200;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 201;
    background: #1a1b1e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    width: min(480px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .transition-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
  }

  .status-chip {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--sc-font-mono, monospace);
    letter-spacing: 0.04em;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.55);
  }

  .status-chip.to.to-candidate {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.08);
  }

  .status-chip.to.to-object {
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.3);
    background: rgba(52, 211, 153, 0.08);
  }

  .status-chip.to.to-archived {
    color: rgba(255, 255, 255, 0.35);
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
  }

  .arrow {
    color: rgba(255, 255, 255, 0.3);
    font-size: 16px;
  }

  .slug-label {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
  }

  .slug-label code {
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .warning {
    margin: 0;
    font-size: 12px;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 6px;
    padding: 8px 10px;
  }

  .reason-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    font-weight: 500;
  }

  .reason-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    padding: 8px 10px;
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
    box-sizing: border-box;
  }

  .reason-input:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.5);
  }

  .reason-input:disabled {
    opacity: 0.5;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .btn {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: opacity 0.15s, background 0.15s;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
  }

  .btn-ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
  }

  .btn-primary {
    background: rgba(99, 102, 241, 0.85);
    border-color: rgba(99, 102, 241, 0.5);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: rgba(99, 102, 241, 1);
  }

  .btn-success {
    background: rgba(52, 211, 153, 0.85);
    border-color: rgba(52, 211, 153, 0.5);
    color: #0a2a1f;
  }

  .btn-success:hover:not(:disabled) {
    background: rgba(52, 211, 153, 1);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.85);
    border-color: rgba(239, 68, 68, 0.4);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 1);
  }
</style>
