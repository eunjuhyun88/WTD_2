<script lang="ts">
  import ConfluencePeekChip from '$lib/components/confluence/ConfluencePeekChip.svelte';
  import '../../../styles/panel-base.css';
  import '../../../styles/ScanPanel.css';

  interface ScanCandidate {
    id: string;
    symbol: string;
    tf: string;
    pattern: string;
    phase: number;
    alpha: number;
    age: string;
    sim: number;
  }

  interface PastCapture {
    capture_id: string;
    symbol: string;
    timeframe: string;
    pattern_slug?: string | null;
    captured_at_ms: number;
    status: string;
  }

  interface ScanData {
    confluence: any;
    scanState: 'idle' | 'scanning' | 'done';
    scanProgress: number;
    scanCandidates: ScanCandidate[];
    scanSelected: string;
    pastCaptures: PastCapture[];
  }

  interface ScanActions {
    onOpenAnalyze: () => void;
    onSetScanSelected: (id: string) => void;
    onOpenTradeTab: (candidate: ScanCandidate) => void;
  }

  interface Props {
    data: ScanData;
    actions: ScanActions;
  }

  let { data, actions }: Props = $props();

  // Convenience destructuring for template
  const { confluence, scanState, scanProgress, scanCandidates, scanSelected, pastCaptures } = data;
  const { onOpenAnalyze, onSetScanSelected, onOpenTradeTab } = actions;
</script>

<div class="scan-panel">
  <div class="scan-header">
    <span class="scan-step">03</span>
    {#if confluence}
      <div style="margin-left: 8px;">
        <ConfluencePeekChip value={confluence} onOpen={onOpenAnalyze} />
      </div>
    {/if}
    {#if scanState === 'scanning'}
      <span class="scan-label scanning">SCANNING</span>
      <span class="scan-title">{Math.round(scanProgress * 3)} / 300</span>
      <div class="scan-prog-track">
        <div class="scan-prog-fill" style:width="{scanProgress}%"></div>
      </div>
      <span class="scan-meta anim">Searching similar patterns...</span>
    {:else}
      <span class="scan-label">SIMILAR NOW</span>
      <span class="scan-title">{scanCandidates.length} candidates</span>
      <span class="spacer"></span>
      <span class="scan-meta">300 sym · 14s</span>
      <span class="scan-sort-btn">sim ▾</span>
    {/if}
  </div>
  <div class="scan-grid" class:scanning={scanState === 'scanning'}>
    {#if scanState === 'scanning'}
      {#each Array(5) as _}
        <div class="scan-card skeleton"></div>
      {/each}
    {:else}
    {#each scanCandidates as x}
      {@const sc = x.alpha >= 75 ? 'var(--pos)' : x.alpha >= 60 ? 'var(--amb)' : 'var(--g7)'}
      <div
        class="scan-card"
        class:active={scanSelected === x.id}
        style:--sc={sc}
        role="button"
        tabindex="0"
        onclick={() => onSetScanSelected(x.id)}
        onkeydown={(e) => e.key === 'Enter' && onSetScanSelected(x.id)}
      >
        <div class="sc-top">
          <span class="sc-sym">{x.symbol.replace('USDT', '')}</span>
          <span class="sc-tf">{x.tf}</span>
          <span class="spacer"></span>
          <span class="sc-alpha" style:color={sc}>α{x.alpha}</span>
          <button
            class="sc-open"
            title="Open in new tab"
            onclick={(e) => {
              e.stopPropagation();
              onOpenTradeTab(x);
            }}
          >↗</button>
        </div>
        <svg viewBox="0 0 180 48" preserveAspectRatio="none" class="sc-minichart">
          {@html (() => {
            const pts: [number,number][] = [[0,14],[8,22],[16,30],[24,38],[32,32],[40,36],[48,40],[56,44],[64,52],[72,48],[80,44],[88,42],[96,40],[104,38],[112,36],[120,34],[128,30],[136,28],[144,26],[152,22],[160,18],[168,14],[176,10],[180,8]];
            const str = pts.map(([px,py],i) => `${i===0?'M':'L'}${px},${py+4}`).join(' ');
            const nowX = x.phase===3?72 : x.phase===4?128 : x.phase===5?170 : 40;
            const nowY = (pts.find(p=>p[0]>=nowX)?.[1]??30)+4;
            return `<rect x="${nowX-8}" y="0" width="16" height="48" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" opacity="0.08"/><path d="${str} L180,52 L0,52 Z" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" opacity="0.05"/><path d="${str}" fill="none" stroke="var(--g6)" stroke-width="1"/><line x1="${nowX}" y1="0" x2="${nowX}" y2="48" stroke="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.7"/><circle cx="${nowX}" cy="${nowY}" r="2.5" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}"/>`;
          })()}
        </svg>
        <div class="sc-sim-row">
          <div class="sc-sim-bar"><div class="sc-sim-fill" style:width="{x.sim * 100}%" style:background={sc}></div></div>
          <span class="sc-sim-pct">{Math.round(x.sim * 100)}%</span>
        </div>
        <div class="sc-pattern">{x.pattern}</div>
        <div class="sc-age">{x.age}</div>
      </div>
    {/each}
    {/if}
  </div>
  <div class="tm-past-strip">
    <div class="tm-past-header">
      <span class="tm-past-title">★ SAVED · {pastCaptures.length}</span>
      <span class="spacer"></span>
      <span class="tm-past-hint">Saved setups</span>
    </div>
    <div class="tm-past-cards">
      {#if pastCaptures.length === 0}
        <span class="past-empty">No saved setups — add one from the chart using Save Setup</span>
      {:else}
        {#each pastCaptures as s (s.capture_id)}
          {@const sym = s.symbol.replace('USDT','').replace('PERP','')}
          {@const dateStr = new Date(s.captured_at_ms).toISOString().slice(0,10)}
          {@const patternSlug = s.pattern_slug ?? 'saved-setup'}
          <button class="tm-past-card" title="{patternSlug} · {s.timeframe}">
            <span class="tm-past-sym">{sym}</span>
            <span class="tm-past-pnl" style:color="var(--g6)">{dateStr}</span>
            <span class="tm-past-sim">{s.status === 'outcome_ready' ? '⚡' : s.status === 'verdict_ready' ? '✓' : '…'}</span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

