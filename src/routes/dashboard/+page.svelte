<script lang="ts">
  import { buildLabLink, buildBattleLink, buildAgentLink } from '$lib/utils/deepLinks';
</script>

<div class="dash">
  <h1 class="dash-title">Dashboard</h1>
  <p class="dash-sub">에이전트 상태와 오늘 할당량을 확인하세요.</p>

  <div class="dash-grid">
    <div class="dash-card">
      <span class="dash-card-label">TODAY'S BATTLES</span>
      <span class="dash-card-value">0 / 5</span>
      <a class="dash-card-cta" href={buildBattleLink()}>배틀 시작 →</a>
    </div>
    <div class="dash-card">
      <span class="dash-card-label">AGENT STATUS</span>
      <span class="dash-card-value">Stage 0</span>
      <a class="dash-card-cta" href={buildAgentLink()}>에이전트 관리 →</a>
    </div>
    <div class="dash-card highlight">
      <span class="dash-card-label">★ LAB — 핵심</span>
      <span class="dash-card-value">Run Again</span>
      <a class="dash-card-cta primary" href={buildLabLink()}>Lab 시작하기 →</a>
    </div>
  </div>
</div>

<style>
  .dash {
    height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch;
    background: var(--arena-bg-0, #081a12); color: var(--arena-text-0, #e0f0e8);
    padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 24px;
  }
  .dash-title { font-size: 24px; font-weight: 700; }
  .dash-sub { font-size: 13px; color: var(--arena-text-1, #8ba59e); }
  .dash-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 640px; width: 100%; }
  .dash-card {
    padding: 20px 16px; border-radius: 10px; border: 1px solid var(--arena-line, #1a3d2e);
    background: var(--arena-bg-1, #0d2118); display: flex; flex-direction: column; gap: 8px;
  }
  .dash-card.highlight { border-color: rgba(96, 160, 240, 0.4); background: rgba(96, 160, 240, 0.05); }
  .dash-card-label { font-size: 9px; letter-spacing: 1px; color: var(--arena-text-2, #5a7d6e); font-weight: 600; }
  .dash-card-value { font-size: 20px; font-weight: 700; }
  .dash-card-cta {
    font-size: 11px; color: var(--arena-accent, #e8967d); text-decoration: none; font-weight: 600;
    margin-top: auto;
  }
  .dash-card-cta.primary { color: #60a0f0; }
  .dash-card-cta:hover { text-decoration: underline; }
  @media (max-width: 640px) { .dash-grid { grid-template-columns: 1fr; } }
</style>
