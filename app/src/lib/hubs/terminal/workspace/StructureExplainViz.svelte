<script lang="ts">
  import { orderedEventPresence, type StructureExplainModel } from '$lib/terminal/structureExplain';

  interface Props {
    model: StructureExplainModel;
  }
  let { model }: Props = $props();
  const eventChips = $derived(
    model.wyckoff
      ? orderedEventPresence(model.wyckoff.events, model.wyckoff.isAccumulation)
      : [],
  );

  const OI_SCALE_MAX = 8;

  function oiMarkerPct(ratio: number): number {
    return Math.min(100, Math.max(0, (ratio / OI_SCALE_MAX) * 100));
  }
</script>

<section class="structure-explain" aria-label="Structure signal decode">
    <header class="se-head">
      <span class="se-title">Signal decode</span>
      <span class="se-sub">Structure &amp; position context tagged by the engine (not confirmed patterns)</span>
    </header>

    {#if model.wyckoff}
      <div class="se-block" data-accum={model.wyckoff.isAccumulation ? '1' : '0'}>
        <div class="se-row-label">
          <span>Wyckoff (1H swing · volume)</span>
          <strong class="se-score" data-sign={model.wyckoff.score >= 0 ? '+' : '-'}>
            {model.wyckoff.score >= 0 ? '+' : ''}{model.wyckoff.score.toFixed(0)}
          </strong>
        </div>
        <p class="se-phase">{model.wyckoff.phase}</p>
        <div class="phase-rail" role="img" aria-label="Wyckoff phase A through D">
          {#each ['A', 'B', 'C', 'D'] as band}
            <div
              class="phase-cell"
              class:on={model.wyckoff.activeBand === band}
              class:dist={!model.wyckoff.isAccumulation}
            >
              <span class="phase-letter">{band}</span>
              <span class="phase-caption">
                {band === 'A'
                  ? model.wyckoff.isAccumulation
                    ? 'SC/Early'
                    : 'BC/Early'
                  : band === 'B'
                    ? 'Build'
                    : band === 'C'
                      ? 'Test'
                      : 'Markup'}
              </span>
            </div>
          {/each}
        </div>
        {#if eventChips.length > 0}
          <div class="event-chips" aria-label="Detected events (recent window)">
            {#each eventChips as ev}
              <span class="ev-chip" class:hit={ev.hit}>{ev.key}</span>
            {/each}
          </div>
        {/if}
        <p class="se-hint">
          Swing highs/lows, volume z-scores, and candle shape are used to <em>approximate-detect</em> events like SC→Spring→SOS. Lit chips above are events detected in the recent window.
        </p>
      </div>
    {/if}

    {#if model.mtf.length > 0}
      <div class="se-block">
        <div class="se-row-label">
          <span>Multi-TF Wyckoff</span>
        </div>
        <div class="mtf-grid">
          {#each model.mtf as cell}
            <div class="mtf-cell">
              <span class="mtf-tf">{cell.tf}</span>
              <span class="mtf-phase">{cell.phase}</span>
              <span class="mtf-sc" data-sign={cell.score >= 0 ? '+' : '-'}>{cell.score >= 0 ? '+' : ''}{cell.score}</span>
            </div>
          {/each}
        </div>
        <p class="se-hint">
          Each timeframe's OHLC is resampled independently and scored with the same rules. The [1H] label refers to the 1H result among them.
        </p>
      </div>
    {/if}

    {#if model.oi}
      <div class="se-block">
        <div class="se-row-label">
          <span>OI / 24h Volume</span>
          {#if model.oi.ratio != null}
            <strong class="se-oi-ratio">{model.oi.ratio.toFixed(2)}×</strong>
          {/if}
          <strong class="se-score subtle">{model.oi.score >= 0 ? '+' : ''}{model.oi.score.toFixed(0)} pts</strong>
        </div>
        {#if model.oi.ratio != null}
          <div class="oi-track" role="img" aria-label="OI to volume ratio gauge">
            <div class="oi-zones">
              <span style="flex:1">&lt;1×</span>
              <span style="flex:1">1–2×</span>
              <span style="flex:1">2–4×</span>
              <span style="flex:1">4×+</span>
            </div>
            <div class="oi-bar">
              <span class="oi-marker" style={`left:${oiMarkerPct(model.oi.ratio)}%`}></span>
            </div>
          </div>
        {/if}
        <p class="se-hint">
          OI notional ÷ 24h volume. A high value means positions are heavily stacked relative to turnover (leverage concentration). Funding sign is used to add short/long skew risk to the score (e.g. +12).
        </p>
      </div>
    {/if}
  </section>

<style>
  .structure-explain {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 8px 10px 10px;
    background: rgba(0, 0, 0, 0.2);
  }
  .se-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
  }
  .se-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(247, 242, 234, 0.45);
  }
  .se-sub {
    font-size: var(--ui-text-xs);
    line-height: 1.3;
    color: rgba(247, 242, 234, 0.42);
  }
  .se-block + .se-block {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .se-row-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.55);
  }
  .se-score {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(173, 202, 124, 0.95);
  }
  .se-score[data-sign='-'] {
    color: rgba(207, 127, 143, 0.95);
  }
  .se-score.subtle {
    font-size: var(--ui-text-xs);
    opacity: 0.85;
  }
  .se-oi-ratio {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(251, 191, 36, 0.95);
  }
  .se-phase {
    margin: 4px 0 6px;
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.75);
  }
  .phase-rail {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .phase-cell {
    text-align: center;
    padding: 5px 2px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    opacity: 0.55;
    transition: opacity 0.12s;
  }
  .phase-cell.on {
    opacity: 1;
    border-color: rgba(99, 179, 237, 0.45);
    background: rgba(99, 179, 237, 0.08);
  }
  .phase-cell.dist.on {
    border-color: rgba(207, 127, 143, 0.45);
    background: rgba(207, 127, 143, 0.08);
  }
  .phase-letter {
    display: block;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(247, 242, 234, 0.88);
  }
  .phase-caption {
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.35);
  }
  .event-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .ev-chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 2px 6px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(247, 242, 234, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .ev-chip.hit {
    color: rgba(173, 202, 124, 0.95);
    border-color: rgba(173, 202, 124, 0.35);
    background: rgba(173, 202, 124, 0.07);
  }
  .se-block[data-accum='0'] .ev-chip.hit {
    color: rgba(207, 127, 143, 0.95);
    border-color: rgba(207, 127, 143, 0.35);
    background: rgba(207, 127, 143, 0.07);
  }
  .se-hint {
    margin: 6px 0 0;
    font-size: var(--ui-text-xs);
    line-height: 1.35;
    color: rgba(247, 242, 234, 0.38);
  }
  .se-hint em {
    font-style: normal;
    color: rgba(247, 242, 234, 0.52);
  }
  .mtf-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 4px;
  }
  .mtf-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .mtf-tf {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.4);
  }
  .mtf-phase {
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.72);
    line-height: 1.2;
    word-break: break-word;
  }
  .mtf-sc {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(173, 202, 124, 0.9);
  }
  .mtf-sc[data-sign='-'] {
    color: rgba(207, 127, 143, 0.9);
  }
  .oi-track {
    margin-top: 6px;
  }
  .oi-zones {
    display: flex;
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.28);
    margin-bottom: 3px;
  }
  .oi-bar {
    position: relative;
    height: 8px;
    border-radius: 2px;
    background: linear-gradient(
      90deg,
      rgba(74, 222, 128, 0.15) 0%,
      rgba(251, 191, 36, 0.2) 35%,
      rgba(248, 113, 113, 0.25) 100%
    );
  }
  .oi-marker {
    position: absolute;
    top: -2px;
    width: 2px;
    height: 12px;
    margin-left: -1px;
    background: #fff;
    border-radius: 1px;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
  }
</style>
