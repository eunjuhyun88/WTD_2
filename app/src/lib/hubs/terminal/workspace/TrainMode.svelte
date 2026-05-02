<script lang="ts">
  import PhaseChart from '../PhaseChart.svelte';

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
  }

  const { mode }: Props = $props();

  type TrainTab = 'library' | 'active' | 'rules' | 'rejudge' | 'model';

  let activeTab = $state<TrainTab>('library');
  let selectedCapture = $state('c1');
  let editTag = $state(false);

  const tabs: { id: TrainTab; label: string; hint: string }[] = [
    { id: 'library', label: 'Library',        hint: 'my saved setups' },
    { id: 'active',  label: 'Active Learning', hint: 'cases the model is unsure about' },
    { id: 'rules',   label: 'My Rules',        hint: 'my documented trading rules' },
    { id: 'rejudge', label: 'Rejudge',         hint: 'override past verdicts' },
    { id: 'model',   label: 'Model',           hint: 'per-user performance' },
  ];

  const CAPTURES = [
    { id: 'c1', symbol: 'TRADOOR', when: '2024-11-12 11:40', note: 'OI +18%, range zone 3h, accum 12bar', range: '4H · Nov 8–15', tags: ['tradoor', 'oi_reversal', 'accum'] },
    { id: 'c2', symbol: 'PTB',     when: '2025-01-03 02:14', note: 'higher-lows after real dump, funding flip', range: '1H · Jan 1–4', tags: ['ptb', 'funding_flip'] },
    { id: 'c3', symbol: 'JUP',     when: '2025-02-18 18:22', note: 'fake dump only, OI flat → invalid', range: '4H · Feb 14–20', tags: ['fake_dump', 'invalid'] },
    { id: 'c4', symbol: 'AVAXUSDT',when: '2025-03-11 14:20', note: 'accumulation 6bar too short → reconsider verdict', range: '1H · Mar 8–13', tags: ['avax', 'accum', 'short_accum'] },
    { id: 'c5', symbol: 'INJ',     when: '2025-03-28 09:12', note: 'OI +22%, simultaneous VWAP reclaim → clean', range: '4H · Mar 24–31', tags: ['inj', 'oi_spike', 'vwap_reclaim'] },
  ];

  const ACTIVE_CASES = [
    { id: 'q1', symbol: 'FETUSDT',  when: 'This week', why: 'OI +14% but funding not reacting — TRADOOR and VAPE cases split on this', guess: 'Positive', confidence: 52 },
    { id: 'q2', symbol: 'RNDRUSDT', when: 'Today',     why: 'Accumulation only 6bar — shorter than my rule (8bar) but OI is sufficient', guess: 'Negative', confidence: 48 },
    { id: 'q3', symbol: 'KASUSDT',  when: '2h ago',    why: '5-phase perfect but BTC regime = DOWN — conflicts with alt trading conditions', guess: 'Negative', confidence: 61 },
  ];

  const PAST_VERDICTS = [
    { id: 'p1', symbol: 'AVAXUSDT', when: '2025-03-11', original: 'agree',    result: '−3.2%', reason: 'only 6bar accumulation — looking back, too short' },
    { id: 'p2', symbol: 'DOGEUSDT', when: '2025-04-02', original: 'disagree', result: '+8.4%', reason: 'missed CVD which was actually turning positive' },
    { id: 'p3', symbol: 'INJUSDT',  when: '2025-04-18', original: 'agree',    result: '+2.1%', reason: 'verdict stands' },
    { id: 'p4', symbol: 'BTCUSDT',  when: '2025-05-02', original: 'agree',    result: '−1.8%', reason: 'missed BTC regime → was DOWN' },
  ];

  const MODEL_SKILL = [
    { feature: 'oi_spike_magnitude', weight: 0.82 },
    { feature: 'phase_seq_match',    weight: 0.74 },
    { feature: 'vwap_reclaim_hold',  weight: 0.61 },
    { feature: 'funding_flip',       weight: 0.58 },
    { feature: 'higher_lows_count',  weight: 0.49 },
    { feature: 'bb_expansion',       weight: 0.42 },
    { feature: 'cvd_divergence',     weight: 0.31 },
  ];

  const WEEK_DATA = [62, 58, 61, 64, 67, 71, 74];
  const WEEK_MAX = Math.max(...WEEK_DATA);

  const CONTRIBUTED_WEIGHTS = [
    { f: 'oi_spike_magnitude', d: 0.12 },
    { f: 'funding_flip',       d: 0.08 },
    { f: 'phase_seq_match',    d: 0.05 },
    { f: 'accum_bar_count',    d: 0.03 },
  ];

  function selectCapture(id: string) {
    selectedCapture = id;
    editTag = false;
  }

  const capture = $derived(CAPTURES.find(c => c.id === selectedCapture) ?? CAPTURES[0]);
</script>

<div class="train-mode">
  <!-- Tab bar -->
  <div class="tab-strip">
    {#each tabs as t (t.id)}
      <button
        class="tab-btn"
        class:active={activeTab === t.id}
        onclick={() => { activeTab = t.id; }}
      >
        <span class="tab-label">{t.label}</span>
        <span class="tab-hint">{t.hint}</span>
      </button>
    {/each}
  </div>

  <!-- Content -->
  <div class="tab-content">

    <!-- ═══ LIBRARY ═══════════════════════════════════════════════════ -->
    {#if activeTab === 'library'}
      <div class="library-grid">

        <!-- List -->
        <div class="panel">
          <div class="panel-header">
            <span class="label">CAPTURES · {CAPTURES.length}</span>
            <button class="action-link">+ import</button>
          </div>
          <div class="list-scroll">
            {#each CAPTURES as cap, i (cap.id)}
              {@const active = cap.id === selectedCapture}
              <button
                class="capture-row"
                class:active
                onclick={() => selectCapture(cap.id)}
              >
                <div class="capture-top">
                  <span class="cap-symbol">{cap.symbol}</span>
                  <span class="cap-date">{cap.when.split(' ')[0]}</span>
                </div>
                <div class="cap-note">{cap.note}</div>
                <div class="tag-row">
                  {#each cap.tags as tag}
                    <span class="tag">#{tag}</span>
                  {/each}
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Detail -->
        <div class="panel detail-panel">
          <div class="detail-eyebrow">CAPTURE · {capture.id}</div>
          <div class="detail-header">
            <span class="detail-symbol">{capture.symbol}</span>
            <span class="detail-range">{capture.range}</span>
            <span class="spacer"></span>
            <span class="detail-when">{capture.when}</span>
          </div>

          <div class="chart-wrap">
            <PhaseChart height="240px" />
          </div>

          <div class="field-block">
            <div class="field-label">YOUR NOTE</div>
            <textarea class="note-area" value={capture.note}></textarea>
          </div>

          <div class="field-block">
            <div class="field-label-row">
              <span>LABELS · used for model training</span>
              <button class="action-link" onclick={() => { editTag = !editTag; }}>
                {editTag ? 'done' : 'edit'}
              </button>
            </div>
            <div class="tag-edit-row">
              {#each capture.tags as tag}
                <span class="tag-editable" class:editing={editTag}>
                  #{tag}
                  {#if editTag}
                    <span class="tag-remove">×</span>
                  {/if}
                </span>
              {/each}
              {#if editTag}
                <span class="tag-add">+ tag</span>
              {/if}
            </div>
          </div>

          <div class="snapshot-block">
            <div class="field-label">SNAPSHOT STORED</div>
            <div class="snapshot-grid">
              <div><div class="snap-key">OI</div><div class="snap-val">+18.2%</div></div>
              <div><div class="snap-key">FUNDING</div><div class="snap-val">+0.018</div></div>
              <div><div class="snap-key">CVD</div><div class="snap-val">positive flip</div></div>
              <div><div class="snap-key">REGIME</div><div class="snap-val">range</div></div>
            </div>
          </div>
        </div>

        <!-- Model influence -->
        <div class="panel">
          <div class="influence-label">★ Impact of this capture on the model</div>
          <p class="influence-text">
            After this setup the model raised weight for <strong>simultaneous OI+funding change</strong> by
            <strong class="pos">+0.08</strong>.
          </p>
          <div class="field-label" style="margin-bottom:6px">CONTRIBUTED WEIGHTS</div>
          {#each CONTRIBUTED_WEIGHTS as w}
            <div class="weight-row">
              <span class="weight-name">{w.f}</span>
              <span class="weight-delta">+{w.d.toFixed(2)}</span>
            </div>
          {/each}
          <button class="full-btn" style="margin-top:14px">↻ Re-run model on this capture</button>
          <button class="full-btn neg-btn" style="margin-top:6px">✕ Mark invalid · exclude from training</button>
        </div>

      </div>
    {/if}

    <!-- ═══ ACTIVE LEARNING ════════════════════════════════════════════ -->
    {#if activeTab === 'active'}
      <div class="active-grid">

        <div class="panel" style="padding:14px; overflow:auto">
          <div class="eyebrow amb">ACTIVE LEARNING</div>
          <div class="section-title" style="margin-bottom:4px">The model is uncertain. Please answer.</div>
          <p class="section-desc">
            These cases were rated at <strong class="amb">below 60% confidence</strong> by the model.
            Your answers sharpen the model's boundaries fastest.
          </p>
          <div class="case-list">
            {#each ACTIVE_CASES as q (q.id)}
              <div class="case-card">
                <div class="case-top">
                  <span class="case-symbol">{q.symbol}</span>
                  <span class="case-when">{q.when}</span>
                  <span class="spacer"></span>
                  <div class="confidence-bar-wrap">
                    <div class="conf-track">
                      <div class="conf-fill" style="width:{q.confidence}%"></div>
                    </div>
                    <span class="conf-pct">{q.confidence}%</span>
                  </div>
                </div>
                <p class="case-why">{q.why}</p>
                <div class="case-actions">
                  <span class="model-guess">My model's guess · <strong>{q.guess}</strong></span>
                  <span class="spacer"></span>
                  <button class="judge-yes">Y · Correct</button>
                  <button class="judge-no">N · Wrong</button>
                  <button class="judge-skip">skip</button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <div class="field-label" style="margin-bottom:10px">WHY these questions matter</div>
          <p class="why-text">
            <strong>Active learning</strong> selects only <em class="amb">boundary cases</em> the model is uncertain about.<br /><br />
            Answering 3 boundary cases shapes your per-user model faster than judging 100 similar cases at random.
          </p>
          <div class="stat-block">
            <div class="stat-label">THIS WEEK</div>
            <div class="stat-row">
              <span class="stat-key">answered</span>
              <span class="stat-val">7 / 10</span>
            </div>
            <div class="stat-row">
              <span class="stat-key">boundary sharpening</span>
              <span class="stat-val pos">+18%</span>
            </div>
          </div>
        </div>

      </div>
    {/if}

    <!-- ═══ RULES ══════════════════════════════════════════════════════ -->
    {#if activeTab === 'rules'}
      <div class="rules-grid">

        <div class="panel" style="padding:18px 24px; overflow:auto">
          <div class="eyebrow">My Rules · AUTO-GENERATED · v0.4.2</div>
          <h1 class="rules-title">My Trading Rules as Read by Cogochi</h1>
          <p class="rules-desc">
            This document was reconstructed in natural language by the model from your <strong>24 captures</strong> and <strong>67 verdicts</strong>.
            These are <em class="amb">your</em> rules, not a generic rulebook.
          </p>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 01</span>
              <span class="rule-section-title">Entry Conditions</span>
            </div>
            <div class="rule"><span class="rule-dot">·</span><span>Only treat as a pos signal when OI rises <strong>+15% or more on a 4h bar basis</strong>. (confidence 0.82)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Range zone must hold for <strong>at least 3 hours</strong>. Shorter than that and it mostly ends as fake_dump. (confidence 0.74)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Only look at accumulation within 15 min after Funding flips from <strong>positive → negative</strong>. (confidence 0.61)</span></div>
          </div>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 02</span>
              <span class="rule-section-title">Prohibited Conditions</span>
            </div>
            <div class="rule"><span class="rule-dot">·</span><span>No alt long entry when BTC regime is <strong>DOWN</strong>. (5 attempts → 4 failures)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Skip if accumulation bar count is <strong>fewer than 8</strong>. (confidence 0.58)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Do not enter on OI signal alone when CVD is in a negative state.</span></div>
          </div>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 03</span>
              <span class="rule-section-title">Risk</span>
            </div>
            <div class="rule"><span class="rule-dot">·</span><span>Position size: <strong>1–1.5%</strong> equity risk. Max 3x leverage.</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Stop: accumulation low −0.8% ~ −1.2%. (historical average: −1.08%)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Target: only enter when R:R is 3.0 or above.</span></div>
          </div>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 04</span>
              <span class="rule-section-title">Exceptions · Low-confidence area</span>
            </div>
            <div class="rule amb"><span class="rule-dot">·</span><span>VWAP reclaim signal alone has insufficient data (n=11). Verdict boundary unclear.</span></div>
            <div class="rule amb"><span class="rule-dot">·</span><span>15m timeframe BB squeeze has low historical similarity. Active Learning needed.</span></div>
          </div>
        </div>

        <div class="rules-sidebar">
          <div class="panel" style="padding:12px">
            <div class="field-label" style="margin-bottom:8px">DOC ACTIONS</div>
            <button class="full-btn" style="margin-bottom:5px">↓ Export as Markdown</button>
            <button class="full-btn" style="margin-bottom:5px">✎ Override · add manually</button>
            <button class="full-btn amb-btn">↻ Regenerate from captures</button>
          </div>
          <div class="panel" style="padding:12px">
            <div class="eyebrow pos" style="margin-bottom:8px">VERSION HISTORY</div>
            {#each [
              { v: 'v0.4.2', when: 'Today',  change: '+ added BB squeeze exception' },
              { v: 'v0.4.1', when: '3d ago', change: 'accumulation threshold 6→8 bar' },
              { v: 'v0.4.0', when: '2w ago', change: 'added BTC regime DOWN prohibition' },
              { v: 'v0.3.0', when: '1m ago', change: 'reflected initial 3 captures' },
            ] as row, i}
              <div class="version-row" class:border-b={i < 3}>
                <span class="ver-v">{row.v}</span>
                <span class="ver-when">{row.when}</span>
                <span class="ver-change">{row.change}</span>
              </div>
            {/each}
          </div>
        </div>

      </div>
    {/if}

    <!-- ═══ REJUDGE ════════════════════════════════════════════════════ -->
    {#if activeTab === 'rejudge'}
      <div class="panel rejudge-panel">
        <div class="eyebrow amb">REJUDGE · override past verdicts</div>
        <div class="section-title" style="margin-bottom:4px">Things you'd judge differently in hindsight</div>
        <p class="section-desc">
          Overrides are a <strong class="amb">strong training signal</strong> for the model.
          "I was wrong then" is the most important input for per-user rules.
        </p>
        <div class="rejudge-list">
          {#each PAST_VERDICTS as p (p.id)}
            {@const pnlNeg = p.result.startsWith('−')}
            {@const conflict = (p.original === 'agree' && pnlNeg) || (p.original === 'disagree' && !pnlNeg)}
            <div class="rejudge-row" class:conflict>
              <div>
                <div class="rj-symbol">{p.symbol}</div>
                <div class="rj-date">{p.when}</div>
              </div>
              <div class="rj-verdict" class:pos-text={p.original === 'agree'} class:neg-text={p.original === 'disagree'}>
                {p.original.toUpperCase()}
              </div>
              <div class="rj-pnl" class:pos-text={!pnlNeg} class:neg-text={pnlNeg}>
                {p.result}
              </div>
              <div class="rj-reason">{p.reason}</div>
              <div class="rj-actions">
                <button class="rj-override">Override →</button>
                <button class="rj-keep">keep</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ═══ MODEL ══════════════════════════════════════════════════════ -->
    {#if activeTab === 'model'}
      <div class="model-grid">

        <div class="panel" style="padding:14px; display:flex; flex-direction:column">
          <div class="eyebrow pos">PER-USER MODEL</div>
          <div class="section-title" style="margin-bottom:14px">Performance · This Week</div>
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">alpha</div>
              <div class="kpi-val pos">+74</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">hit rate</div>
              <div class="kpi-val pos">68%</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">avg win</div>
              <div class="kpi-val pos">+3.8%</div>
            </div>
          </div>
          <div class="field-label" style="margin-bottom:6px">ALPHA · LAST 7 WEEKS</div>
          <div class="bar-chart">
            {#each WEEK_DATA as w, i}
              <div class="bar-col">
                <div
                  class="bar"
                  class:current={i === WEEK_DATA.length - 1}
                  style="height:{(w / WEEK_MAX) * 64}px"
                ></div>
                <span class="bar-label">w{i + 1}</span>
              </div>
            {/each}
          </div>
          <div class="spacer-flex"></div>
          <div class="model-summary">
            Your model improved by <strong class="pos">+19 alpha</strong> over the last 7 weeks. Top contributing actions:<br />
            <span class="mono-sm amb">active_learning(7) &gt; rejudge(3) &gt; save_setup(12)</span>
          </div>
        </div>

        <div class="panel" style="padding:14px; display:flex; flex-direction:column">
          <div class="eyebrow">FEATURE WEIGHTS</div>
          <div class="section-title" style="margin-bottom:14px">What the model currently prioritizes</div>
          {#each MODEL_SKILL as s (s.feature)}
            <div class="feature-row">
              <div class="feature-top">
                <span class="feature-name">{s.feature}</span>
                <span class="feature-weight">{s.weight.toFixed(2)}</span>
              </div>
              <div class="feature-track">
                <div
                  class="feature-fill"
                  class:high={s.weight >= 0.6}
                  class:mid={s.weight >= 0.4 && s.weight < 0.6}
                  style="width:{s.weight * 100}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>

      </div>
    {/if}

  </div>
</div>

<style>
  /* ── Shell ─────────────────────────────────────────────────────────── */
  .train-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--g0);
    overflow: hidden;
    min-height: 0;
  }

  /* ── Tab strip ─────────────────────────────────────────────────────── */
  .tab-strip {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--g1);
    border-bottom: 0.5px solid var(--g4);
    flex-shrink: 0;
  }

  .tab-btn {
    flex: 1;
    padding: 8px 12px;
    border-radius: 4px;
    background: transparent;
    border: 0.5px solid transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .tab-btn.active {
    background: var(--g3);
    border-color: var(--g5);
  }

  .tab-label {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--g7);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .tab-btn.active .tab-label {
    color: var(--g9);
  }

  .tab-hint {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.08em;
    margin-top: 1px;
  }

  /* ── Content area ──────────────────────────────────────────────────── */
  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    min-height: 0;
  }

  /* ── Layout grids ──────────────────────────────────────────────────── */
  .library-grid {
    display: grid;
    grid-template-columns: 280px 1fr 260px;
    gap: 8px;
    flex: 1;
    padding: 8px;
    overflow: hidden;
    min-height: 0;
  }

  .active-grid {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 8px;
    flex: 1;
    padding: 8px;
    overflow: hidden;
    min-height: 0;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 8px;
    flex: 1;
    padding: 8px;
    overflow: hidden;
    min-height: 0;
  }

  .rules-sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
  }

  .model-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    flex: 1;
    padding: 8px;
    overflow: hidden;
    min-height: 0;
  }

  .rejudge-panel {
    flex: 1;
    margin: 8px;
    padding: 14px;
    overflow: auto;
  }

  /* ── Panel ─────────────────────────────────────────────────────────── */
  .panel {
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 0.5px solid var(--g4);
    flex-shrink: 0;
  }

  /* ── Library ───────────────────────────────────────────────────────── */
  .list-scroll {
    flex: 1;
    overflow: auto;
  }

  .capture-row {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    cursor: pointer;
    border-left: 3px solid transparent;
    border-bottom: 0.5px solid var(--g3);
    background: transparent;
    transition: background 0.1s;
  }

  .capture-row:last-child {
    border-bottom: none;
  }

  .capture-row.active {
    background: var(--g2);
    border-left-color: var(--amb);
  }

  .capture-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 3px;
  }

  .cap-symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--g9);
    font-weight: 600;
  }

  .cap-date {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: var(--g6);
  }

  .cap-note {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: var(--g7);
    line-height: 1.45;
    margin-bottom: 4px;
  }

  .tag-row {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    padding: 1.5px 5px;
    background: var(--g3);
    color: var(--g8);
    border-radius: 2px;
    letter-spacing: 0.02em;
  }

  /* ── Detail panel ──────────────────────────────────────────────────── */
  .detail-panel {
    padding: 14px;
    overflow: auto;
  }

  .detail-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--amb);
    letter-spacing: 0.2em;
    margin-bottom: 4px;
  }

  .detail-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 10px;
  }

  .detail-symbol {
    font-size: 18px;
    color: var(--g9);
    font-weight: 600;
  }

  .detail-range {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }

  .detail-when {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g7);
  }

  .chart-wrap {
    margin-bottom: 12px;
    border-radius: 4px;
    overflow: hidden;
  }

  .field-block {
    margin-top: 12px;
  }

  .field-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.14em;
    margin-bottom: 6px;
  }

  .field-label-row {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.14em;
    margin-bottom: 6px;
  }

  .note-area {
    width: 100%;
    min-height: 60px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    padding: 8px;
    font-size: 11px;
    color: var(--g9);
    font-family: 'Geist', sans-serif;
    resize: vertical;
    line-height: 1.5;
    box-sizing: border-box;
  }

  .tag-edit-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag-editable {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    padding: 3px 8px;
    background: var(--g3);
    border: 0.5px solid transparent;
    color: var(--g9);
    border-radius: 2px;
    letter-spacing: 0.02em;
  }

  .tag-editable.editing {
    background: var(--amb-dd);
    border-color: var(--amb-d);
  }

  .tag-remove {
    color: var(--neg);
    margin-left: 6px;
    cursor: pointer;
  }

  .tag-add {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    padding: 3px 8px;
    border: 0.5px dashed var(--g4);
    color: var(--g6);
    border-radius: 2px;
  }

  .snapshot-block {
    margin-top: 12px;
    padding: 10px 12px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
  }

  .snapshot-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .snap-key {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
  }

  .snap-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g9);
  }

  /* ── Model influence ───────────────────────────────────────────────── */
  .influence-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--pos);
    letter-spacing: 0.16em;
    margin-bottom: 8px;
    padding: 12px 12px 0;
  }

  .influence-text {
    font-size: var(--ui-text-xs);
    color: var(--g8);
    line-height: 1.55;
    margin: 0 12px 12px;
  }

  .weight-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-bottom: 0.5px solid var(--g3);
  }

  .weight-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    flex: 1;
  }

  .weight-delta {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--pos);
  }

  /* ── Active Learning ───────────────────────────────────────────────── */
  .case-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .case-card {
    background: var(--g0);
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    padding: 12px 14px;
  }

  .case-top {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
  }

  .case-symbol {
    font-size: 13px;
    color: var(--g9);
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }

  .case-when {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }

  .confidence-bar-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .conf-track {
    width: 48px;
    height: 3px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }

  .conf-fill {
    height: 100%;
    background: var(--amb);
  }

  .conf-pct {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--amb);
  }

  .case-why {
    font-size: 11px;
    color: var(--g8);
    line-height: 1.55;
    margin: 0 0 10px;
  }

  .case-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .model-guess {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.1em;
  }

  .judge-yes {
    padding: 7px 18px;
    background: var(--pos-dd);
    border: 0.5px solid var(--pos-d);
    color: var(--pos);
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    cursor: pointer;
  }

  .judge-no {
    padding: 7px 18px;
    background: var(--neg-dd);
    border: 0.5px solid var(--neg-d);
    color: var(--neg);
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    cursor: pointer;
  }

  .judge-skip {
    padding: 7px 12px;
    background: var(--g2);
    border: 0.5px solid var(--g3);
    color: var(--g7);
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .why-text {
    font-size: var(--ui-text-xs);
    color: var(--g8);
    line-height: 1.6;
    margin: 0 0 16px;
  }

  .stat-block {
    padding: 10px 12px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
  }

  .stat-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.1em;
    margin-bottom: 5px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    margin-top: 4px;
  }

  .stat-key { color: var(--g7); }
  .stat-val { color: var(--g9); font-weight: 600; }

  /* ── Rules ─────────────────────────────────────────────────────────── */
  .rules-title {
    font-size: 22px;
    color: var(--g9);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 16px;
  }

  .rules-desc {
    font-size: 11px;
    color: var(--g7);
    line-height: 1.65;
    margin: 0 0 20px;
  }

  .rule-section {
    margin-bottom: 20px;
  }

  .rule-section-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 0.5px solid var(--g4);
  }

  .rule-n {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.2em;
  }

  .rule-section-title {
    font-size: 15px;
    color: var(--g9);
    font-weight: 600;
  }

  .rule {
    display: flex;
    gap: 10px;
    padding: 6px 0;
    font-size: 12px;
    color: var(--g8);
    line-height: 1.6;
  }

  .rule.amb {
    color: var(--amb);
  }

  .rule-dot {
    font-family: 'JetBrains Mono', monospace;
    color: var(--g5);
    font-size: var(--ui-text-xs);
    flex-shrink: 0;
  }

  .version-row {
    display: flex;
    padding: 5px 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
  }

  .version-row.border-b {
    border-bottom: 0.5px solid var(--g3);
  }

  .ver-v    { color: var(--g8); width: 46px; }
  .ver-when { color: var(--g5); width: 54px; }
  .ver-change { color: var(--g7); flex: 1; line-height: 1.4; }

  /* ── Rejudge ───────────────────────────────────────────────────────── */
  .rejudge-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .rejudge-row {
    display: grid;
    grid-template-columns: 120px 70px 80px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    background: var(--g2);
    border: 0.5px solid var(--g3);
    border-radius: 4px;
  }

  .rejudge-row.conflict {
    background: var(--amb-dd);
    border-color: var(--amb-d);
  }

  .rj-symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--g9);
    font-weight: 600;
  }

  .rj-date {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px;
    color: var(--g6);
  }

  .rj-verdict {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    font-weight: 600;
  }

  .rj-pnl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
  }

  .pos-text { color: var(--pos); }
  .neg-text { color: var(--neg); }

  .rj-reason {
    font-size: var(--ui-text-xs);
    color: var(--g8);
    line-height: 1.5;
  }

  .rj-actions {
    display: flex;
    gap: 4px;
  }

  .rj-override {
    padding: 5px 12px;
    background: var(--amb-dd);
    border: 0.5px solid var(--amb-d);
    color: var(--amb);
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .rj-keep {
    padding: 5px 10px;
    background: var(--g3);
    border: 0.5px solid var(--g4);
    color: var(--g7);
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  /* ── Model ─────────────────────────────────────────────────────────── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 16px;
  }

  .kpi-card {
    padding: 10px 12px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
  }

  .kpi-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .kpi-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    font-weight: 600;
    margin-top: 2px;
  }

  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 80px;
    margin-bottom: 8px;
  }

  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .bar {
    width: 100%;
    background: var(--g4);
    border-radius: 2px 2px 0 0;
  }

  .bar.current {
    background: var(--pos);
  }

  .bar-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }

  .spacer-flex {
    flex: 1;
  }

  .model-summary {
    padding: 10px 12px;
    background: var(--g2);
    border-radius: 4px;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    line-height: 1.55;
  }

  .feature-row {
    padding: 7px 0;
    border-bottom: 0.5px solid var(--g3);
  }

  .feature-top {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
  }

  .feature-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g8);
  }

  .feature-weight {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g9);
    font-weight: 600;
  }

  .feature-track {
    height: 3px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }

  .feature-fill {
    height: 100%;
    background: var(--g6);
  }

  .feature-fill.high { background: var(--pos); }
  .feature-fill.mid  { background: var(--amb); }

  /* ── Shared utilities ──────────────────────────────────────────────── */
  .label {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.14em;
    flex: 1;
  }

  .action-link {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--amb);
    letter-spacing: 0.1em;
    background: none;
    border: none;
    cursor: pointer;
  }

  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    letter-spacing: 0.2em;
    margin-bottom: 4px;
  }

  .eyebrow.amb { color: var(--amb); }
  .eyebrow.pos { color: var(--pos); }

  .section-title {
    font-size: 14px;
    color: var(--g9);
    font-weight: 600;
  }

  .section-desc {
    font-size: var(--ui-text-xs);
    color: var(--g6);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .spacer {
    flex: 1;
  }

  .pos { color: var(--pos); }
  .amb { color: var(--amb); }

  .full-btn {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
    cursor: pointer;
    text-align: left;
  }

  .full-btn:hover {
    background: var(--g3);
  }

  .amb-btn {
    background: var(--amb-dd);
    border-color: var(--amb-d);
    color: var(--amb);
  }

  .neg-btn {
    background: var(--neg-dd);
    border-color: var(--neg-d);
    color: var(--neg);
  }

  .mono-sm {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
  }
</style>
