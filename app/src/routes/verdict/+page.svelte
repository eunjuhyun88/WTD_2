<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  interface CaptureInfo {
    capture_id: string;
    symbol: string;
    pattern_slug: string;
    expires_at: number;
  }

  let status = $state<'loading' | 'ready' | 'expired' | 'invalid' | 'submitted'>('loading');
  let captureInfo = $state<CaptureInfo | null>(null);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  function parseToken(token: string): CaptureInfo | null {
    try {
      const [payloadB64] = token.split('.');
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json) as CaptureInfo;
    } catch {
      return null;
    }
  }

  onMount(() => {
    const token = $page.url.searchParams.get('token');
    if (!token) { status = 'invalid'; return; }

    const info = parseToken(token);
    if (!info) { status = 'invalid'; return; }
    if (Date.now() / 1000 > info.expires_at) { status = 'expired'; return; }

    captureInfo = info;
    status = 'ready';
  });

  async function submitVerdict(verdict: 'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late') {
    if (!captureInfo) return;
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
</script>

<svelte:head>
  <title>Verdict — Cogochi</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="verdict-page">
  {#if status === 'loading'}
    <div class="verdict-card"><p class="verdict-meta">링크 확인 중...</p></div>

  {:else if status === 'invalid'}
    <div class="verdict-card verdict-card--error">
      <h2>유효하지 않은 링크</h2>
      <p class="verdict-meta">링크가 손상되었거나 잘못된 형식입니다.</p>
      <button class="verdict-btn-secondary" onclick={() => goto('/cogochi')}>홈으로</button>
    </div>

  {:else if status === 'expired'}
    <div class="verdict-card verdict-card--error">
      <h2>만료된 링크</h2>
      <p class="verdict-meta">Verdict 링크는 72시간 유효합니다. 앱에서 직접 verdict를 제출해주세요.</p>
      <button class="verdict-btn-secondary" onclick={() => goto('/dashboard')}>Dashboard</button>
    </div>

  {:else if status === 'submitted'}
    <div class="verdict-card verdict-card--success">
      <div class="verdict-icon">✓</div>
      <h2>Verdict 제출 완료</h2>
      <p class="verdict-meta">피드백이 기록되었습니다. 10개 이상 모이면 패턴이 자동 개선됩니다.</p>
      <button class="verdict-btn-secondary" onclick={() => goto('/dashboard')}>Dashboard로</button>
    </div>

  {:else if status === 'ready' && captureInfo}
    <div class="verdict-card">
      <div class="verdict-header">
        <span class="verdict-kicker">Verdict 제출</span>
        <h2 class="verdict-symbol">{captureInfo.symbol}</h2>
        <p class="verdict-meta">{fmtSlug(captureInfo.pattern_slug)}</p>
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
          <span>진입 후 수익</span>
        </button>
        <button
          class="verdict-choice verdict-invalid"
          disabled={submitting}
          onclick={() => submitVerdict('invalid')}
        >
          <span class="verdict-emoji">✗</span>
          <strong>Invalid</strong>
          <span>패턴 틀림 / 손실</span>
        </button>
        <button
          class="verdict-choice verdict-near-miss"
          disabled={submitting}
          onclick={() => submitVerdict('near_miss')}
        >
          <span class="verdict-emoji">~</span>
          <strong>Near Miss</strong>
          <span>패턴 맞음, 타점 놓침</span>
        </button>
        <button
          class="verdict-choice verdict-too-early"
          disabled={submitting}
          onclick={() => submitVerdict('too_early')}
        >
          <span class="verdict-emoji">⏫</span>
          <strong>Too Early</strong>
          <span>조기 진입</span>
        </button>
        <button
          class="verdict-choice verdict-too-late"
          disabled={submitting}
          onclick={() => submitVerdict('too_late')}
        >
          <span class="verdict-emoji">⏰</span>
          <strong>Too Late</strong>
          <span>진입 타이밍 놓침</span>
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
  }

  .verdict-card--error { border-color: rgba(239,68,68,0.3); }
  .verdict-card--success { border-color: rgba(34,197,94,0.3); align-items: center; text-align: center; }

  .verdict-icon {
    font-size: 2.5rem;
    color: #86efac;
  }

  .verdict-header { display: flex; flex-direction: column; gap: 4px; }
  .verdict-kicker { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.4); }
  .verdict-symbol { font-size: 1.8rem; font-weight: 700; letter-spacing: 0.02em; margin: 0; }
  .verdict-meta { color: rgba(255,255,255,0.5); font-size: 0.88rem; margin: 0; }
  .verdict-error { color: #f87171; font-size: 0.88rem; margin: 0; }

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
  .verdict-choice span { font-size: 0.75rem; color: rgba(255,255,255,0.45); }

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
</style>
