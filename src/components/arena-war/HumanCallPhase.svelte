<script lang="ts">
  import {
    arenaWarStore,
    arenaWarTimer,
    arenaWarHumanRR,
    setHumanDirection,
    setHumanConfidence,
    setHumanTp,
    setHumanSl,
    toggleReasonTag,
    setReasonText,
    lockHumanDecision,
  } from '$lib/stores/arenaWarStore';
  import { AGENT_POOL } from '$lib/engine/agents';
  import { REASON_TAGS, ALL_REASON_TAGS, type ReasonTagCategory } from '$lib/engine/arenaWarTypes';
  import type { Direction, CtxFlag } from '$lib/engine/types';

  // Derived from store (use 'ws' to avoid name conflict with $state rune)
  let ws = $derived($arenaWarStore);
  let timer = $derived($arenaWarTimer);
  let rr = $derived($arenaWarHumanRR);

  let aiDecision = $derived(ws.aiDecision);
  let c02 = $derived(aiDecision?.c02Result);
  let factors = $derived(ws.factors);

  // UI state
  let showFactorDetail: boolean = $state(false);
  let activeReasonCategory: ReasonTagCategory | null = $state(null);
  let reasonTextInput: string = $state('');

  // Agent outputs grouped by role
  let offenseAgents = $derived(
    c02 ? [
      { id: 'STRUCTURE', def: AGENT_POOL.STRUCTURE, factors: factors.filter(f => AGENT_POOL.STRUCTURE.factors.some(fd => fd.id === f.factorId)) },
      { id: 'VPA', def: AGENT_POOL.VPA, factors: factors.filter(f => AGENT_POOL.VPA.factors.some(fd => fd.id === f.factorId)) },
      { id: 'ICT', def: AGENT_POOL.ICT, factors: factors.filter(f => AGENT_POOL.ICT.factors.some(fd => fd.id === f.factorId)) },
    ] : []
  );

  let canLock = $derived(
    ws.humanDirection !== null &&
    ws.humanTp > 0 &&
    ws.humanSl > 0 &&
    !ws.humanLocked
  );

  function getFlagIcon(flag: CtxFlag): string {
    if (flag === 'GREEN') return '🟢';
    if (flag === 'RED') return '🔴';
    return '⚪';
  }

  function getFlagColor(flag: CtxFlag): string {
    if (flag === 'GREEN') return 'var(--arena-good, #00cc88)';
    if (flag === 'RED') return 'var(--arena-bad, #ff5e7a)';
    return 'var(--arena-text-2, #5a7d6e)';
  }

  function dirColor(dir: Direction): string {
    if (dir === 'LONG') return 'var(--arena-good, #00cc88)';
    if (dir === 'SHORT') return 'var(--arena-bad, #ff5e7a)';
    return 'var(--arena-text-2, #5a7d6e)';
  }

  function factorBar(value: number): string {
    const pct = Math.abs(value);
    const color = value > 0 ? 'var(--arena-good, #00cc88)' : 'var(--arena-bad, #ff5e7a)';
    return `linear-gradient(${value > 0 ? '90deg' : '270deg'}, ${color} ${pct}%, transparent ${pct}%)`;
  }

  function handleLock() {
    if (reasonTextInput.trim()) {
      setReasonText(reasonTextInput);
    }
    lockHumanDecision();
  }

  function getCategoryLabel(cat: ReasonTagCategory): string {
    const labels: Record<ReasonTagCategory, string> = {
      technical: '기술적 해석',
      ai_reinterpretation: 'AI 판단 교정',
      sentiment: '심리 판단',
      intuition: '직관',
    };
    return labels[cat];
  }

  function getCategoryColor(cat: ReasonTagCategory): string {
    const colors: Record<ReasonTagCategory, string> = {
      technical: '#3b9eff',
      ai_reinterpretation: '#e8967d',
      sentiment: '#a78bfa',
      intuition: '#f59e0b',
    };
    return colors[cat];
  }
</script>

<div class="human-call">
  <!-- Timer Bar -->
  <div class="timer-bar">
    <div class="timer-fill" style="width: {(timer / 45) * 100}%"></div>
    <span class="timer-text">{timer}s</span>
  </div>

  <div class="main-layout">
    <!-- LEFT: AI Analysis (전체 공개) -->
    <div class="ai-panel">
      <div class="panel-header">
        <span class="panel-icon">🤖</span>
        <span class="panel-title">AI 분석 — 전체 공개</span>
      </div>

      {#if c02}
        <!-- OFFENSE (ORPO) -->
        <div class="section offense">
          <div class="section-label">═══ OFFENSE (ORPO) ═══</div>
          {#each offenseAgents as agent}
            <div class="agent-row">
              <span class="agent-icon">{agent.def.icon}</span>
              <span class="agent-id">{agent.id}</span>
              <span class="agent-dir" style="color: {dirColor(agent.factors.reduce((s, f) => s + f.value, 0) > 15 ? 'LONG' : agent.factors.reduce((s, f) => s + f.value, 0) < -15 ? 'SHORT' : 'NEUTRAL')}">
                {agent.factors.reduce((s, f) => s + f.value, 0) > 15 ? 'LONG' : agent.factors.reduce((s, f) => s + f.value, 0) < -15 ? 'SHORT' : 'NEUTRAL'}
              </span>
              <div class="factor-chips">
                {#each agent.factors as f}
                  <span class="factor-chip" class:pos={f.value > 0} class:neg={f.value < 0}
                        title={f.detail}>
                    {f.factorId.replace(/_/g, ' ')}: {f.value > 0 ? '+' : ''}{f.value}
                  </span>
                {/each}
              </div>
            </div>
          {/each}

          <div class="orpo-summary">
            → ORPO 합성:
            <span style="color: {dirColor(c02.orpo.direction)}; font-weight: 700">
              {c02.orpo.direction} {c02.orpo.confidence}%
            </span>
          </div>
        </div>

        <!-- CTX -->
        <div class="section ctx">
          <div class="section-label">═══ CTX 검증 ═══</div>
          {#each c02.ctx as belief}
            <div class="ctx-row">
              <span class="ctx-icon">{getFlagIcon(belief.flag)}</span>
              <span class="ctx-agent">{AGENT_POOL[belief.agentId]?.icon ?? ''} {belief.agentId}</span>
              <span class="ctx-flag" style="color: {getFlagColor(belief.flag)}">
                {belief.flag}
              </span>
              <span class="ctx-headline">{belief.headline}</span>
            </div>
          {/each}
        </div>

        <!-- GUARDIAN -->
        <div class="section guardian">
          <div class="section-label">═══ GUARDIAN ═══</div>
          {#if c02.guardian.violations.length > 0}
            {#each c02.guardian.violations as v}
              <div class="guardian-violation" class:block={v.severity === 'BLOCK'} class:warn={v.severity === 'WARN'}>
                {v.severity === 'BLOCK' ? '🚫' : '⚠'} {v.severity}: {v.detail}
              </div>
            {/each}
          {:else}
            <div class="guardian-ok">✅ All checks passed</div>
          {/if}
        </div>

        <!-- COMMANDER -->
        <div class="section commander">
          <div class="section-label">═══ COMMANDER 판정 ═══</div>
          {#if c02.commander}
            <div class="commander-conflict">
              ORPO({c02.orpo.direction}) vs CTX → 충돌 감지
            </div>
            <div class="commander-result">
              결론: <span style="color: {dirColor(c02.commander.finalDirection)}; font-weight: 700">
                {c02.commander.finalDirection}
              </span>
              확신도: {c02.commander.entryScore}%
            </div>
            <div class="commander-reason">{c02.commander.reasoning}</div>
          {:else}
            <div class="commander-ok">충돌 없음 — ORPO 방향 유지</div>
          {/if}
        </div>

        <!-- AI FINAL -->
        <div class="ai-final">
          <div class="section-label">═══ AI 최종 판단 ═══</div>
          <div class="ai-verdict">
            <span class="ai-bot">🤖</span>
            <span style="color: {dirColor(aiDecision?.direction ?? 'NEUTRAL')}; font-weight: 700; font-size: 1.1rem">
              {aiDecision?.direction}
            </span>
            <span class="ai-conf">확신 {aiDecision?.confidence}%</span>
            <span class="ai-levels">
              TP {aiDecision?.tp?.toLocaleString()} | SL {aiDecision?.sl?.toLocaleString()}
            </span>
          </div>
        </div>

        <!-- Factor Detail Toggle -->
        <button class="factor-toggle" onclick={() => showFactorDetail = !showFactorDetail}>
          {showFactorDetail ? '▲ 48팩터 접기' : '▼ 48팩터 전체 보기'}
        </button>

        {#if showFactorDetail}
          <div class="factor-detail">
            {#each factors as f}
              <div class="factor-row">
                <span class="factor-id">{f.factorId}</span>
                <div class="factor-bar-wrap">
                  <div class="factor-bar"
                       class:pos={f.value > 0}
                       class:neg={f.value < 0}
                       style="width: {Math.abs(f.value)}%; {f.value > 0 ? 'margin-left: 50%' : `margin-left: ${50 - Math.abs(f.value)}%`}">
                  </div>
                </div>
                <span class="factor-val" class:pos={f.value > 0} class:neg={f.value < 0}>
                  {f.value > 0 ? '+' : ''}{f.value}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- RIGHT: Human Decision -->
    <div class="human-panel">
      <div class="panel-header">
        <span class="panel-icon">👤</span>
        <span class="panel-title">당신의 판단</span>
      </div>

      <!-- Direction -->
      <div class="decision-section">
        <label class="dec-label">방향</label>
        <div class="dir-buttons">
          <button
            class="dir-btn long"
            class:active={ws.humanDirection === 'LONG'}
            onclick={() => setHumanDirection('LONG')}
            disabled={ws.humanLocked}
          >
            LONG ▲
          </button>
          <button
            class="dir-btn neutral"
            class:active={ws.humanDirection === 'NEUTRAL'}
            onclick={() => setHumanDirection('NEUTRAL')}
            disabled={ws.humanLocked}
          >
            NEUTRAL
          </button>
          <button
            class="dir-btn short"
            class:active={ws.humanDirection === 'SHORT'}
            onclick={() => setHumanDirection('SHORT')}
            disabled={ws.humanLocked}
          >
            SHORT ▼
          </button>
        </div>
      </div>

      <!-- Confidence -->
      <div class="decision-section">
        <label class="dec-label">확신도: {ws.humanConfidence}%</label>
        <input
          type="range"
          min="10"
          max="95"
          step="5"
          value={ws.humanConfidence}
          oninput={(e) => setHumanConfidence(Number(e.currentTarget.value))}
          disabled={ws.humanLocked}
          class="confidence-slider"
        />
      </div>

      <!-- TP / SL -->
      <div class="decision-section tp-sl-row">
        <div class="tp-input">
          <label class="dec-label">TP</label>
          <input
            type="number"
            value={ws.humanTp}
            oninput={(e) => setHumanTp(Number(e.currentTarget.value))}
            disabled={ws.humanLocked}
            class="price-input"
            step="10"
          />
        </div>
        <div class="sl-input">
          <label class="dec-label">SL</label>
          <input
            type="number"
            value={ws.humanSl}
            oninput={(e) => setHumanSl(Number(e.currentTarget.value))}
            disabled={ws.humanLocked}
            class="price-input"
            step="10"
          />
        </div>
        <div class="rr-display">
          <label class="dec-label">R:R</label>
          <span class="rr-value" class:good={rr >= 2} class:warn={rr >= 1.5 && rr < 2} class:bad={rr < 1.5}>
            {rr.toFixed(1)}
          </span>
        </div>
      </div>

      <!-- Reason Tags -->
      <div class="decision-section">
        <label class="dec-label">근거 태그 (AI를 왜 따르거나 거부하는가?)</label>
        <div class="tag-categories">
          {#each Object.entries(REASON_TAGS) as [cat, tags]}
            <div class="tag-category">
              <button
                class="cat-header"
                style="border-color: {getCategoryColor(cat as ReasonTagCategory)}"
                onclick={() => activeReasonCategory = activeReasonCategory === cat ? null : cat as ReasonTagCategory}
              >
                <span style="color: {getCategoryColor(cat as ReasonTagCategory)}">{getCategoryLabel(cat as ReasonTagCategory)}</span>
                <span class="cat-count">{ws.humanReasonTags.filter(t => (tags as readonly string[]).includes(t)).length}</span>
              </button>
              {#if activeReasonCategory === cat}
                <div class="tag-list">
                  {#each tags as tag}
                    <button
                      class="reason-tag"
                      class:selected={ws.humanReasonTags.includes(tag)}
                      onclick={() => toggleReasonTag(tag)}
                      disabled={ws.humanLocked}
                      style="--cat-color: {getCategoryColor(cat as ReasonTagCategory)}"
                    >
                      {tag.replace(/_/g, ' ')}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Reason Text (optional) -->
      <div class="decision-section">
        <label class="dec-label">메모 (선택)</label>
        <textarea
          class="reason-text"
          placeholder="AI의 판단과 다르게 생각하는 이유..."
          maxlength="280"
          bind:value={reasonTextInput}
          disabled={ws.humanLocked}
        ></textarea>
      </div>

      <!-- Lock In Button -->
      <button
        class="lock-btn"
        onclick={handleLock}
        disabled={!canLock}
      >
        ⚔ LOCK IN
      </button>
    </div>
  </div>
</div>

<style>
  .human-call {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .timer-bar {
    position: relative;
    height: 28px;
    background: var(--arena-bg-1, #0d2118);
    border-bottom: 1px solid var(--arena-line, #1a3d2e);
  }

  .timer-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--arena-accent, #e8967d), var(--arena-good, #00cc88));
    transition: width 1s linear;
  }

  .timer-text {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--arena-text-0, #e0f0e8);
    font-weight: 700;
  }

  .main-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    flex: 1;
    overflow: hidden;
    background: var(--arena-line, #1a3d2e);
  }

  /* ─── AI Panel ─── */
  .ai-panel {
    background: var(--arena-bg-0, #07130d);
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--arena-line, #1a3d2e);
  }

  .panel-icon { font-size: 1.1rem; }

  .panel-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--arena-accent, #e8967d);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .section {
    padding: 0.5rem 0;
  }

  .section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: var(--arena-text-2, #5a7d6e);
    margin-bottom: 0.4rem;
    letter-spacing: 1px;
  }

  .agent-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--arena-line, #1a3d2e);
  }

  .agent-icon { font-size: 0.9rem; }
  .agent-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--arena-text-0, #e0f0e8);
    width: 70px;
  }
  .agent-dir {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 700;
    width: 55px;
  }

  .factor-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    width: 100%;
    margin-top: 0.2rem;
  }

  .factor-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--arena-bg-1, #0d2118);
    white-space: nowrap;
  }

  .factor-chip.pos { color: var(--arena-good, #00cc88); border: 1px solid rgba(0, 204, 136, 0.2); }
  .factor-chip.neg { color: var(--arena-bad, #ff5e7a); border: 1px solid rgba(255, 94, 122, 0.2); }

  .orpo-summary {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--arena-text-1, #8ba59e);
    padding: 0.5rem;
    background: var(--arena-bg-1, #0d2118);
    border-radius: 4px;
    margin-top: 0.3rem;
  }

  .ctx-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0;
    font-size: 0.7rem;
  }

  .ctx-agent {
    font-family: 'JetBrains Mono', monospace;
    color: var(--arena-text-0, #e0f0e8);
    width: 80px;
  }

  .ctx-flag {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    width: 55px;
    font-size: 0.65rem;
  }

  .ctx-headline {
    font-size: 0.6rem;
    color: var(--arena-text-2, #5a7d6e);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .guardian-violation {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    margin: 0.2rem 0;
  }

  .guardian-violation.block {
    background: rgba(255, 94, 122, 0.1);
    color: var(--arena-bad, #ff5e7a);
    border: 1px solid rgba(255, 94, 122, 0.3);
  }

  .guardian-violation.warn {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .guardian-ok {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--arena-good, #00cc88);
  }

  .commander-conflict {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #f59e0b;
    margin-bottom: 0.2rem;
  }

  .commander-result {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--arena-text-0, #e0f0e8);
  }

  .commander-reason {
    font-size: 0.6rem;
    color: var(--arena-text-2, #5a7d6e);
    margin-top: 0.15rem;
    line-height: 1.4;
  }

  .commander-ok {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--arena-text-1, #8ba59e);
  }

  .ai-final {
    padding: 0.6rem;
    background: var(--arena-bg-1, #0d2118);
    border: 1px solid var(--arena-accent, #e8967d);
    border-radius: 6px;
    margin-top: 0.3rem;
  }

  .ai-verdict {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.3rem;
  }

  .ai-bot { font-size: 1.3rem; }

  .ai-conf {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: var(--arena-text-1, #8ba59e);
  }

  .ai-levels {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--arena-text-2, #5a7d6e);
  }

  .factor-toggle {
    background: none;
    border: 1px solid var(--arena-line, #1a3d2e);
    color: var(--arena-text-2, #5a7d6e);
    padding: 0.4rem;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    cursor: pointer;
    text-align: center;
  }

  .factor-toggle:hover {
    color: var(--arena-accent, #e8967d);
    border-color: var(--arena-accent, #e8967d);
  }

  .factor-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .factor-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 1px 0;
  }

  .factor-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    color: var(--arena-text-2, #5a7d6e);
    width: 100px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .factor-bar-wrap {
    flex: 1;
    height: 8px;
    background: var(--arena-bg-1, #0d2118);
    border-radius: 2px;
    position: relative;
    overflow: hidden;
  }

  .factor-bar {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .factor-bar.pos { background: var(--arena-good, #00cc88); }
  .factor-bar.neg { background: var(--arena-bad, #ff5e7a); }

  .factor-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    width: 30px;
    text-align: right;
  }

  .factor-val.pos { color: var(--arena-good, #00cc88); }
  .factor-val.neg { color: var(--arena-bad, #ff5e7a); }

  /* ─── Human Panel ─── */
  .human-panel {
    background: var(--arena-bg-0, #07130d);
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .decision-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .dec-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--arena-accent, #e8967d);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .dir-buttons {
    display: flex;
    gap: 0.4rem;
  }

  .dir-btn {
    flex: 1;
    padding: 0.6rem;
    border: 2px solid var(--arena-line, #1a3d2e);
    background: var(--arena-bg-1, #0d2118);
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .dir-btn.long { color: var(--arena-good, #00cc88); }
  .dir-btn.short { color: var(--arena-bad, #ff5e7a); }
  .dir-btn.neutral { color: var(--arena-text-1, #8ba59e); }

  .dir-btn.long.active {
    background: rgba(0, 204, 136, 0.15);
    border-color: var(--arena-good, #00cc88);
  }

  .dir-btn.short.active {
    background: rgba(255, 94, 122, 0.15);
    border-color: var(--arena-bad, #ff5e7a);
  }

  .dir-btn.neutral.active {
    background: rgba(139, 165, 158, 0.15);
    border-color: var(--arena-text-1, #8ba59e);
  }

  .dir-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .confidence-slider {
    width: 100%;
    accent-color: var(--arena-accent, #e8967d);
    cursor: pointer;
  }

  .tp-sl-row {
    flex-direction: row !important;
    gap: 0.5rem !important;
    align-items: flex-end;
  }

  .tp-input, .sl-input, .rr-display {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tp-input, .sl-input { flex: 1; }

  .price-input {
    width: 100%;
    padding: 0.4rem;
    background: var(--arena-bg-1, #0d2118);
    border: 1px solid var(--arena-line, #1a3d2e);
    color: var(--arena-text-0, #e0f0e8);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
  }

  .price-input:focus {
    border-color: var(--arena-accent, #e8967d);
    outline: none;
  }

  .price-input:disabled { opacity: 0.5; }

  .rr-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.1rem;
    font-weight: 700;
    padding: 0.25rem;
    text-align: center;
  }

  .rr-value.good { color: var(--arena-good, #00cc88); }
  .rr-value.warn { color: #f59e0b; }
  .rr-value.bad { color: var(--arena-bad, #ff5e7a); }

  .tag-categories {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .cat-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0.5rem;
    background: var(--arena-bg-1, #0d2118);
    border: 1px solid var(--arena-line, #1a3d2e);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .cat-header:hover { border-color: var(--arena-accent, #e8967d); }

  .cat-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: var(--arena-accent, #e8967d);
    background: rgba(232, 150, 125, 0.15);
    padding: 0 4px;
    border-radius: 3px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.3rem 0;
  }

  .reason-tag {
    padding: 0.2rem 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    border: 1px solid var(--arena-line, #1a3d2e);
    background: var(--arena-bg-1, #0d2118);
    color: var(--arena-text-1, #8ba59e);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .reason-tag:hover:not(:disabled) {
    border-color: var(--cat-color);
    color: var(--cat-color);
  }

  .reason-tag.selected {
    background: color-mix(in srgb, var(--cat-color) 15%, transparent);
    border-color: var(--cat-color);
    color: var(--cat-color);
    font-weight: 600;
  }

  .reason-tag:disabled { opacity: 0.5; cursor: not-allowed; }

  .reason-text {
    width: 100%;
    min-height: 50px;
    padding: 0.4rem;
    background: var(--arena-bg-1, #0d2118);
    border: 1px solid var(--arena-line, #1a3d2e);
    color: var(--arena-text-0, #e0f0e8);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    resize: vertical;
  }

  .reason-text:focus {
    border-color: var(--arena-accent, #e8967d);
    outline: none;
  }

  .reason-text:disabled { opacity: 0.5; }

  .lock-btn {
    width: 100%;
    padding: 0.8rem;
    background: var(--arena-accent, #e8967d);
    color: #000;
    border: 3px solid #000;
    border-radius: 6px;
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 1.3rem;
    letter-spacing: 3px;
    cursor: pointer;
    box-shadow: 3px 3px 0 #000;
    transition: all 0.1s ease;
    margin-top: auto;
  }

  .lock-btn:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 #000;
  }

  .lock-btn:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 #000;
  }

  .lock-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }
</style>
