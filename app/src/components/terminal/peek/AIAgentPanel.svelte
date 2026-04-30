<script lang="ts">
  import type { PanelAnalyzeData } from '$lib/terminal/panelAdapter';

  type JudgeVerdict = 'valid' | 'invalid' | 'too_early' | 'too_late' | 'near_miss';

  interface RangeSelection {
    from: number;
    to: number;
    fromTime?: number;
    toTime?: number;
  }

  interface Props {
    symbol?: string;
    tf?: string;
    analysisData?: PanelAnalyzeData | null;
    rangeSelection?: RangeSelection | null;
    ohlcvBars?: any[];
    onEnterRangeMode?: () => void;
  }

  let {
    symbol = '',
    tf = '4h',
    analysisData,
    rangeSelection = null,
    ohlcvBars = [],
    onEnterRangeMode,
  }: Props = $props();

  let analyzing = $state(false);
  let phase = $state('');
  let phaseConfidence = $state(0);
  let signals = $state<Array<{ label: string; state: string; note: string; detected?: boolean }>>([]);
  let thesis = $state<string[]>([]);
  let summary = $state('');
  let analysisError = $state('');
  let judgeVerdict = $state<JudgeVerdict | null>(null);
  let saving = $state(false);
  let saved = $state(false);
  let promptText = $state('');
  let abortCtrl: AbortController | null = null;

  const sym = $derived(symbol.replace('USDT', '') || '—');
  const tfUpper = $derived(tf.toUpperCase());
  const hasRange = $derived(rangeSelection != null);
  const hasResult = $derived(phase !== '' || summary !== '');

  async function runAnalysis() {
    if (!hasRange || analyzing) return;
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    analyzing = true;
    phase = ''; phaseConfidence = 0; signals = []; thesis = []; summary = '';
    analysisError = ''; judgeVerdict = null; saved = false;

    try {
      const klines = ohlcvBars.filter((b: any) => {
        const t = b.time ?? b.t;
        return t >= (rangeSelection!.fromTime ?? 0) && t <= (rangeSelection!.toTime ?? Infinity);
      });

      const snap = (analysisData as any)?.snapshot ?? {};
      const layersRaw = (analysisData as any)?.deep?.layers ?? {};
      const deriv = (analysisData as any)?.derivativesSnapshot ?? {};
      const flowSummary = analysisData?.flowSummary ?? {};

      const indicatorContext = {
        rsi14: snap.rsi14 ?? undefined,
        fundingRate: snap.funding_rate ?? (analysisData as any)?.derivatives?.funding_rate ?? undefined,
        oiChange1h: snap.oi_change_1h ?? undefined,
        emaAlignment: snap.ema_alignment ?? undefined,
        htfStructure: snap.htf_structure ?? undefined,
        volRatio3: snap.vol_ratio_3 ?? undefined,
        cvdState: snap.cvd_state ?? undefined,
        wyckoffScore: (layersRaw as any).wyckoff?.score ?? undefined,
        momentumScore: (layersRaw as any).momentum?.score ?? undefined,
        bbScore: (layersRaw as any).bb?.score ?? undefined,
        mtfScore: (layersRaw as any).mtf?.score ?? undefined,
        lsRatio: (deriv as any).lsRatio ?? undefined,
        takerBuyRatio: (flowSummary as any).takerBuyRatio ?? undefined,
        kimchiScore: (layersRaw as any).kimchi?.score ?? undefined,
        fgScore: (layersRaw as any).fg?.score ?? undefined,
        pWin: analysisData?.p_win ?? undefined,
        direction: (analysisData as any)?.ensemble?.direction ?? undefined,
      };

      const res = await fetch('/api/terminal/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol, timeframe: tf,
          klines: klines.length > 0 ? klines : ohlcvBars.slice(rangeSelection!.from, rangeSelection!.to + 1),
          noteDraft: promptText || undefined,
          indicatorContext,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) { analysisError = `분석 실패 (${res.status})`; return; }
      const data = await res.json();
      phase = data.phase ?? ''; phaseConfidence = data.phaseConfidence ?? 0;
      signals = data.signals ?? []; thesis = data.thesis ?? []; summary = data.summary ?? '';
    } catch (e: any) {
      if (e?.name !== 'AbortError') analysisError = '분석 오류 — 다시 시도하세요';
    } finally {
      analyzing = false;
    }
  }

  async function saveCapture() {
    if (!judgeVerdict || saving) return;
    saving = true; saved = false;
    try {
      const res = await fetch('/api/terminal/pattern-captures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol, timeframe: tf, triggerOrigin: 'manual',
          verdict: judgeVerdict === 'valid' ? 'bullish' : judgeVerdict === 'invalid' ? 'bearish' : 'neutral',
          judgmentVerdict: judgeVerdict,
          phase: phase || undefined, summary: summary || undefined,
          markers: [],
          rangeFrom: rangeSelection?.fromTime ?? rangeSelection?.from,
          rangeTo: rangeSelection?.toTime ?? rangeSelection?.to,
        }),
      });
      if (res.ok) saved = true;
      else analysisError = 'Save 실패';
    } catch { analysisError = 'Save 오류'; }
    finally { saving = false; }
  }

  function phaseColor(p: string): string {
    const low = p.toLowerCase();
    if (low.includes('accumulation') || low.includes('breakout') || low.includes('축적') || low.includes('돌파')) return 'bull';
    if (low.includes('dump') || low.includes('distribution') || low.includes('급락') || low.includes('분산')) return 'bear';
    return 'dim';
  }
</script>

<div class="aap">
  <div class="aap-header">
    <span class="aap-title">AI AGENT</span>
    <span class="aap-ctx">{sym} · {tfUpper}</span>
  </div>

  <!-- Range status — clickable when no range to enter range mode -->
  <button
    class="aap-range"
    class:has-range={hasRange}
    onclick={() => !hasRange && onEnterRangeMode?.()}
    aria-label={hasRange ? '구간 선택됨' : '차트에서 구간 선택'}
  >
    {#if hasRange}
      <span class="range-label">구간 선택됨</span>
      <span class="range-bars">{rangeSelection!.to - rangeSelection!.from + 1}개 봉</span>
    {:else}
      <span class="range-hint">▷ 여기 클릭 후 차트에서 드래그</span>
    {/if}
  </button>

  <div class="aap-prompt-row">
    <input
      class="aap-prompt"
      type="text"
      placeholder="프롬프트 (옵션)"
      bind:value={promptText}
      onkeydown={(e) => e.key === 'Enter' && void runAnalysis()}
    />
    <button
      class="aap-analyze-btn"
      disabled={!hasRange || analyzing || !ohlcvBars.length}
      onclick={() => void runAnalysis()}
    >{analyzing ? '…' : '▶'}</button>
  </div>

  {#if analysisError}
    <div class="aap-error">{analysisError}</div>
  {/if}

  {#if analyzing}
    <div class="aap-loading"><span class="pulse"></span><span>분석 중…</span></div>
  {:else if hasResult}
    <div class="aap-result">
      {#if phase}
        <div class="aap-phase" data-color={phaseColor(phase)}>
          <span class="phase-label">{phase}</span>
          {#if phaseConfidence > 0}<span class="phase-conf">{Math.round(phaseConfidence * 100)}%</span>{/if}
        </div>
      {/if}
      {#if signals.length > 0}
        <div class="aap-signals">
          {#each signals.filter(s => s.detected ?? true).slice(0, 6) as sig}
            <div class="sig-row">
              <span class="sig-dot" data-s={sig.state}>·</span>
              <span class="sig-label">{sig.label}</span>
              {#if (sig as any).value && (sig as any).value !== '—'}<span class="sig-note">{(sig as any).value}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
      {#if thesis.length > 0}
        <div class="aap-thesis">{#each thesis as t}<p class="thesis-line">{t}</p>{/each}</div>
      {/if}
      {#if summary}<div class="aap-summary">{summary}</div>{/if}
    </div>

    <div class="aap-judge">
      {#each ([
        { key: 'valid',     label: '✓', tone: 'good', title: 'Valid'     },
        { key: 'invalid',   label: '✗', tone: 'bad',  title: 'Invalid'   },
        { key: 'too_early', label: '⏤', tone: 'warn', title: 'Too Early' },
        { key: 'too_late',  label: '⌛', tone: 'warn', title: 'Too Late'  },
        { key: 'near_miss', label: '◎',  tone: 'dim',  title: 'Near Miss' },
      ] as const) as btn}
        <button
          class="judge-btn" class:active={judgeVerdict === btn.key}
          data-tone={btn.tone} title={btn.title}
          onclick={() => judgeVerdict = judgeVerdict === btn.key ? null : btn.key}
          aria-pressed={judgeVerdict === btn.key}
        >{btn.label}</button>
      {/each}
    </div>

    {#if judgeVerdict && !saved}
      <button class="aap-save-btn" disabled={saving} onclick={() => void saveCapture()}>
        {saving ? '저장 중…' : 'Save to Scan'}
      </button>
    {:else if saved}
      <div class="aap-saved">✓ 저장 완료 — 스캔에 추가됨</div>
    {/if}
  {:else if !hasRange}
    <div class="aap-empty">
      <span>차트에서 분석할 구간을</span>
      <span>위 버튼을 눌러 선택하세요</span>
    </div>
  {/if}
</div>

<style>
  .aap {
    font-family: var(--sc-font-mono, monospace);
    background: var(--tv-bg-1, #131722);
    display: flex; flex-direction: column;
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .aap-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px 5px; border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .aap-title { font-size: 8px; font-weight: 700; letter-spacing: 0.14em; color: rgba(255,255,255,0.25); }
  .aap-ctx { font-size: 9px; color: rgba(255,255,255,0.4); }
  .aap-range {
    width: 100%; padding: 6px 10px; display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.02); border: none; border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer; text-align: left; transition: background 0.12s;
  }
  .aap-range:hover:not(.has-range) { background: rgba(255,255,255,0.05); }
  .aap-range.has-range { cursor: default; }
  .range-hint { font-size: 9px; color: rgba(255,255,255,0.35); font-family: var(--sc-font-mono, monospace); }
  .range-label { font-size: 9px; color: rgba(34,171,148,0.8); font-weight: 700; font-family: var(--sc-font-mono, monospace); }
  .range-bars { font-size: 9px; color: rgba(255,255,255,0.4); font-family: var(--sc-font-mono, monospace); }
  .aap-prompt-row { display: flex; gap: 4px; padding: 6px 8px; }
  .aap-prompt {
    flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px; padding: 4px 7px; font-family: var(--sc-font-mono, monospace);
    font-size: 10px; color: rgba(255,255,255,0.75); outline: none;
  }
  .aap-prompt:focus { border-color: rgba(255,255,255,0.18); }
  .aap-prompt::placeholder { color: rgba(255,255,255,0.2); }
  .aap-analyze-btn {
    background: rgba(34,171,148,0.12); border: 1px solid rgba(34,171,148,0.25);
    border-radius: 3px; color: #22ab94; font-size: 11px; padding: 0 10px;
    cursor: pointer; transition: background 0.1s;
  }
  .aap-analyze-btn:hover:not(:disabled) { background: rgba(34,171,148,0.22); }
  .aap-analyze-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .aap-error { padding: 4px 10px; font-size: 10px; color: #f23645; font-family: var(--sc-font-mono, monospace); }
  .aap-loading {
    display: flex; align-items: center; gap: 8px; padding: 12px 10px;
    font-size: 10px; color: rgba(255,255,255,0.3); font-family: var(--sc-font-mono, monospace);
  }
  .pulse {
    width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.3);
    animation: pulse 1.4s ease-in-out infinite; flex-shrink: 0;
  }
  @keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
  .aap-result { padding: 4px 0; overflow-y: auto; max-height: 240px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
  .aap-phase {
    display: flex; align-items: center; gap: 6px; padding: 5px 10px;
    background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .aap-phase[data-color='bull'] .phase-label { color: #22ab94; }
  .aap-phase[data-color='bear'] .phase-label { color: #f23645; }
  .aap-phase[data-color='dim'] .phase-label { color: rgba(255,255,255,0.5); }
  .phase-label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .phase-conf { font-size: 9px; color: rgba(255,199,80,0.7); }
  .aap-signals { padding: 4px 8px; }
  .sig-row { display: flex; align-items: baseline; gap: 4px; padding: 1px 0; }
  .sig-dot { font-size: 14px; line-height: 1; color: rgba(255,255,255,0.3); flex-shrink: 0; }
  .sig-dot[data-s='bull'] { color: #22ab94; }
  .sig-dot[data-s='bear'] { color: #f23645; }
  .sig-dot[data-s='warn'] { color: #efc050; }
  .sig-label { font-size: 10px; color: rgba(255,255,255,0.65); flex-shrink: 0; }
  .sig-note { font-size: 9px; color: rgba(255,255,255,0.3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aap-thesis { padding: 4px 10px; border-top: 1px solid rgba(255,255,255,0.04); }
  .thesis-line { font-size: 10px; color: rgba(255,255,255,0.55); margin: 2px 0; line-height: 1.45; }
  .aap-summary { padding: 6px 10px; font-size: 10px; color: rgba(255,255,255,0.5); line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.04); }
  .aap-judge { display: flex; align-items: center; gap: 3px; padding: 6px 10px; border-top: 1px solid rgba(255,255,255,0.05); }
  .judge-btn {
    width: 26px; height: 22px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.10);
    background: transparent; font-size: 11px; color: rgba(255,255,255,0.35);
    cursor: pointer; transition: all 0.08s; display: flex; align-items: center; justify-content: center; padding: 0;
  }
  .judge-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.72); }
  .judge-btn.active[data-tone='good'] { background: rgba(34,171,148,0.18); border-color: rgba(34,171,148,0.4); color: #22ab94; }
  .judge-btn.active[data-tone='bad']  { background: rgba(242,54,69,0.18);  border-color: rgba(242,54,69,0.4);  color: #f23645; }
  .judge-btn.active[data-tone='warn'] { background: rgba(239,192,80,0.18); border-color: rgba(239,192,80,0.4); color: #efc050; }
  .judge-btn.active[data-tone='dim']  { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.75); }
  .aap-save-btn {
    margin: 0 8px 8px; width: calc(100% - 16px); padding: 6px;
    background: rgba(34,171,148,0.12); border: 1px solid rgba(34,171,148,0.3);
    border-radius: 3px; font-family: var(--sc-font-mono, monospace); font-size: 10px;
    font-weight: 700; color: #22ab94; cursor: pointer; letter-spacing: 0.08em; transition: background 0.1s;
  }
  .aap-save-btn:hover:not(:disabled) { background: rgba(34,171,148,0.22); }
  .aap-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .aap-saved { margin: 0 8px 8px; padding: 6px 10px; font-size: 10px; color: rgba(34,171,148,0.8); background: rgba(34,171,148,0.06); border-radius: 3px; text-align: center; font-family: var(--sc-font-mono, monospace); }
  .aap-empty { padding: 16px 10px; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10px; color: rgba(255,255,255,0.2); text-align: center; }
</style>
