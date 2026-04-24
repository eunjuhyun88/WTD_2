<script lang="ts">
  import type { TerminalAsset } from '$lib/types/terminal';

  type MatchCandidate = {
    symbol: string;
    source: 'board' | 'search';
    score: number;
    matchedSignals: string[];
    missingSignals: string[];
    summary: string;
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
          assets: assets.map((asset) => ({
            symbol: asset.symbol,
            changePct15m: asset.changePct15m,
            changePct1h: asset.changePct1h,
            changePct4h: asset.changePct4h,
            volumeRatio1h: asset.volumeRatio1h,
            oiChangePct1h: asset.oiChangePct1h,
            fundingRate: asset.fundingRate,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      requestedSignals = Array.isArray(body.seed?.requestedSignals) ? body.seed.requestedSignals : [];
      candidates = Array.isArray(body.candidates) ? body.candidates : [];
    } catch (err) {
      error = String(err);
      candidates = [];
      requestedSignals = [];
    } finally {
      loading = false;
    }
  }

  function handlePick(symbol: string) {
    onPickSymbol?.(symbol);
    onClose?.();
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

        {#if error}
          <p class="seed-error">{error}</p>
        {/if}

        <div class="candidate-list">
          {#if !loading && candidates.length === 0}
            <p class="seed-empty">Run a thesis search to rank similar setups.</p>
          {:else}
            {#each candidates as candidate}
              <button type="button" class="candidate-row" onclick={() => handlePick(candidate.symbol)}>
                <div class="candidate-main">
                  <strong>{candidate.symbol.replace('USDT', '')}</strong>
                  <span class="candidate-source" data-source={candidate.source}>{candidate.source}</span>
                  <span class="candidate-score">{candidate.score}</span>
                </div>
                <p class="candidate-summary">{candidate.summary}</p>
                <div class="candidate-signals">
                  {#if candidate.matchedSignals.length > 0}
                    <span class="candidate-match">match: {candidate.matchedSignals.join(', ')}</span>
                  {/if}
                  {#if candidate.missingSignals.length > 0}
                    <span class="candidate-miss">missing: {candidate.missingSignals.join(', ')}</span>
                  {/if}
                </div>
              </button>
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
</style>
