<script lang="ts">
  import { patchPatternStatus } from '$lib/api/patterns';
  import type { PatternLifecycleStatus } from '$lib/api/patterns';

  interface Props {
    slug: string;
    fromStatus: string;
    toStatus: PatternLifecycleStatus;
    onConfirm: () => void;
    onCancel: () => void;
  }
  let { slug, fromStatus, toStatus, onConfirm, onCancel }: Props = $props();

  let reason = $state('');
  let loading = $state(false);
  let error = $state('');

  const LABEL: Record<PatternLifecycleStatus, string> = {
    draft: '초안 복원',
    candidate: '후보 등록',
    object: '프로덕션 승급',
    archived: '보관',
  };

  const label = $derived(LABEL[toStatus]);

  async function confirm() {
    loading = true;
    error = '';
    try {
      await patchPatternStatus(slug, toStatus, reason);
      onConfirm();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <div class="modal">
    <h3 id="modal-title" class="modal-title">{label}: <span class="modal-slug">{slug}</span></h3>

    <p class="modal-transition">
      <span class="status-badge status-{fromStatus}">{fromStatus}</span>
      <span class="arrow">→</span>
      <span class="status-badge status-{toStatus}">{toStatus}</span>
    </p>

    {#if toStatus === 'object'}
      <p class="warning">
        production scanner가 즉시 이 패턴을 사용합니다.
        되돌리려면 archive 후 재등록 필요.
      </p>
    {/if}

    {#if toStatus === 'archived'}
      <p class="warning">
        scanner에서 제거됩니다. 재활성화하려면 새 candidate 등록 필요.
      </p>
    {/if}

    <label class="reason-label" for="promote-reason">이유 (선택)</label>
    <textarea
      id="promote-reason"
      bind:value={reason}
      placeholder="감사 로그에 기록됩니다"
      rows={2}
      disabled={loading}
    ></textarea>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel} disabled={loading}>
        취소
      </button>
      <button
        class="btn-confirm btn-{toStatus}"
        onclick={confirm}
        disabled={loading}
      >
        {loading ? '처리 중…' : label}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-surface, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 1.5rem;
    min-width: 360px;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .modal-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 1rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
  }

  .modal-slug {
    color: var(--color-primary, #6366f1);
    font-size: 0.875rem;
  }

  .modal-transition {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.875rem;
    margin: 0;
  }

  .arrow {
    color: rgba(255, 255, 255, 0.4);
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-draft     { background: rgba(107, 114, 128, 0.2); color: #9ca3af; border: 1px solid rgba(107,114,128,0.3); }
  .status-candidate { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
  .status-object    { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
  .status-archived  { background: rgba(239, 68, 68, 0.15);  color: #f87171; border: 1px solid rgba(239,68,68,0.3); }

  .warning {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.8rem;
    color: var(--color-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    margin: 0;
  }

  .reason-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  textarea {
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.8);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    resize: vertical;
    box-sizing: border-box;
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary, #6366f1);
  }

  .error {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.8rem;
    color: var(--color-error, #ef4444);
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .btn-cancel,
  .btn-confirm {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.5rem 1.25rem;
    border-radius: 5px;
    border: none;
    cursor: pointer;
    transition: opacity 0.1s;
  }

  .btn-cancel,
  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .btn-cancel:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-candidate {
    background: rgba(245, 158, 11, 0.8);
    color: #1a1a1a;
  }

  .btn-object {
    background: rgba(16, 185, 129, 0.8);
    color: #1a1a1a;
  }

  .btn-archived {
    background: rgba(239, 68, 68, 0.8);
    color: #fff;
  }

  .btn-draft {
    background: rgba(107, 114, 128, 0.8);
    color: #fff;
  }

  .btn-confirm:not(:disabled):hover {
    opacity: 0.85;
  }
</style>
