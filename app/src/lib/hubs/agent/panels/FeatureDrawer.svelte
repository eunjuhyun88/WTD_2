<script lang="ts">
  import { onMount } from 'svelte';
  import type { DecisionRow } from './decisions.types';

  interface Props {
    decision: DecisionRow | null;
    onClose: () => void;
  }

  const { decision, onClose }: Props = $props();

  function formatLatency(ms: number | null | undefined): string {
    if (ms == null) return '—';
    return ms.toFixed(0) + 'ms';
  }

  function formatTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if decision != null}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-backdrop" onclick={handleBackdropClick}>
    <div class="drawer" role="dialog" aria-modal="true" aria-label="결정 상세">
      <div class="drawer-header">
        <span class="drawer-title">결정 상세</span>
        <button class="drawer-close" onclick={onClose} aria-label="닫기">✕</button>
      </div>

      <div class="drawer-body">
        <div class="field-grid">
          <div class="field">
            <span class="field-lbl">CMD</span>
            <span class="field-val field-val--mono">{decision.cmd}</span>
          </div>
          <div class="field">
            <span class="field-lbl">LLM Verdict</span>
            <span class="field-val field-val--mono">{decision.llm_verdict ?? '—'}</span>
          </div>
          <div class="field">
            <span class="field-lbl">Latency</span>
            <span class="field-val field-val--mono">{formatLatency(decision.latency_ms)}</span>
          </div>
          <div class="field">
            <span class="field-lbl">시각</span>
            <span class="field-val field-val--mono">{formatTime(decision.created_at)}</span>
          </div>
        </div>

        {#if decision.features_json != null}
          <div class="features-section">
            <span class="features-lbl">Raw Features</span>
            <pre class="features-json">{JSON.stringify(decision.features_json, null, 2)}</pre>
          </div>
        {:else}
          <div class="features-empty">features 없음</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 100;
    display: flex;
    justify-content: flex-end;
  }

  .drawer {
    width: min(400px, 92vw);
    height: 100%;
    background: #161616;
    border-left: 1px solid rgba(255, 255, 255, 0.09);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateX(0);
    animation: drawer-slide-in 140ms ease-out;
  }

  @keyframes drawer-slide-in {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
  }

  .drawer-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.5);
  }

  .drawer-close {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.35);
    padding: 4px 6px;
    border-radius: 4px;
    transition: color 80ms, background 80ms;
    font-family: 'JetBrains Mono', monospace;
  }

  .drawer-close:hover {
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.06);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }

  .field {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .field:nth-child(2n) {
    border-right: none;
  }

  .field:nth-last-child(-n+2) {
    border-bottom: none;
  }

  .field-lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.25);
  }

  .field-val {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.82);
  }

  .field-val--mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .features-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .features-lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.25);
  }

  .features-json {
    margin: 0;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.6);
    white-space: pre-wrap;
    word-break: break-all;
    overflow-x: auto;
    line-height: 1.6;
  }

  .features-empty {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.2);
    text-align: center;
    padding: 24px 0;
  }
</style>
