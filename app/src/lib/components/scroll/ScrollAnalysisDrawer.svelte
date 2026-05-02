<script lang="ts">
  import { scrollAnalysis } from '$lib/stores/scrollAnalysis';
  import ScrollAnalysisCard from './ScrollAnalysisCard.svelte';

  const VERDICT_COLOR: Record<string, string> = {
    STRONG_ALPHA: 'text-emerald-400',
    ALPHA: 'text-sky-400',
    WATCH: 'text-amber-400',
    NEUTRAL: 'text-neutral-400',
    AVOID: 'text-red-400',
  };

  const SEVERITY_DOT: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-400',
    low: 'bg-sky-400',
  };

  function scoreBar(score: number): string {
    const pct = Math.round(score);
    return `width: ${pct}%`;
  }

  function handleJumpTo(from: string, to: string) {
    // Dispatch to chart — parent listens via CustomEvent
    window.dispatchEvent(new CustomEvent('chart:scroll-to', { detail: { from, to } }));
  }

  let expandedSignals = $state(false);
  let expandedAnomalies = $state(false);
</script>

{#if $scrollAnalysis.isOpen}
  <aside class="scroll-drawer" aria-label="구간 분석">
    <!-- Header -->
    <div class="scroll-drawer__header">
      <span class="scroll-drawer__title">구간 분석</span>
      {#if $scrollAnalysis.request}
        <span class="scroll-drawer__symbol">{$scrollAnalysis.request.symbol}</span>
      {/if}
      <button class="scroll-drawer__close" onclick={() => scrollAnalysis.close()}>✕</button>
    </div>

    {#if $scrollAnalysis.isLoading}
      <div class="scroll-drawer__loading">
        <span class="scroll-drawer__spinner" aria-hidden="true"></span>
        <span>분석 중...</span>
      </div>

    {:else if $scrollAnalysis.error}
      <div class="scroll-drawer__error">{$scrollAnalysis.error}</div>

    {:else if $scrollAnalysis.result}
      {@const r = $scrollAnalysis.result}

      <!-- Section 1: Alpha Score -->
      <section class="scroll-section">
        <div class="scroll-section__title">Alpha Score</div>
        <div class="alpha-score-row">
          <span class="alpha-score-num">{r.alpha_score.score.toFixed(0)}</span>
          <span class="alpha-verdict {VERDICT_COLOR[r.alpha_score.verdict] ?? ''}">
            {r.alpha_score.verdict.replace('_', ' ')}
          </span>
        </div>
        <div class="alpha-bar">
          <div class="alpha-bar__fill" style={scoreBar(r.alpha_score.score)}></div>
        </div>

        <!-- Signals accordion -->
        <button
          class="accordion-toggle"
          onclick={() => (expandedSignals = !expandedSignals)}
        >
          시그널 {r.alpha_score.signals.length}개 {expandedSignals ? '▲' : '▼'}
        </button>
        {#if expandedSignals}
          <ul class="signal-list">
            {#each r.alpha_score.signals as sig}
              <li class="signal-item {sig.score_delta >= 0 ? 'signal-item--pos' : 'signal-item--neg'}">
                <span class="signal-delta">
                  {sig.score_delta >= 0 ? '+' : ''}{sig.score_delta}
                </span>
                <span class="signal-label">{sig.label}</span>
                <span class="signal-raw">{sig.raw_value.toFixed(2)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Section 2: Anomaly Flags -->
      {#if r.segment.anomaly_flags.length > 0}
        <section class="scroll-section">
          <button
            class="scroll-section__title accordion-toggle"
            onclick={() => (expandedAnomalies = !expandedAnomalies)}
          >
            이상점 {r.segment.anomaly_flags.length}개 {expandedAnomalies ? '▲' : '▼'}
          </button>
          {#if expandedAnomalies}
            <ul class="anomaly-list">
              {#each r.segment.anomaly_flags as flag}
                <li class="anomaly-item">
                  <span class="anomaly-dot {SEVERITY_DOT[flag.severity] ?? 'bg-neutral-500'}"></span>
                  <span class="anomaly-desc">{flag.description}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      <!-- Section 3: Similar Segments -->
      <section class="scroll-section">
        <div class="scroll-section__title">
          유사구간
          <span class="confidence-badge confidence-badge--{r.similar.confidence}">
            {r.similar.confidence}
          </span>
          {#if r.similar.win_rate != null}
            <span class="win-rate">승률 {(r.similar.win_rate * 100).toFixed(0)}%</span>
          {/if}
        </div>

        {#if r.similar.similar_segments.length === 0}
          <p class="scroll-empty">유사구간 없음 (corpus 미채워짐)</p>
        {:else}
          <div class="card-list">
            {#each r.similar.similar_segments as seg, i}
              <ScrollAnalysisCard
                segment={seg}
                index={i}
                onJumpTo={handleJumpTo}
              />
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </aside>
{/if}

<style>
  .scroll-drawer {
    position: fixed;
    top: 48px;
    right: 0;
    bottom: 0;
    width: 280px;
    background: hsl(220 20% 8%);
    border-left: 1px solid hsl(220 15% 18%);
    overflow-y: auto;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .scroll-drawer__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid hsl(220 15% 18%);
    position: sticky;
    top: 0;
    background: hsl(220 20% 8%);
    z-index: 1;
  }
  .scroll-drawer__title {
    font-size: 12px;
    font-weight: 600;
    color: hsl(220 15% 70%);
    flex: 1;
  }
  .scroll-drawer__symbol {
    font-size: 11px;
    color: hsl(220 60% 70%);
    font-weight: 600;
  }
  .scroll-drawer__close {
    color: hsl(220 15% 50%);
    font-size: 14px;
    padding: 2px 4px;
    cursor: pointer;
    background: none;
    border: none;
  }
  .scroll-drawer__close:hover {
    color: hsl(0 70% 65%);
  }

  .scroll-drawer__loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 24px 12px;
    font-size: 13px;
    color: hsl(220 15% 55%);
  }
  .scroll-drawer__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid hsl(220 15% 35%);
    border-top-color: hsl(220 60% 60%);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .scroll-drawer__error {
    padding: 12px;
    font-size: 12px;
    color: hsl(0 70% 60%);
  }

  .scroll-section {
    padding: 10px 12px;
    border-bottom: 1px solid hsl(220 15% 15%);
  }
  .scroll-section__title {
    font-size: 11px;
    font-weight: 600;
    color: hsl(220 15% 55%);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .alpha-score-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }
  .alpha-score-num {
    font-size: 28px;
    font-weight: 700;
    color: hsl(220 80% 85%);
    line-height: 1;
  }
  .alpha-verdict {
    font-size: 13px;
    font-weight: 600;
  }
  .alpha-bar {
    height: 4px;
    background: hsl(220 15% 20%);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .alpha-bar__fill {
    height: 100%;
    background: linear-gradient(90deg, hsl(220 60% 50%), hsl(160 60% 50%));
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  .accordion-toggle {
    font-size: 11px;
    color: hsl(220 15% 50%);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
  .accordion-toggle:hover { color: hsl(220 60% 70%); }

  .signal-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .signal-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 4px;
  }
  .signal-item--pos { background: hsl(160 40% 10%); }
  .signal-item--neg { background: hsl(0 40% 10%); }
  .signal-delta {
    font-weight: 700;
    min-width: 28px;
    font-size: 12px;
  }
  .signal-item--pos .signal-delta { color: hsl(160 60% 55%); }
  .signal-item--neg .signal-delta { color: hsl(0 60% 60%); }
  .signal-label { flex: 1; color: hsl(220 15% 70%); }
  .signal-raw { color: hsl(220 15% 45%); font-size: 10px; }

  .anomaly-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .anomaly-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 11px;
  }
  .anomaly-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-top: 3px;
    flex-shrink: 0;
  }
  .anomaly-desc { color: hsl(220 15% 65%); line-height: 1.4; }

  .confidence-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
  }
  .confidence-badge--high { background: hsl(160 40% 15%); color: hsl(160 60% 60%); }
  .confidence-badge--medium { background: hsl(40 40% 15%); color: hsl(40 60% 60%); }
  .confidence-badge--low { background: hsl(220 20% 15%); color: hsl(220 15% 50%); }

  .win-rate {
    font-size: 11px;
    color: hsl(160 60% 55%);
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }

  .scroll-empty {
    font-size: 11px;
    color: hsl(220 15% 40%);
    margin: 0;
    padding: 4px 0;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
