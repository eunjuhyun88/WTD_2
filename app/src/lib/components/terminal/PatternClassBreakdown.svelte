<script lang="ts">
  /**
   * W-0322: Pattern classification breakdown
   * 유사 패턴을 하락/매집/상승전/하락전 4개 카테고리로 분류해 시각화.
   */

  interface SimilarCapture {
    verdict?: string | null;   // 'bullish' | 'bearish' | 'neutral'
    label?: string | null;
    phase?: string | null;     // from PatternPhaseRow
  }

  interface PhaseRow {
    phaseName?: string;
    symbols?: string[];
  }

  interface Props {
    similar?: SimilarCapture[];
    phases?: PhaseRow[];
    loading?: boolean;
    onShareClick?: () => void;
  }

  let { similar = [], phases = [], loading = false, onShareClick }: Props = $props();

  type CategoryKey = '하락' | '매집' | '상승전' | '하락전';

  const CATEGORIES: { key: CategoryKey; color: string; bg: string }[] = [
    { key: '하락',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
    { key: '매집',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
    { key: '상승전', color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
    { key: '하락전', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  ];

  function classifyCapture(c: SimilarCapture): CategoryKey {
    const p = (c.phase ?? '').toLowerCase();
    const v = (c.verdict ?? '').toLowerCase();
    const l = (c.label ?? '').toLowerCase();

    if (p.includes('dump') || p.includes('real_dump') || p.includes('fake_dump') || v === 'bearish')
      return '하락';
    if (p.includes('accum') || p.includes('매집'))
      return '매집';
    if (p.includes('squeeze') || p.includes('breakout') || v === 'bullish')
      return '상승전';
    if (p.includes('arch') || l.includes('하락전') || l.includes('before_dump'))
      return '하락전';
    // fallback: verdict-based
    if (v === 'bearish') return '하락';
    if (v === 'bullish') return '상승전';
    return '매집';
  }

  function classifyPhase(phaseName: string): CategoryKey {
    const p = phaseName.toLowerCase();
    if (p.includes('dump') || p.includes('bear')) return '하락';
    if (p.includes('accum') || p.includes('매집')) return '매집';
    if (p.includes('squeeze') || p.includes('trigger') || p.includes('breakout')) return '상승전';
    if (p.includes('arch') || p.includes('top')) return '하락전';
    return '매집';
  }

  const counts = $derived.by(() => {
    const map: Record<CategoryKey, number> = { '하락': 0, '매집': 0, '상승전': 0, '하락전': 0 };

    // From similar captures
    for (const c of similar) map[classifyCapture(c)]++;

    // From phase rows (count symbols)
    for (const row of phases) {
      if (!row.phaseName) continue;
      const cat = classifyPhase(row.phaseName);
      map[cat] += (row.symbols?.length ?? 1);
    }

    return map;
  });

  const total = $derived(Object.values(counts).reduce((a, b) => a + b, 0));

  function pct(n: number): number {
    return total === 0 ? 0 : Math.round((n / total) * 100);
  }
</script>

<div class="pcb">
  <div class="pcb-header">
    <span class="pcb-title">PATTERN BREAKDOWN</span>
    {#if total > 0}
      <span class="pcb-total">{total}개</span>
    {/if}
    {#if onShareClick && total > 0}
      <button class="pcb-share" onclick={onShareClick} title="분류 결과 공유">
        ↗ 공유
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="pcb-skeleton">
      {#each [72, 50, 34, 20] as w}
        <div class="pcb-skel-row">
          <div class="pcb-skel-label"></div>
          <div class="pcb-skel-bar" style="width:{w}%"></div>
        </div>
      {/each}
    </div>
  {:else if total === 0}
    <div class="pcb-empty">
      차트 구간을 선택하면<br/>유사 패턴이 분류됩니다
    </div>
  {:else}
    <div class="pcb-bars">
      {#each CATEGORIES as cat}
        {@const n = counts[cat.key]}
        {@const p = pct(n)}
        {#if p > 0}
          <div class="pcb-row">
            <span class="pcb-label" style="color:{cat.color}">{cat.key}</span>
            <div class="pcb-track">
              <div
                class="pcb-fill"
                style="width:{p}%; background:{cat.color}; box-shadow:0 0 6px {cat.color}40"
              ></div>
            </div>
            <span class="pcb-pct" style="color:{cat.color}">{p}%</span>
            <span class="pcb-count">({n})</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .pcb {
    padding: 8px 10px 10px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .pcb-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .pcb-title {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(196,202,214,0.5);
  }
  .pcb-total {
    font-size: var(--ui-text-xs);
    color: rgba(196,202,214,0.7);
    margin-left: auto;
  }
  .pcb-share {
    font-size: var(--ui-text-xs);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: rgba(196,202,214,0.6);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .pcb-share:hover {
    background: rgba(255,255,255,0.06);
    color: rgba(196,202,214,0.9);
  }

  .pcb-bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pcb-row {
    display: grid;
    grid-template-columns: 36px 1fr 30px 28px;
    align-items: center;
    gap: 6px;
  }
  .pcb-label {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.02em;
    text-align: right;
  }
  .pcb-track {
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    overflow: hidden;
  }
  .pcb-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .pcb-pct {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    text-align: right;
  }
  .pcb-count {
    font-size: var(--ui-text-xs);
    color: rgba(196,202,214,0.4);
  }

  /* skeleton */
  .pcb-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pcb-skel-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pcb-skel-label {
    width: 30px;
    height: 8px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .pcb-skel-bar {
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1;   }
  }

  .pcb-empty {
    font-size: var(--ui-text-xs);
    color: rgba(196,202,214,0.3);
    text-align: center;
    padding: 12px 0;
    line-height: 1.6;
  }
</style>
