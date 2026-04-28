<script lang="ts">
  let open = $state(false);
  let body = $state('');
  let sending = $state(false);
  let sent = $state(false);
  let err = $state('');

  async function submit() {
    if (!body.trim()) return;
    sending = true;
    err = '';
    try {
      const res = await fetch('/api/beta/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), url: window.location.pathname }),
      });
      if (res.ok) {
        sent = true;
        body = '';
        setTimeout(() => { sent = false; open = false; }, 1800);
      } else {
        const d = await res.json().catch(() => ({}));
        err = (d as any).error ?? 'Failed to send';
      }
    } catch {
      err = 'Network error';
    } finally {
      sending = false;
    }
  }
</script>

<div class="fb-wrap">
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fb-backdrop" onclick={() => (open = false)}></div>
    <div class="fb-panel">
      <div class="fb-header">
        <span>Feedback</span>
        <button class="fb-close" onclick={() => (open = false)} aria-label="Close">✕</button>
      </div>
      {#if sent}
        <p class="fb-sent">Received — thanks!</p>
      {:else}
        <textarea
          class="fb-textarea"
          placeholder="What's broken or confusing? What would you want to see?"
          bind:value={body}
          rows={4}
          disabled={sending}
        ></textarea>
        {#if err}<p class="fb-err">{err}</p>{/if}
        <button class="fb-send" onclick={submit} disabled={sending || !body.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      {/if}
    </div>
  {:else}
    <button class="fb-trigger" onclick={() => (open = true)} aria-label="Send feedback">
      Feedback
    </button>
  {/if}
</div>

<style>
  .fb-wrap {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 900;
  }
  .fb-trigger {
    background: rgba(38,166,154,0.9);
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.06em;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    transition: opacity 0.15s;
  }
  .fb-trigger:hover { opacity: 0.85; }

  .fb-backdrop {
    position: fixed;
    inset: 0;
    z-index: 898;
  }
  .fb-panel {
    position: relative;
    z-index: 899;
    width: 280px;
    background: #1a1f1c;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .fb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .fb-close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.3);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    line-height: 1;
  }
  .fb-close:hover { color: rgba(255,255,255,0.7); }

  .fb-textarea {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: rgba(255,255,255,0.85);
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    line-height: 1.5;
    padding: 8px;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }
  .fb-textarea:focus { outline: none; border-color: rgba(38,166,154,0.5); }
  .fb-textarea::placeholder { color: rgba(255,255,255,0.2); }

  .fb-send {
    background: rgba(38,166,154,0.85);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    align-self: flex-end;
    transition: opacity 0.15s;
  }
  .fb-send:disabled { opacity: 0.4; cursor: default; }
  .fb-send:not(:disabled):hover { opacity: 0.85; }

  .fb-sent { font-size: 12px; color: #4ade80; font-family: var(--sc-font-mono, monospace); text-align: center; padding: 8px 0; }
  .fb-err  { font-size: 10px; color: #f87171; font-family: var(--sc-font-mono, monospace); margin: 0; }

  @media (max-width: 640px) {
    .fb-wrap { bottom: 72px; right: 16px; }
  }
</style>
