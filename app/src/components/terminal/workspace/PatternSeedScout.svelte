<script lang="ts">
  import type { TerminalAsset } from '$lib/types/terminal';

  interface MatchCandidate {
    symbol: string;
    source: 'board' | 'scan';
    score: number;
    matchedSignals: string[];
    missingSignals: string[];
    summary: string;
  }

  interface Props {
    assets: TerminalAsset[];
    activeSymbol: string;
    timeframe: string;
    onPickSymbol?: (symbol: string) => void;
  }

  let { assets, activeSymbol, timeframe, onPickSymbol }: Props = $props();

  const defaultThesis = `OI 급등 후 급락-반등 구조 + 저점 상향 패턴을 찾고 싶어요.
숏펀/양펀 전환과 거래량 동반 돌파를 중점으로 찾기.`;

  let thesis = $state(defaultThesis);
  let loading = $state(false);
  let error = $state('');
  let candidates = $state<MatchCandidate[]>([]);
  let snapshotFiles = $state<File[]>([]);
  let lastSeedSignals = $state<string[]>([]);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesis,
          snapshotNames: snapshotFiles.map((f) => f.name),
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
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      candidates = Array.isArray(body.candidates) ? body.candidates : [];
      lastSeedSignals = Array.isArray(body.seed?.requestedSignals) ? body.seed.requestedSignals : [];
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
</script>

<section class="seed-scout">
  <div class="seed-head">
    <div>
      <p class="seed-kicker">Pattern Seed Scout</p>
      <h3>텍스트/스냅샷 기준 유사 패턴 탐색</h3>
      <p class="seed-meta">Current: {activeSymbol || 'BTCUSDT'} · {timeframe.toUpperCase()} · Board {assets.length} symbols</p>
    </div>
    <button class="seed-run" onclick={runMatch} disabled={loading}>
      {loading ? 'Searching…' : 'Find Similar'}
    </button>
  </div>

  <label class="seed-label" for="seed-thesis">Seed thesis</label>
  <textarea id="seed-thesis" bind:value={thesis} rows={4} class="seed-textarea"></textarea>

  <div class="seed-row">
    <label class="seed-label" for="seed-snapshots">Snapshots (optional)</label>
    <input id="seed-snapshots" type="file" accept="image/*" multiple onchange={handleSnapshotChange} />
  </div>

  {#if snapshotFiles.length > 0}
    <div class="snapshot-list">
      {#each snapshotFiles as file}
        <span class="snapshot-pill">{file.name}</span>
      {/each}
    </div>
  {/if}

  {#if lastSeedSignals.length > 0}
    <div class="signal-tags">
      {#each lastSeedSignals as signal}
        <span class="signal-pill">{signal}</span>
      {/each}
    </div>
  {/if}

  {#if error}
    <p class="seed-error">{error}</p>
  {/if}

  {#if candidates.length > 0}
    <div class="candidate-list">
      {#each candidates as candidate}
        <button class="candidate-row" onclick={() => onPickSymbol?.(candidate.symbol)}>
          <div class="candidate-main">
            <span class="candidate-symbol">{candidate.symbol.replace('USDT', '')}</span>
            <span class="candidate-source" data-source={candidate.source}>{candidate.source}</span>
            <span class="candidate-score">{candidate.score}</span>
          </div>
          <p class="candidate-summary">{candidate.summary}</p>
          <div class="candidate-signals">
            {#if candidate.matchedSignals.length > 0}
              <span class="sig-ok">match: {candidate.matchedSignals.join(', ')}</span>
            {/if}
            {#if candidate.missingSignals.length > 0}
              <span class="sig-miss">missing: {candidate.missingSignals.join(', ')}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .seed-scout {
    margin: 0 18px 12px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 12px;
    background: rgba(6, 12, 18, 0.58);
  }
  .seed-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .seed-kicker {
    margin: 0;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(190,212,255,0.75);
  }
  h3 {
    margin: 2px 0 3px;
    font-size: 14px;
    color: rgba(250,247,235,0.95);
  }
  .seed-meta {
    margin: 0;
    font-size: 11px;
    color: rgba(250,247,235,0.55);
  }
  .seed-run {
    align-self: flex-start;
    border-radius: 10px;
    border: 1px solid rgba(99,179,237,0.35);
    background: rgba(99,179,237,0.18);
    color: rgba(240,248,255,0.95);
    padding: 7px 10px;
    cursor: pointer;
    font-family: var(--sc-font-mono);
    font-size: 11px;
  }
  .seed-run:disabled { opacity: 0.55; cursor: not-allowed; }
  .seed-label {
    display: block;
    margin-bottom: 4px;
    font-size: 10px;
    color: rgba(250,247,235,0.6);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: var(--sc-font-mono);
  }
  .seed-textarea {
    width: 100%;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(3, 6, 10, 0.72);
    color: rgba(250,247,235,0.9);
    padding: 9px 10px;
    line-height: 1.45;
    font-size: 12px;
  }
  .seed-row { margin-top: 8px; }
  .snapshot-list,
  .signal-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .snapshot-pill,
  .signal-pill {
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    padding: 4px 8px;
    font-size: 10px;
    color: rgba(250,247,235,0.75);
    font-family: var(--sc-font-mono);
  }
  .signal-pill {
    border-color: rgba(74,222,128,0.28);
    color: rgba(167,243,208,0.95);
  }
  .seed-error {
    color: #fca5a5;
    font-size: 12px;
    margin: 8px 0 0;
  }
  .candidate-list {
    margin-top: 10px;
    display: grid;
    gap: 8px;
  }
  .candidate-row {
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.02);
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }
  .candidate-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .candidate-symbol {
    font-family: var(--sc-font-mono);
    font-weight: 700;
    color: rgba(250,247,235,0.95);
  }
  .candidate-source {
    font-size: 10px;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 2px 7px;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(250,247,235,0.75);
    font-family: var(--sc-font-mono);
  }
  .candidate-source[data-source='board'] {
    border-color: rgba(74,222,128,0.25);
    color: rgba(134,239,172,0.95);
  }
  .candidate-score {
    margin-left: auto;
    font-family: var(--sc-font-mono);
    font-weight: 700;
    color: rgba(99,179,237,0.95);
  }
  .candidate-summary {
    margin: 6px 0 0;
    font-size: 11px;
    color: rgba(250,247,235,0.72);
  }
  .candidate-signals {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    font-family: var(--sc-font-mono);
  }
  .sig-ok { color: rgba(134,239,172,0.95); }
  .sig-miss { color: rgba(253,186,116,0.95); }
</style>

