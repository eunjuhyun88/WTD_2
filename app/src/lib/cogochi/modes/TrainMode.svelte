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
    { id: 'library', label: 'Library',        hint: '내가 박제한 셋업' },
    { id: 'active',  label: 'Active Learning', hint: '모델이 헷갈리는 case' },
    { id: 'rules',   label: '내 규칙',          hint: '명문화된 내 트레이딩 docs' },
    { id: 'rejudge', label: 'Rejudge',         hint: '과거 판정 번복' },
    { id: 'model',   label: 'Model',           hint: 'per-user 성능' },
  ];

  const CAPTURES = [
    { id: 'c1', symbol: 'TRADOOR', when: '2024-11-12 11:40', note: 'OI +18%, 번지대 3시간, accum 12bar', range: '4H · Nov 8–15', tags: ['tradoor', 'oi_reversal', 'accum'] },
    { id: 'c2', symbol: 'PTB',     when: '2025-01-03 02:14', note: 'real dump 후 higher-lows, funding 플립', range: '1H · Jan 1–4', tags: ['ptb', 'funding_flip'] },
    { id: 'c3', symbol: 'JUP',     when: '2025-02-18 18:22', note: 'fake dump만, OI 정체 → invalid', range: '4H · Feb 14–20', tags: ['fake_dump', 'invalid'] },
    { id: 'c4', symbol: 'AVAXUSDT',when: '2025-03-11 14:20', note: 'accumulation 6bar 너무 짧음 → 판정 재고', range: '1H · Mar 8–13', tags: ['avax', 'accum', 'short_accum'] },
    { id: 'c5', symbol: 'INJ',     when: '2025-03-28 09:12', note: 'OI +22%, VWAP reclaim 동시 → clean', range: '4H · Mar 24–31', tags: ['inj', 'oi_spike', 'vwap_reclaim'] },
  ];

  const ACTIVE_CASES = [
    { id: 'q1', symbol: 'FETUSDT',  when: '이번 주', why: 'OI +14%인데 funding 미반응 — 유사했던 TRADOOR와 VAPE 케이스에서 판정이 엇갈림', guess: '긍정', confidence: 52 },
    { id: 'q2', symbol: 'RNDRUSDT', when: '오늘',   why: 'Accumulation 6bar만 — 경험 기준(8bar)보다 짧지만 OI는 충분', guess: '부정', confidence: 48 },
    { id: 'q3', symbol: 'KASUSDT',  when: '2h 전',  why: '5-phase 완벽인데 BTC regime = DOWN — 알트 거래 조건과 충돌', guess: '부정', confidence: 61 },
  ];

  const PAST_VERDICTS = [
    { id: 'p1', symbol: 'AVAXUSDT', when: '2025-03-11', original: 'agree',    result: '−3.2%', reason: 'accumulation 6bar만 — 지금 보면 너무 짧았음' },
    { id: 'p2', symbol: 'DOGEUSDT', when: '2025-04-02', original: 'disagree', result: '+8.4%', reason: 'CVD 못 봤는데 사실 양전환 중이었음' },
    { id: 'p3', symbol: 'INJUSDT',  when: '2025-04-18', original: 'agree',    result: '+2.1%', reason: '판정 유지 가능' },
    { id: 'p4', symbol: 'BTCUSDT',  when: '2025-05-02', original: 'agree',    result: '−1.8%', reason: 'BTC regime 놓침 → DOWN이었음' },
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
            <span class="spacer" />
            <span class="detail-when">{capture.when}</span>
          </div>

          <div class="chart-wrap">
            <PhaseChart height={240} />
          </div>

          <div class="field-block">
            <div class="field-label">YOUR NOTE</div>
            <textarea class="note-area" value={capture.note}></textarea>
          </div>

          <div class="field-block">
            <div class="field-label-row">
              <span>LABELS · 모델이 학습에 쓰는 것</span>
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
              <div><div class="snap-key">CVD</div><div class="snap-val">양전환</div></div>
              <div><div class="snap-key">REGIME</div><div class="snap-val">range</div></div>
            </div>
          </div>
        </div>

        <!-- Model influence -->
        <div class="panel">
          <div class="influence-label">★ 이 캡처가 모델에 준 영향</div>
          <p class="influence-text">
            이 셋업 이후 모델은 <strong>OI+funding 동시 변화</strong>에 가중치를
            <strong class="pos">+0.08</strong> 올렸습니다.
          </p>
          <div class="field-label" style="margin-bottom:6px">CONTRIBUTED WEIGHTS</div>
          {#each CONTRIBUTED_WEIGHTS as w}
            <div class="weight-row">
              <span class="weight-name">{w.f}</span>
              <span class="weight-delta">+{w.d.toFixed(2)}</span>
            </div>
          {/each}
          <button class="full-btn" style="margin-top:14px">↻ Re-run model on this capture</button>
          <button class="full-btn neg-btn" style="margin-top:6px">✕ Mark invalid · 학습에서 제외</button>
        </div>

      </div>
    {/if}

    <!-- ═══ ACTIVE LEARNING ════════════════════════════════════════════ -->
    {#if activeTab === 'active'}
      <div class="active-grid">

        <div class="panel" style="padding:14px; overflow:auto">
          <div class="eyebrow amb">ACTIVE LEARNING</div>
          <div class="section-title" style="margin-bottom:4px">모델이 헷갈립니다. 답해주세요.</div>
          <p class="section-desc">
            아래 케이스들은 모델이 <strong class="amb">확신도 60% 이하</strong>로 판정한 것들입니다.
            당신의 답이 모델의 경계를 가장 빠르게 다듬습니다.
          </p>
          <div class="case-list">
            {#each ACTIVE_CASES as q (q.id)}
              <div class="case-card">
                <div class="case-top">
                  <span class="case-symbol">{q.symbol}</span>
                  <span class="case-when">{q.when}</span>
                  <span class="spacer" />
                  <div class="confidence-bar-wrap">
                    <div class="conf-track">
                      <div class="conf-fill" style="width:{q.confidence}%"></div>
                    </div>
                    <span class="conf-pct">{q.confidence}%</span>
                  </div>
                </div>
                <p class="case-why">{q.why}</p>
                <div class="case-actions">
                  <span class="model-guess">내 모델의 추측 · <strong>{q.guess}</strong></span>
                  <span class="spacer" />
                  <button class="judge-yes">Y · 맞다</button>
                  <button class="judge-no">N · 아니다</button>
                  <button class="judge-skip">skip</button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <div class="field-label" style="margin-bottom:10px">WHY 이 질문들이 중요한가</div>
          <p class="why-text">
            <strong>Active learning</strong>은 모델이 확신 없는 <em class="amb">경계 사례</em>만 골라 묻습니다.<br /><br />
            비슷한 케이스 100개를 무작정 판정하는 것보다 경계 3개 판정이 per-user 모델을 더 빠르게 당신답게 만듭니다.
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
          <div class="eyebrow">내 규칙 · AUTO-GENERATED · v0.4.2</div>
          <h1 class="rules-title">Cogochi가 읽은 나의 트레이딩 규칙</h1>
          <p class="rules-desc">
            이 문서는 당신이 <strong>24개 캡처</strong>를 박제하고 <strong>67번 판정</strong>한 결과를
            모델이 자연어로 재구성한 것입니다. 일반 규칙집이 아니라 <em class="amb">당신의</em> 규칙입니다.
          </p>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 01</span>
              <span class="rule-section-title">진입 조건</span>
            </div>
            <div class="rule"><span class="rule-dot">·</span><span>OI가 <strong>4시간 봉 기준 +15% 이상</strong> 증가했을 때만 pos 신호로 취급한다. (confidence 0.82)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span><strong>번지대 최소 3시간</strong>을 채워야 한다. 이보다 짧으면 대부분 fake_dump로 끝났다. (confidence 0.74)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Funding이 <strong>양 → 음</strong>으로 플립된 직후 15분 안의 accumulation만 본다. (confidence 0.61)</span></div>
          </div>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 02</span>
              <span class="rule-section-title">금지 조건</span>
            </div>
            <div class="rule"><span class="rule-dot">·</span><span>BTC regime이 <strong>DOWN</strong>일 때 알트 long 진입은 하지 않는다. (5번 시도 → 4번 실패)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Accumulation bar가 <strong>8개 미만</strong>이면 건너뛴다. (confidence 0.58)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>CVD가 음전인 상태에서는 OI 신호만으로 진입하지 않는다.</span></div>
          </div>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 03</span>
              <span class="rule-section-title">리스크</span>
            </div>
            <div class="rule"><span class="rule-dot">·</span><span>포지션 크기: equity의 <strong>1–1.5%</strong> 리스크. 레버리지 3x 상한.</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Stop: accumulation low −0.8% ~ −1.2%. (과거 평균: −1.08%)</span></div>
            <div class="rule"><span class="rule-dot">·</span><span>Target: R:R 3.0 이상일 때만 진입.</span></div>
          </div>

          <div class="rule-section">
            <div class="rule-section-header">
              <span class="rule-n">§ 04</span>
              <span class="rule-section-title">예외 · 확신 낮은 영역</span>
            </div>
            <div class="rule amb"><span class="rule-dot">·</span><span>VWAP reclaim 단독 시그널은 데이터 부족 (n=11). 판정 경계 불명확.</span></div>
            <div class="rule amb"><span class="rule-dot">·</span><span>15m 타임프레임 BB squeeze는 histor 유사도 낮음. Active Learning 필요.</span></div>
          </div>
        </div>

        <div class="rules-sidebar">
          <div class="panel" style="padding:12px">
            <div class="field-label" style="margin-bottom:8px">DOC ACTIONS</div>
            <button class="full-btn" style="margin-bottom:5px">↓ Export as Markdown</button>
            <button class="full-btn" style="margin-bottom:5px">✎ Override · 수동 추가</button>
            <button class="full-btn amb-btn">↻ Regenerate from captures</button>
          </div>
          <div class="panel" style="padding:12px">
            <div class="eyebrow pos" style="margin-bottom:8px">VERSION HISTORY</div>
            {#each [
              { v: 'v0.4.2', when: 'Today',  change: '+ BB squeeze 예외 추가' },
              { v: 'v0.4.1', when: '3d ago', change: 'accumulation 기준 6→8 bar' },
              { v: 'v0.4.0', when: '2w ago', change: 'BTC regime DOWN 금지 추가' },
              { v: 'v0.3.0', when: '1m ago', change: '초기 3개 캡처 반영' },
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
        <div class="eyebrow amb">REJUDGE · 과거 판정 번복</div>
        <div class="section-title" style="margin-bottom:4px">지금 와서 보면 다르게 판단할 것들</div>
        <p class="section-desc">
          번복은 모델에 <strong class="amb">강한 학습 신호</strong>입니다.
          "그때의 내가 틀렸다"는 per-user 규칙의 가장 중요한 입력.
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
                <button class="rj-override">번복 →</button>
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
          <div class="section-title" style="margin-bottom:14px">성능 · 이번 주</div>
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
          <div class="spacer-flex" />
          <div class="model-summary">
            당신의 모델은 지난 7주간 <strong class="pos">+19 alpha</strong> 개선. 기여가 큰 action:<br />
            <span class="mono-sm amb">active_learning(7) &gt; rejudge(3) &gt; save_setup(12)</span>
          </div>
        </div>

        <div class="panel" style="padding:14px; display:flex; flex-direction:column">
          <div class="eyebrow">FEATURE WEIGHTS</div>
          <div class="section-title" style="margin-bottom:14px">모델이 현재 중시하는 것</div>
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
    font-size: 8px;
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
    font-size: 7px;
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
    font-size: 7px;
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
    font-size: 10px;
    color: var(--g6);
  }

  .detail-when {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
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
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.14em;
    margin-bottom: 6px;
  }

  .field-label-row {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
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
    font-size: 9px;
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
    font-size: 9px;
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
    font-size: 7px;
    color: var(--g5);
  }

  .snap-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g9);
  }

  /* ── Model influence ───────────────────────────────────────────────── */
  .influence-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--pos);
    letter-spacing: 0.16em;
    margin-bottom: 8px;
    padding: 12px 12px 0;
  }

  .influence-text {
    font-size: 10px;
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
    font-size: 9px;
    color: var(--g7);
    flex: 1;
  }

  .weight-delta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
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
    font-size: 9px;
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
    font-size: 9px;
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
    font-size: 8px;
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
    font-size: 9px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }

  .why-text {
    font-size: 10px;
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
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.1em;
    margin-bottom: 5px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
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
    font-size: 9px;
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
    font-size: 10px;
    flex-shrink: 0;
  }

  .version-row {
    display: flex;
    padding: 5px 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
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
    font-size: 10px;
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
    font-size: 10px;
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
    font-size: 10px;
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
    font-size: 9px;
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
    font-size: 7px;
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
    font-size: 8px;
    color: var(--g6);
  }

  .spacer-flex {
    flex: 1;
  }

  .model-summary {
    padding: 10px 12px;
    background: var(--g2);
    border-radius: 4px;
    font-size: 10px;
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
    font-size: 10px;
    color: var(--g8);
  }

  .feature-weight {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
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
    font-size: 9px;
    color: var(--g5);
    letter-spacing: 0.14em;
    flex: 1;
  }

  .action-link {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--amb);
    letter-spacing: 0.1em;
    background: none;
    border: none;
    cursor: pointer;
  }

  .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
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
    font-size: 10px;
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
    font-size: 10px;
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
    font-size: 9px;
  }
</style>
