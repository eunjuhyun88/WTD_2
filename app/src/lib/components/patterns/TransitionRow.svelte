<script lang="ts">
  interface Props {
    symbol: string;
    slug: string;
    fromPhase: string | null;
    toPhase: string;
    confidence: number | null;
    transitionedAt: string | null;
  }
  const { symbol, slug, fromPhase, toPhase, confidence, transitionedAt }: Props = $props();

  function fmt(iso: string | null): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ko-KR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }
</script>

<tr class="tr-row">
  <td class="td-sym">
    <a href="/cogochi?symbol={symbol}">{symbol.replace('USDT', '')}</a>
  </td>
  <td class="td-slug">{slug.replace(/_/g, ' ')}</td>
  <td class="td-phase from">{fromPhase ?? '—'}</td>
  <td class="td-arrow">→</td>
  <td class="td-phase to">{toPhase}</td>
  <td class="td-conf">{confidence != null ? (confidence * 100).toFixed(0) + '%' : '—'}</td>
  <td class="td-time">{fmt(transitionedAt)}</td>
</tr>

<style>
  .tr-row td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
  }
  .td-sym a {
    font-weight: 700;
    color: #fff;
    text-decoration: none;
  }
  .td-sym a:hover { color: #63b3ed; }
  .td-slug { color: rgba(255,255,255,0.3); font-size: 10px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .td-phase { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .td-phase.from { color: #94a3b8; }
  .td-phase.to   { color: #4ade80; }
  .td-arrow { color: rgba(255,255,255,0.2); padding: 6px 2px; }
  .td-conf { color: rgba(255,255,255,0.5); }
  .td-time { color: rgba(255,255,255,0.25); font-size: 10px; }
</style>
