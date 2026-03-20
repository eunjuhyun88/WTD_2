<!-- ═══════════════════════════════════════════
  ChallengeOverlay.svelte — 차트 리딩 챌린지 UI
  배틀 위에 오버레이되는 인터랙티브 챌린지
═══════════════════════════════════════════ -->
<script lang="ts">
  import type { ChartChallenge } from '$lib/engine/v3BattleTypes';

  const {
    challenge,
    onAnswer,
  }: {
    challenge: ChartChallenge;
    onAnswer: (answer: string) => void;
  } = $props();

  let timeLeft = $state(100); // percentage
  let answered = $state(false);

  $effect(() => {
    if (challenge.result !== 'pending') return;

    const startTime = Date.now();
    const duration = challenge.timeoutMs;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      timeLeft = Math.max(0, 100 - (elapsed / duration) * 100);

      if (timeLeft <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  });

  function handleAnswer(answer: string) {
    if (answered) return;
    answered = true;
    onAnswer(answer);
  }

  const typeConfig = $derived({
    direction_call: {
      icon: '🎯',
      color: '#4FC3F7',
      bgGlow: 'rgba(79, 195, 247, 0.15)',
    },
    pattern_recognition: {
      icon: '🔍',
      color: '#FFB74D',
      bgGlow: 'rgba(255, 183, 77, 0.15)',
    },
    risk_decision: {
      icon: '⚖️',
      color: '#F06292',
      bgGlow: 'rgba(240, 98, 146, 0.15)',
    },
    quick_reaction: {
      icon: '⚡',
      color: '#FFD54F',
      bgGlow: 'rgba(255, 213, 79, 0.15)',
    },
  }[challenge.type]);
</script>

<div class="challenge-overlay" style:--challenge-color={typeConfig.color} style:--challenge-glow={typeConfig.bgGlow}>
  <div class="challenge-card" class:urgent={timeLeft < 30}>
    <!-- Timer bar -->
    <div class="timer-bar">
      <div class="timer-fill" style="width: {timeLeft}%"
           class:warning={timeLeft < 50}
           class:critical={timeLeft < 25}></div>
    </div>

    <!-- Header -->
    <div class="challenge-header">
      <span class="challenge-icon">{typeConfig.icon}</span>
      <span class="challenge-type">
        {#if challenge.type === 'direction_call'}
          DIRECTION CALL
        {:else if challenge.type === 'pattern_recognition'}
          PATTERN RECOGNITION
        {:else if challenge.type === 'risk_decision'}
          RISK DECISION
        {:else}
          QUICK REACTION
        {/if}
      </span>
    </div>

    <!-- Prompt -->
    <p class="challenge-prompt">{challenge.prompt}</p>

    <!-- Options -->
    <div class="options-grid"
         class:two-col={challenge.options.length <= 2}
         class:three-col={challenge.options.length === 3}
         class:four-col={challenge.options.length >= 4}>
      {#each challenge.options as option (option)}
        <button
          class="option-btn"
          class:tap-btn={challenge.type === 'quick_reaction'}
          onclick={() => handleAnswer(option)}
          disabled={answered}
        >
          {#if challenge.type === 'direction_call'}
            <span class="option-icon">
              {option === 'LONG' ? '📈' : option === 'SHORT' ? '📉' : '➡️'}
            </span>
          {/if}
          <span class="option-label">{option}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .challenge-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .challenge-card {
    background: var(--arena-bg-0, #07130d);
    border: 2px solid var(--challenge-color, #4FC3F7);
    border-radius: 12px;
    padding: 16px 20px;
    width: min(90%, 380px);
    box-shadow:
      0 0 20px var(--challenge-glow),
      0 0 60px var(--challenge-glow),
      inset 0 0 20px var(--challenge-glow);
    animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .challenge-card.urgent {
    animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), pulse-border 0.5s ease-in-out infinite;
  }

  @keyframes slideIn {
    from { transform: scale(0.8) translateY(20px); opacity: 0; }
    to { transform: scale(1) translateY(0); opacity: 1; }
  }

  @keyframes pulse-border {
    0%, 100% { border-color: var(--challenge-color); }
    50% { border-color: #ff4444; }
  }

  .timer-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .timer-fill {
    height: 100%;
    background: var(--challenge-color);
    border-radius: 2px;
    transition: width 0.05s linear;
  }

  .timer-fill.warning {
    background: #FFB74D;
  }

  .timer-fill.critical {
    background: #f85858;
    animation: blink 0.3s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .challenge-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .challenge-icon {
    font-size: 1.2rem;
  }

  .challenge-type {
    font-family: 'JetBrains Mono', 'Bebas Neue', monospace;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 2px;
    color: var(--challenge-color);
  }

  .challenge-prompt {
    font-family: 'Space Grotesk', 'Pretendard', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--arena-text-0, #e0f0e8);
    margin: 0 0 16px;
    text-align: center;
  }

  .options-grid {
    display: grid;
    gap: 8px;
  }

  .options-grid.two-col { grid-template-columns: 1fr 1fr; }
  .options-grid.three-col { grid-template-columns: 1fr 1fr 1fr; }
  .options-grid.four-col { grid-template-columns: 1fr 1fr; }

  .option-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: var(--arena-text-0, #e0f0e8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .option-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: var(--challenge-color);
    transform: scale(1.05);
    box-shadow: 0 0 10px var(--challenge-glow);
  }

  .option-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .option-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .option-btn.tap-btn {
    grid-column: 1 / -1;
    padding: 24px;
    font-size: 1.4rem;
    background: rgba(255, 213, 79, 0.1);
    border-color: #FFD54F;
    animation: tapPulse 0.6s ease-in-out infinite;
  }

  @keyframes tapPulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(255, 213, 79, 0.2); }
    50% { transform: scale(1.03); box-shadow: 0 0 20px rgba(255, 213, 79, 0.4); }
  }

  .option-icon {
    font-size: 1.2rem;
  }

  .option-label {
    font-size: 0.75rem;
    letter-spacing: 1px;
  }
</style>
