<script lang="ts">
  interface PassportSummary {
    tier: string;
    winRate: number;
    totalLp: number;
    streak: number;
    wins: number;
    losses: number;
  }

  interface UserStats {
    accuracy: number | null;
    pass: boolean;
    verdicts_remaining: number;
    min_verdicts: number;
  }

  interface Props {
    passport: PassportSummary | null;
    userStats: UserStats | null;
  }

  const { passport, userStats }: Props = $props();

  const totalVerdicts = $derived(passport ? passport.wins + passport.losses : null);
  const accuracyDisplay = $derived(
    userStats?.accuracy != null
      ? (userStats.accuracy * 100).toFixed(1) + '%'
      : passport
        ? passport.winRate.toFixed(1) + '%'
        : '—'
  );
</script>

<div class="stats-zone">
  <div class="stats-zone-header">
    <span class="zone-label">내 통계 (30일)</span>
    <a href="/passport" class="zone-link">상세 →</a>
  </div>

  <div class="stats-grid">
    <div class="stat-item">
      <span class="stat-val">{totalVerdicts ?? '—'}</span>
      <span class="stat-lbl">verdict</span>
    </div>
    <div class="stat-item">
      <span class="stat-val" class:pos={passport && passport.winRate >= 55} class:neg={passport && passport.winRate < 45}>
        {accuracyDisplay}
      </span>
      <span class="stat-lbl">정확도</span>
    </div>
    <div class="stat-item">
      <span class="stat-val" class:pos={passport && passport.streak > 0}>
        {passport ? (passport.streak > 0 ? '+' : '') + passport.streak + '일 🔥' : '—'}
      </span>
      <span class="stat-lbl">연속</span>
    </div>
    <div class="stat-item">
      <span class="stat-val">{passport?.tier ?? '—'}</span>
      <span class="stat-lbl">등급</span>
    </div>
  </div>

  {#if userStats && !userStats.pass}
    <div class="stats-gate-hint">
      F-60 달성까지 {userStats.verdicts_remaining}개 남음
    </div>
  {/if}
</div>

<style>
  .stats-zone {
    background: var(--g3);
    border: 1px solid var(--g4);
    border-radius: 4px;
    padding: 10px;
    flex: 1;
    min-width: 0;
  }
  .stats-zone-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .zone-label { font-size: 10px; font-weight: 700; color: var(--g9); text-transform: uppercase; letter-spacing: 0.04em; }
  .zone-link  { font-size: 9px; color: var(--g7); text-decoration: none; }
  .zone-link:hover { color: var(--g9); }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .stat-item { display: flex; flex-direction: column; gap: 1px; }
  .stat-val  { font-size: 13px; font-weight: 700; color: var(--g9); }
  .stat-lbl  { font-size: 9px; color: var(--g7); }
  .pos { color: var(--pos); }
  .neg { color: var(--neg); }

  .stats-gate-hint {
    margin-top: 6px;
    font-size: 9px;
    color: var(--amb);
    border-top: 1px solid var(--g4);
    padding-top: 6px;
  }
</style>
