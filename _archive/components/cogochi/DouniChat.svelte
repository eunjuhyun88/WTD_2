<script lang="ts">
  import { onMount } from 'svelte';

  // ─── Props ───────────────────────────────────────────────
  let {
    douniName = 'DOUNI',
    archetype = 'RIDER',
    stage = 'CHICK',
    onSendMessage = (_msg: string) => {},
    onSavePattern = () => {},
  }: {
    douniName?: string;
    archetype?: string;
    stage?: string;
    onSendMessage?: (msg: string) => void;
    onSavePattern?: () => void;
  } = $props();

  // ─── State ───────────────────────────────────────────────
  let messages = $state<Array<{
    role: 'douni' | 'user';
    text: string;
    timestamp: number;
  }>>([]);

  let inputText = $state('');
  let isThinking = $state(false);
  let showPatternSave = $state(false);
  let chatContainer: HTMLDivElement | undefined = $state();

  // ─── Analysis Stack ──────────────────────────────────────
  let analysisStack = $state<Array<{
    id: string;
    layer: string;
    description: string;
    score: number;
    reaction: '✓' | '✗' | '?' | null;
  }>>([]);

  // ─── Initial message ────────────────────────────────────
  onMount(() => {
    const hour = new Date().getHours();
    let greeting: string;
    if (hour >= 6 && hour < 12) greeting = '좋은 아침! 어젯밤 시장 정리해놨어.';
    else if (hour >= 12 && hour < 18) greeting = '오후야! 뭐 볼까?';
    else if (hour >= 18 && hour < 24) greeting = '오늘 수고했어. 분석 시작해볼까?';
    else greeting = '아직 안 자? 시장은 24시간이지만 너는 아니야.';

    messages.push({
      role: 'douni',
      text: greeting,
      timestamp: Date.now(),
    });
  });

  // ─── Send Message ────────────────────────────────────────
  function handleSend() {
    const text = inputText.trim();
    if (!text || isThinking) return;

    messages.push({ role: 'user', text, timestamp: Date.now() });
    inputText = '';
    isThinking = true;

    // Simulate DOUNI response (실제로는 SSE 스트리밍)
    setTimeout(() => {
      // Mock analysis based on input
      const isBtc = text.toLowerCase().includes('btc');
      const isEth = text.toLowerCase().includes('eth');
      const symbol = isBtc ? 'BTC' : isEth ? 'ETH' : 'BTC';

      // Add analysis stack items
      analysisStack = [
        { id: '1', layer: 'L11', description: `CVD BEARISH_DIVERGENCE`, score: -25, reaction: null },
        { id: '2', layer: 'L2', description: `FR 0.12% — 롱 과열`, score: -15, reaction: null },
        { id: '3', layer: 'L1', description: `와이코프 DISTRIBUTION`, score: -20, reaction: null },
      ];

      messages.push({
        role: 'douni',
        text: `${symbol} 4H 봤어. CVD가 베어리시 다이버전스야. 펀딩비도 0.12%로 과열이고. 와이코프로 보면 분배 단계 같아. 여기서 숏 각인데?`,
        timestamp: Date.now(),
      });

      isThinking = false;
      showPatternSave = true;

      // Scroll to bottom
      requestAnimationFrame(() => {
        chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
      });
    }, 1500);

    onSendMessage(text);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function reactToStack(id: string, reaction: '✓' | '✗') {
    analysisStack = analysisStack.map(s =>
      s.id === id ? { ...s, reaction } : s
    );
    // 1개 이상 ✓ 있으면 패턴 저장 활성화
    showPatternSave = analysisStack.some(s => s.reaction === '✓');
  }

  // ─── Archetype meta ──────────────────────────────────────
  const archetypeIcons: Record<string, string> = {
    CRUSHER: '🗡', RIDER: '🏄', ORACLE: '🔮', GUARDIAN: '🛡'
  };
</script>

<div class="douni-chat">
  <!-- Header -->
  <div class="chat-header">
    <div class="douni-avatar">
      <span class="owl-emoji">🐦</span>
      <span class="stage-badge">{stage}</span>
    </div>
    <div class="douni-info">
      <span class="douni-name">{douniName}</span>
      <span class="archetype-tag">{archetypeIcons[archetype] ?? '🏄'} {archetype}</span>
    </div>
  </div>

  <!-- Messages -->
  <div class="chat-messages" bind:this={chatContainer}>
    {#each messages as msg}
      <div class="message {msg.role}">
        {#if msg.role === 'douni'}
          <span class="msg-avatar">🐦</span>
        {/if}
        <div class="msg-bubble {msg.role}">
          {msg.text}
        </div>
      </div>
    {/each}

    {#if isThinking}
      <div class="message douni">
        <span class="msg-avatar">🐦</span>
        <div class="msg-bubble douni thinking">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Analysis Stack -->
  {#if analysisStack.length > 0}
    <div class="analysis-stack">
      <div class="stack-title">분석 스택</div>
      {#each analysisStack as item}
        <div class="stack-item">
          <span class="stack-layer">{item.layer}</span>
          <span class="stack-desc">{item.description}</span>
          <span class="stack-score" class:negative={item.score < 0} class:positive={item.score > 0}>
            {item.score > 0 ? '+' : ''}{item.score}
          </span>
          <div class="stack-reactions">
            <button
              class="reaction-btn"
              class:active={item.reaction === '✓'}
              onclick={() => reactToStack(item.id, '✓')}
            >✓</button>
            <button
              class="reaction-btn"
              class:active={item.reaction === '✗'}
              onclick={() => reactToStack(item.id, '✗')}
            >✗</button>
          </div>
        </div>
      {/each}

      {#if showPatternSave}
        <button class="pattern-save-btn" onclick={onSavePattern}>
          📌 패턴으로 저장
        </button>
      {/if}
    </div>
  {/if}

  <!-- Input -->
  <div class="chat-input">
    <input
      type="text"
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder="BTC 4H 라고 입력해봐! →"
      disabled={isThinking}
    />
    <button class="send-btn" onclick={handleSend} disabled={isThinking || !inputText.trim()}>
      →
    </button>
  </div>
</div>

<style>
  .douni-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a0a0f;
    border-right: 1px solid #1a1a2e;
  }

  /* Header */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #1a1a2e;
    background: #0d0d14;
  }
  .douni-avatar {
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a3e;
    border-radius: 12px;
    font-size: 20px;
  }
  .stage-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    font-size: 8px;
    background: #3b82f6;
    color: white;
    padding: 1px 4px;
    border-radius: 4px;
    font-weight: 700;
  }
  .douni-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .douni-name {
    font-weight: 700;
    color: #e0e0ff;
    font-size: 14px;
  }
  .archetype-tag {
    font-size: 11px;
    color: #7878a0;
  }

  /* Messages */
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .message {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .message.user {
    flex-direction: row-reverse;
  }
  .msg-avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .msg-bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 13px;
    line-height: 1.5;
  }
  .msg-bubble.douni {
    background: #1a1a3e;
    color: #d0d0f0;
    border-bottom-left-radius: 4px;
  }
  .msg-bubble.user {
    background: #3b82f6;
    color: white;
    border-bottom-right-radius: 4px;
  }

  /* Thinking dots */
  .thinking {
    display: flex;
    gap: 4px;
    padding: 12px 18px;
  }
  .dot {
    width: 6px;
    height: 6px;
    background: #5858a0;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }
  .dot:nth-child(1) { animation-delay: -0.32s; }
  .dot:nth-child(2) { animation-delay: -0.16s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* Analysis Stack */
  .analysis-stack {
    border-top: 1px solid #1a1a2e;
    padding: 12px 16px;
    background: #0d0d14;
  }
  .stack-title {
    font-size: 11px;
    color: #5858a0;
    margin-bottom: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .stack-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #12121e;
  }
  .stack-layer {
    font-size: 11px;
    font-weight: 700;
    color: #7878b0;
    min-width: 32px;
  }
  .stack-desc {
    flex: 1;
    font-size: 12px;
    color: #a0a0c0;
  }
  .stack-score {
    font-size: 12px;
    font-weight: 700;
    min-width: 32px;
    text-align: right;
  }
  .stack-score.negative { color: #ef4444; }
  .stack-score.positive { color: #22c55e; }
  .stack-reactions {
    display: flex;
    gap: 4px;
  }
  .reaction-btn {
    width: 28px;
    height: 28px;
    border: 1px solid #2a2a4e;
    background: transparent;
    color: #7878a0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.15s;
  }
  .reaction-btn:hover {
    background: #1a1a3e;
    color: white;
  }
  .reaction-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  /* Pattern Save */
  .pattern-save-btn {
    width: 100%;
    margin-top: 10px;
    padding: 10px;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .pattern-save-btn:hover {
    opacity: 0.9;
  }

  /* Input */
  .chat-input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #1a1a2e;
    background: #0a0a0f;
  }
  .chat-input input {
    flex: 1;
    padding: 10px 14px;
    background: #12121e;
    border: 1px solid #2a2a4e;
    border-radius: 10px;
    color: #d0d0f0;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .chat-input input:focus {
    border-color: #3b82f6;
  }
  .chat-input input::placeholder {
    color: #4a4a6e;
  }
  .send-btn {
    width: 40px;
    height: 40px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 18px;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .send-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .send-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  /* Scrollbar */
  .chat-messages::-webkit-scrollbar { width: 4px; }
  .chat-messages::-webkit-scrollbar-thumb { background: #2a2a4e; border-radius: 2px; }
</style>
