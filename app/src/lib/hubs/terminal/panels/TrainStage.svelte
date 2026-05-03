<script lang="ts">
  import { onMount } from 'svelte';
  import { workMode } from '../workMode.store';
  import { trackTrainSessionComplete } from '../telemetry';
  import QuizCard from './QuizCard.svelte';

  interface QuizQuestion {
    id: string;
    symbol: string;
    timeframe: string;
    note?: string;
  }

  let questions = $state<QuizQuestion[]>([]);
  let current = $state(0);
  let answers = $state<string[]>([]);
  let sessionId = $state('');
  let loading = $state(true);
  let done = $state(false);
  let sessionStartMs = $state(0);

  onMount(async () => {
    sessionId = crypto.randomUUID();
    sessionStartMs = Date.now();
    try {
      const res = await fetch('/api/terminal/train/quiz');
      const { questions: qs } = await res.json();
      questions = qs;
    } catch {
      questions = [];
    } finally {
      loading = false;
    }
  });

  async function handleAnswer(answer: 'UP' | 'DOWN' | 'SKIP') {
    const q = questions[current];
    answers = [...answers, answer];

    await fetch('/api/terminal/train/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capture_id: q.id,
        symbol: q.symbol,
        answer,
        session_id: sessionId,
      }),
    }).catch(() => {});

    if (current + 1 >= questions.length) {
      done = true;
      const durationMs = Date.now() - (sessionStartMs || Date.now());
      trackTrainSessionComplete(sessionId, [...answers, answer], questions.length, durationMs);
    } else {
      current = current + 1;
    }
  }

  function close() {
    workMode.set('TRADE');
  }

  function restart() {
    current = 0;
    answers = [];
    done = false;
  }

  const accuracy = $derived(
    done ? `${answers.filter((a) => a !== 'SKIP').length} / ${questions.length} 답변` : '',
  );
</script>

<div class="train-overlay">
  <div class="train-panel">
    <div class="train-header">
      <span class="train-badge">TRAIN</span>
      <button class="train-close" onclick={close}>✕</button>
    </div>

    {#if loading}
      <div class="train-loading">퀴즈 로딩 중...</div>
    {:else if done}
      <div class="train-summary">
        <div class="summary-title">세션 완료!</div>
        <div class="summary-stat">{accuracy}</div>
        <button class="summary-restart" onclick={restart}>다시 시작</button>
        <button class="summary-exit" onclick={close}>터미널로 돌아가기</button>
      </div>
    {:else if questions.length === 0}
      <div class="train-empty">퀴즈 데이터가 없습니다.</div>
    {:else}
      <QuizCard
        question={questions[current]}
        questionNum={current + 1}
        total={questions.length}
        onAnswer={handleAnswer}
      />
    {/if}
  </div>
</div>

<style>
  .train-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(12, 10, 9, 0.85);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .train-panel {
    width: min(480px, 90vw);
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 12px;
    overflow: hidden;
  }
  .train-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--g3);
  }
  .train-badge {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: var(--amb);
    letter-spacing: 0.1em;
    font-family: 'JetBrains Mono', monospace;
  }
  .train-close {
    background: none;
    border: none;
    color: var(--g6);
    cursor: pointer;
    font-size: var(--ui-text-base);
    padding: 4px 8px;
  }
  .train-loading,
  .train-empty {
    padding: 40px;
    text-align: center;
    font-size: var(--ui-text-sm);
    color: var(--g6);
  }
  .train-summary {
    padding: 40px 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }
  .summary-title {
    font-size: var(--ui-text-lg);
    color: var(--g9);
    font-weight: 600;
  }
  .summary-stat {
    font-size: var(--ui-text-base);
    color: var(--amb);
    font-family: 'JetBrains Mono', monospace;
  }
  .summary-restart,
  .summary-exit {
    padding: 10px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: var(--ui-text-sm);
    width: 100%;
  }
  .summary-restart {
    background: var(--amb);
    color: var(--g1);
    border: none;
  }
  .summary-exit {
    background: transparent;
    border: 1px solid var(--g4);
    color: var(--g7);
  }
</style>
