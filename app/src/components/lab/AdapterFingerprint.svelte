<script lang="ts">
  import {
    ADAPTER_MODE,
    PLACEHOLDER_ADAPTER_VERSIONS,
    PLACEHOLDER_WEIGHT_CHANGES,
    type AdapterVersion,
    type AdapterWeightChange,
  } from '$lib/config/personalization';

  interface Props {
    version?: AdapterVersion;
    weightChanges?: AdapterWeightChange[];
  }

  const latestPlaceholder = PLACEHOLDER_ADAPTER_VERSIONS[PLACEHOLDER_ADAPTER_VERSIONS.length - 1];

  const {
    version = ADAPTER_MODE === 'placeholder' ? latestPlaceholder : undefined,
    weightChanges = ADAPTER_MODE === 'placeholder' ? PLACEHOLDER_WEIGHT_CHANGES : [],
  }: Props = $props();

  const isLive = ADAPTER_MODE === 'live';

  const maxDelta = $derived(
    weightChanges.length > 0 ? Math.max(...weightChanges.map((w) => w.delta)) : 1
  );

  function fmtTrainedAt(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    } catch {
      return iso;
    }
  }

  function barWidthPct(delta: number): number {
    return Math.round((delta / maxDelta) * 100);
  }
</script>

{#if !version}
  <div class="afp-locked">
    <span class="afp-lock-icon">⎋</span>
    <span class="afp-lock-label">Adapter Fingerprint — requires H1 verification</span>
  </div>
{:else}
  <div class="afp-panel">
    <div class="afp-header">
      <span class="afp-kicker">Adapter</span>
      <h2 class="afp-title">{version.version}</h2>
    </div>

    <div class="afp-meta-grid">
      <div class="afp-meta-row">
        <span class="afp-meta-label">훈련</span>
        <span class="afp-meta-value">{fmtTrainedAt(version.trainedAt)}</span>
      </div>
      <div class="afp-meta-row">
        <span class="afp-meta-label">비용</span>
        <span class="afp-meta-value">${version.cost.toFixed(3)}</span>
      </div>
      <div class="afp-meta-row">
        <span class="afp-meta-label">피드백</span>
        <span class="afp-meta-value">{version.feedbackCount}개</span>
      </div>
      <div class="afp-meta-row">
        <span class="afp-meta-label">적중률</span>
        <span class="afp-meta-value afp-positive">{version.hitRate}%</span>
      </div>
      {#if version.deltaPct > 0}
        <div class="afp-meta-row">
          <span class="afp-meta-label">val gate</span>
          <span class="afp-meta-value afp-positive">+{version.deltaPct}%p 통과 ✓ (배포됨)</span>
        </div>
      {/if}
    </div>

    <div class="afp-section-label">Learned Patterns (weight 변화 Top {weightChanges.length})</div>

    <div class="afp-weights">
      {#each weightChanges as w}
        <div class="afp-weight-row">
          <div class="afp-weight-name">
            {w.feature}
            {#if w.note}
              <span class="afp-unique-badge">{w.note}</span>
            {/if}
          </div>
          <div class="afp-weight-bar-wrap">
            <div
              class="afp-weight-bar"
              style="width: {barWidthPct(w.delta)}%"
            ></div>
          </div>
          <span class="afp-weight-delta">+{w.delta.toFixed(2)}</span>
        </div>
      {/each}
    </div>

    <div class="afp-download">
      {#if isLive}
        <button class="afp-dl-btn">
          download adapter .safetensors
        </button>
      {:else}
        <button class="afp-dl-btn afp-dl-disabled" disabled title="Requires H1 verification">
          download adapter .safetensors
          <span class="afp-requires-badge">Requires H1</span>
        </button>
      {/if}
    </div>

    {#if !isLive}
      <div class="afp-preview-strip">
        Preview (mock data) · requires H1 verification
      </div>
    {/if}
  </div>
{/if}

<style>
  .afp-locked {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-radius: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.02);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.78rem;
    color: rgba(250, 247, 235, 0.36);
  }

  .afp-lock-icon {
    font-size: 1rem;
    opacity: 0.4;
  }

  .afp-panel {
    display: grid;
    gap: 16px;
    background: var(--sc-terminal-bg, #0d0d0f);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 20px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  .afp-header {
    display: grid;
    gap: 4px;
  }

  .afp-kicker {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(250, 247, 235, 0.36);
  }

  .afp-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(250, 247, 235, 0.92);
  }

  .afp-meta-grid {
    display: grid;
    gap: 6px;
  }

  .afp-meta-row {
    display: flex;
    gap: 12px;
    align-items: baseline;
    font-size: 0.82rem;
  }

  .afp-meta-label {
    min-width: 72px;
    color: rgba(250, 247, 235, 0.36);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }

  .afp-meta-value {
    color: rgba(250, 247, 235, 0.82);
    font-size: 0.82rem;
  }

  .afp-positive {
    color: #4ade80;
  }

  .afp-section-label {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .afp-weights {
    display: grid;
    gap: 8px;
  }

  .afp-weight-row {
    display: grid;
    grid-template-columns: 1fr 120px 44px;
    align-items: center;
    gap: 10px;
  }

  .afp-weight-name {
    font-size: 0.8rem;
    color: rgba(250, 247, 235, 0.82);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .afp-unique-badge {
    font-size: 0.62rem;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(74, 222, 128, 0.12);
    border: 1px solid rgba(74, 222, 128, 0.25);
    color: #4ade80;
    letter-spacing: 0.04em;
    font-weight: 600;
    white-space: nowrap;
  }

  .afp-weight-bar-wrap {
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .afp-weight-bar {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(74, 222, 128, 0.8), rgba(74, 222, 128, 0.4));
    transition: width 0.3s ease;
  }

  .afp-weight-delta {
    font-size: 0.76rem;
    color: #4ade80;
    font-weight: 600;
    text-align: right;
  }

  .afp-download {
    padding-top: 4px;
  }

  .afp-dl-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: rgba(250, 247, 235, 0.7);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.78rem;
    padding: 7px 14px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .afp-dl-btn:not(:disabled):hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(250, 247, 235, 0.92);
  }

  .afp-dl-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .afp-requires-badge {
    font-size: 0.62rem;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(248, 113, 113, 0.15);
    border: 1px solid rgba(248, 113, 113, 0.3);
    color: #f87171;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .afp-preview-strip {
    font-size: 0.68rem;
    color: rgba(250, 247, 235, 0.28);
    letter-spacing: 0.04em;
    text-align: center;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 8px;
  }

  @media (max-width: 480px) {
    .afp-weight-row {
      grid-template-columns: 1fr 80px 44px;
    }
  }
</style>
