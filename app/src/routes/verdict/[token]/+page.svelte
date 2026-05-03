<script lang="ts">
  import { goto } from '$app/navigation';
  import type { CaptureInfo } from '$lib/server/verdictToken';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  type VerdictStatus = 'ready' | 'expired' | 'invalid' | 'submitted';
  type VerdictChoice = 'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late';

  let status = $state<VerdictStatus>(data.tokenStatus as VerdictStatus);
  let captureInfo = $state<CaptureInfo | null>(data.captureInfo);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // Swipe state
  let swipeStartX = $state(0);
  let swipeStartTime = $state(0);
  let swipeDeltaX = $state(0);
  let isSwiping = $state(false);
  let flashOverlay = $state<'agree' | 'disagree' | null>(null);
  const SWIPE_THRESHOLD = 80;
  const VELOCITY_THRESHOLD = 0.3;

  // Derived card rotation: clamp between -3deg and +3deg
  const cardRotation = $derived(
    isSwiping
      ? Math.max(-3, Math.min(3, (swipeDeltaX / SWIPE_THRESHOLD) * 3))
      : 0
  );


  async function submitVerdict(verdict: VerdictChoice) {
    if (!captureInfo || submitting) return;
    submitting = true;
    error = null;
    try {
      const res = await fetch(`/api/captures/${captureInfo.capture_id}/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        error = (body as { detail?: string }).detail ?? `Error ${res.status}`;
        return;
      }
      status = 'submitted';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      submitting = false;
    }
  }

  function fmtSlug(slug: string) {
    return slug.replace(/-v\d+$/, '').replace(/-/g, ' ');
  }

  // ── Pointer / swipe handlers ──────────────────────────────────────────────

  function onPointerDown(e: PointerEvent) {
    if (status !== 'ready' || submitting) return;
    swipeStartX = e.clientX;
    swipeStartTime = Date.now();
    swipeDeltaX = 0;
    isSwiping = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isSwiping) return;
    swipeDeltaX = e.clientX - swipeStartX;
  }

  function onPointerUp(e: PointerEvent) {
    if (!isSwiping) return;
    isSwiping = false;

    const delta = e.clientX - swipeStartX;
    const elapsed = Date.now() - swipeStartTime;
    const velocity = Math.abs(delta) / Math.max(elapsed, 1);

    const meetsThreshold = Math.abs(delta) >= SWIPE_THRESHOLD;
    const meetsVelocity = velocity >= VELOCITY_THRESHOLD;

    if (meetsThreshold || meetsVelocity) {
      if (delta > 0) {
        // Swipe right → agree (valid)
        flashOverlay = 'agree';
        setTimeout(() => { flashOverlay = null; }, 500);
        submitVerdict('valid');
      } else {
        // Swipe left → disagree (invalid)
        flashOverlay = 'disagree';
        setTimeout(() => { flashOverlay = null; }, 500);
        submitVerdict('invalid');
      }
    }

    swipeDeltaX = 0;
  }

  function onPointerCancel() {
    isSwiping = false;
    swipeDeltaX = 0;
  }
</script>

<svelte:head>
  <title>{captureInfo ? `${captureInfo.symbol} Verdict — Cogochi` : 'Verdict — Cogochi'}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="verdict-page">
  {#if status === 'invalid'}
    <div class="verdict-card verdict-card--error">
      <h2>Invalid link</h2>
      <p class="verdict-meta">The link is corrupted or malformed.</p>
      <button class="verdict-btn-secondary" onclick={() => goto('/cogochi')}>Home</button>
    </div>

  {:else if status === 'expired'}
    <div class="verdict-card verdict-card--error">
      <h2>Expired link</h2>
      <p class="verdict-meta">Verdict links are valid for 72 hours. Please submit a verdict directly in the app.</p>
      <button class="verdict-btn-secondary" onclick={() => goto('/dashboard')}>Dashboard</button>
    </div>

  {:else if status === 'submitted'}
    <div class="verdict-card verdict-card--success">
      <div class="verdict-icon">✓</div>
      <h2>Verdict submitted</h2>
      <p class="verdict-meta">Feedback recorded. Patterns improve automatically once 10+ verdicts are collected.</p>
      <a class="verdict-cta" href="/cogochi">cogochi에서 더 분석하기 →</a>
      <button class="verdict-btn-secondary" onclick={() => goto('/dashboard')}>Go to Dashboard</button>
    </div>

  {:else if status === 'ready' && captureInfo}
    <div
      class="verdict-card verdict-card--swipeable"
      role="group"
      aria-label="Swipeable verdict card"
      style:transform="rotate({cardRotation}deg)"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
    >
      {#if flashOverlay === 'agree'}
        <div class="verdict-flash verdict-flash--agree" aria-hidden="true"></div>
      {:else if flashOverlay === 'disagree'}
        <div class="verdict-flash verdict-flash--disagree" aria-hidden="true"></div>
      {/if}

      <div class="verdict-header">
        <span class="verdict-kicker">Submit Verdict</span>
        <h2 class="verdict-symbol">{captureInfo.symbol}</h2>
        <p class="verdict-meta">{fmtSlug(captureInfo.pattern_slug)}</p>
        <p class="verdict-swipe-hint">← 왼쪽 스와이프: 불일치 &nbsp;|&nbsp; 오른쪽 스와이프: 일치 →</p>
      </div>

      {#if error}
        <p class="verdict-error">{error}</p>
      {/if}

      <div class="verdict-grid">
        <button
          class="verdict-choice verdict-valid"
          disabled={submitting}
          onclick={() => submitVerdict('valid')}
        >
          <span class="verdict-emoji">✅</span>
          <strong>Valid</strong>
          <span>Profitable entry</span>
        </button>
        <button
          class="verdict-choice verdict-invalid"
          disabled={submitting}
          onclick={() => submitVerdict('invalid')}
        >
          <span class="verdict-emoji">✗</span>
          <strong>Invalid</strong>
          <span>Wrong pattern / Loss</span>
        </button>
        <button
          class="verdict-choice verdict-near-miss"
          disabled={submitting}
          onclick={() => submitVerdict('near_miss')}
        >
          <span class="verdict-emoji">~</span>
          <strong>Near Miss</strong>
          <span>Pattern correct, entry missed</span>
        </button>
        <button
          class="verdict-choice verdict-too-early"
          disabled={submitting}
          onclick={() => submitVerdict('too_early')}
        >
          <span class="verdict-emoji">⏫</span>
          <strong>Too Early</strong>
          <span>Entered too early</span>
        </button>
        <button
          class="verdict-choice verdict-too-late"
          disabled={submitting}
          onclick={() => submitVerdict('too_late')}
        >
          <span class="verdict-emoji">⏰</span>
          <strong>Too Late</strong>
          <span>Missed entry timing</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .verdict-page {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100dvh;
    padding: 24px 16px;
    background: var(--sc-bg, #0d0d0d);
  }

  .verdict-card {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 32px 24px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
    position: relative;
    overflow: hidden;
  }

  .verdict-card--swipeable {
    cursor: grab;
    touch-action: pan-y;
    transition: transform 100ms ease-out;
    user-select: none;
  }

  .verdict-card--swipeable:active {
    cursor: grabbing;
  }

  .verdict-card--error { border-color: rgba(239,68,68,0.3); }
  .verdict-card--success { border-color: rgba(34,197,94,0.3); align-items: center; text-align: center; }

  .verdict-icon {
    font-size: 2.5rem;
    color: #86efac;
  }

  .verdict-header { display: flex; flex-direction: column; gap: 4px; }
  .verdict-kicker { font-size: var(--ui-text-xs, 0.75rem); text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.4); }
  .verdict-symbol { font-size: 1.8rem; font-weight: 700; letter-spacing: 0.02em; margin: 0; }
  .verdict-meta { color: rgba(255,255,255,0.5); font-size: 0.88rem; margin: 0; }
  .verdict-error { color: #f87171; font-size: 0.88rem; margin: 0; }

  .verdict-swipe-hint {
    font-size: var(--ui-text-xs, 0.75rem);
    color: rgba(255,255,255,0.3);
    margin: 4px 0 0 0;
  }

  /* Flash overlays */
  .verdict-flash {
    position: absolute;
    inset: 0;
    border-radius: 12px;
    pointer-events: none;
    animation: flash-fade 500ms ease-out forwards;
    z-index: 10;
  }

  .verdict-flash--agree { background: rgba(74, 222, 128, 0.25); }
  .verdict-flash--disagree { background: rgba(248, 113, 113, 0.25); }

  @keyframes flash-fade {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }

  .verdict-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .verdict-grid > :last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }

  .verdict-choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    cursor: pointer;
    transition: transform 80ms, border-color 80ms;
  }
  .verdict-choice:hover:not(:disabled) { transform: translateY(-2px); }
  .verdict-choice:disabled { opacity: 0.4; cursor: not-allowed; }
  .verdict-choice .verdict-emoji { font-size: 1.4rem; }
  .verdict-choice strong { font-size: 0.9rem; color: rgba(255,255,255,0.9); }
  .verdict-choice span { font-size: var(--ui-text-xs, 0.75rem); color: rgba(255,255,255,0.45); }

  .verdict-valid  { border-color: rgba(34,197,94,0.25); }
  .verdict-valid:hover:not(:disabled) { border-color: rgba(34,197,94,0.5); }
  .verdict-invalid { border-color: rgba(239,68,68,0.25); }
  .verdict-invalid:hover:not(:disabled) { border-color: rgba(239,68,68,0.5); }
  .verdict-near-miss { border-color: rgba(148,163,184,0.25); }
  .verdict-too-early { border-color: rgba(147,51,234,0.25); }
  .verdict-too-late  { border-color: rgba(250,204,21,0.25); }

  .verdict-btn-secondary {
    padding: 10px 24px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: transparent;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .verdict-btn-secondary:hover { background: rgba(255,255,255,0.06); }

  .verdict-cta {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 8px;
    background: rgba(245, 166, 35, 0.15);
    border: 1px solid rgba(245, 166, 35, 0.3);
    color: var(--amb, #f5a623);
    font-size: 0.9rem;
    text-decoration: none;
    transition: background 80ms;
  }
  .verdict-cta:hover { background: rgba(245, 166, 35, 0.25); }
</style>
