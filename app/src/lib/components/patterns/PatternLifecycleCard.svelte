<script lang="ts">
  import PromoteConfirmModal from './PromoteConfirmModal.svelte';
  import type { PatternLifecycleStatus } from '$lib/api/patterns';

  interface Props {
    slug: string;
    name?: string;
    status: PatternLifecycleStatus;
    timeframe?: string;
    tags?: string[];
    verdictCount?: number;   // total verdicts — used to gate promote button
    hitRate?: number | null; // 0-1
    onStatusChange?: (slug: string, newStatus: PatternLifecycleStatus) => void;
  }

  let {
    slug,
    name,
    status,
    timeframe = '1h',
    tags = [],
    verdictCount = 0,
    hitRate = null,
    onStatusChange,
  }: Props = $props();

  let modalTarget = $state<PatternLifecycleStatus | null>(null);

  // Next logical transition for the primary CTA button
  const nextStatus: PatternLifecycleStatus | null = $derived(
    status === 'draft' ? 'candidate' : status === 'candidate' ? 'object' : null
  );

  // Promote button disabled if < 100 verdicts (per design doc)
  const canPromote = $derived(
    nextStatus !== null && (status === 'draft' || verdictCount >= 100)
  );

  function openModal(target: PatternLifecycleStatus) {
    modalTarget = target;
  }

  function onConfirm() {
    if (modalTarget) {
      onStatusChange?.(slug, modalTarget);
    }
    modalTarget = null;
  }

  function onCancel() {
    modalTarget = null;
  }

  function fmtPct(v: number | null): string {
    if (v == null) return '—';
    return `${(v * 100).toFixed(0)}%`;
  }
</script>

<div class="lifecycle-card status-bg-{status}">
  <div class="card-header">
    <span class="card-slug">{slug}</span>
    <span class="status-badge status-{status}">{status}</span>
  </div>

  {#if name && name !== slug}
    <p class="card-name">{name}</p>
  {/if}

  <div class="card-meta">
    <span class="meta-item tf">{timeframe}</span>
    {#if verdictCount > 0}
      <span class="meta-item">판정 {verdictCount}건</span>
    {/if}
    {#if hitRate != null}
      <span class="meta-item hit-rate" class:good={hitRate >= 0.55} class:bad={hitRate < 0.4}>
        적중률 {fmtPct(hitRate)}
      </span>
    {/if}
    {#if tags.length > 0}
      <span class="meta-item tags">{tags.slice(0, 2).join(' · ')}</span>
    {/if}
  </div>

  {#if status === 'candidate' && verdictCount < 100}
    <p class="verdict-hint">승급하려면 판정 {100 - verdictCount}건 더 필요</p>
  {/if}

  <div class="card-actions">
    {#if nextStatus !== null}
      <button
        class="btn-promote btn-{nextStatus}"
        onclick={() => openModal(nextStatus!)}
        disabled={!canPromote}
        title={canPromote ? '' : `판정 100건 이상 필요 (현재 ${verdictCount})`}
      >
        {nextStatus === 'candidate' ? '후보 등록' : '프로덕션 승급'}
      </button>
    {/if}

    {#if status !== 'archived'}
      <button
        class="btn-archive"
        onclick={() => openModal('archived')}
      >
        보관
      </button>
    {/if}
  </div>
</div>

{#if modalTarget !== null}
  <PromoteConfirmModal
    {slug}
    fromStatus={status}
    toStatus={modalTarget}
    {onConfirm}
    {onCancel}
  />
{/if}

<style>
  .lifecycle-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    transition: background 0.1s;
  }

  .lifecycle-card:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .status-bg-draft     { border-left: 3px solid rgba(107, 114, 128, 0.4); }
  .status-bg-candidate { border-left: 3px solid rgba(245, 158, 11, 0.5); }
  .status-bg-object    { border-left: 3px solid rgba(16, 185, 129, 0.5); }
  .status-bg-archived  { border-left: 3px solid rgba(239, 68, 68, 0.4); opacity: 0.6; }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-slug {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.8rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .card-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    padding: 2px 7px;
    border-radius: 3px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .status-draft     { background: rgba(107, 114, 128, 0.2); color: #9ca3af; border: 1px solid rgba(107,114,128,0.3); }
  .status-candidate { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
  .status-object    { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
  .status-archived  { background: rgba(239, 68, 68, 0.15);  color: #f87171; border: 1px solid rgba(239,68,68,0.3); }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .meta-item {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.04);
    padding: 1px 6px;
    border-radius: 3px;
  }

  .hit-rate.good { color: #34d399; }
  .hit-rate.bad  { color: #f87171; }

  .verdict-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.72rem;
    color: rgba(245, 158, 11, 0.6);
    margin: 0;
  }

  .card-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .btn-promote,
  .btn-archive {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: opacity 0.1s;
  }

  .btn-promote:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn-candidate {
    background: rgba(245, 158, 11, 0.75);
    color: #1a1a1a;
  }

  .btn-object {
    background: rgba(16, 185, 129, 0.75);
    color: #1a1a1a;
  }

  .btn-promote:not(:disabled):hover {
    opacity: 0.85;
  }

  .btn-archive {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn-archive:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.3);
  }
</style>
