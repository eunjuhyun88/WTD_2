<script lang="ts">
  import PhaseBadge from './PhaseBadge.svelte';

  interface Props {
    symbol: string;
    patternId: string;
    phase: number;
    phaseId?: string;
    enteredAt: string;
    candlesInPhase: number;
  }
  const { symbol, patternId, phase, phaseId, enteredAt, candlesInPhase }: Props = $props();

  function sinceHours(iso: string): string {
    if (!iso) return '—';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000 / 60;
    if (diff < 60)  return `${Math.round(diff)}m ago`;
    if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
    return `${Math.round(diff / 1440)}d ago`;
  }
</script>

<a class="pattern-card" href="/cogochi?symbol={symbol}">
  <div class="card-top">
    <span class="card-sym">{symbol.replace('USDT', '')}</span>
    <PhaseBadge {phase} {phaseId} size="sm" />
  </div>
  <div class="card-bottom">
    <span class="card-pattern">{patternId.replace(/_/g, ' ')}</span>
    <span class="card-meta">{sinceHours(enteredAt)} · {candlesInPhase}c</span>
  </div>
</a>

<style>
  .pattern-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    background: rgba(255,255,255,0.02);
    text-decoration: none;
    transition: background 0.1s;
  }
  .pattern-card:hover { background: rgba(255,255,255,0.05); }
  .card-top { display: flex; justify-content: space-between; align-items: center; }
  .card-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .card-bottom { display: flex; justify-content: space-between; align-items: center; }
  .card-pattern {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }
  .card-meta {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.25);
    white-space: nowrap;
  }
</style>
