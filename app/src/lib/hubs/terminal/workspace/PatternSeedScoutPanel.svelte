<script lang="ts">
  import type { SearchQuerySpec } from '$lib/contracts/search/querySpec';
  import type { TerminalAsset } from '$lib/types/terminal';
  import type { PromotionGateResult } from '$lib/contracts/search/seedSearch';

  type MatchCandidate = {
    symbol: string;
    source: 'engine' | 'similar';
    score: number;
    matchedSignals: string[];
    missingSignals: string[];
    summary: string;
    layerAScore?: number;
    layerBScore?: number | null;
    layerCScore?: number | null;
    candidatePhasePath?: string[];
    windowId?: string;
    startTs?: string;
    endTs?: string;
  };

  type Props = {
    open: boolean;
    assets: TerminalAsset[];
    activeSymbol: string;
    timeframe: string;
    onClose?: () => void;
    onPickSymbol?: (symbol: string) => void;
  };

  let { open, assets, activeSymbol, timeframe, onClose, onPickSymbol }: Props = $props();

  const defaultThesis = `OI spike after a flush, then reclaim with higher lows.\nFocus on funding pressure and breakout confirmation.`;

  let thesis = $state(defaultThesis);
  let loading = $state(false);
  let error = $state('');
  let candidates = $state<MatchCandidate[]>([]);
  let snapshotFiles = $state<File[]>([]);
  let requestedSignals = $state<string[]>([]);
  let searchQuerySpec = $state<SearchQuerySpec | null>(null);
  let promotionGate = $state<PromotionGateResult | null>(null);
  let currentRunId = $state<string | null>(null);
  let judgedCandidates = $state<Set<string>>(new Set());

  function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isSearchQuerySpec(value: unknown): value is SearchQuerySpec {
    return (
      isRecord(value) &&
      typeof value.pattern_family === 'string' &&
      typeof value.reference_timeframe === 'string' &&
      Array.isArray(value.phase_path)
    );
  }

  function handleSnapshotChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    snapshotFiles = Array.from(input.files ?? []).slice(0, 6);
  }

  async function runMatch() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/terminal/pattern-seed/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          thesis,
          activeSymbol,
          timeframe,
          snapshotNames: snapshotFiles.map((file) => file.name),
          boardSymbols: assets.map((asset) => asset.symbol),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      requestedSignals = Array.isArray(body.seed?.requestedSignals) ? body.seed.requestedSignals : [];
      searchQuerySpec = isSearchQuerySpec(body.seed?.searchQuerySpec) ? body.seed.searchQuerySpec : null;
      promotionGate = isRecord(body.promotionGate) ? (body.promotionGate as unknown as PromotionGateResult) : null;
      candidates = Array.isArray(body.candidates) ? body.candidates : [];
      currentRunId = body.seed?.runId ?? body.seed?.researchRunId ?? null;
      judgedCandidates = new Set();
    } catch (err) {
      error = String(err);
      candidates = [];
      requestedSignals = [];
      searchQuerySpec = null;
    } finally {
      loading = false;
    }
  }

  function handlePick(symbol: string) {
    onPickSymbol?.(symbol);
    onClose?.();
  }

  async function judgeCandidate(candidate: MatchCandidate, verdict: 'good' | 'bad') {
    if (!currentRunId || !candidate.windowId) return;
    judgedCandidates = new Set([...judgedCandidates, candidate.windowId]);
    try {
      await fetch('/api/terminal/pattern-seed/judge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          runId: currentRunId,
          candidateId: candidate.windowId,
          verdict,
          symbol: candidate.symbol,
          layerAScore: candidate.layerAScore,
          layerBScore: candidate.layerBScore,
          layerCScore: candidate.layerCScore,
          finalScore: candidate.score / 100,
        }),
      });
    } catch {
      // non-fatal — best-effort telemetry
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="seed-backdrop" role="presentation" tabindex="-1" onclick={onClose} onkeydown={(event) => event.key === 'Escape' && onClose?.()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="seed-panel" role="dialog" aria-modal="true" tabindex="0" onclick={(event) => event.stopPropagation()} onkeydown={() => {}}>
      <header class="seed-head">
        <div>
          <p class="seed-kicker">Research Lane</p>
          <h3>Pattern Seed Scout</h3>
          <p class="seed-meta">{activeSymbol || 'BTCUSDT'} · {timeframe.toUpperCase()} · Board {assets.length} symbols</p>
        </div>
        <button type="button" class="seed-close" onclick={onClose} aria-label="Close pattern seed scout">x</button>
      </header>

      <section class="seed-body">
        <label class="seed-label" for="pattern-seed-thesis">Seed Thesis</label>
        <textarea id="pattern-seed-thesis" class="seed-textarea" rows="5" bind:value={thesis}></textarea>

        <div class="seed-row">
          <label class="seed-label" for="pattern-seed-snapshots">Snapshots</label>
          <input id="pattern-seed-snapshots" type="file" accept="image/*" multiple onchange={handleSnapshotChange} />
        </div>

        {#if snapshotFiles.length > 0}
          <div class="chip-row">
            {#each snapshotFiles as file}
              <span class="chip">{file.name}</span>
            {/each}
          </div>
        {/if}

        <div class="seed-actions">
          <button type="button" class="seed-run" onclick={runMatch} disabled={loading}>
            {loading ? 'Searching…' : 'Find Similar'}
          </button>
        </div>

        {#if requestedSignals.length > 0}
          <div class="chip-row">
            {#each requestedSignals as signal}
              <span class="chip signal">{signal}</span>
            {/each}
          </div>
        {/if}

        {#if searchQuerySpec}
          <div class="seed-spec">
            <p class="seed-label">Engine Query Spec</p>
            <div class="chip-row">
              <span class="chip spec">{searchQuerySpec.reference_timeframe}</span>
              {#each searchQuerySpec.phase_path as phase}
                <span class="chip spec">{phase}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if promotionGate}
          <div class="gate-card" data-decision={promotionGate.decision}>
            <div class="gate-head">
              <p class="seed-label">Benchmark Gate</p>
              <span class="gate-badge" data-decision={promotionGate.decision}>
                {promotionGate.decision === 'promote_candidate' ? 'PROMOTE' : 'REJECT'}
              </span>
              {#if promotionGate.decisionPath && promotionGate.decisionPath !== 'rejected'}
                <span class="gate-path">{promotionGate.decisionPath}</span>
              {/if}
            </div>
            <div class="gate-metrics">
              {#if promotionGate.canonicalFeatureScore !== null}
                <span class="gate-metric">
                  <span class="gate-metric-label">feat</span>
                  {(promotionGate.canonicalFeatureScore * 100).toFixed(0)}
                </span>
              {/if}
              <span class="gate-metric">
                <span class="gate-metric-label">recall</span>
                {(promotionGate.referenceRecall * 100).toFixed(0)}%
              </span>
              <span class="gate-metric">
                <span class="gate-metric-label">fidelity</span>
                {(promotionGate.phaseFidelity * 100).toFixed(0)}%
              </span>
              {#if promotionGate.entryProfitableRate !== null}
                <span class="gate-metric">
                  <span class="gate-metric-label">win%</span>
                  {(promotionGate.entryProfitableRate * 100).toFixed(0)}%
                </span>
              {/if}
            </div>
            {#if Object.keys(promotionGate.gateResults).length > 0}
              <div class="gate-gates">
                {#each Object.entries(promotionGate.gateResults) as [gate, passed]}
                  <span class="gate-chip" data-passed={passed}>{gate.replace(/_/g, ' ')}</span>
                {/each}
              </div>
            {/if}
            {#if promotionGate.rejectionReasons.length > 0}
              <div class="gate-reasons">
                {#each promotionGate.rejectionReasons as reason}
                  <p class="gate-reason">{reason}</p>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if error}
          <p class="seed-error">{error}</p>
        {/if}

        <div class="candidate-list">
          {#if !loading && candidates.length === 0}
            <p class="seed-empty">Run a thesis search to rank similar setups.</p>
          {:else}
            {#each candidates as candidate}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div role="button" class="candidate-row" tabindex="0"
                onclick={() => handlePick(candidate.symbol)}
                onkeydown={(e) => e.key === 'Enter' && handlePick(candidate.symbol)}>
                <div class="candidate-main">
                  <strong>{candidate.symbol.replace('USDT', '')}</strong>
                  <span class="candidate-source" data-source={candidate.source}>{candidate.source}</span>
                  <span class="candidate-score">{candidate.score}</span>
                  {#if candidate.windowId && !judgedCandidates.has(candidate.windowId)}
                    <div class="judge-btns" role="group" aria-label="Rate this candidate">
                      <button type="button" class="judge-btn good" title="Good match"
                        onclick={(e) => { e.stopPropagation(); judgeCandidate(candidate, 'good'); }}
                        aria-label="Mark as good match">+</button>
                      <button type="button" class="judge-btn bad" title="Bad match"
                        onclick={(e) => { e.stopPropagation(); judgeCandidate(candidate, 'bad'); }}
                        aria-label="Mark as bad match">−</button>
                    </div>
                  {:else if candidate.windowId && judgedCandidates.has(candidate.windowId)}
                    <span class="judge-done">✓</span>
                  {/if}
                </div>
                {#if candidate.candidatePhasePath && candidate.candidatePhasePath.length > 0}
                  <div class="phase-path">
                    {#each candidate.candidatePhasePath as phase, i}
                      <span class="phase-node">{phase}</span>{#if i < (candidate.candidatePhasePath?.length ?? 0) - 1}<span class="phase-arrow">→</span>{/if}
                    {/each}
                  </div>
                {/if}
                {#if candidate.layerAScore !== undefined}
                  <div class="layer-scores">
                    <span class="layer-badge" data-layer="a">A {(candidate.layerAScore * 100).toFixed(0)}</span>
                    {#if candidate.layerBScore !== null && candidate.layerBScore !== undefined}
                      <span class="layer-badge" data-layer="b">B {(candidate.layerBScore * 100).toFixed(0)}</span>
                    {/if}
                    {#if candidate.layerCScore !== null && candidate.layerCScore !== undefined}
                      <span class="layer-badge" data-layer="c">C {(candidate.layerCScore * 100).toFixed(0)}</span>
                    {/if}
                    {#if candidate.startTs}
                      <span class="candidate-window">{candidate.startTs.slice(0, 10)}</span>
                    {/if}
                  </div>
                {:else}
                  <p class="candidate-summary">{candidate.summary}</p>
                  <div class="candidate-signals">
                    {#if candidate.matchedSignals.length > 0}
                      <span class="candidate-match">match: {candidate.matchedSignals.join(', ')}</span>
                    {/if}
                    {#if candidate.missingSignals.length > 0}
                      <span class="candidate-miss">missing: {candidate.missingSignals.join(', ')}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .seed-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.52);
  }
  .seed-panel {
    width: min(520px, 92vw);
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    background: #0b0e14;
    border-left: 1px solid rgba(255,255,255,0.08);
    box-shadow: -18px 0 80px rgba(0,0,0,0.35);
  }
  .seed-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 14px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .seed-kicker,
  .seed-meta,
  .seed-label,
  .chip,
  .candidate-source,
  .candidate-score,
  .candidate-signals {
    font-family: var(--sc-font-mono);
  }
  .seed-kicker {
    margin: 0;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(190,212,255,0.72);
  }
  h3 {
    margin: 3px 0 4px;
    font-size: 14px;
    color: rgba(247,242,234,0.9);
  }
  .seed-meta {
    margin: 0;
    font-size: 10px;
    color: rgba(247,242,234,0.42);
  }
  .seed-close {
    align-self: flex-start;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: rgba(247,242,234,0.62);
    border-radius: 4px;
    padding: 2px 7px;
    cursor: pointer;
  }
  .seed-body {
    overflow-y: auto;
    padding: 12px 14px 18px;
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .seed-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.5);
  }
  .seed-textarea,
  .seed-row input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    background: rgba(255,255,255,0.03);
    color: rgba(247,242,234,0.9);
    padding: 9px 10px;
    font-size: 12px;
  }
  .seed-row {
    display: grid;
    gap: 5px;
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font-size: 9px;
    color: rgba(247,242,234,0.74);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    padding: 4px 8px;
  }
  .chip.signal {
    border-color: rgba(74,222,128,0.22);
    color: rgba(167,243,208,0.95);
  }
  .chip.spec {
    border-color: rgba(131,188,255,0.26);
    color: rgba(214,231,255,0.9);
  }
  .seed-spec {
    display: grid;
    gap: 6px;
  }
  .seed-actions {
    display: flex;
    justify-content: flex-end;
  }
  .seed-run {
    border-radius: 8px;
    border: 1px solid rgba(99,179,237,0.35);
    background: rgba(99,179,237,0.18);
    color: rgba(240,248,255,0.95);
    padding: 7px 10px;
    cursor: pointer;
    font-family: var(--sc-font-mono);
    font-size: 11px;
  }
  .seed-run:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .seed-error,
  .seed-empty {
    margin: 0;
    font-size: 12px;
    color: rgba(247,242,234,0.48);
  }
  .seed-error {
    color: #fca5a5;
  }
  .candidate-list {
    display: grid;
    gap: 8px;
  }
  .candidate-row {
    display: grid;
    gap: 5px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.02);
    padding: 9px 10px;
    text-align: left;
    cursor: pointer;
  }
  .candidate-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .candidate-main strong {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: rgba(247,242,234,0.9);
  }
  .candidate-source {
    font-size: 9px;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 2px 7px;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(247,242,234,0.66);
  }
  .candidate-source[data-source='board'] {
    border-color: rgba(74,222,128,0.22);
    color: rgba(167,243,208,0.95);
  }
  .candidate-score {
    margin-left: auto;
    font-size: 10px;
    color: rgba(131,188,255,0.95);
  }
  .candidate-summary {
    margin: 0;
    font-size: 11px;
    color: rgba(247,242,234,0.68);
  }
  .candidate-signals {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 9px;
  }
  .candidate-match {
    color: rgba(167,243,208,0.95);
  }
  .candidate-miss {
    color: rgba(253,186,116,0.95);
  }
  .phase-path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: rgba(214,231,255,0.8);
  }
  .phase-node {
    background: rgba(99,179,237,0.1);
    border: 1px solid rgba(99,179,237,0.2);
    border-radius: 3px;
    padding: 1px 5px;
  }
  .phase-arrow {
    color: rgba(247,242,234,0.3);
    padding: 0 1px;
  }
  .layer-scores {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    font-family: var(--sc-font-mono);
  }
  .layer-badge {
    font-size: 9px;
    border-radius: 3px;
    padding: 2px 6px;
    border: 1px solid;
  }
  .layer-badge[data-layer='a'] {
    border-color: rgba(131,188,255,0.25);
    color: rgba(190,220,255,0.9);
    background: rgba(131,188,255,0.07);
  }
  .layer-badge[data-layer='b'] {
    border-color: rgba(167,243,208,0.25);
    color: rgba(167,243,208,0.9);
    background: rgba(74,222,128,0.07);
  }
  .layer-badge[data-layer='c'] {
    border-color: rgba(253,186,116,0.25);
    color: rgba(253,186,116,0.9);
    background: rgba(251,146,60,0.07);
  }
  .candidate-window {
    font-size: 9px;
    color: rgba(247,242,234,0.3);
    margin-left: auto;
  }
  .judge-btns {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .judge-btn {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .judge-btn.good {
    border-color: rgba(74,222,128,0.3);
    color: rgba(74,222,128,0.9);
  }
  .judge-btn.good:hover {
    background: rgba(74,222,128,0.12);
  }
  .judge-btn.bad {
    border-color: rgba(248,113,113,0.3);
    color: rgba(248,113,113,0.9);
  }
  .judge-btn.bad:hover {
    background: rgba(248,113,113,0.12);
  }
  .judge-done {
    margin-left: auto;
    font-size: 10px;
    color: rgba(74,222,128,0.7);
  }

  /* Gate card */
  .gate-card {
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.02);
    padding: 9px 10px;
    display: grid;
    gap: 7px;
  }
  .gate-card[data-decision='promote_candidate'] {
    border-color: rgba(74,222,128,0.2);
    background: rgba(74,222,128,0.04);
  }
  .gate-head {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .gate-badge {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.06em;
    border-radius: 3px;
    padding: 2px 6px;
    border: 1px solid rgba(248,113,113,0.35);
    color: rgba(252,165,165,0.95);
    background: rgba(248,113,113,0.08);
  }
  .gate-badge[data-decision='promote_candidate'] {
    border-color: rgba(74,222,128,0.35);
    color: rgba(134,239,172,0.95);
    background: rgba(74,222,128,0.08);
  }
  .gate-path {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: rgba(247,242,234,0.4);
    margin-left: auto;
  }
  .gate-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .gate-metric {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: rgba(247,242,234,0.75);
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .gate-metric-label {
    font-size: 8px;
    text-transform: uppercase;
    color: rgba(247,242,234,0.38);
    letter-spacing: 0.05em;
  }
  .gate-gates {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .gate-chip {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    border-radius: 3px;
    padding: 2px 5px;
    border: 1px solid rgba(248,113,113,0.25);
    color: rgba(252,165,165,0.8);
    background: rgba(248,113,113,0.05);
  }
  .gate-chip[data-passed='true'] {
    border-color: rgba(74,222,128,0.25);
    color: rgba(134,239,172,0.85);
    background: rgba(74,222,128,0.05);
  }
  .gate-reasons {
    display: grid;
    gap: 2px;
  }
  .gate-reason {
    margin: 0;
    font-size: 9px;
    color: rgba(252,165,165,0.7);
    line-height: 1.4;
  }
</style>
