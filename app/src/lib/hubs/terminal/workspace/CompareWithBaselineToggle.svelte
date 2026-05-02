<script lang="ts">
  import { ADAPTER_MODE } from '$lib/config/personalization';

  const isLive = ADAPTER_MODE === 'live';

  let compareEnabled = $state(false);
</script>

{#if !isLive}
  <div class="cwb-locked">
    <span class="cwb-lock-icon">⎋</span>
    <span class="cwb-lock-label">Compare with baseline — Requires H1 verification</span>
  </div>
{:else}
  <div class="cwb-wrap">
    <div class="cwb-toggle-row">
      <span class="cwb-toggle-label">Compare with baseline</span>
      <button
        class="cwb-toggle-btn"
        class:cwb-toggle-on={compareEnabled}
        role="switch"
        aria-checked={compareEnabled}
        aria-label="Compare with baseline"
        onclick={() => (compareEnabled = !compareEnabled)}
      >
        <span class="cwb-toggle-knob"></span>
      </button>
    </div>

    {#if compareEnabled}
      <div class="cwb-comparison">
        <div class="cwb-question">
          <span class="cwb-q-label">Question</span>
          <span class="cwb-q-text">What's the current BTC 4h situation?</span>
        </div>

        <div class="cwb-response-block">
          <div class="cwb-response-header cwb-response-baseline-header">
            <span class="cwb-response-tag">Baseline</span>
            <span class="cwb-response-sublabel">Shared model</span>
          </div>
          <div class="cwb-response-body">
            "BTC는 현재 $XX,XXX에 거래 중이며, RSI 60으로
            중립 구간. MACD는 상승 추세..."
            <span class="cwb-response-type">[generic + textbook response]</span>
          </div>
        </div>

        <div class="cwb-response-block">
          <div class="cwb-response-header cwb-response-user-header">
            <span class="cwb-response-tag">Your Model</span>
            <span class="cwb-response-sublabel">v3, 피드백 60 반영</span>
          </div>
          <div class="cwb-response-body">
            "너가 전에 본 bb_expansion + OI 누적 조건이
            지금 BTC 4h에 나타남. 다만 지난번처럼 펀딩비
            과열 아니라 진입 가능할 듯. 손절 23.8..."
            <span class="cwb-response-type">[your-style response]</span>
          </div>
        </div>

        <div class="cwb-diff-footer">
          차이: 너의 피드백으로 학습된 패턴 "bb_expansion"이
          baseline 모델에는 없는 관점.
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .cwb-locked {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.3);
  }

  .cwb-lock-icon {
    opacity: 0.4;
  }

  .cwb-wrap {
    display: grid;
    gap: 12px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  .cwb-toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .cwb-toggle-label {
    font-size: 0.78rem;
    color: rgba(250, 247, 235, 0.7);
  }

  .cwb-toggle-btn {
    position: relative;
    width: 34px;
    height: 18px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    padding: 0;
    flex-shrink: 0;
  }

  .cwb-toggle-on {
    background: rgba(74, 222, 128, 0.25);
    border-color: rgba(74, 222, 128, 0.5);
  }

  .cwb-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(250, 247, 235, 0.6);
    transition: transform 0.15s;
  }

  .cwb-toggle-on .cwb-toggle-knob {
    transform: translateX(16px);
    background: #4ade80;
  }

  .cwb-comparison {
    display: grid;
    gap: 10px;
  }

  .cwb-question {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .cwb-q-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(250, 247, 235, 0.36);
    flex-shrink: 0;
  }

  .cwb-q-text {
    font-size: 0.82rem;
    color: rgba(250, 247, 235, 0.82);
  }

  .cwb-response-block {
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .cwb-response-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .cwb-response-baseline-header {
    background: rgba(255, 255, 255, 0.03);
  }

  .cwb-response-user-header {
    background: rgba(74, 222, 128, 0.05);
    border-bottom-color: rgba(74, 222, 128, 0.1);
  }

  .cwb-response-tag {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(250, 247, 235, 0.82);
  }

  .cwb-response-user-header .cwb-response-tag {
    color: #4ade80;
  }

  .cwb-response-sublabel {
    font-size: 0.66rem;
    color: rgba(250, 247, 235, 0.3);
  }

  .cwb-response-body {
    padding: 10px 12px;
    font-size: 0.78rem;
    color: rgba(250, 247, 235, 0.65);
    line-height: 1.6;
    background: rgba(255, 255, 255, 0.01);
    display: grid;
    gap: 4px;
  }

  .cwb-response-type {
    font-size: 0.66rem;
    color: rgba(250, 247, 235, 0.3);
    font-style: italic;
  }

  .cwb-diff-footer {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.45);
    line-height: 1.6;
    padding: 8px 12px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
</style>
