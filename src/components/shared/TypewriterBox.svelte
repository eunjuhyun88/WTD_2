<!-- ═══════════════════════════════════════════
  TypewriterBox.svelte — Bottom-fixed text box
  Typewriter effect with blinking cursor
═══════════════════════════════════════════ -->
<script lang="ts">
  import { onDestroy } from 'svelte';

  const { messages = [], speed = 30, onComplete = undefined }: {
    messages: string[];
    speed?: number;
    onComplete?: (() => void) | undefined;
  } = $props();

  let displayText = $state('');
  let cursorVisible = $state(false);
  let msgIndex = $state(0);
  let charIndex = $state(0);
  let typingDone = $state(false);

  let typeTimer: ReturnType<typeof setInterval> | null = null;
  let cursorTimer: ReturnType<typeof setInterval> | null = null;

  function startTyping() {
    if (typeTimer) clearInterval(typeTimer);
    typingDone = false;
    cursorVisible = false;

    typeTimer = setInterval(() => {
      if (msgIndex >= messages.length) {
        if (typeTimer) clearInterval(typeTimer);
        typingDone = true;
        startCursorBlink();
        onComplete?.();
        return;
      }

      const currentMsg = messages[msgIndex];
      if (charIndex < currentMsg.length) {
        displayText += currentMsg[charIndex];
        charIndex++;
      } else {
        // Move to next message
        displayText += '\n';
        msgIndex++;
        charIndex = 0;
      }
    }, speed);
  }

  function startCursorBlink() {
    if (cursorTimer) clearInterval(cursorTimer);
    cursorTimer = setInterval(() => {
      cursorVisible = !cursorVisible;
    }, 500);
  }

  // Reset and start when messages change
  $effect(() => {
    if (messages.length > 0) {
      displayText = '';
      msgIndex = 0;
      charIndex = 0;
      startTyping();
    }
  });

  onDestroy(() => {
    if (typeTimer) clearInterval(typeTimer);
    if (cursorTimer) clearInterval(cursorTimer);
  });
</script>

<div class="typewriter-box">
  <div class="tw-border" />
  <div class="tw-content">
    {#each displayText.split('\n') as line, i}
      {#if i > 0}<br />{/if}
      <span class="tw-prefix">&gt; </span>{line}
    {/each}
    {#if typingDone && cursorVisible}
      <span class="tw-cursor">&#9660;</span>
    {/if}
  </div>
</div>

<style>
  .typewriter-box {
    position: relative;
    background: #0e0e1a;
    border: 3px solid #3a3a5c;
    border-radius: 8px;
    min-height: 64px;
    max-height: 80px;
    flex-shrink: 0;
  }
  .tw-border {
    position: absolute;
    inset: 2px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 5px;
    pointer-events: none;
  }
  .tw-content {
    padding: 10px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    color: #e0e0e0;
    line-height: 1.5;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tw-prefix {
    color: #e8967d;
    font-weight: 700;
  }
  .tw-cursor {
    display: inline-block;
    margin-left: 4px;
    font-size: 10px;
    color: #e8967d;
    animation: cursorBlink 1s step-end infinite;
  }
  @keyframes cursorBlink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
</style>
