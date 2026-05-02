<script lang="ts">
  import type { SimilarSegment } from '$lib/stores/scrollAnalysis';

  let {
    segment,
    index = 0,
    onJumpTo,
  }: {
    segment: SimilarSegment;
    index?: number;
    onJumpTo?: (from: string, to: string) => void;
  } = $props();

  function pnlColor(v: number | null): string {
    if (v == null) return 'text-neutral-400';
    return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-neutral-400';
  }

  function pnlStr(v: number | null): string {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
  }

  function outcomeIcon(outcome: string | null): string {
    if (!outcome) return '';
    if (outcome.includes('TP') || outcome.includes('tp')) return '✅';
    if (outcome.includes('SL') || outcome.includes('sl')) return '❌';
    return '⏱';
  }

  function simColor(score: number): string {
    if (score >= 0.80) return 'text-emerald-400';
    if (score >= 0.65) return 'text-amber-400';
    return 'text-neutral-400';
  }

  function fromDateStr(iso: string): string {
    return iso.slice(0, 10);
  }

</script>

<button
  class="scroll-card"
  onclick={() => onJumpTo?.(segment.from_ts, segment.to_ts)}
  title="차트에서 이 구간으로 이동"
>
  <div class="scroll-card__header">
    <span class="scroll-card__symbol">{segment.symbol}</span>
    <span class="scroll-card__date">{fromDateStr(segment.from_ts)}</span>
    <span class="scroll-card__sim {simColor(segment.similarity_score)}">
      sim {segment.similarity_score.toFixed(2)}
    </span>
  </div>

  <div class="scroll-card__layers">
    <span title="Feature similarity">F:{segment.layer_scores.feature.toFixed(2)}</span>
    <span title="Sequence similarity">S:{segment.layer_scores.sequence.toFixed(2)}</span>
    <span title="ML p_win">ML:{segment.layer_scores.ml.toFixed(2)}</span>
  </div>

  <div class="scroll-card__pnl">
    <span class={pnlColor(segment.forward_pnl_4h)} title="4h return">
      {pnlStr(segment.forward_pnl_4h)} 4h
    </span>
    {#if segment.outcome}
      <span class="scroll-card__outcome">{outcomeIcon(segment.outcome)}</span>
    {/if}
  </div>

  {#if segment.explanation}
    <p class="scroll-card__explanation">{segment.explanation}</p>
  {/if}
</button>

<style>
  .scroll-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 6px;
    background: hsl(220 20% 12%);
    border: 1px solid hsl(220 15% 20%);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.15s;
  }
  .scroll-card:hover {
    border-color: hsl(220 60% 50% / 0.6);
  }
  .scroll-card__header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .scroll-card__symbol {
    font-weight: 600;
    color: hsl(220 80% 80%);
  }
  .scroll-card__date {
    color: hsl(220 15% 55%);
    flex: 1;
  }
  .scroll-card__sim {
    font-size: 11px;
    font-weight: 600;
  }
  .scroll-card__layers {
    display: flex;
    gap: 10px;
    font-size: 11px;
    color: hsl(220 15% 50%);
  }
  .scroll-card__pnl {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .scroll-card__outcome {
    font-size: 13px;
  }
  .scroll-card__explanation {
    margin: 0;
    font-size: 11px;
    color: hsl(220 15% 45%);
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
