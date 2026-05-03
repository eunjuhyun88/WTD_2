<script lang="ts">
  interface QuizQuestion {
    id: string;
    symbol: string;
    timeframe: string;
    note?: string;
  }

  interface Props {
    question: QuizQuestion;
    questionNum: number;
    total: number;
    onAnswer: (answer: 'UP' | 'DOWN' | 'SKIP') => void;
  }

  let { question, questionNum, total, onAnswer }: Props = $props();
  let answered = $state<'UP' | 'DOWN' | 'SKIP' | null>(null);

  function pick(a: 'UP' | 'DOWN' | 'SKIP') {
    if (answered) return;
    answered = a;
    setTimeout(() => onAnswer(a), 300);
  }
</script>

<div class="quiz-card">
  <div class="quiz-progress">
    <div class="quiz-progress-bar" style="width: {(questionNum / total) * 100}%"></div>
  </div>
  <div class="quiz-header">
    <span class="quiz-symbol">{question.symbol}</span>
    <span class="quiz-tf">{question.timeframe}</span>
    <span class="quiz-num">{questionNum} / {total}</span>
  </div>
  <div class="quiz-prompt">이 패턴의 방향을 예측하세요</div>
  {#if question.note}
    <div class="quiz-note">{question.note}</div>
  {/if}
  <div class="quiz-actions">
    <button class="quiz-btn up" class:selected={answered === 'UP'} onclick={() => pick('UP')}>⬆ UP</button>
    <button class="quiz-btn down" class:selected={answered === 'DOWN'} onclick={() => pick('DOWN')}>⬇ DOWN</button>
    <button class="quiz-btn skip" class:selected={answered === 'SKIP'} onclick={() => pick('SKIP')}>→ SKIP</button>
  </div>
</div>

<style>
  .quiz-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
  }
  .quiz-progress {
    height: 2px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }
  .quiz-progress-bar {
    height: 100%;
    background: var(--amb);
    transition: width 0.3s;
  }
  .quiz-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .quiz-symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-base);
    color: var(--g9);
    font-weight: 600;
  }
  .quiz-tf {
    font-size: var(--ui-text-sm);
    color: var(--g6);
    background: var(--g3);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .quiz-num {
    font-size: var(--ui-text-sm);
    color: var(--g6);
    margin-left: auto;
  }
  .quiz-prompt {
    font-size: var(--ui-text-sm);
    color: var(--g7);
  }
  .quiz-note {
    font-size: var(--ui-text-xs);
    color: var(--g6);
    font-style: italic;
  }
  .quiz-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
  .quiz-btn {
    flex: 1;
    min-height: 44px;
    border-radius: 6px;
    border: 1px solid var(--g4);
    background: var(--g2);
    color: var(--g8);
    font-size: var(--ui-text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }
  .quiz-btn:hover {
    border-color: var(--g6);
    color: var(--g9);
  }
  .quiz-btn.up.selected {
    background: color-mix(in srgb, var(--pos) 20%, var(--g2));
    border-color: var(--pos);
    color: var(--pos);
  }
  .quiz-btn.down.selected {
    background: color-mix(in srgb, var(--neg) 20%, var(--g2));
    border-color: var(--neg);
    color: var(--neg);
  }
  .quiz-btn.skip.selected {
    border-color: var(--g6);
    color: var(--g7);
  }
</style>
