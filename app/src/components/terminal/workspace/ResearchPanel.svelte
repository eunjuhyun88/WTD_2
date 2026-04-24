<script lang="ts">
  /**
   * ResearchPanel — 구간 선택 → 자동 분석 → 유사 패턴 → 저장
   *
   * 흐름:
   *  1. 구간이 선택되면 즉시 열림
   *  2. 병렬로: OI/funding 주입 + AI 자동 분석 실행
   *  3. 유저: 간단 메모 추가 또는 AI 분석 수정
   *  4. 엔진에서 유사 패턴 10개 + outcome 표시
   *  5. 저장 → DB + 백그라운드 benchmark_search
   */
  import { onDestroy } from 'svelte';
  import { PHASE_META } from '$lib/terminal/phaseInfo';
  import { createPatternCapture } from '$lib/api/terminalPersistence';
  import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  interface Props {
    symbol: string;
    tf: string;
    open: boolean;
    viewport: ChartViewportSnapshot | null;
    onClose: () => void;
    onSaved: (captureId: string) => void;
  }

  let { symbol, tf, open, viewport, onClose, onSaved }: Props = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  type PanelStep = 'analyzing' | 'ready' | 'searching' | 'saving' | 'saved';

  let step = $state<PanelStep>('analyzing');
  let noteDraft = $state('');
  let saveError = $state<string | null>(null);

  // Auto-analysis result
  let detectedPhase = $state<string>('GENERAL');
  let phaseConfidence = $state(0);
  let detectedSignals = $state<Array<{ id: string; label: string; detected: boolean; value: string }>>([]);
  let thesisBullets = $state<string[]>([]);
  let analysisError = $state<string | null>(null);

  // Indicator injection
  let oiBars = $state<Array<{ time: number; value: number }>>([]);
  let fundingBars = $state<Array<{ time: number; rate: number }>>([]);
  let indicatorsLoaded = $state(false);

  // Engine search results
  type Candidate = {
    symbol: string;
    score: number;
    matchedSignals: string[];
    summary: string;
    source: string;
  };
  let candidates = $state<Candidate[]>([]);
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const sym = $derived(symbol.replace('USDT', ''));
  const phaseMeta = $derived(PHASE_META[detectedPhase as keyof typeof PHASE_META] ?? null);
  const detectedCount = $derived(detectedSignals.filter((s) => s.detected).length);
  const thesisText = $derived([...thesisBullets, noteDraft.trim()].filter(Boolean).join('\n'));

  // ---------------------------------------------------------------------------
  // Main effect: trigger pipeline when panel opens
  // ---------------------------------------------------------------------------

  let abortController: AbortController | null = null;

  $effect(() => {
    if (!open || !viewport) return;

    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    // Reset state
    step = 'analyzing';
    detectedPhase = 'GENERAL';
    phaseConfidence = 0;
    detectedSignals = [];
    thesisBullets = [];
    analysisError = null;
    candidates = [];
    searchError = null;
    indicatorsLoaded = false;
    oiBars = [];
    fundingBars = [];
    noteDraft = '';

    const klines = viewport.klines;
    const timeFrom = viewport.timeFrom;
    const timeTo = viewport.timeTo;
    const limit = Math.ceil((timeTo - timeFrom) / tfToSeconds(tf)) + 10;

    // Step A: fetch OI + funding in parallel
    void (async () => {
      const [oiRes, fundingRes] = await Promise.allSettled([
        fetch(
          `/api/market/oi?symbol=${encodeURIComponent(symbol)}&period=${tf}&limit=${Math.min(limit, 200)}`,
          { signal },
        ),
        fetch(
          `/api/market/funding?symbol=${encodeURIComponent(symbol)}&limit=${Math.min(limit, 200)}`,
          { signal },
        ),
      ]);

      if (signal.aborted) return;

      if (oiRes.status === 'fulfilled' && oiRes.value.ok) {
        try {
          const data = await oiRes.value.json();
          const bars: Array<{ time: number; value: number }> = (data.bars ?? data.klines ?? []).map(
            (b: Record<string, unknown>) => ({
              time: Number(b.time ?? b.t ?? 0),
              value: Number(b.c ?? b.sumOpenInterest ?? b.value ?? 0),
            }),
          );
          oiBars = bars.filter((b) => b.time >= timeFrom && b.time <= timeTo);
        } catch { /* non-fatal */ }
      }

      if (fundingRes.status === 'fulfilled' && fundingRes.value.ok) {
        try {
          const data = await fundingRes.value.json();
          const bars: Array<{ time: number; rate: number }> = (data.history ?? data.bars ?? []).map(
            (b: Record<string, unknown>) => ({
              time: Number(b.time ?? b.fundingTime ?? 0),
              rate: Number(b.rate ?? b.fundingRate ?? 0),
            }),
          );
          fundingBars = bars.filter((b) => b.time >= timeFrom && b.time <= timeTo);
        } catch { /* non-fatal */ }
      }

      indicatorsLoaded = true;

      // Step B: auto-analyze
      try {
        const res = await fetch('/api/terminal/research', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            symbol,
            timeframe: tf,
            klines,
            oiBars,
            fundingBars,
            noteDraft,
          }),
          signal,
        });

        if (signal.aborted) return;

        if (res.ok) {
          const data = await res.json();
          detectedPhase = data.phase ?? 'GENERAL';
          phaseConfidence = data.phaseConfidence ?? 0;
          detectedSignals = data.signals ?? [];
          thesisBullets = data.thesis ?? [];
        } else {
          analysisError = 'AI 분석 실패 — 직접 입력해주세요';
        }
      } catch {
        if (!signal.aborted) analysisError = 'AI 분석 오류';
      }

      step = 'searching';

      // Step C: engine search
      void runEngineSearch(signal);
    })();

    return () => { abortController?.abort(); };
  });

  // Reset when closed
  $effect(() => {
    if (!open) {
      abortController?.abort();
      step = 'analyzing';
    }
  });

  onDestroy(() => { abortController?.abort(); });

  // ---------------------------------------------------------------------------
  // Engine search
  // ---------------------------------------------------------------------------

  async function runEngineSearch(signal?: AbortSignal) {
    if (!viewport) return;
    searchLoading = true;
    searchError = null;

    try {
      const thesis = thesisText || `${sym} ${tf.toUpperCase()} 패턴`;
      const res = await fetch('/api/terminal/pattern-seed/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          thesis,
          activeSymbol: symbol,
          timeframe: tf,
          boardSymbols: [],
          assets: [],
        }),
        signal,
      });

      if (signal?.aborted) return;

      if (res.ok) {
        const data = await res.json();
        candidates = (data.candidates ?? []).slice(0, 10);
      } else {
        searchError = '엔진 검색 불가 — 저장 후 재시도';
      }
    } catch {
      if (!signal?.aborted) searchError = '검색 연결 오류';
    } finally {
      searchLoading = false;
      if (step === 'searching') step = 'ready';
    }
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!viewport || step === 'saving' || step === 'saved') return;
    step = 'saving';
    saveError = null;

    try {
      const record = await createPatternCapture({
        symbol,
        timeframe: tf,
        contextKind: 'symbol',
        triggerOrigin: 'manual',
        reason: detectedPhase,
        note: [thesisText, noteDraft.trim()].filter(Boolean).join('\n').slice(0, 2000),
        snapshot: {
          price: viewport.klines.at(-1)?.close ?? null,
          change24h: null,
          funding: null,
          oiDelta: null,
          freshness: 'recent',
          viewport,
        },
        decision: {},
        sourceFreshness: { source: 'range_mode_save' },
      });

      if (!record) {
        saveError = '저장 실패 — 다시 시도해주세요';
        step = 'ready';
        return;
      }

      step = 'saved';

      // Background: trigger benchmark_search on engine (fire-and-forget)
      void fetch(`/api/terminal/pattern-captures/${encodeURIComponent(record.id)}/benchmark`, {
        method: 'POST',
      }).catch(() => { /* non-fatal */ });

      onSaved(record.id);
    } catch (e) {
      saveError = e instanceof Error ? e.message : '저장 오류';
      step = 'ready';
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function tfToSeconds(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
      '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600,
      '12h': 43200, '1d': 86400,
    };
    return map[timeframe] ?? 900;
  }

  function fmtTime(ts: number): string {
    return new Date(ts * 1000).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="panel-backdrop"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('panel-backdrop')) onClose(); }}
  onkeydown={handleKeydown}
>
  <div class="panel">

    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <span class="sym">{sym}<span class="quote">/USDT</span></span>
        <span class="tf-badge">{tf.toUpperCase()}</span>
        {#if viewport}
          <span class="range-hint">
            {fmtTime(viewport.timeFrom)} → {fmtTime(viewport.timeTo)}
            &nbsp;·&nbsp; {viewport.barCount}봉
          </span>
        {/if}
      </div>
      <button class="close-btn" onclick={onClose} aria-label="닫기">✕</button>
    </div>

    <div class="panel-body">

      <!-- Col A: AI 분석 결과 -->
      <div class="col col-analysis">
        <p class="col-label">AI 자동 분석</p>

        {#if step === 'analyzing'}
          <div class="loading-row">
            <span class="spinner"></span>
            <span>OI / 펀딩 / 차트 분석 중…</span>
          </div>
        {:else if analysisError}
          <p class="err-inline">{analysisError}</p>
        {:else}
          <!-- Phase chip -->
          <div
            class="phase-chip"
            style="border-color: {phaseMeta?.color ?? 'rgba(255,255,255,0.12)'}; background: {phaseMeta?.color ?? 'rgba(255,255,255,0.04)'};"
          >
            <span class="phase-name">{phaseMeta?.koLabel ?? detectedPhase}</span>
            <span class="phase-conf">{Math.round(phaseConfidence * 100)}% 확신</span>
          </div>

          <!-- Phase meaning -->
          {#if phaseMeta?.meaning}
            <p class="phase-meaning">{phaseMeta.meaning}</p>
          {/if}

          <!-- Detected signals -->
          {#if detectedSignals.length > 0}
            <div class="signal-grid">
              {#each detectedSignals.filter((s) => s.detected) as sig}
                <div class="signal-row signal-on">
                  <span class="signal-dot on"></span>
                  <span class="signal-label">{sig.label}</span>
                  <span class="signal-val">{sig.value}</span>
                </div>
              {/each}
              {#each detectedSignals.filter((s) => !s.detected).slice(0, 3) as sig}
                <div class="signal-row signal-off">
                  <span class="signal-dot off"></span>
                  <span class="signal-label">{sig.label}</span>
                  <span class="signal-val">—</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Thesis bullets -->
          {#if thesisBullets.length > 0}
            <div class="thesis-block">
              {#each thesisBullets as bullet, i}
                {#if i > 0}<p class="thesis-bullet">{bullet}</p>{/if}
              {/each}
            </div>
          {/if}

          <!-- Indicator injection status -->
          <div class="indicator-status">
            <span class:loaded={oiBars.length > 0}>OI {oiBars.length > 0 ? `${oiBars.length}봉` : '없음'}</span>
            <span class:loaded={fundingBars.length > 0}>펀딩 {fundingBars.length > 0 ? `${fundingBars.length}봉` : '없음'}</span>
          </div>
        {/if}

        <!-- User note -->
        <div class="note-section">
          <p class="col-label" style="margin-top:12px;">메모 추가 (선택)</p>
          <textarea
            class="note-input"
            placeholder="AI 분석에 추가할 내용 — 예: 세력 숏 누르기 패턴, BTC 횡보 중, 펀딩 0.05% → −0.02%"
            bind:value={noteDraft}
            rows={3}
            disabled={step === 'saving' || step === 'saved'}
          ></textarea>
        </div>
      </div>

      <!-- Col B: 유사 패턴 + Outcome -->
      <div class="col col-results">
        <div class="col-label-row">
          <p class="col-label">유사 패턴</p>
          {#if searchLoading}
            <span class="spinner small"></span>
          {:else}
            <span class="result-count">{candidates.length}건</span>
          {/if}
        </div>

        {#if step === 'analyzing'}
          <div class="results-placeholder">분석 완료 후 검색 시작</div>
        {:else if searchLoading && candidates.length === 0}
          <div class="loading-row">
            <span class="spinner"></span>
            <span>엔진에서 비슷한 패턴 검색 중…</span>
          </div>
        {:else if searchError && candidates.length === 0}
          <div class="results-placeholder err">{searchError}</div>
        {:else if candidates.length === 0}
          <div class="results-placeholder">검색 결과 없음</div>
        {:else}
          <div class="candidate-list">
            {#each candidates as c}
              <div class="candidate-card">
                <div class="cand-top">
                  <strong class="cand-sym">{c.symbol.replace('USDT', '')}</strong>
                  <span class="cand-score" class:high={c.score >= 70} class:mid={c.score >= 40 && c.score < 70}>
                    {c.score}점
                  </span>
                </div>
                {#if c.summary}
                  <p class="cand-summary">{c.summary}</p>
                {/if}
                {#if c.matchedSignals.length > 0}
                  <div class="cand-signals">
                    {#each c.matchedSignals.slice(0, 4) as sig}
                      <span class="sig-tag">{sig.replace(/_/g, ' ')}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Re-search button (after note change) -->
        {#if step === 'ready' && !searchLoading}
          <button
            class="research-btn"
            onclick={() => { step = 'searching'; void runEngineSearch(); }}
          >
            다시 검색
          </button>
        {/if}
      </div>
    </div>

    <!-- Footer actions -->
    <div class="panel-footer">
      {#if saveError}
        <p class="save-error">{saveError}</p>
      {/if}

      {#if step === 'saved'}
        <div class="saved-row">
          <span class="saved-badge">✓ 저장됨</span>
          <button class="close-after-save-btn" onclick={onClose}>닫기</button>
        </div>
      {:else}
        <button class="cancel-btn" onclick={onClose} disabled={step === 'saving'}>취소</button>
        <button
          class="save-btn"
          onclick={handleSave}
          disabled={step === 'analyzing' || step === 'saving' || !viewport}
        >
          {step === 'saving' ? '저장 중…' : '패턴 저장 →'}
        </button>
      {/if}
    </div>

  </div>
</div>
{/if}

<style>
  .panel-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
  }

  .panel {
    background: #0d0d0d;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    width: min(780px, 95vw);
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }
  .quote {
    font-weight: 400;
    color: rgba(255, 255, 255, 0.3);
    font-size: 12px;
  }
  .tf-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 3px;
    color: rgba(255, 255, 255, 0.5);
  }
  .range-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(94, 234, 212, 0.7);
  }
  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.3);
    font-size: 14px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.1s;
  }
  .close-btn:hover {
    color: rgba(255, 255, 255, 0.7);
  }

  /* Body: two-column */
  .panel-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    flex: 1;
    overflow: hidden;
  }

  .col {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .col-analysis {
    border-right: 1px solid rgba(255, 255, 255, 0.06);
  }

  .col-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.25);
    margin: 0;
    text-transform: uppercase;
  }
  .col-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .result-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Loading */
  .loading-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(38, 166, 154, 0.8);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  .spinner.small {
    width: 10px;
    height: 10px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Phase chip */
  .phase-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    gap: 8px;
  }
  .phase-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }
  .phase-conf {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
  }
  .phase-meaning {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.55);
  }

  /* Signals */
  .signal-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .signal-row {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 3px;
  }
  .signal-row.signal-on {
    background: rgba(255, 255, 255, 0.04);
  }
  .signal-row.signal-off {
    opacity: 0.35;
  }
  .signal-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .signal-dot.on {
    background: #4ade80;
  }
  .signal-dot.off {
    background: rgba(255, 255, 255, 0.2);
  }
  .signal-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.75);
  }
  .signal-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
  }

  /* Thesis */
  .thesis-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 4px;
  }
  .thesis-bullet {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.65);
  }

  /* Indicator status */
  .indicator-status {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .indicator-status span {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255, 255, 255, 0.25);
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: color 0.2s;
  }
  .indicator-status span.loaded {
    color: rgba(74, 222, 128, 0.7);
    border-color: rgba(74, 222, 128, 0.2);
  }

  /* Note */
  .note-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .note-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    padding: 8px 10px;
    resize: vertical;
    line-height: 1.5;
    font-family: inherit;
    transition: border-color 0.1s;
  }
  .note-input:focus {
    outline: none;
    border-color: rgba(38, 166, 154, 0.4);
  }
  .note-input::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }

  /* Results */
  .results-placeholder {
    padding: 16px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    text-align: center;
  }
  .results-placeholder.err {
    color: rgba(251, 113, 133, 0.7);
  }

  .candidate-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .candidate-card {
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: border-color 0.1s;
  }
  .candidate-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
  }
  .cand-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cand-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }
  .cand-score {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
  }
  .cand-score.high {
    color: #4ade80;
  }
  .cand-score.mid {
    color: #fbbf24;
  }
  .cand-summary {
    margin: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.4;
  }
  .cand-signals {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .sig-tag {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    padding: 2px 5px;
    background: rgba(38, 166, 154, 0.1);
    border: 1px solid rgba(38, 166, 154, 0.25);
    border-radius: 3px;
    color: rgba(38, 166, 154, 0.85);
  }

  .research-btn {
    margin-top: 4px;
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.5);
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .research-btn:hover {
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
  }

  /* Footer */
  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
  }
  .save-error {
    flex: 1;
    margin: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: #f87171;
  }
  .saved-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    justify-content: flex-end;
  }
  .saved-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: #4ade80;
    font-weight: 700;
  }
  .close-after-save-btn {
    padding: 7px 16px;
    background: rgba(74, 222, 128, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.3);
    color: #4ade80;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    transition: all 0.1s;
  }
  .err-inline {
    margin: 0;
    font-size: 11px;
    color: rgba(251, 113, 133, 0.7);
  }
  .cancel-btn {
    padding: 7px 14px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    transition: all 0.1s;
  }
  .cancel-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.7);
  }
  .save-btn {
    padding: 7px 20px;
    background: rgba(38, 166, 154, 0.15);
    border: 1px solid rgba(38, 166, 154, 0.45);
    color: #26a69a;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    transition: all 0.12s;
  }
  .save-btn:hover:not(:disabled) {
    background: rgba(38, 166, 154, 0.28);
  }
  .save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .panel {
      width: 100vw;
    }
    .panel-body {
      grid-template-columns: 1fr;
    }
    .col-analysis {
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
  }
</style>
