<script lang="ts">
  import { goto } from '$app/navigation';
  import type { CaptureRow, OpportunityScore } from '../../../routes/dashboard/+page.server';

  interface WatchingCapture {
    capture_id: string;
    symbol: string;
    pattern_slug: string;
    status: string;
    captured_at_ms: number;
    pnl_pct: number | null;
  }

  interface Props {
    topOpportunities: OpportunityScore[];
    opportunityPersonalized: boolean;
    macroRegime: string;
    pendingVerdicts: CaptureRow[];
    labellingId: string | null;
    labelError: string | null;
    watchingCaptures: WatchingCapture[];
    watchingLoading: boolean;
    onVerdict: (captureId: string, verdict: 'valid' | 'invalid' | 'near_miss') => void;
  }

  let {
    topOpportunities,
    opportunityPersonalized,
    macroRegime,
    pendingVerdicts,
    labellingId,
    labelError,
    watchingCaptures,
    watchingLoading,
    onVerdict,
  }: Props = $props();

  function opScoreColor(s: number): string {
    if (s >= 56) return '#4ade80';
    if (s >= 40) return '#fbbf24';
    return '#f87171';
  }
  function opDirColor(d: string): string {
    if (d === 'long') return '#4ade80';
    if (d === 'short') return '#f87171';
    return '#94a3b8';
  }
  function opDirIcon(d: string): string {
    if (d === 'long') return '↑';
    if (d === 'short') return '↓';
    return '→';
  }
  function fmtOpPrice(p: number): string {
    if (!p) return '—';
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return '$' + p.toFixed(2);
    return '$' + p.toPrecision(3);
  }
  function fmtDate(ms: number): string {
    return new Date(ms).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  function fmtSlug(slug: string): string {
    return slug.replace(/-v\d+$/, '').replace(/-/g, ' ');
  }
  function fmtPct(v: number | null | undefined): string {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }
  function pnlClass(v: number | null | undefined): string {
    if (v == null) return '';
    return v >= 0 ? 'surface-value-positive' : 'surface-value-negative';
  }
</script>

<section class="dash-3col">
  <!-- Col 1: Top Movers -->
  <div class="dash-col">
    <div class="dash-col-head">
      <span class="dash-col-title">Top Movers</span>
      {#if opportunityPersonalized}
        <span class="surface-chip op-chip--personal">개인화</span>
      {/if}
      <span class="dash-col-regime" class:regime-on={macroRegime === 'risk-on'} class:regime-off={macroRegime === 'risk-off'}>{macroRegime}</span>
    </div>
    {#if topOpportunities.length === 0}
      <div class="dash-col-empty">엔진 연결 중…</div>
    {:else}
      {#each topOpportunities.slice(0, 5) as pick, i (pick.symbol)}
        <div class="mover-row">
          <span class="mover-rank" style="color:{opScoreColor(pick.totalScore)}">#{i + 1}</span>
          <span class="mover-sym">{pick.symbol}</span>
          <span class="mover-dir" style="color:{opDirColor(pick.direction)}">{opDirIcon(pick.direction)}</span>
          <span class="mover-price">{fmtOpPrice(pick.price)}</span>
          <span class="mover-chg" class:mover-up={pick.change24h >= 0} class:mover-dn={pick.change24h < 0}>
            {pick.change24h >= 0 ? '+' : ''}{pick.change24h.toFixed(1)}%
          </span>
          <span class="mover-score" style="color:{opScoreColor(pick.totalScore)}">{pick.totalScore}</span>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Col 2: Pending Verdicts -->
  <div class="dash-col">
    <div class="dash-col-head">
      <span class="dash-col-title">Pending Verdicts</span>
      {#if pendingVerdicts.length > 0}
        <span class="surface-chip">{pendingVerdicts.length}</span>
      {/if}
    </div>
    {#if labelError}
      <p class="verdict-error">{labelError}</p>
    {/if}
    {#if pendingVerdicts.length === 0}
      <div class="dash-col-empty">판정 대기 없음</div>
    {:else}
      {#each pendingVerdicts.slice(0, 5) as capture (capture.capture_id)}
        {@const busy = labellingId === capture.capture_id}
        <div class="decision-row" class:decision-row--busy={busy}>
          <div class="decision-meta">
            <strong class="decision-sym">{capture.symbol}</strong>
            <span class="decision-slug">{fmtSlug(capture.pattern_slug)}</span>
            <span class="surface-meta">{fmtDate(capture.captured_at_ms)}</span>
          </div>
          <div class="decision-btns">
            <button class="vbtn vbtn--win" disabled={busy} onclick={() => onVerdict(capture.capture_id, 'valid')}>WIN</button>
            <button class="vbtn vbtn--loss" disabled={busy} onclick={() => onVerdict(capture.capture_id, 'invalid')}>LOSS</button>
            <button class="vbtn vbtn--miss" disabled={busy} onclick={() => onVerdict(capture.capture_id, 'near_miss')}>MISS</button>
          </div>
        </div>
      {/each}
      {#if pendingVerdicts.length > 5}
        <a href="/lab" class="dash-more-link">+ {pendingVerdicts.length - 5} more in Lab</a>
      {/if}
    {/if}
  </div>

  <!-- Col 3: Today's Patterns -->
  <div class="dash-col">
    <div class="dash-col-head">
      <span class="dash-col-title">Today's Patterns</span>
      {#if !watchingLoading}
        <span class="surface-chip">{watchingCaptures.length}</span>
      {/if}
    </div>
    {#if watchingLoading}
      <div class="dash-col-empty">로딩 중…</div>
    {:else if watchingCaptures.length === 0}
      <div class="dash-col-empty">
        <p>패턴 없음 — Terminal에서 Watch를 눌러 추가</p>
        <button class="surface-button" style="margin-top:8px; font-size:11px;" onclick={() => goto('/cogochi')}>Open Terminal</button>
      </div>
    {:else}
      {#each watchingCaptures as cap}
        <button class="pattern-row-btn" onclick={() => goto(`/cogochi?capture=${cap.capture_id}`)}>
          <span class="pattern-slug">{cap.pattern_slug.replace(/-v\d+$/, '').replace(/-/g, ' ')}</span>
          <span class="pattern-sym">{cap.symbol}</span>
          <span class="surface-chip pattern-status-{cap.status}">{cap.status}</span>
          {#if cap.pnl_pct != null}
            <span class={pnlClass(cap.pnl_pct)}>{fmtPct(cap.pnl_pct)}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</section>

<style>
  .dash-3col {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: rgba(249, 216, 194, 0.06);
    border-top: 1px solid rgba(249, 216, 194, 0.06);
    border-bottom: 1px solid rgba(249, 216, 194, 0.06);
  }
  @media (max-width: 900px) {
    .dash-3col { grid-template-columns: 1fr; }
  }

  .dash-col {
    padding: 12px 16px;
    background: rgba(8, 10, 18, 0.5);
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 160px;
  }

  .dash-col-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.06);
    margin-bottom: 4px;
  }

  .dash-col-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(250, 247, 235, 0.5);
    flex: 1;
  }

  .dash-col-regime {
    font-size: var(--ui-text-xs);
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(255,255,255,0.05);
    color: rgba(250, 247, 235, 0.35);
    text-transform: capitalize;
  }
  .dash-col-regime.regime-on  { color: #4ade80; background: rgba(74,222,128,0.1); }
  .dash-col-regime.regime-off { color: #f87171; background: rgba(248,113,113,0.1); }

  .dash-col-empty {
    font-size: 11px;
    color: rgba(250, 247, 235, 0.25);
    padding: 12px 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .dash-col-empty p { margin: 0; }

  .mover-row {
    display: grid;
    grid-template-columns: 24px 1fr 12px auto auto auto;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 0.5px solid rgba(249, 216, 194, 0.04);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .mover-rank { font-weight: 700; font-size: var(--ui-text-xs); }
  .mover-sym  { font-weight: 700; color: rgba(250, 247, 235, 0.9); }
  .mover-dir  { font-size: 12px; }
  .mover-price { color: rgba(250, 247, 235, 0.6); font-size: 11px; }
  .mover-chg  { font-size: 11px; font-weight: 600; }
  .mover-up   { color: #22AB94; }
  .mover-dn   { color: #F23645; }
  .mover-score { font-size: var(--ui-text-xs); color: rgba(250, 247, 235, 0.4); }

  .decision-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
    border-bottom: 0.5px solid rgba(249, 216, 194, 0.04);
  }
  .decision-row--busy { opacity: 0.4; pointer-events: none; }
  .decision-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .decision-sym  { font-size: 13px; font-weight: 700; color: rgba(250, 247, 235, 0.9); font-family: 'JetBrains Mono', monospace; }
  .decision-slug { font-size: var(--ui-text-xs); color: rgba(250, 247, 235, 0.4); text-transform: capitalize; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .decision-btns { display: flex; gap: 4px; }
  .vbtn {
    padding: 3px 8px;
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    cursor: pointer;
    border: 1px solid transparent;
    background: rgba(255,255,255,0.06);
    color: rgba(250,247,235,0.6);
    transition: all 0.1s;
  }
  .vbtn:disabled { opacity: 0.3; cursor: not-allowed; }
  .vbtn--win:hover:not(:disabled)  { background: rgba(34,171,148,0.2); border-color: rgba(34,171,148,0.5); color: #22AB94; }
  .vbtn--loss:hover:not(:disabled) { background: rgba(242,54,69,0.2);  border-color: rgba(242,54,69,0.5);  color: #F23645; }
  .vbtn--miss:hover:not(:disabled) { background: rgba(251,191,36,0.2); border-color: rgba(251,191,36,0.5); color: #fbbf24; }

  .dash-more-link {
    font-size: var(--ui-text-xs);
    color: rgba(249, 216, 194, 0.4);
    text-decoration: none;
    padding: 4px 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .dash-more-link:hover { color: rgba(249, 216, 194, 0.7); }

  .pattern-row-btn {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 6px;
    padding: 5px 0;
    border-bottom: 0.5px solid rgba(249, 216, 194, 0.04);
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    text-align: left;
    transition: background 0.08s;
  }
  .pattern-row-btn:hover { background: rgba(255,255,255,0.03); }
  .pattern-slug { font-size: var(--ui-text-xs); color: rgba(250,247,235,0.55); text-transform: capitalize; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pattern-sym  { font-size: 11px; font-weight: 700; color: rgba(250,247,235,0.85); }
  .pattern-status-watching        { background: rgba(59,130,246,0.15); color: #93c5fd; }
  .pattern-status-pending_outcome { background: rgba(234,179,8,0.15);  color: #fde047; }
  .pattern-status-outcome_ready   { background: rgba(34,197,94,0.15);  color: #86efac; }

  .verdict-error {
    margin: 0;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(248, 113, 113, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.25);
    font-size: 0.82rem;
    color: #f87171;
  }

  .op-chip--personal {
    background: rgba(99, 179, 237, 0.15);
    color: #63b3ed;
  }
</style>
