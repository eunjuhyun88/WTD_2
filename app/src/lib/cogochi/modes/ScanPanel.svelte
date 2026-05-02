<script lang="ts">
  import ConfluencePeekChip from '$lib/components/confluence/ConfluencePeekChip.svelte';
  import { shellStore } from '$lib/cogochi/shell.store';

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

  interface Props {
    confluence: any;
    onOpenAnalyze: () => void;
    scanState: 'idle' | 'scanning' | 'done';
    scanProgress: number;
    scanCandidates: ScanCandidate[];
    scanSelected: string;
    onSetScanSelected: (id: string) => void;
    pastCaptures: PastCapture[];
  }

  let {
    confluence,
    onOpenAnalyze,
    scanState,
    scanProgress,
    scanCandidates,
    scanSelected,
    onSetScanSelected,
    pastCaptures,
  }: Props = $props();
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
      <span class="scan-meta anim">유사 패턴 탐색 중...</span>
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
            title="새 탭에서 열기"
            onclick={(e) => {
              e.stopPropagation();
              shellStore.openTab({ kind: 'trade', title: `${x.symbol.replace('USDT','')} · ${x.tf}` });
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
      <span class="tm-past-hint">저장된 셋업</span>
    </div>
    <div class="tm-past-cards">
      {#if pastCaptures.length === 0}
        <span class="past-empty">저장된 셋업 없음 — 차트에서 Save Setup으로 추가</span>
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

<style>

  /* Fix 1: 모바일에서 ChartBoard 데스크탑 툴바 숨김 (+98px 확보) */
  :global(.mobile-chart-section .chart-toolbar) { display: none; }
  :global(.mobile-chart-section .chart-header--tv) { display: none; }
  /* Fix 2: ChartBoard min-height 420px 오버라이드 → 42vh 컨테이너에 맞춤 */
  :global(.mobile-chart-section .chart-board) { min-height: 0 !important; }

  /* Chart section */

  .spacer { flex: 1; }

  .ind-tog.active {
    background: rgba(122,162,224,0.1);
    border-color: rgba(122,162,224,0.4);
    color: #7aa2e0;
  }

  .micro-toggle-btn.active {
    color: #d9edf8;
    background: linear-gradient(135deg, rgba(74,187,142,0.22), rgba(122,162,224,0.18));
    box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--pos) 38%, var(--g4));
  }

  .micro-heat-strip.active, .micro-depth-strip.active {
    border-color: color-mix(in srgb, var(--amb) 48%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.08);
  }

  /* PEEK bar */

  /* W-0122-Phase3: small confluence chip appended to peek-bar */

  .pb-tab.active {
    background: var(--g1);
    border-bottom-color: var(--tc);
  }

  .pb-tab.active .pb-n { color: var(--tc); opacity: 0.7; }

  .pb-tab.active .pb-label { color: var(--g9); }

  .pb-tab.active .pb-chevron { color: var(--tc); }

  /* PEEK overlay */

  @keyframes peekSlide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* Drawer header */

  .dh-tab.active {
    background: var(--g1);
    border-top-color: var(--tc);
  }

  .dh-tab.active .dh-n { color: var(--tc); opacity: 0.7; }

  .dh-tab.active .dh-label { color: var(--g9); }

  /* Drawer content */

  /* ANALYZE workspace shared primitives */

  /* ── SCAN panel (trade_scan.jsx) ── */
  .scan-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--g1);
  }
  .scan-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-bottom: 0.5px solid var(--g4);
    background: var(--g0); flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .scan-step { font-size: 7px; color: #7aa2e0; letter-spacing: 0.22em; font-weight: 600; }
  .scan-label { font-size: 7px; color: #7aa2e0; letter-spacing: 0.14em; }
  .scan-label.scanning { animation: scan-pulse 1.1s ease-in-out infinite; }
  @keyframes scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .scan-title { font-size: 13px; color: var(--g9); font-weight: 600; }
  .scan-meta { font-size: 9px; color: var(--g6); letter-spacing: 0.04em; }
  .scan-meta.anim { animation: scan-pulse 1.6s ease-in-out infinite; }
  .scan-prog-track {
    width: 100%; height: 3px; background: var(--g3); border-radius: 2px; overflow: hidden;
    margin: 4px 0;
  }
  .scan-prog-fill {
    height: 100%; background: #7aa2e0; border-radius: 2px;
    transition: width 0.18s ease-out;
  }
  .sc-open {
    padding: 2px 7px; border-radius: 3px;
    background: transparent; border: 0.5px solid var(--g4);
    color: var(--g6); font-size: 9px; cursor: pointer;
    flex-shrink: 0; transition: all 0.1s;
  }
  .sc-open:hover { background: var(--g2); border-color: var(--g5); color: var(--g8); }
  .scan-sort-btn {
    font-size: 10px; color: var(--g8); font-weight: 500;
    padding: 3px 8px; background: var(--g2); border-radius: 3px; cursor: pointer;
  }
  .scan-grid {
    flex: 1; overflow: auto; padding: 10px 12px;
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
    align-content: start;
  }
  .scan-card {
    padding: 10px 12px 9px; border-radius: 8px; cursor: pointer;
    background: var(--g0); border: 0.5px solid var(--g4);
    display: flex; flex-direction: column; gap: 5px;
    transition: all 0.14s; text-align: left;
  }
  .scan-card:hover { background: var(--g2); border-color: var(--g4); }
  .scan-card.active { background: var(--g2); border-color: var(--sc); box-shadow: 0 0 0 0.5px var(--sc); }
  .scan-card.skeleton {
    min-height: 100px; background: var(--g2); border-color: var(--g3);
    animation: skeleton-fade 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
  .sc-top { display: flex; align-items: center; gap: 4px; }
  .sc-sym { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--g9); font-weight: 600; }
  .sc-tf {
    font-family: 'JetBrains Mono', monospace; font-size: 7.5px; color: var(--g6);
    padding: 1px 4px; background: var(--g2); border-radius: 2px;
  }
  .sc-alpha { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; }
  .sc-sim-row { display: flex; align-items: center; gap: 4px; }
  .sc-sim-bar { flex: 1; height: 2.5px; background: var(--g3); border-radius: 2px; overflow: hidden; }
  .sc-sim-fill { height: 100%; opacity: 0.85; }
  .sc-sim-pct { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--g8); width: 24px; text-align: right; }
  .sc-pattern { font-size: 8.5px; color: var(--g6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc-age { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g5); }

  /* ── ACT panel (trade_act.jsx) ── */

  /* Plan col */

  /* Judge col */

  .judge-btn.agree.active { background: rgba(52,196,112,0.18); border-color: var(--pos); box-shadow: inset 0 0 0 0.5px var(--pos); }

  .judge-btn.disagree.active { background: rgba(248,81,73,0.18); border-color: var(--neg); box-shadow: inset 0 0 0 0.5px var(--neg); }

  /* After col */

  .outcome-btn.active { background: var(--obg); color: var(--oc); border-color: var(--oc); }

  .rj-pos.active { background: var(--pos-d); border-color: var(--pos); }

  .rj-neg.active { background: var(--neg-d); border-color: var(--neg); }

  /* PeekBar rich summary */

  /* MiniChart */
  .sc-minichart { width: 100%; height: 48px; display: block; }

  /* ── Layout switcher strip ─────────────────────────────────────────────── */

  /* scan-row: compact horizontal scan item for C sidebar */

  .scan-row.active { background: var(--g2); }

  /* ── Layout C — chart + peek bar + sidebar (merged C+D) ─────────────────── */

  /* merged layout: chart-section.lc-main = left pane (chart + peek) */

  /* Responsive: hide sidebar below 860px, chart-section goes full width */
  

  /* ── Decision HUD: right rail owns conclusions only ───────────────────── */

  .hud-action.active {
    background: var(--g2);
    border-color: var(--brand);
    color: var(--g9);
  }

  /* ── Analyze workspace: bottom owns verification/comparison/refinement ── */

  .phase-node.active {
    border-color: color-mix(in srgb, var(--amb) 55%, var(--g4));
    background: color-mix(in srgb, var(--amb) 11%, var(--g0));
  }

  .phase-node.active .phase-dot { background: var(--amb); box-shadow: 0 0 0 4px var(--amb-dd); }

  .phase-node.active .phase-label { color: var(--g9); font-weight: 700; }

  /* Visual salvage pass: less card noise, more trading-terminal density. */

  .micro-toggle-btn.active {
    color: #f3d58d;
    background: rgba(232,184,106,0.105);
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.22);
  }

  .pb-tab.active {
    background: rgba(255,255,255,0.028);
  }

  .dh-tab.active {
    background: rgba(255,255,255,0.026);
  }

  .phase-node.active {
    background: rgba(232,184,106,0.105);
  }

  .multichart-toggle.active {
    border-color: rgba(59,130,246,0.5);
    background: rgba(59,130,246,0.12);
    color: #93c5fd;
  }
  .multichart-toggle.active:hover {
    border-color: rgba(59,130,246,0.7);
    background: rgba(59,130,246,0.2);
    color: #bfdbfe;
  }

  .observe-mode :global(.chart-live .chart-toolbar), .observe-mode :global(.chart-live .chart-header--tv) {
    display: none !important;
  }

  .observe-mode :global(.chart-live .chart-board) {
    border: none !important;
    border-radius: 0 !important;
    background: #0f131d !important;
  }

  

  /* ── Mobile layout ── */

  .mts-tab.active {
    color: var(--brand);
    background: var(--g1);
    border-top: 1.5px solid var(--brand);
  }

  /* ── Accessibility: Screen reader only text ── */

  /* ── Mobile loading ── */

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Proposal AI CTA (mobile) ── */

  /* ── JUDGE context header ── */

</style>
