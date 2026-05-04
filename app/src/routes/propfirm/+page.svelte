<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<svelte:head>
  <title>PropFirm Challenge — WTD</title>
</svelte:head>

<main class="propfirm-landing">
  {#if !data.betaInvited}
    <!-- Waitlist -->
    <section class="waitlist">
      <h1>PropFirm Challenge</h1>
      <p class="badge">Beta</p>
      <p>현재 베타 초대 유저만 참여 가능합니다.</p>
      <p class="sub">대기 목록에 등록하시면 순차적으로 초대 링크를 발송합니다.</p>
      <a href="mailto:beta@wtd.com" class="btn btn--secondary">대기 목록 등록</a>
    </section>
  {:else if !data.evaluation || data.evaluation.status === 'FAILED'}
    <!-- Purchase -->
    <section class="purchase">
      <h1>PropFirm Challenge</h1>
      {#if data.evaluation?.status === 'FAILED'}
        <p class="alert">이전 평가가 실패했습니다. 재도전하세요.</p>
      {/if}
      <div class="challenge-info">
        <div class="rule-item">
          <span class="label">평가비</span>
          <span class="value">$99 (일회성)</span>
        </div>
        <div class="rule-item">
          <span class="label">목표 수익률</span>
          <span class="value">8% 이상</span>
        </div>
        <div class="rule-item">
          <span class="label">최대 일일 손실</span>
          <span class="value">-5% (MLL)</span>
        </div>
        <div class="rule-item">
          <span class="label">최소 거래일</span>
          <span class="value">10일</span>
        </div>
        <div class="rule-item">
          <span class="label">일관성 룰</span>
          <span class="value">단일 거래일 ≤ 40%</span>
        </div>
      </div>
      <form method="POST" action="/api/propfirm/checkout">
        <button type="submit" class="btn btn--primary">도전 시작 — $99</button>
      </form>
    </section>
  {:else if data.evaluation.status === 'PENDING'}
    <!-- Payment pending -->
    <section class="pending">
      <h1>결제 처리 중</h1>
      <p>Stripe 결제 확인을 기다리는 중입니다. 잠시 후 다시 확인해주세요.</p>
      <a href="/propfirm" class="btn btn--secondary">새로고침</a>
    </section>
  {/if}
</main>

<style>
  .propfirm-landing {
    max-width: 560px;
    margin: 4rem auto;
    padding: 0 1.5rem;
    font-family: inherit;
  }
  h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; }
  .badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 600;
    background: var(--color-accent, #6366f1);
    color: #fff;
    padding: 2px 8px;
    border-radius: 9999px;
    margin-bottom: 1rem;
  }
  .sub { color: var(--color-text-muted, #888); font-size: 0.9rem; }
  .alert {
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border: 1px solid #ef4444;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .challenge-info {
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 1.25rem;
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .rule-item { display: flex; justify-content: space-between; align-items: center; }
  .label { color: var(--color-text-muted, #888); font-size: 0.875rem; }
  .value { font-weight: 600; font-size: 0.9rem; }
  .btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-size: 1rem;
    text-decoration: none;
  }
  .btn--primary { background: var(--color-accent, #6366f1); color: #fff; width: 100%; }
  .btn--secondary {
    background: transparent;
    border: 1px solid var(--color-border, #555);
    color: inherit;
  }
  .pending { text-align: center; }
</style>
