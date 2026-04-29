<script lang="ts">
  /**
   * PatternLifecycleCard — W-0308 F-14
   *
   * Shows current lifecycle status for a pattern and provides
   * one-click transition buttons (promote / archive).
   *
   * Flow: current status → button click → PromoteConfirmModal → PATCH API
   */
  import { onMount } from 'svelte';
  import {
    fetchLifecycleStatus,
    patchPatternStatus,
    ALLOWED_NEXT,
    STATUS_LABEL,
    type LifecycleStatus,
  } from '$lib/api/lifecycleApi';
  import PromoteConfirmModal from './PromoteConfirmModal.svelte';

  interface Props {
    slug: string;
    /** Card heading, useful when rendering a lifecycle list. */
    title?: string;
    /** Optional compact metadata line. */
    meta?: string;
    /** Optional initial status (avoids extra fetch if parent already knows). */
    initialStatus?: LifecycleStatus;
    /** Called after a successful transition. */
    ontransition?: (from: LifecycleStatus, to: LifecycleStatus) => void;
  }

  let { slug, title = 'Lifecycle Status', meta, initialStatus, ontransition }: Props = $props();

  let status = $state<LifecycleStatus>('draft');
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Modal state
  let pendingTo = $state<LifecycleStatus | null>(null);
  let applying = $state(false);

  $effect(() => {
    if (initialStatus !== undefined) {
      status = initialStatus;
      loading = false;
    }
  });

  onMount(async () => {
    if (initialStatus !== undefined) return;
    try {
      const res = await fetchLifecycleStatus(slug);
      status = res.status;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load';
    } finally {
      loading = false;
    }
  });

  const nextStatuses = $derived(ALLOWED_NEXT[status]);
  const isTerminal = $derived(nextStatuses.length === 0);

  function openModal(to: LifecycleStatus) {
    pendingTo = to;
  }

  function closeModal() {
    pendingTo = null;
  }

  async function applyTransition(reason: string) {
    if (!pendingTo) return;
    const to = pendingTo;
    applying = true;
    pendingTo = null;
    error = null;
    try {
      const res = await patchPatternStatus(slug, to, reason);
      const prev = status;
      status = res.to_status;
      ontransition?.(prev, res.to_status);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Transition failed';
    } finally {
      applying = false;
    }
  }

  // Color-coding
  const statusColor: Record<LifecycleStatus, string> = {
    draft:     'status-draft',
    candidate: 'status-candidate',
    object:    'status-object',
    archived:  'status-archived',
  };

  const btnClass: Record<LifecycleStatus, string> = {
    draft:     'btn-primary',
    candidate: 'btn-success',
    object:    'btn-success',
    archived:  'btn-ghost',
  };
</script>

<div class="lifecycle-card">
  <div class="card-header">
    <span class="card-title">{title}</span>
    {#if loading}
      <span class="status-chip status-loading">…</span>
    {:else}
      <span class="status-chip {statusColor[status]}">{STATUS_LABEL[status]}</span>
    {/if}
  </div>

  {#if meta}
    <p class="card-meta">{meta}</p>
  {/if}

  {#if error}
    <p class="error-msg">{error}</p>
  {/if}

  {#if !loading && !isTerminal}
    <div class="actions">
      {#each nextStatuses as next}
        <button
          class="btn {next === 'archived' ? 'btn-danger' : btnClass[next]}"
          onclick={() => openModal(next)}
          disabled={applying}
        >
          {#if applying}
            Applying…
          {:else if next === 'archived'}
            Archive
          {:else}
            → {STATUS_LABEL[next]}
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if !loading && isTerminal}
    <p class="terminal-note">Terminal state — no further transitions.</p>
  {/if}
</div>

{#if pendingTo}
  <PromoteConfirmModal
    {slug}
    from_status={status}
    to_status={pendingTo}
    onconfirm={applyTransition}
    oncancel={closeModal}
  />
{/if}

<style>
  .lifecycle-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .card-meta {
    margin: -4px 0 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    font-family: var(--sc-font-mono, monospace);
  }

  .status-chip {
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--sc-font-mono, monospace);
    letter-spacing: 0.04em;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .status-draft     { color: rgba(255,255,255,.55); background: rgba(255,255,255,.05); }
  .status-candidate { color: #f59e0b; background: rgba(245,158,11,.09); border-color: rgba(245,158,11,.3); }
  .status-object    { color: #34d399; background: rgba(52,211,153,.09); border-color: rgba(52,211,153,.3); }
  .status-archived  { color: rgba(255,255,255,.3); background: rgba(255,255,255,.03); }
  .status-loading   { color: rgba(255,255,255,.3); background: rgba(255,255,255,.03); animation: pulse 1.4s ease-in-out infinite; }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: opacity 0.15s, background 0.15s;
  }

  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    background: rgba(99,102,241,.8);
    border-color: rgba(99,102,241,.4);
    color: white;
  }
  .btn-primary:hover:not(:disabled) { background: rgba(99,102,241,1); }

  .btn-success {
    background: rgba(52,211,153,.8);
    border-color: rgba(52,211,153,.4);
    color: #062016;
  }
  .btn-success:hover:not(:disabled) { background: rgba(52,211,153,1); }

  .btn-danger {
    background: rgba(239,68,68,.7);
    border-color: rgba(239,68,68,.35);
    color: white;
  }
  .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,.9); }

  .btn-ghost {
    background: transparent;
    border-color: rgba(255,255,255,.12);
    color: rgba(255,255,255,.5);
  }

  .error-msg {
    margin: 0;
    font-size: 12px;
    color: #f87171;
    background: rgba(248,113,113,.08);
    border: 1px solid rgba(248,113,113,.2);
    border-radius: 5px;
    padding: 6px 8px;
  }

  .terminal-note {
    margin: 0;
    font-size: 11px;
    color: rgba(255,255,255,.3);
    font-style: italic;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>
