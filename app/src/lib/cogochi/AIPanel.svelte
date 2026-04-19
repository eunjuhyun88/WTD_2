<script lang="ts">
  interface Message {
    role: 'user' | 'assistant';
    text: string;
  }

  interface Props {
    messages: Message[];
    onSend: (text: string) => void;
    onClose: () => void;
  }

  const { messages, onSend, onClose }: Props = $props();

  let inputValue = $state('');
  let containerRef: HTMLDivElement;

  function send() {
    if (inputValue.trim()) {
      onSend(inputValue);
      inputValue = '';
    }
  }

  $effect(() => {
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  });
</script>

<div class="panel">
  <div class="header">
    <span class="title">AI Assistant</span>
    <button class="close-btn" onclick={onClose} title="Close AI panel (⌘L)">×</button>
  </div>

  <div class="messages" bind:this={containerRef}>
    {#each messages as msg, i (i)}
      <div class="message" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
        <div class="avatar">{msg.role === 'user' ? 'U' : 'A'}</div>
        <div class="content">{msg.text}</div>
      </div>
    {/each}
  </div>

  <div class="input-area">
    <textarea
      placeholder="Ask me anything… (natural language or /command)"
      bind:value={inputValue}
      onkeydown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          send();
        }
      }}
    />
    <button class="send-btn" onclick={send}>Send</button>
  </div>
</div>

<style>
  .panel {
    width: 320px;
    flex-shrink: 0;
    background: var(--g1);
    border-left: 0.5px solid var(--g3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
  }

  .title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g8);
    font-weight: 500;
    letter-spacing: 0.05em;
    flex: 1;
  }

  .close-btn {
    font-size: 18px;
    color: var(--g5);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 4px;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: var(--g7);
  }

  .messages {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .message {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .message.user {
    flex-direction: row-reverse;
  }

  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 3px;
    background: var(--g3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
    flex-shrink: 0;
  }

  .message.user .avatar {
    background: var(--pos-d);
    color: var(--pos);
  }

  .content {
    font-size: 10px;
    color: var(--g7);
    line-height: 1.4;
    word-break: break-word;
    max-width: 260px;
  }

  .input-area {
    display: flex;
    gap: 6px;
    padding: 10px;
    border-top: 0.5px solid var(--g3);
    flex-shrink: 0;
  }

  textarea {
    flex: 1;
    background: var(--g2);
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 10px;
    color: var(--g9);
    resize: none;
    min-height: 32px;
    max-height: 80px;
    transition: all 0.15s;
  }

  textarea:focus {
    border-color: var(--pos);
    background: var(--g2);
  }

  textarea::placeholder {
    color: var(--g5);
  }

  .send-btn {
    padding: 6px 10px;
    background: var(--pos-d);
    color: var(--pos);
    border: 0.5px solid var(--pos-d);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .send-btn:hover {
    background: var(--pos);
    color: var(--g0);
    border-color: var(--pos);
  }
</style>
