<script lang="ts">
  import { parseDirectives } from '$lib/agent/directives';
  import type { Segment, VerdictCardPayload, SimilarityCardPayload, PassportCardPayload } from '$lib/agent/directives';
  import VerdictCard from './cards/VerdictCard.svelte';
  import SimilarityCard from './cards/SimilarityCard.svelte';
  import PassportMiniCard from './cards/PassportMiniCard.svelte';

  interface Message { role: 'user' | 'assistant'; text: string; streaming?: boolean; }
  interface Props {
    symbol?: string;
    timeframe?: string;
    onSelectSymbol?: (s: string) => void;
  }
  let { symbol = 'BTCUSDT', timeframe = '4h', onSelectSymbol }: Props = $props();

  let messages = $state<Message[]>([]);
  let input = $state('');
  let busy = $state(false);
  let bottomEl = $state<HTMLDivElement | null>(null);

  function scrollBottom() { bottomEl?.scrollIntoView({ behavior: 'smooth' }); }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    input = '';
    busy = true;
    messages = [...messages, { role: 'user', text }];
    messages = [...messages, { role: 'assistant', text: '', streaming: true }];
    scrollBottom();

    try {
      const res = await fetch('/api/terminal/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, symbol, timeframe }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let lastEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            lastEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6)) as { text?: string; name?: string; input?: unknown };
              if (lastEvent === 'chunk' && d.text) {
                messages = messages.map((m, i) =>
                  i === messages.length - 1 ? { ...m, text: m.text + d.text } : m
                );
              } else if (lastEvent === 'tool_call' && d.name) {
                const trace = `\n[tool: ${d.name}]`;
                messages = messages.map((m, i) =>
                  i === messages.length - 1 ? { ...m, text: m.text + trace } : m
                );
              }
            } catch { /* skip malformed */ }
            lastEvent = '';
          }
        }
      }
    } catch (err) {
      messages = messages.map((m, i) =>
        i === messages.length - 1 ? { ...m, text: '⚠ Error: ' + String(err), streaming: false } : m
      );
    } finally {
      messages = messages.map((m, i) =>
        i === messages.length - 1 ? { ...m, streaming: false } : m
      );
      busy = false;
      scrollBottom();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  function getSegments(msg: Message): Segment[] {
    if (msg.role === 'user') return [{ kind: 'text', text: msg.text }];
    return parseDirectives(msg.text);
  }
</script>

<div class="chat-thread">
  <div class="messages">
    {#each messages as msg}
      {@const segs = getSegments(msg)}
      <div class="msg msg--{msg.role}">
        {#each segs as seg, si}
          {#if seg.kind === 'text'}
            <span class="msg-text">{seg.text}{#if msg.streaming && si === segs.length - 1}<span class="cursor">&#x2587;</span>{/if}</span>
          {:else if seg.directive.type === 'verdict_card'}
            <VerdictCard payload={seg.directive.payload as VerdictCardPayload} {onSelectSymbol} />
          {:else if seg.directive.type === 'similarity_card'}
            <SimilarityCard payload={seg.directive.payload as SimilarityCardPayload} />
          {:else if seg.directive.type === 'passport_card'}
            <PassportMiniCard payload={seg.directive.payload as PassportCardPayload} />
          {/if}
        {/each}
      </div>
    {/each}
    <div bind:this={bottomEl}></div>
  </div>
  <div class="input-row">
    <textarea
      class="chat-input"
      bind:value={input}
      onkeydown={onKeydown}
      placeholder="Ask anything about {symbol}…"
      rows={2}
      disabled={busy}
    ></textarea>
    <button class="send-btn" onclick={() => void send()} disabled={busy || !input.trim()}>
      {busy ? '…' : '↑'}
    </button>
  </div>
</div>

<style>
.chat-thread { display: flex; flex-direction: column; height: 100%; gap: 0; }
.messages { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.msg { max-width: 95%; padding: 6px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5; display: flex; flex-direction: column; gap: 6px; }
.msg--user { align-self: flex-end; background: #1a3a5c; color: #cce8ff; max-width: 80%; }
.msg--assistant { align-self: flex-start; background: #1a1a2e; color: #c8ccd4; }
.msg-text { white-space: pre-wrap; word-break: break-word; }
.cursor { animation: blink 1s step-end infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
.input-row { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #2a2a3a; }
.chat-input { flex: 1; background: #0e0e1a; color: #c8ccd4; border: 1px solid #2a2a3a; border-radius: 6px; padding: 6px 8px; font-size: 12px; resize: none; font-family: inherit; }
.chat-input:focus { outline: none; border-color: #4a6fa5; }
.send-btn { background: #1a3a5c; color: #cce8ff; border: none; border-radius: 6px; width: 32px; cursor: pointer; font-size: 16px; }
.send-btn:disabled { opacity: 0.4; cursor: default; }
</style>
