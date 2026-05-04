<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  $: eval_ = data.evaluation;
  $: ver = data.verification;
  $: passed = eval_.status === 'PASSED' && ver?.result === 'PASS';
</script>

<svelte:head>
  <title>PropFirm 인증서 — WTD</title>
</svelte:head>

<main class="verify-page">
  <div class="cert-card {passed ? 'cert--pass' : 'cert--fail'}">
    <div class="cert-icon">{passed ? '✓' : '✗'}</div>
    <h1>{passed ? 'PropFirm 평가 통과' : '평가 미통과'}</h1>
    <p class="cert-sub">Evaluation ID: {eval_.id}</p>

    {#if ver}
      <div class="cert-stats">
        {#if ver.snapshot && typeof ver.snapshot === 'object'}
          {#each Object.entries(ver.snapshot as Record<string, unknown>) as [key, val]}
            <div class="stat-row">
              <span class="stat-key">{key}</span>
              <span class="stat-val">{String(val)}</span>
            </div>
          {/each}
        {/if}
      </div>

      <div class="cert-hash">
        <span class="hash-label">검증 해시</span>
        <code>{ver.signed_hash}</code>
      </div>
      <div class="cert-date">
        발행일: {new Date(ver.created_at).toLocaleDateString('ko-KR')}
      </div>
    {:else}
      <p class="no-ver">검증 기록이 없습니다.</p>
    {/if}
  </div>
</main>

<style>
  .verify-page {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 60vh;
    padding: 3rem 1.5rem;
  }
  .cert-card {
    max-width: 560px;
    width: 100%;
    border-radius: 12px;
    padding: 2.5rem;
    border: 2px solid;
    text-align: center;
  }
  .cert--pass { border-color: #22c55e; background: #22c55e0d; }
  .cert--fail { border-color: #ef4444; background: #ef44440d; }

  .cert-icon { font-size: 3rem; margin-bottom: 1rem; }
  .cert--pass .cert-icon { color: #22c55e; }
  .cert--fail .cert-icon { color: #ef4444; }

  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
  .cert-sub { color: var(--color-text-muted, #888); font-size: 0.8rem; margin-bottom: 1.5rem; }

  .cert-stats {
    text-align: left;
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .stat-row { display: flex; justify-content: space-between; font-size: 0.85rem; }
  .stat-key { color: var(--color-text-muted, #888); }
  .stat-val { font-weight: 600; }

  .cert-hash {
    margin-top: 1.5rem;
    text-align: left;
  }
  .hash-label {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    display: block;
    margin-bottom: 0.25rem;
  }
  code {
    display: block;
    font-size: 0.7rem;
    word-break: break-all;
    background: var(--color-bg-code, #1a1a1a);
    padding: 0.5rem;
    border-radius: 4px;
  }
  .cert-date { font-size: 0.8rem; color: var(--color-text-muted, #888); margin-top: 1rem; }
  .no-ver { color: var(--color-text-muted, #888); font-size: 0.9rem; }
</style>
