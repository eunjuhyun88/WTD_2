<script lang="ts">
  /**
   * /analyze — 트레이딩 분석 텍스트 다중 LLM 비교
   *
   * 분석 텍스트를 붙여넣으면 Groq / Gemini / Cerebras가
   * 병렬로 building block을 추출하고 결과를 비교 시각화.
   */
  import { buildCanonicalHref } from '$lib/seo/site';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface AnalysisResult {
    provider:        string;
    model:           string;
    symbol:          string | null;
    bias:            string;
    watch_blocks:    string[];
    entry_condition: string;
    risk_note:       string;
    confidence:      number;
    latency_ms:      number;
    error?:          string;
  }

  interface Consensus {
    bias:   string;
    blocks: string[];
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let analysisText = $state('');
  let loading      = $state(false);
  let results      = $state<AnalysisResult[]>([]);
  let consensus    = $state<Consensus | null>(null);
  let blockCounts  = $state<Record<string, number>>({});
  let error        = $state<string | null>(null);

  let selectedProviders = $state(['groq', 'gemini', 'cerebras']);

  const PROVIDERS = [
    { id: 'groq',     label: 'Groq',     sublabel: 'llama-3.3-70b',    color: '#f97316' },
    { id: 'gemini',   label: 'Gemini',   sublabel: 'gemini-2.0-flash',  color: '#4ade80' },
    { id: 'cerebras', label: 'Cerebras', sublabel: 'qwen-3-235b',       color: '#a78bfa' },
  ];

  // ── Actions ────────────────────────────────────────────────────────────────
  async function runAnalysis() {
    if (!analysisText.trim() || loading) return;
    loading = true;
    error   = null;
    results = [];
    consensus = null;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: analysisText, providers: selectedProviders }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? '분석 실패'; return; }
      results    = data.results ?? [];
      consensus  = data.consensus ?? null;
      blockCounts = data.block_counts ?? {};
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function toggleProvider(id: string) {
    if (selectedProviders.includes(id)) {
      if (selectedProviders.length > 1) {
        selectedProviders = selectedProviders.filter((p) => p !== id);
      }
    } else {
      selectedProviders = [...selectedProviders, id];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function biasColor(bias: string): string {
    if (bias === 'bullish') return '#26a69a';
    if (bias === 'bearish') return '#ef5350';
    return 'rgba(255,255,255,0.35)';
  }

  function biasLabel(bias: string): string {
    if (bias === 'bullish') return '강세 ↑';
    if (bias === 'bearish') return '약세 ↓';
    return '중립 →';
  }

  function blockColor(block: string, total: number): string {
    const count = blockCounts[block] ?? 0;
    if (count === total) return 'rgba(38,166,154,0.15)';
    if (count >= Math.ceil(total / 2)) return 'rgba(251,191,36,0.10)';
    return 'rgba(255,255,255,0.04)';
  }

  function blockBorder(block: string, total: number): string {
    const count = blockCounts[block] ?? 0;
    if (count === total) return 'rgba(38,166,154,0.4)';
    if (count >= Math.ceil(total / 2)) return 'rgba(251,191,36,0.3)';
    return 'rgba(255,255,255,0.08)';
  }

  const SAMPLE = `(온체인) - $IN (인피니트)

1/ CVD, NET LONG/SHORT
SPOT CVD 약간 회복하는 모양새이나 선물 CVD 완전 밀리고, SHORT를 세력이 매집하면서 밀어버린 상황으로 보임.

2/ LONG/SHORT ACCOUNTS RATIO
개미들은 일명 "하따"를 하면서 인피니트 롱을 갈기고 있는 모양새임.

3/ FUNDING RATE GLOBAL
펀비 역시 음펀비 전환되면서 세력 숏 물량 축적 중으로 보임.

4/ OI
이번 하락에 OI 감소세 역시 두드러져서 아직 발사 준비는 이르다고 생각이 들기는 함.

결론/ 당장 진입은 너무 도박에 가까움. 숏 물량 축소와 롱숏어카운트 비율이 점진적 감소하는 추세전환을 노릴 필요가 있어보임.`;

  const successResults = $derived(results.filter((r) => !r.error));
  const hasResults     = $derived(results.length > 0);
</script>

<svelte:head>
  <title>Analyze — Cogochi</title>
  <meta name="description" content="트레이딩 분석 텍스트를 여러 LLM으로 비교 분석. Building block 신호 추출 및 합의 도출." />
  <link rel="canonical" href={buildCanonicalHref('/analyze')} />
</svelte:head>

<div class="surface-page chrome-layout analyze-page">
  <header class="surface-hero surface-fixed-hero">
    <div class="surface-copy">
      <div>
        <span class="surface-kicker">Multi-LLM</span>
        <h1 class="surface-title">Signal Analyzer</h1>
      </div>
      <p class="surface-subtitle">
        분석 텍스트를 붙여넣으면 여러 AI가 동시에 building block 신호를 추출해 비교합니다.
      </p>
    </div>

    {#if hasResults && consensus}
      <div class="surface-stats">
        <article class="surface-stat">
          <span class="surface-meta">Consensus</span>
          <strong style="color:{biasColor(consensus.bias)}">{biasLabel(consensus.bias)}</strong>
        </article>
        <article class="surface-stat">
          <span class="surface-meta">공통 블록</span>
          <strong>{consensus.blocks.length}</strong>
        </article>
        <article class="surface-stat">
          <span class="surface-meta">모델 수</span>
          <strong>{successResults.length} / {results.length}</strong>
        </article>
        <article class="surface-stat">
          <span class="surface-meta">최고 속도</span>
          <strong>{Math.min(...successResults.map((r) => r.latency_ms))}ms</strong>
        </article>
      </div>
    {/if}
  </header>

  <div class="surface-scroll-body analyze-body">

    <!-- Input section -->
    <section class="surface-grid">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Input</span>
          <h2>분석 텍스트</h2>
        </div>
        <div class="input-actions">
          <!-- Provider toggles -->
          <div class="provider-toggles">
            {#each PROVIDERS as p}
              <button
                class="provider-toggle"
                class:active={selectedProviders.includes(p.id)}
                style="--p-color:{p.color}"
                onclick={() => toggleProvider(p.id)}
              >
                <span class="p-dot"></span>
                {p.label}
              </button>
            {/each}
          </div>
          <button class="surface-button-secondary sample-btn" onclick={() => analysisText = SAMPLE}>
            샘플 불러오기
          </button>
        </div>
      </div>

      <div class="surface-card input-card">
        <textarea
          class="analysis-input"
          bind:value={analysisText}
          placeholder="트레이딩 분석 텍스트를 붙여넣으세요&#10;&#10;예) CVD 분석, 펀딩비, OI 변화, L/S 비율, 결론 등..."
          rows="10"
        ></textarea>
        <div class="input-footer">
          <span class="char-count">{analysisText.length}자</span>
          <button
            class="surface-button run-btn"
            onclick={runAnalysis}
            disabled={loading || !analysisText.trim()}
          >
            {loading ? '분석 중…' : `분석 실행 (${selectedProviders.length}개 모델)`}
          </button>
        </div>
      </div>
    </section>

    <!-- Error -->
    {#if error}
      <section class="surface-card page-error">
        <p>⚠ {error}</p>
      </section>
    {/if}

    <!-- Loading -->
    {#if loading}
      <section class="surface-card page-loading">
        <div class="loading-dots">
          {#each selectedProviders as p}
            {@const meta = PROVIDERS.find((x) => x.id === p)}
            <div class="loading-dot" style="--dot-color:{meta?.color}">
              <span class="pulse-ring"></span>
              <span class="dot-label">{meta?.label}</span>
            </div>
          {/each}
        </div>
        <span class="loading-text">LLM 병렬 호출 중…</span>
      </section>
    {/if}

    <!-- Results -->
    {#if hasResults && !loading}

      <!-- Consensus -->
      {#if consensus && consensus.blocks.length > 0}
        <section class="surface-grid">
          <div class="surface-section-head">
            <div>
              <span class="surface-kicker">Consensus</span>
              <h2>공통 신호 — {Math.ceil(successResults.length / 2)}개 이상 동의</h2>
            </div>
            <span class="surface-chip" style="color:{biasColor(consensus.bias)};border-color:{biasColor(consensus.bias)}40">
              {biasLabel(consensus.bias)}
            </span>
          </div>
          <div class="surface-card consensus-card">
            <div class="block-grid">
              {#each consensus.blocks as block}
                {@const count = blockCounts[block] ?? 0}
                <div class="block-chip consensus-chip" style="--bg:rgba(38,166,154,0.12);--border:rgba(38,166,154,0.35)">
                  <span class="block-name">{block}</span>
                  <span class="block-count">{count}/{successResults.length}</span>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

      <!-- Model comparison grid -->
      <section class="surface-grid">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Comparison</span>
            <h2>모델별 결과</h2>
          </div>
        </div>

        <div class="model-grid" style="--col-count:{results.length}">
          {#each results as r}
            {@const meta = PROVIDERS.find((p) => p.id.toLowerCase() === r.provider.toLowerCase())}
            <div class="model-col surface-card" class:model-error={!!r.error}>

              <!-- Model header -->
              <div class="model-header">
                <div class="model-name-row">
                  <span class="model-dot" style="background:{meta?.color ?? '#fff'}"></span>
                  <span class="model-provider">{r.provider}</span>
                  <span class="model-latency">{r.latency_ms}ms</span>
                </div>
                <span class="model-slug">{r.model.split('-').slice(0,3).join('-')}</span>
              </div>

              {#if r.error}
                <div class="model-err-msg">⚠ {r.error}</div>
              {:else}
                <!-- Bias -->
                <div class="model-section">
                  <span class="model-label">편향</span>
                  <span class="model-bias" style="color:{biasColor(r.bias)}">{biasLabel(r.bias)}</span>
                </div>

                <!-- Confidence -->
                <div class="model-section">
                  <span class="model-label">확신도</span>
                  <div class="conf-bar-wrap">
                    <div class="conf-bar" style="width:{r.confidence * 100}%;background:{meta?.color ?? '#fff'}"></div>
                  </div>
                  <span class="conf-value">{Math.round(r.confidence * 100)}%</span>
                </div>

                <!-- Blocks -->
                <div class="model-section blocks-section">
                  <span class="model-label">Watch Blocks ({r.watch_blocks.length})</span>
                  <div class="block-grid">
                    {#each r.watch_blocks as block}
                      <div
                        class="block-chip"
                        style="--bg:{blockColor(block, successResults.length)};--border:{blockBorder(block, successResults.length)}"
                      >
                        <span class="block-name">{block}</span>
                        {#if (blockCounts[block] ?? 0) > 1}
                          <span class="block-count">{blockCounts[block]}</span>
                        {/if}
                      </div>
                    {/each}
                    {#if r.watch_blocks.length === 0}
                      <span class="no-blocks">블록 없음</span>
                    {/if}
                  </div>
                </div>

                <!-- Entry condition -->
                {#if r.entry_condition}
                  <div class="model-section">
                    <span class="model-label">진입 조건</span>
                    <p class="model-text entry-text">{r.entry_condition}</p>
                  </div>
                {/if}

                <!-- Risk note -->
                {#if r.risk_note}
                  <div class="model-section">
                    <span class="model-label">리스크</span>
                    <p class="model-text risk-text">{r.risk_note}</p>
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <!-- Block frequency heatmap -->
      {#if Object.keys(blockCounts).length > 0}
        <section class="surface-grid">
          <div class="surface-section-head">
            <div>
              <span class="surface-kicker">Heatmap</span>
              <h2>블록 언급 빈도</h2>
            </div>
          </div>
          <div class="surface-card heatmap-card">
            <div class="heatmap-grid">
              {#each Object.entries(blockCounts).sort(([, a], [, b]) => b - a) as [block, count]}
                {@const pct = count / successResults.length}
                <div class="heat-item" title="{block}: {count}/{successResults.length}개 모델">
                  <div class="heat-bar-wrap">
                    <div
                      class="heat-bar"
                      style="height:{pct * 100}%;background:{pct === 1 ? '#26a69a' : pct >= 0.5 ? '#fbbf24' : 'rgba(255,255,255,0.2)'}"
                    ></div>
                  </div>
                  <span class="heat-label">{block.replace(/_/g, ' ')}</span>
                  <span class="heat-count">{count}</span>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

    {/if}
  </div>
</div>

<style>
  .analyze-body { display: flex; flex-direction: column; gap: 20px; }

  /* Input */
  .input-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .provider-toggles { display: flex; gap: 6px; }
  .provider-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: rgba(255,255,255,0.35);
    font-size: 11px;
    font-family: var(--sc-font-mono, monospace);
    cursor: pointer;
    transition: all 0.15s;
  }
  .provider-toggle.active {
    border-color: var(--p-color);
    color: var(--p-color);
    background: color-mix(in srgb, var(--p-color) 8%, transparent);
  }
  .p-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
  }
  .sample-btn { font-size: 11px; padding: 5px 12px; }

  .input-card { padding: 0; overflow: hidden; }
  .analysis-input {
    width: 100%;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.85);
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    line-height: 1.6;
    padding: 16px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }
  .analysis-input::placeholder { color: rgba(255,255,255,0.2); }
  .input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .char-count { font-size: 10px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); }
  .run-btn { min-width: 180px; }

  /* Loading */
  .page-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 48px 24px;
  }
  .loading-dots { display: flex; gap: 32px; }
  .loading-dot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;
  }
  .pulse-ring {
    width: 24px; height: 24px;
    border-radius: 50%;
    border: 2px solid var(--dot-color);
    animation: pulse-ring 1.2s ease-in-out infinite;
  }
  @keyframes pulse-ring {
    0%   { transform: scale(0.8); opacity: 0.4; }
    50%  { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(0.8); opacity: 0.4; }
  }
  .dot-label { font-size: 10px; color: rgba(255,255,255,0.4); font-family: var(--sc-font-mono, monospace); }
  .loading-text { font-size: 12px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); }

  /* Consensus */
  .consensus-card { padding: 16px; }

  /* Model grid */
  .model-grid {
    display: grid;
    grid-template-columns: repeat(var(--col-count, 3), 1fr);
    gap: 12px;
    align-items: start;
  }
  .model-col {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
  }
  .model-error { opacity: 0.5; }
  .model-header { display: flex; flex-direction: column; gap: 3px; }
  .model-name-row { display: flex; align-items: center; gap: 7px; }
  .model-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .model-provider { font-family: var(--sc-font-mono, monospace); font-size: 13px; font-weight: 700; color: #fff; }
  .model-latency { margin-left: auto; font-size: 10px; color: rgba(255,255,255,0.3); font-family: var(--sc-font-mono, monospace); }
  .model-slug { font-size: 9px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); padding-left: 15px; }
  .model-err-msg { font-size: 11px; color: #ef5350; font-family: var(--sc-font-mono, monospace); }

  .model-section { display: flex; flex-direction: column; gap: 5px; }
  .model-label { font-size: 9px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); letter-spacing: 0.08em; text-transform: uppercase; }
  .model-bias { font-family: var(--sc-font-mono, monospace); font-size: 13px; font-weight: 700; }
  .model-text { margin: 0; font-size: 11px; color: rgba(255,255,255,0.55); line-height: 1.5; }
  .entry-text { color: rgba(74,222,128,0.7); }
  .risk-text  { color: rgba(248,113,113,0.7); }

  .conf-bar-wrap { height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; flex: 1; }
  .conf-bar { height: 100%; border-radius: 2px; transition: width 0.4s; }
  .model-section:has(.conf-bar-wrap) { flex-direction: row; align-items: center; }
  .conf-value { font-size: 10px; color: rgba(255,255,255,0.35); font-family: var(--sc-font-mono, monospace); min-width: 30px; text-align: right; }

  /* Blocks */
  .blocks-section { flex-direction: column; }
  .block-grid { display: flex; flex-wrap: wrap; gap: 5px; }
  .block-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--bg, rgba(255,255,255,0.04));
    border: 1px solid var(--border, rgba(255,255,255,0.08));
  }
  .block-name { font-size: 10px; font-family: var(--sc-font-mono, monospace); color: rgba(255,255,255,0.7); }
  .block-count { font-size: 9px; color: rgba(255,255,255,0.3); font-family: var(--sc-font-mono, monospace); }
  .no-blocks { font-size: 10px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); }

  /* Heatmap */
  .heatmap-card { padding: 16px; }
  .heatmap-grid {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    overflow-x: auto;
    padding-bottom: 4px;
    min-height: 80px;
  }
  .heat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    width: 60px;
  }
  .heat-bar-wrap {
    width: 100%;
    height: 48px;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .heat-bar { width: 100%; border-radius: 3px; transition: height 0.3s; min-height: 2px; }
  .heat-label {
    font-size: 8px;
    color: rgba(255,255,255,0.3);
    font-family: var(--sc-font-mono, monospace);
    text-align: center;
    word-break: break-all;
    line-height: 1.3;
  }
  .heat-count {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--sc-font-mono, monospace);
    color: rgba(255,255,255,0.5);
  }

  /* Error */
  .page-error {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #f87171;
    font-size: 12px;
    font-family: var(--sc-font-mono, monospace);
  }

  @media (max-width: 900px) {
    .model-grid { grid-template-columns: 1fr; }
    .provider-toggles { flex-wrap: wrap; }
  }
</style>
