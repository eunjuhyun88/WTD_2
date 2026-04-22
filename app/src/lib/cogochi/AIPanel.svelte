<script lang="ts">
  /**
   * AIPanel — right side AI setup assist panel.
   * Natural language → setup tokens → scan trigger.
   *
   * Indicator intent detection runs BEFORE the setup-token parser.
   * If the query matches an indicator (via search.ts), the AI responds
   * with indicator info and dispatches cogochi:cmd { id: 'focus_indicator', def }.
   */
  import { findIndicatorByQuery } from '$lib/indicators/search';

  interface SetupToken {
    kind: 'asset' | 'trigger' | 'filter';
    label: string;
  }

  interface SetupResult {
    tokens: SetupToken[];
    matches: number;
    past: number;
    text: string;
  }

  interface Message {
    role: 'user' | 'assistant';
    text: string;
    setup?: SetupResult;
  }

  interface Props {
    messages?: Message[];
    onSend?: (text: string, newMessages: Message[]) => void;
    onApplySetup?: (setup: SetupResult) => void;
    onClose?: () => void;
  }

  let {
    messages = [],
    onSend,
    onApplySetup,
    onClose,
  }: Props = $props();

  // Local copy — keeps AI replies even while store updates
  let localMessages = $state<Message[]>(messages);
  $effect(() => {
    if (messages.length !== localMessages.length) localMessages = messages;
  });

  let inputValue = $state('');
  let scrollEl: HTMLDivElement | undefined = $state();

  const quicks = [
    'OI 급증 후 번지대 3시간 accumulation',
    'VWAP reclaim + CVD 양전환',
    'real_dump 후 higher-lows + funding 플립',
    'BB squeeze 해제, 15분',
  ];

  function send() {
    const t = inputValue.trim();
    if (!t) return;

    // ── Indicator intent detection (runs before setup-token parser) ──────────
    const indicatorDef = findIndicatorByQuery(t);
    if (indicatorDef) {
      const isShowIntent = /보여|show|확인|뭐야|어때|what|check/i.test(t);
      const aiText = isShowIntent
        ? `**${indicatorDef.label ?? indicatorDef.id}** 지표를 찾았습니다 — ${indicatorDef.description ?? ''}. 아래 분석 패널에서 강조 표시합니다.`
        : `**${indicatorDef.label ?? indicatorDef.id}** (${indicatorDef.family}) — ${indicatorDef.description ?? '해당 지표입니다.'} 패널로 이동합니다.`;

      // Dispatch focus command so TradeMode can scroll/highlight the pane
      window.dispatchEvent(new CustomEvent('cogochi:cmd', {
        detail: { id: 'focus_indicator', indicatorId: indicatorDef.id, def: indicatorDef },
      }));

      const newMessages: Message[] = [
        ...localMessages,
        { role: 'user', text: t },
        { role: 'assistant', text: aiText },
      ];
      localMessages = newMessages;
      onSend?.(t, newMessages);
      inputValue = '';
      return;
    }

    // ── Fallthrough: setup-token parser ─────────────────────────────────────
    const setup = convertPromptToSetup(t);
    const aiText = generateAIReply(t, setup);
    const newMessages: Message[] = [
      ...localMessages,
      { role: 'user', text: t },
      { role: 'assistant', text: aiText, setup },
    ];
    localMessages = newMessages;
    onSend?.(t, newMessages);
    inputValue = '';
  }

  function quickPick(q: string) {
    inputValue = q;
  }

  function convertPromptToSetup(text: string): SetupResult {
    const lower = text.toLowerCase();
    const tokens: SetupToken[] = [];

    const assetM = lower.match(/btc|eth|sol|arb|link|avax|jup|doge|ondo|wif/);
    tokens.push({ kind: 'asset', label: assetM ? `@${assetM[0]}` : '@any' });

    if (/3\s*(시간|h)/.test(lower)) tokens.push({ kind: 'asset', label: '@3시간' });
    else if (/4\s*(시간|h)/.test(lower)) tokens.push({ kind: 'asset', label: '@4h' });
    else if (/15\s*(분|m)/.test(lower)) tokens.push({ kind: 'asset', label: '@15m' });

    if (/oi|open.?interest|급증/.test(lower)) tokens.push({ kind: 'trigger', label: 'oi_spike' });
    if (/real.?dump|덤프/.test(lower))        tokens.push({ kind: 'trigger', label: 'real_dump' });
    if (/accumulation|번지|accum/.test(lower)) tokens.push({ kind: 'trigger', label: 'accumulation' });
    if (/vwap|reclaim/.test(lower))            tokens.push({ kind: 'trigger', label: 'vwap_reclaim' });
    if (/bb|bollinger|squeeze/.test(lower))    tokens.push({ kind: 'trigger', label: 'bb_expansion' });
    if (/higher.?low|hl/.test(lower))          tokens.push({ kind: 'trigger', label: 'higher_lows' });
    if (/funding|펀딩|플립/.test(lower))       tokens.push({ kind: 'filter', label: 'funding_flip' });
    if (/cvd|양전환/.test(lower))              tokens.push({ kind: 'filter', label: 'cvd_positive' });
    if (/3\s*(시간|h)/.test(lower))            tokens.push({ kind: 'filter', label: 'duration>3h' });

    if (tokens.filter(t => t.kind === 'trigger' || t.kind === 'filter').length === 0) {
      tokens.push({ kind: 'trigger', label: 'tradoor_v2' });
    }

    return {
      tokens,
      matches: Math.floor(Math.random() * 8) + 4,
      past: Math.floor(Math.random() * 8) + 8,
      text,
    };
  }

  function generateAIReply(text: string, setup: SetupResult): string {
    const triggers = setup.tokens.filter(t => t.kind === 'trigger' || t.kind === 'filter').map(t => t.label);
    return `"${text}" 를 **${triggers.join(' + ') || 'tradoor_v2'}** 셋업으로 해석했습니다. 현재 ${setup.matches}개 종목이 같은 모양이고, 과거 유사 케이스 ${setup.past}건 확인 가능합니다.`;
  }

  $effect(() => {
    localMessages; // track changes
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  function tokenStyle(kind: string): { bg: string; color: string; border: string } {
    if (kind === 'asset')   return { bg: 'var(--g3)',     color: 'var(--g9)',  border: 'var(--g4)' };
    if (kind === 'trigger') return { bg: 'var(--pos-dd)', color: 'var(--pos)', border: 'var(--pos-d)' };
    return                         { bg: 'var(--amb-dd)', color: 'var(--amb)', border: 'var(--amb-d)' };
  }
</script>

<div class="panel">
  <!-- Header -->
  <div class="hdr">
    <span class="ai-dot"></span>
    <span class="ai-title">AI · SETUP ASSIST</span>
    <span class="spacer"></span>
    <span class="kbd">⌘L</span>
    <button class="close" onclick={onClose}>×</button>
  </div>

  <!-- Messages / welcome -->
  <div class="messages" bind:this={scrollEl}>
    {#if messages.length === 0}
      <!-- Welcome -->
      <div class="welcome">
        <div class="wl-section">AI · HOW TO</div>
        <p class="wl-text">
          찾고 싶은 셋업을 말로 설명하세요.<br/>
          예: <em class="wl-example">"OI 급증 후 번지대 3시간"</em><br/>
          <span class="wl-hint">→ 변환된 셋업을 <strong class="wl-run">Run</strong>하면 왼쪽 캔버스가 분석을 띄웁니다.</span>
        </p>
        <div class="wl-section">QUICK</div>
        <div class="wl-picks">
          {#each quicks as q}
            <button class="wl-pick" onclick={() => quickPick(q)}>
              <span class="pick-slash">/</span>
              {q}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      {#each messages as msg}
        {#if msg.role === 'user'}
          <div class="msg-user">
            <div class="msg-from">YOU</div>
            <div class="msg-bubble user">{msg.text}</div>
          </div>
        {:else}
          <div class="msg-ai">
            <div class="msg-from ai">
              <span class="ai-dot-sm"></span>
              AI
            </div>
            <div class="msg-text">{msg.text}</div>
            {#if msg.setup}
              <div class="setup-card">
                <div class="setup-title">CONVERTED SETUP</div>
                <div class="setup-tokens">
                  {#each msg.setup.tokens as t}
                    {@const s = tokenStyle(t.kind)}
                    <span class="token" style:background={s.bg} style:color={s.color} style:border-color={s.border}>
                      {t.label}
                    </span>
                  {/each}
                </div>
                <div class="setup-meta">
                  <span>matches <strong>{msg.setup.matches}</strong> now</span>
                  <span class="setup-div">·</span>
                  <span>past <strong>{msg.setup.past}</strong></span>
                  <span class="spacer"></span>
                  <button class="run-btn" onclick={() => onApplySetup?.(msg.setup!)}>RUN →</button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <!-- Input -->
  <div class="input-area">
    <div class="input-box">
      <textarea
        bind:value={inputValue}
        placeholder="셋업을 말로 — 'OI 급증 후 번지대 3시간' ↵"
        rows={2}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      ></textarea>
      <div class="input-footer">
        <span class="context-hint">@btc @4h</span>
        <span class="spacer"></span>
        <span class="enter-hint">↵ send</span>
        <button class="send-btn" class:active={!!inputValue.trim()} onclick={send} disabled={!inputValue.trim()}>
          SEND
        </button>
      </div>
    </div>
    <div class="context-chips">
      {#each ['@btc', '@4h', '@tradoor_v2', '#accumulation'] as c}
        <span class="ctx-chip" onclick={() => inputValue = inputValue + ' ' + c}>{c}</span>
      {/each}
    </div>
  </div>
</div>

<style>
  .panel {
    width: 300px;
    flex-shrink: 0;
    background: var(--g1);
    border-left: 1px solid var(--g5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
  }

  .hdr {
    height: 34px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border-bottom: 1px solid var(--g5);
    background: var(--g0);
    flex-shrink: 0;
  }
  .ai-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .ai-title { font-size: 9px; color: var(--g7); letter-spacing: 0.16em; }
  .spacer { flex: 1; }
  .kbd {
    font-size: 7px;
    padding: 2px 5px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 2px;
    color: var(--g5);
    letter-spacing: 0.1em;
  }
  .close {
    color: var(--g5);
    font-size: 16px;
    padding: 0 3px;
    background: none;
    border: none;
    cursor: pointer;
  }
  .close:hover { color: var(--g7); }

  /* Messages */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Welcome */
  .welcome { display: flex; flex-direction: column; gap: 6px; }
  .wl-section {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    margin-top: 8px;
  }
  .wl-text {
    font-size: 11px;
    color: var(--g7);
    line-height: 1.65;
    margin: 0;
    font-family: 'Geist', sans-serif;
  }
  .wl-example {
    color: var(--g9);
    font-style: normal;
    background: var(--g2);
    padding: 1px 4px;
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
  }
  .wl-hint { color: var(--g6); }
  .wl-run { color: var(--brand); font-style: normal; }
  .wl-picks { display: flex; flex-direction: column; gap: 3px; }
  .wl-pick {
    text-align: left;
    padding: 6px 9px;
    background: var(--g2);
    border: 1px solid var(--g5);
    border-radius: 3px;
    font-size: 10px;
    color: var(--g7);
    line-height: 1.4;
    cursor: pointer;
    font-family: 'Geist', sans-serif;
    transition: background 0.1s;
  }
  .wl-pick:hover { background: var(--g3); }
  .pick-slash { color: var(--brand); margin-right: 5px; font-family: 'JetBrains Mono', monospace; }

  /* Messages */
  .msg-user, .msg-ai { margin-bottom: 12px; }
  .msg-from {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.16em;
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .msg-from.ai { color: var(--brand); }
  .ai-dot-sm { width: 5px; height: 5px; border-radius: 50%; background: var(--brand); }
  .msg-bubble {
    font-size: 11px;
    color: var(--g8);
    line-height: 1.55;
    padding: 6px 9px;
    border-radius: 4px;
    border: 1px solid var(--g5);
    font-family: 'Geist', sans-serif;
  }
  .msg-bubble.user { background: var(--g2); }
  .msg-text {
    font-size: 11px;
    color: var(--g8);
    line-height: 1.6;
    margin-bottom: 6px;
    font-family: 'Geist', sans-serif;
  }

  /* Setup card */
  .setup-card {
    padding: 8px 10px;
    background: var(--g0);
    border: 0.5px solid var(--pos-d);
    border-radius: 4px;
  }
  .setup-title {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.14em;
    margin-bottom: 5px;
  }
  .setup-tokens { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
  .token {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 2px;
    border: 0.5px solid;
    letter-spacing: 0.04em;
  }
  .setup-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 8px;
    color: var(--g6);
  }
  .setup-meta strong { color: var(--g8); }
  .setup-div { color: var(--g4); }
  .run-btn {
    padding: 3px 10px;
    background: var(--brand-dd);
    color: var(--brand);
    border: 0.5px solid var(--brand-d);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }
  .run-btn:hover { background: var(--pos-d); }

  /* Input */
  .input-area {
    border-top: 1px solid var(--g5);
    padding: 9px;
    background: var(--g0);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .input-box {
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    padding: 7px 9px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  textarea {
    background: transparent;
    color: var(--g9);
    font-size: 11px;
    font-family: 'Geist', sans-serif;
    resize: none;
    width: 100%;
    line-height: 1.5;
    border: none;
    outline: none;
  }
  textarea::placeholder { color: var(--g5); }
  .input-footer {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .context-hint { font-size: 8px; color: var(--g5); letter-spacing: 0.08em; }
  .enter-hint { font-size: 7px; color: var(--g5); }
  .send-btn {
    padding: 3px 9px;
    border-radius: 3px;
    background: var(--g3);
    color: var(--g5);
    border: 1px solid var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: all 0.12s;
  }
  .send-btn.active {
    background: var(--brand-dd);
    color: var(--brand);
    border-color: var(--brand-d);
  }
  .send-btn.active:hover { background: var(--brand-d); }

  .context-chips {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .ctx-chip {
    font-size: 8px;
    padding: 2px 6px;
    background: var(--g2);
    color: var(--g6);
    border: 1px solid var(--g5);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .ctx-chip:hover { background: var(--g3); color: var(--g8); }
</style>
