<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState, type ArenaView } from '$lib/stores/gameState';
  import { sfx } from '$lib/audio/sfx';
  import { startMatch as engineStartMatch, resetPhaseInit } from '$lib/engine/gameLoop';
  import { AGDEFS } from '$lib/data/agents';
  import {
    listActiveTournaments,
    registerTournament,
    getTournamentBracket,
    type TournamentActiveRecord,
    type TournamentBracketMatch,
    type TournamentType,
  } from '$lib/api/arenaApi';

  const PVP_UNLOCK_MATCHES = 10;
  const TOURNAMENT_UNLOCK_LP = 500;
  const TOURNAMENT_UNLOCK_PVP_WINS = 5;

  let selectedMode: 'pve' | 'pvp' | 'tournament' = $state('pve');
  let tournaments: TournamentActiveRecord[] = $state([]);
  let tournamentsLoading = $state(false);
  let tournamentsError: string | null = $state(null);
  let selectedTournamentId: string | null = $state(null);
  let bracketLoading = $state(false);
  let bracketError: string | null = $state(null);
  let bracketRound = $state(1);
  let bracketMatches: TournamentBracketMatch[] = $state([]);
  let registerLoading = $state(false);
  let registerMessage: string | null = $state(null);

  let mounted = $state(false);
  let hoveredMode: string | null = $state(null);
  let glitchText = $state('ARENA LOBBY');
  let glitchActive = $state(false);
  let killFeedVisible: boolean[] = $state([]);
  let typewriterText = $state('');
  const fullTypewriterText = 'INITIALIZING PREDICTION ENGINE...';
  let scannerAngle = $state(0);

  let walletLabel = $derived($gameState.lp >= 2200 ? 'MASTER' : $gameState.lp >= 1200 ? 'DIAMOND' : $gameState.lp >= 600 ? 'GOLD' : $gameState.lp >= 200 ? 'SILVER' : 'BRONZE');
  let tierColor = $derived(walletLabel === 'MASTER' ? '#ff3366' : walletLabel === 'DIAMOND' ? '#66cce6' : walletLabel === 'GOLD' ? '#ffd060' : walletLabel === 'SILVER' ? '#c0c0c0' : '#cd7f32');
  let pveRecord = $derived(`${$gameState.wins}W-${$gameState.losses}L`);
  let winRate = $derived($gameState.matchN > 0 ? Math.round(($gameState.wins / $gameState.matchN) * 100) : 0);
  let pvpWins = $derived(Math.max(0, Math.floor($gameState.wins * 0.65)));
  let pvpLosses = $derived(Math.max(0, Math.floor($gameState.losses * 0.35)));
  let pvpRecord = $derived(`${pvpWins}W-${pvpLosses}L`);
  let pvpUnlocked = $derived($gameState.matchN >= PVP_UNLOCK_MATCHES);
  let tournamentUnlocked = $derived($gameState.lp >= TOURNAMENT_UNLOCK_LP && pvpWins >= TOURNAMENT_UNLOCK_PVP_WINS);
  let activeCount = $derived(Math.min(5, Math.max(1, ($gameState.matchN % 5) + 1)));
  let selectedTournament = $derived(tournaments.find((t) => t.tournamentId === selectedTournamentId) ?? tournaments[0] ?? null);
  let canRegisterTournament = $derived(
    !!selectedTournament &&
    selectedTournament.status === 'REG_OPEN' &&
    selectedTournament.registeredPlayers < selectedTournament.maxPlayers
  );

  let lpBarWidth = $derived(Math.min(100, ($gameState.lp / 3000) * 100));
  let streakEmoji = $derived($gameState.streak >= 5 ? '🔥' : $gameState.streak >= 3 ? '⚡' : '');

  let recent = $derived([
    { id: `#${Math.max(1, $gameState.matchN)}`, result: $gameState.wins >= $gameState.losses ? 'WIN' : 'LOSS', lp: $gameState.wins >= $gameState.losses ? 16 : -3, pair: $gameState.pair.split('/')[0], dir: $gameState.score >= 60 ? 'LONG' : 'SHORT', tag: 'DISSENT', fbs: Math.max(40, Math.min(99, Math.round($gameState.score + 8))), age: '2h' },
    { id: `#${Math.max(1, $gameState.matchN - 1)}`, result: 'WIN', lp: 12, pair: 'ETH', dir: 'LONG', tag: 'UNANIMOUS', fbs: 87, age: '5h' },
    { id: `#${Math.max(1, $gameState.matchN - 2)}`, result: 'LOSS', lp: -8, pair: 'SOL', dir: 'SHORT', tag: 'DISSENT', fbs: 52, age: '8h' },
  ]);

  // ── View Picker ──
  const viewOptions: { key: ArenaView; icon: string; name: string; desc: string }[] = [
    { key: 'chart',   icon: '◎', name: 'CHART WAR',       desc: '차트 중심 배틀' },
    { key: 'arena',   icon: '⚔', name: 'AGENT ARENA',     desc: 'RPG 에이전트 배틀' },
    { key: 'mission', icon: '▦', name: 'MISSION CONTROL', desc: '블룸버그 터미널' },
    { key: 'card',    icon: '▧', name: 'CARD DUEL',       desc: '카드 대결' },
  ];

  function pickView(v: ArenaView) {
    sfx.step();
    gameState.update(s => ({ ...s, arenaView: v }));
  }

  function modeStart(mode: 'pve' | 'pvp' | 'tournament', tournament: TournamentActiveRecord | null = null) {
    sfx.enter();
    selectedMode = mode;
    const arenaMode = mode === 'pve' ? 'PVE' : mode === 'pvp' ? 'PVP' : 'TOURNAMENT';

    gameState.update((s) => ({
      ...s,
      arenaMode,
      tournament: arenaMode === 'TOURNAMENT'
        ? { tournamentId: tournament?.tournamentId ?? null, round: bracketRound ?? 1, type: tournament?.type ?? null, pair: tournament?.pair ?? null, entryFeeLp: tournament?.entryFeeLp ?? null }
        : { tournamentId: null, round: null, type: null, pair: null, entryFeeLp: null },
      inLobby: false,
      pair: arenaMode === 'TOURNAMENT' && tournament?.pair ? tournament.pair : s.pair,
      selectedAgents: ['structure', 'vpa', 'ict', 'deriv', 'valuation', 'flow', 'senti', 'macro'],
      speed: 3
    }));

    resetPhaseInit();
    engineStartMatch();
  }

  async function loadTournaments() {
    tournamentsLoading = true;
    tournamentsError = null;
    try {
      const res = await listActiveTournaments(12);
      tournaments = res.records;
      if (!selectedTournamentId && tournaments.length > 0) selectedTournamentId = tournaments[0].tournamentId;
    } catch (err) {
      tournamentsError = err instanceof Error ? err.message : '토너먼트 목록 로드 실패';
      tournaments = [];
    } finally {
      tournamentsLoading = false;
    }
  }

  async function loadBracket(tournamentId: string) {
    bracketLoading = true;
    bracketError = null;
    registerMessage = null;
    try {
      const res = await getTournamentBracket(tournamentId);
      bracketRound = res.round;
      bracketMatches = res.matches;
    } catch (err) {
      bracketError = err instanceof Error ? err.message : '브래킷 로드 실패';
      bracketMatches = [];
    } finally {
      bracketLoading = false;
    }
  }

  async function openTournamentPanel() {
    selectedMode = 'tournament';
    await loadTournaments();
    if (selectedTournamentId) await loadBracket(selectedTournamentId);
  }

  async function chooseTournament(tournamentId: string) {
    selectedTournamentId = tournamentId;
    await loadBracket(tournamentId);
  }

  async function onTournamentRegister() {
    if (!selectedTournamentId) return;
    registerLoading = true;
    registerMessage = null;
    try {
      const res = await registerTournament(selectedTournamentId);
      const lpLabel = res.lpDelta === 0 ? '' : ` · ${res.lpDelta > 0 ? '+' : ''}${res.lpDelta} LP`;
      registerMessage = `등록 완료 · Seed #${res.seed}${lpLabel}`;
      await loadTournaments();
      await loadBracket(selectedTournamentId);
    } catch (err) {
      registerMessage = err instanceof Error ? err.message : '토너먼트 등록 실패';
    } finally {
      registerLoading = false;
    }
  }

  function formatStartAt(iso: string): string {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatTournamentType(type: TournamentType): string {
    if (type === 'DAILY_SPRINT') return 'Daily Sprint';
    if (type === 'WEEKLY_CUP') return 'Weekly Cup';
    if (type === 'SEASON_CHAMPIONSHIP') return 'Season Championship';
    return type;
  }

  function enterMode(mode: 'pve' | 'pvp' | 'tournament') {
    if (mode === 'pvp' && !pvpUnlocked) return;
    if (mode === 'tournament' && !tournamentUnlocked) return;
    if (mode === 'tournament') { openTournamentPanel(); return; }
    modeStart(mode);
  }

  function startTournamentRound() {
    if (!selectedTournament) return;
    modeStart('tournament', selectedTournament);
  }

  // Glitch effect on title
  function triggerGlitch() {
    if (glitchActive) return;
    glitchActive = true;
    const chars = '░▒▓█▀▄■□◆◇';
    let iterations = 0;
    const iv = setInterval(() => {
      glitchText = 'ARENA LOBBY'.split('').map((c, i) =>
        i < iterations ? 'ARENA LOBBY'[i] : chars[Math.floor(Math.random() * chars.length)]
      ).join('');
      iterations++;
      if (iterations > 11) { clearInterval(iv); glitchText = 'ARENA LOBBY'; glitchActive = false; }
    }, 40);
  }

  // Typewriter effect
  function runTypewriter() {
    let i = 0;
    const iv = setInterval(() => {
      typewriterText = fullTypewriterText.slice(0, i + 1);
      i++;
      if (i >= fullTypewriterText.length) { clearInterval(iv); setTimeout(() => { typewriterText = 'SYSTEM READY — SELECT MODE'; }, 1200); }
    }, 35);
  }

  // Kill feed stagger
  function staggerKillFeed() {
    killFeedVisible = recent.map(() => false);
    recent.forEach((_, i) => {
      setTimeout(() => { killFeedVisible[i] = true; killFeedVisible = [...killFeedVisible]; }, 300 + i * 180);
    });
  }

  // Scanner rotation
  let scannerRaf: number;
  function animateScanner() {
    scannerAngle = (scannerAngle + 0.8) % 360;
    scannerRaf = requestAnimationFrame(animateScanner);
  }

  onMount(() => {
    mounted = true;
    loadTournaments();
    runTypewriter();
    staggerKillFeed();
    animateScanner();
    setTimeout(triggerGlitch, 600);
    const glitchIv = setInterval(triggerGlitch, 8000);
    return () => { clearInterval(glitchIv); cancelAnimationFrame(scannerRaf); };
  });
</script>

<div class="lobby" class:mounted>
  <!-- Atmospheric layers -->
  <div class="atmo scanlines" aria-hidden="true"></div>
  <div class="atmo grid-dots" aria-hidden="true"></div>
  <div class="atmo glow-orbs" aria-hidden="true"></div>
  <div class="atmo vignette" aria-hidden="true"></div>

  <main class="lobby-core">
    <!-- ═══ HERO: Fighter Profile Bar ═══ -->
    <header class="hero-bar">
      <div class="hero-left">
        <div class="player-badge">
          <div class="badge-ring" style="--tier-color: {tierColor}">
            <span class="badge-icon">⚡</span>
          </div>
          <div class="badge-info">
            <div class="player-name">
              <span class="glitch-wrap">
                <span class="glitch-text" data-text={glitchText}>{glitchText}</span>
              </span>
            </div>
            <div class="player-tier" style="color: {tierColor}">
              {walletLabel} · LP {$gameState.lp.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div class="hero-stats">
        <div class="stat-block">
          <span class="stat-label">전적</span>
          <span class="stat-value">{pveRecord}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-block">
          <span class="stat-label">승률</span>
          <span class="stat-value" class:hot={winRate >= 60}>{winRate}%</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-block">
          <span class="stat-label">연승</span>
          <span class="stat-value">{streakEmoji}{$gameState.streak}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-block">
          <span class="stat-label">동시매치</span>
          <span class="stat-value accent">{activeCount}/5</span>
        </div>
      </div>

      <!-- LP Health Bar -->
      <div class="lp-bar-wrap">
        <div class="lp-bar-track">
          <div class="lp-bar-fill" style="width: {lpBarWidth}%"></div>
          <div class="lp-bar-glow" style="width: {lpBarWidth}%"></div>
        </div>
        <span class="lp-bar-label">LP {$gameState.lp} / 3000</span>
      </div>
    </header>

    <!-- ═══ AGENT ROSTER (Scrolling Icons) ═══ -->
    <div class="agent-roster">
      <span class="roster-label">SQUAD</span>
      <div class="roster-agents">
        {#each AGDEFS as ag, i}
          <div class="roster-agent" style="--ag-color: {ag.color}; --delay: {i * 0.08}s">
            <span class="ag-icon">{ag.icon}</span>
            <span class="ag-name">{ag.name}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- ═══ MODE SELECT: The Portals ═══ -->
    <section class="mode-select">
      <div class="mode-select-header">
        <span class="section-tag">SELECT MODE</span>
        <span class="typewriter">{typewriterText}<span class="cursor">▊</span></span>
      </div>

      <div class="portals">
        <!-- PvE Portal -->
        <button
          class="portal portal-pve"
          class:hovered={hoveredMode === 'pve'}
          onmouseenter={() => { hoveredMode = 'pve'; sfx.step(); }}
          onmouseleave={() => hoveredMode = null}
          onclick={() => enterMode('pve')}
        >
          <div class="portal-bg">
            <div class="portal-scanner" style="--angle: {scannerAngle}deg"></div>
          </div>
          <div class="portal-content">
            <div class="portal-icon-wrap">
              <span class="portal-icon">🤖</span>
              <div class="portal-ring"></div>
            </div>
            <div class="portal-label">PvE</div>
            <div class="portal-title">vs ORPO</div>
            <div class="portal-sub">AI PREDICTION SYSTEM</div>
            <div class="portal-stats">{pveRecord} · FBS {$gameState.score}</div>
            <div class="portal-enter">
              <span class="enter-arrow">▶</span> ENTER ARENA
            </div>
          </div>
          <div class="portal-edge"></div>
        </button>

        <!-- PvP Portal -->
        <button
          class="portal portal-pvp"
          class:hovered={hoveredMode === 'pvp'}
          class:locked={!pvpUnlocked}
          onmouseenter={() => { hoveredMode = 'pvp'; if(pvpUnlocked) sfx.step(); }}
          onmouseleave={() => hoveredMode = null}
          onclick={() => enterMode('pvp')}
        >
          <div class="portal-bg pvp-bg">
            {#if pvpUnlocked}
              <div class="pvp-pulse"></div>
              <div class="pvp-pulse delay"></div>
            {/if}
          </div>
          <div class="portal-content">
            <div class="portal-icon-wrap pvp-icon">
              <span class="portal-icon">⚔️</span>
              <div class="portal-ring pvp-ring"></div>
            </div>
            <div class="portal-label pvp-text">PvP</div>
            <div class="portal-title pvp-text">vs HUMAN</div>
            <div class="portal-sub pvp-text">
              {#if pvpUnlocked}
                MATCHMAKING ACTIVE
              {:else}
                🔒 {PVP_UNLOCK_MATCHES}전 완료 후 해금
              {/if}
            </div>
            <div class="portal-stats pvp-text">{pvpRecord}</div>
            <div class="portal-enter pvp-enter">
              {#if pvpUnlocked}
                <span class="enter-arrow">▶</span> FIND OPPONENT
              {:else}
                <span class="lock-icon">🔒</span> LOCKED
              {/if}
            </div>
          </div>
          <div class="portal-edge pvp-edge"></div>
        </button>

        <!-- Tournament Portal -->
        <button
          class="portal portal-tour"
          class:hovered={hoveredMode === 'tournament'}
          class:locked={!tournamentUnlocked}
          onmouseenter={() => { hoveredMode = 'tournament'; if(tournamentUnlocked) sfx.step(); }}
          onmouseleave={() => hoveredMode = null}
          onclick={() => enterMode('tournament')}
        >
          <div class="portal-bg tour-bg">
            {#if tournamentUnlocked}
              <div class="tour-sparkle s1"></div>
              <div class="tour-sparkle s2"></div>
              <div class="tour-sparkle s3"></div>
            {/if}
          </div>
          <div class="portal-content">
            <div class="portal-icon-wrap tour-icon">
              <span class="portal-icon">👑</span>
              <div class="portal-ring tour-ring"></div>
            </div>
            <div class="portal-label tour-text">TOURNAMENT</div>
            <div class="portal-title tour-text">BRACKET BATTLE</div>
            <div class="portal-sub tour-text">
              {#if tournamentUnlocked}
                REGISTRATION OPEN
              {:else}
                🔒 LP {TOURNAMENT_UNLOCK_LP}+ & PvP {TOURNAMENT_UNLOCK_PVP_WINS}승
              {/if}
            </div>
            <div class="portal-stats tour-text">WEEKLY CUP</div>
            <div class="portal-enter tour-enter">
              {#if tournamentUnlocked}
                <span class="enter-arrow">▶</span> VIEW BRACKETS
              {:else}
                <span class="lock-icon">🔒</span> LOCKED
              {/if}
            </div>
          </div>
          <div class="portal-edge tour-edge"></div>
        </button>
      </div>
    </section>

    <!-- ═══ TOURNAMENT PANEL ═══ -->
    {#if selectedMode === 'tournament' && tournamentUnlocked}
      <section class="panel panel-tournament">
        <div class="panel-head">
          <span class="panel-title tour-text">👑 WEEKLY TOURNAMENT</span>
          <div class="panel-actions">
            <button class="btn-sm" onclick={loadTournaments} disabled={tournamentsLoading}>새로고침</button>
            <button class="btn-sm btn-primary" onclick={startTournamentRound} disabled={!selectedTournamentId}>라운드 시작 →</button>
          </div>
        </div>

        {#if tournamentsLoading}
          <div class="panel-empty">토너먼트 목록 로딩 중...</div>
        {:else if tournamentsError}
          <div class="panel-empty panel-error">{tournamentsError}</div>
        {:else if tournaments.length === 0}
          <div class="panel-empty">현재 등록 가능한 토너먼트가 없습니다.</div>
        {:else}
          <div class="tour-layout">
            <div class="tour-list">
              {#each tournaments as t}
                <button class="tour-item" class:active={selectedTournamentId === t.tournamentId} onclick={() => chooseTournament(t.tournamentId)}>
                  <div class="ti-row"><span class="ti-type">{formatTournamentType(t.type)}</span><span class="ti-status">{t.status}</span></div>
                  <div class="ti-row"><span class="ti-pair">{t.pair}</span><span class="ti-time">{formatStartAt(t.startAt)}</span></div>
                  <div class="ti-row"><span>{t.registeredPlayers}/{t.maxPlayers}명</span><span>Entry {t.entryFeeLp} LP</span></div>
                </button>
              {/each}
            </div>
            <div class="tour-bracket">
              <div class="tb-head">
                <div>
                  <div class="tb-title">{selectedTournament ? selectedTournament.pair : '-'}</div>
                  <div class="tb-sub">Round {bracketRound} · Bracket</div>
                </div>
                <button class="btn-sm btn-gold" onclick={onTournamentRegister} disabled={!canRegisterTournament || registerLoading}>
                  {registerLoading ? '등록 중...' : canRegisterTournament ? '등록하기' : '등록 마감'}
                </button>
              </div>
              {#if registerMessage}<div class="register-msg">{registerMessage}</div>{/if}
              {#if bracketLoading}
                <div class="panel-empty">브래킷 로딩 중...</div>
              {:else if bracketError}
                <div class="panel-empty panel-error">{bracketError}</div>
              {:else if bracketMatches.length === 0}
                <div class="panel-empty">참가자가 모이면 브래킷이 생성됩니다.</div>
              {:else}
                <div class="bracket-rows">
                  {#each bracketMatches as m}
                    <div class="bracket-row">
                      <span class="br-slot">{m.matchIndex}</span>
                      <span class="br-player">{m.userA ? m.userA.nickname : 'TBD'}</span>
                      <span class="br-vs">vs</span>
                      <span class="br-player">{m.userB ? m.userB.nickname : 'BYE'}</span>
                      <span class="br-status">{m.winnerId ? '✓' : '⏳'}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- ═══ KILL FEED: Recent Results ═══ -->
    <section class="kill-feed">
      <div class="section-tag">RECENT MATCHES</div>
      <div class="feed-rows">
        {#each recent as r, i}
          <div class="feed-row" class:visible={killFeedVisible[i]} style="--stagger: {i * 0.12}s">
            <div class="feed-left">
              <span class="feed-id">{r.id}</span>
              <span class="feed-result" class:win={r.result === 'WIN'} class:loss={r.result !== 'WIN'}>
                {r.result}
              </span>
              <span class="feed-lp" class:pos={r.lp > 0} class:neg={r.lp < 0}>
                {r.lp > 0 ? '+' : ''}{r.lp}LP
              </span>
              <span class="feed-pair">{r.pair}</span>
              <span class="feed-dir">{r.dir}</span>
            </div>
            <div class="feed-right">
              <span class="feed-tag">{r.tag}</span>
              <span class="feed-fbs">FBS {r.fbs}</span>
              <span class="feed-age">{r.age}</span>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- ═══ VIEW PICKER: 4 Game Views ═══ -->
    <section class="view-picker-section">
      <div class="section-tag">BATTLE VIEW</div>
      <div class="view-cards">
        {#each viewOptions as opt}
          <button
            class="view-card"
            class:active={$gameState.arenaView === opt.key}
            onclick={() => pickView(opt.key)}
          >
            <span class="vc-icon">{opt.icon}</span>
            <span class="vc-name">{opt.name}</span>
            <span class="vc-desc">{opt.desc}</span>
          </button>
        {/each}
      </div>
    </section>
  </main>

  <!-- ═══ STATUS BAR ═══ -->
  <footer class="status-bar">
    <span>DECISION CHAIN</span>
    <span class="status-dot"></span>
    <span class="status-online">SYSTEM ONLINE</span>
    <span>BLOCK #18,429,031</span>
    <span class="status-lat">LATENCY 42ms</span>
    <span class="status-pair">{$gameState.pair}</span>
  </footer>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════
     STOCKCLAW — Arena Lobby v3
     Fighting Game Select Screen × Crypto Terminal
     ═══════════════════════════════════════════════════════════════ */

  :root {
    --bg: #08130d;
    --bg2: #0a1a12;
    --coral: #e8967d;
    --cyan: #00d4ff;
    --cyan2: #66cce6;
    --gold: #ffd060;
    --gold2: #dcb970;
    --grn: #00cc88;
    --red: #ff5e7a;
    --txt: #f0ede4;
    --txt60: rgba(240, 237, 228, 0.6);
    --txt40: rgba(240, 237, 228, 0.4);
    --fm: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
  }

  /* ── Base ── */
  .lobby {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg);
    color: var(--txt);
    font-family: var(--fm);
    opacity: 0;
    transition: opacity 0.6s ease;
  }
  .lobby.mounted { opacity: 1; }

  /* ── Atmospheric Layers ── */
  .atmo {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .scanlines {
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.08) 2px,
      rgba(0, 0, 0, 0.08) 4px
    );
    z-index: 10;
    animation: scanlineScroll 8s linear infinite;
  }

  @keyframes scanlineScroll {
    0% { transform: translateY(0); }
    100% { transform: translateY(4px); }
  }

  .grid-dots {
    background-image: radial-gradient(rgba(232, 150, 125, 0.06) 1px, transparent 1px);
    background-size: 16px 16px;
    mask-image: linear-gradient(to bottom, black, transparent 85%);
    z-index: 1;
  }

  .glow-orbs {
    background:
      radial-gradient(ellipse 600px 400px at 80% 10%, rgba(232, 150, 125, 0.12) 0%, transparent 70%),
      radial-gradient(ellipse 500px 500px at 15% 85%, rgba(0, 212, 255, 0.06) 0%, transparent 70%),
      radial-gradient(ellipse 300px 300px at 50% 50%, rgba(255, 208, 96, 0.04) 0%, transparent 70%);
    z-index: 2;
    animation: orbPulse 6s ease-in-out infinite alternate;
  }

  @keyframes orbPulse {
    0% { opacity: 0.7; }
    100% { opacity: 1; }
  }

  .vignette {
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.5) 100%);
    z-index: 3;
  }

  /* ── Core Layout ── */
  .lobby-core {
    position: relative;
    z-index: 5;
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px 16px 80px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ═══ HERO BAR ═══ */
  .hero-bar {
    border: 1px solid rgba(232, 150, 125, 0.3);
    background: linear-gradient(135deg, rgba(10, 26, 18, 0.95), rgba(8, 19, 13, 0.98));
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    overflow: hidden;
  }

  .hero-bar::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--coral), transparent);
    animation: shimmerBar 3s ease-in-out infinite;
  }

  @keyframes shimmerBar {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .hero-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .player-badge {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .badge-ring {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid var(--tier-color);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 16px color-mix(in srgb, var(--tier-color) 40%, transparent),
                inset 0 0 8px color-mix(in srgb, var(--tier-color) 20%, transparent);
    animation: ringPulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes ringPulse {
    0%, 100% { box-shadow: 0 0 12px color-mix(in srgb, var(--tier-color) 30%, transparent); }
    50% { box-shadow: 0 0 24px color-mix(in srgb, var(--tier-color) 50%, transparent); }
  }

  .badge-icon { font-size: 22px; }

  .player-name {
    font-size: clamp(22px, 3.5vw, 36px);
    font-weight: 900;
    letter-spacing: 2px;
    line-height: 1;
  }

  .player-tier {
    font-size: 12px;
    letter-spacing: 1.5px;
    margin-top: 4px;
  }

  /* Glitch text effect */
  .glitch-wrap { position: relative; display: inline-block; }
  .glitch-text {
    position: relative;
    text-shadow: 0 0 8px rgba(232, 150, 125, 0.3);
  }
  .glitch-text::before,
  .glitch-text::after {
    content: attr(data-text);
    position: absolute;
    top: 0; left: 0;
    opacity: 0;
  }
  .glitch-text::before {
    color: var(--cyan);
    animation: glitch1 0.3s ease-in-out infinite alternate;
    clip-path: inset(0 0 65% 0);
  }
  .glitch-text::after {
    color: var(--red);
    animation: glitch2 0.3s ease-in-out infinite alternate;
    clip-path: inset(65% 0 0 0);
  }

  @keyframes glitch1 {
    0% { transform: translate(0); opacity: 0; }
    20% { transform: translate(-2px, 1px); opacity: 0.7; }
    40% { transform: translate(2px, -1px); opacity: 0; }
    100% { transform: translate(0); opacity: 0; }
  }
  @keyframes glitch2 {
    0% { transform: translate(0); opacity: 0; }
    30% { transform: translate(2px, 1px); opacity: 0.5; }
    60% { transform: translate(-1px, -1px); opacity: 0; }
    100% { transform: translate(0); opacity: 0; }
  }

  /* Stats row */
  .hero-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .stat-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--txt40);
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--txt);
  }
  .stat-value.hot { color: var(--grn); text-shadow: 0 0 8px rgba(0, 204, 136, 0.4); }
  .stat-value.accent { color: var(--coral); }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: rgba(232, 150, 125, 0.2);
  }

  /* LP Health Bar */
  .lp-bar-wrap {
    position: relative;
  }

  .lp-bar-track {
    height: 6px;
    background: rgba(232, 150, 125, 0.1);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
  }

  .lp-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--coral), #ff6b4a);
    border-radius: 3px;
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    position: relative;
  }

  .lp-bar-glow {
    position: absolute;
    top: -2px;
    left: 0;
    height: 10px;
    background: linear-gradient(90deg, transparent, rgba(232, 150, 125, 0.4));
    border-radius: 5px;
    filter: blur(4px);
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .lp-bar-label {
    position: absolute;
    right: 0;
    top: -16px;
    font-size: 10px;
    color: var(--txt60);
    letter-spacing: 0.8px;
  }

  /* ═══ AGENT ROSTER ═══ */
  .agent-roster {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid rgba(232, 150, 125, 0.15);
    background: rgba(8, 19, 13, 0.7);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .agent-roster::-webkit-scrollbar { display: none; }

  .roster-label {
    font-size: 9px;
    letter-spacing: 2px;
    color: var(--coral);
    flex-shrink: 0;
  }

  .roster-agents {
    display: flex;
    gap: 6px;
  }

  .roster-agent {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid rgba(232, 150, 125, 0.2);
    background: rgba(232, 150, 125, 0.04);
    border-radius: 2px;
    white-space: nowrap;
    opacity: 0;
    animation: agentIn 0.3s ease forwards;
    animation-delay: var(--delay);
    transition: border-color 0.2s, background 0.2s;
  }

  .roster-agent:hover {
    border-color: var(--ag-color);
    background: color-mix(in srgb, var(--ag-color) 10%, transparent);
  }

  @keyframes agentIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .ag-icon { font-size: 14px; }
  .ag-name { font-size: 10px; color: var(--txt60); letter-spacing: 0.5px; }

  /* ═══ MODE SELECT ═══ */
  .mode-select {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mode-select-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-tag {
    font-size: 11px;
    letter-spacing: 3px;
    color: var(--coral);
    font-weight: 700;
  }

  .typewriter {
    font-size: 10px;
    color: var(--txt40);
    letter-spacing: 1px;
  }

  .cursor {
    animation: blink 1s step-end infinite;
    color: var(--coral);
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* ═══ PORTALS ═══ */
  .portals {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .portal {
    position: relative;
    text-align: left;
    padding: 0;
    border: 1px solid rgba(232, 150, 125, 0.35);
    background: linear-gradient(180deg, rgba(13, 26, 19, 0.95), rgba(8, 19, 13, 0.98));
    color: var(--txt);
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease;
    min-height: 220px;
    display: flex;
    flex-direction: column;
  }

  .portal:hover:not(.locked) {
    transform: translateY(-4px) scale(1.01);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }

  .portal.locked {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(0.3);
  }

  /* Portal background effects */
  .portal-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .portal-scanner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 200%;
    height: 2px;
    background: linear-gradient(90deg, transparent 30%, rgba(232, 150, 125, 0.15), transparent 70%);
    transform-origin: 0% 50%;
    transform: rotate(var(--angle));
    opacity: 0;
    transition: opacity 0.3s;
  }

  .portal-pve:hover .portal-scanner { opacity: 1; }

  /* PvP pulse */
  .pvp-pulse {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 1px solid rgba(0, 212, 255, 0.3);
    transform: translate(-50%, -50%);
    animation: pvpPulse 2s ease-out infinite;
  }
  .pvp-pulse.delay { animation-delay: 1s; }

  @keyframes pvpPulse {
    0% { width: 40px; height: 40px; opacity: 0.6; }
    100% { width: 200px; height: 200px; opacity: 0; }
  }

  /* Tournament sparkles */
  .tour-sparkle {
    position: absolute;
    width: 3px;
    height: 3px;
    background: var(--gold);
    border-radius: 50%;
    box-shadow: 0 0 6px var(--gold);
    animation: sparkle 3s ease-in-out infinite;
  }
  .s1 { top: 20%; left: 30%; animation-delay: 0s; }
  .s2 { top: 60%; left: 70%; animation-delay: 1s; }
  .s3 { top: 40%; left: 50%; animation-delay: 2s; }

  @keyframes sparkle {
    0%, 100% { opacity: 0; transform: scale(0.5); }
    50% { opacity: 1; transform: scale(1.5); }
  }

  /* Portal content */
  .portal-content {
    position: relative;
    z-index: 2;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .portal-icon-wrap {
    position: relative;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
  }

  .portal-icon { font-size: 28px; position: relative; z-index: 1; }

  .portal-ring {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1px solid rgba(232, 150, 125, 0.3);
    animation: ringRotate 8s linear infinite;
  }
  .pvp-ring { border-color: rgba(0, 212, 255, 0.3); }
  .tour-ring { border-color: rgba(255, 208, 96, 0.3); }

  @keyframes ringRotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .portal-label {
    font-size: 11px;
    letter-spacing: 3px;
    color: var(--coral);
    font-weight: 700;
  }
  .pvp-text.portal-label { color: var(--cyan2); }
  .tour-text.portal-label { color: var(--gold); }

  .portal-title {
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 1px;
    margin-top: 4px;
    line-height: 1.2;
  }

  .portal-sub {
    font-size: 10px;
    color: var(--txt40);
    letter-spacing: 1px;
    margin-top: 8px;
  }

  .portal-stats {
    font-size: 12px;
    color: var(--txt60);
    margin-top: 6px;
  }

  .portal-enter {
    margin-top: auto;
    padding-top: 16px;
    font-size: 12px;
    letter-spacing: 2px;
    color: var(--coral);
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .portal:hover:not(.locked) .portal-enter {
    opacity: 1;
    transform: translateX(4px);
  }

  .pvp-enter { color: var(--cyan2); }
  .tour-enter { color: var(--gold); }

  .enter-arrow {
    font-size: 10px;
    animation: arrowPulse 1.2s ease-in-out infinite;
  }

  @keyframes arrowPulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  /* Portal edge glow */
  .portal-edge {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--coral);
    opacity: 0;
    transition: opacity 0.3s;
    box-shadow: 0 0 12px var(--coral);
  }
  .pvp-edge { background: var(--cyan); box-shadow: 0 0 12px var(--cyan); }
  .tour-edge { background: var(--gold); box-shadow: 0 0 12px var(--gold); }

  .portal:hover:not(.locked) .portal-edge { opacity: 1; }

  /* Portal hover border colors */
  .portal-pve:hover:not(.locked) { border-color: rgba(232, 150, 125, 0.7); }
  .portal-pvp:hover:not(.locked) { border-color: rgba(0, 212, 255, 0.6); }
  .portal-tour:hover:not(.locked) { border-color: rgba(255, 208, 96, 0.6); }

  .portal-pvp { border-color: rgba(0, 212, 255, 0.25); }
  .portal-tour { border-color: rgba(255, 208, 96, 0.25); }

  /* ═══ KILL FEED ═══ */
  .kill-feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .feed-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .feed-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid rgba(232, 150, 125, 0.15);
    background: rgba(10, 22, 16, 0.85);
    opacity: 0;
    transform: translateX(-20px);
    transition: opacity 0.4s ease, transform 0.4s ease;
    transition-delay: var(--stagger);
  }

  .feed-row.visible {
    opacity: 1;
    transform: translateX(0);
  }

  .feed-left, .feed-right {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .feed-id { color: var(--txt40); font-size: 11px; }
  .feed-pair { color: var(--txt); font-size: 13px; font-weight: 700; }
  .feed-dir { color: var(--txt40); font-size: 11px; }
  .feed-age { color: var(--txt40); font-size: 10px; }
  .feed-fbs { color: var(--txt60); font-size: 11px; }

  .feed-result {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 2px 6px;
    border: 1px solid;
  }
  .feed-result.win { color: var(--grn); border-color: rgba(0, 204, 136, 0.5); background: rgba(0, 204, 136, 0.08); }
  .feed-result.loss { color: var(--red); border-color: rgba(255, 94, 122, 0.5); background: rgba(255, 94, 122, 0.08); }

  .feed-lp { font-size: 13px; font-weight: 700; }
  .feed-lp.pos { color: var(--grn); }
  .feed-lp.neg { color: var(--red); }

  .feed-tag {
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--coral);
    padding: 2px 6px;
    border: 1px solid rgba(232, 150, 125, 0.3);
  }

  /* ═══ TOURNAMENT PANEL ═══ */
  .panel {
    border: 1px solid rgba(255, 208, 96, 0.25);
    background: rgba(10, 22, 16, 0.92);
    padding: 14px;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .panel-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--gold);
  }

  .panel-actions {
    display: flex;
    gap: 8px;
  }

  .btn-sm {
    border: 1px solid rgba(232, 150, 125, 0.4);
    background: rgba(232, 150, 125, 0.06);
    color: var(--coral);
    font-family: var(--fm);
    font-size: 10px;
    letter-spacing: 0.8px;
    padding: 6px 10px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-sm:hover:not(:disabled) { background: rgba(232, 150, 125, 0.15); }
  .btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    border-color: rgba(0, 212, 255, 0.5);
    background: rgba(0, 212, 255, 0.08);
    color: var(--cyan2);
  }

  .btn-gold {
    border-color: rgba(255, 208, 96, 0.5);
    background: rgba(255, 208, 96, 0.08);
    color: var(--gold);
  }

  .panel-empty {
    color: var(--txt40);
    font-size: 12px;
    padding: 16px;
    text-align: center;
    border: 1px dashed rgba(240, 237, 228, 0.15);
  }
  .panel-error { color: var(--red); border-color: rgba(255, 94, 122, 0.3); }

  .tour-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 12px;
  }

  .tour-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tour-item {
    width: 100%;
    text-align: left;
    border: 1px solid rgba(255, 208, 96, 0.2);
    background: rgba(13, 24, 19, 0.9);
    padding: 10px;
    color: var(--txt);
    font-family: var(--fm);
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .tour-item.active { border-color: rgba(255, 208, 96, 0.6); box-shadow: inset 0 0 0 1px rgba(255, 208, 96, 0.1); }
  .tour-item:hover { border-color: rgba(255, 208, 96, 0.4); }

  .ti-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ti-row + .ti-row { margin-top: 5px; }
  .ti-type { color: var(--gold2); font-size: 11px; }
  .ti-status { color: var(--txt40); font-size: 10px; }
  .ti-pair { color: var(--txt); font-size: 14px; font-weight: 700; }
  .ti-time { color: var(--txt40); font-size: 10px; }
  .ti-row:last-child span { color: var(--txt40); font-size: 10px; }

  .tour-bracket {
    border: 1px solid rgba(0, 212, 255, 0.2);
    background: rgba(10, 22, 16, 0.9);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tb-head { display: flex; justify-content: space-between; align-items: center; }
  .tb-title { color: var(--cyan2); font-size: 16px; font-weight: 700; }
  .tb-sub { color: var(--txt40); font-size: 10px; letter-spacing: 0.5px; }

  .register-msg {
    border: 1px solid rgba(0, 204, 136, 0.3);
    background: rgba(0, 204, 136, 0.06);
    color: var(--grn);
    padding: 6px 10px;
    font-size: 11px;
  }

  .bracket-rows { display: flex; flex-direction: column; gap: 4px; }
  .bracket-row {
    display: grid;
    grid-template-columns: 30px 1fr 24px 1fr 30px;
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
    border: 1px solid rgba(102, 204, 230, 0.15);
    background: rgba(13, 24, 19, 0.8);
    font-size: 11px;
  }
  .br-slot { color: var(--cyan2); text-align: center; }
  .br-player { color: var(--txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .br-vs { color: var(--txt40); text-align: center; font-size: 9px; }
  .br-status { color: var(--txt40); text-align: center; }

  /* ═══ STATUS BAR ═══ */
  .status-bar {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 8px 12px;
    border-top: 1px solid rgba(232, 150, 125, 0.2);
    background: rgba(5, 11, 8, 0.97);
    backdrop-filter: blur(8px);
    color: var(--txt40);
    font-size: 10px;
    letter-spacing: 1px;
    flex-wrap: wrap;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--grn);
    box-shadow: 0 0 8px var(--grn);
    animation: dotBlink 2s ease-in-out infinite;
  }

  @keyframes dotBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .status-online { color: var(--grn); }
  .status-lat { color: var(--cyan2); }
  .status-pair { color: var(--coral); font-weight: 700; }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 900px) {
    .portals { grid-template-columns: 1fr; }
    .portal { min-height: 160px; }
    .hero-stats { gap: 10px; }
    .tour-layout { grid-template-columns: 1fr; }
  }

  @media (max-width: 600px) {
    .lobby-core { padding: 10px 10px 80px; }
    .player-name { font-size: 22px !important; }
    .portal-title { font-size: 16px; }
    .hero-bar { padding: 10px 12px; }
    .stat-value { font-size: 14px; }
    .feed-row { flex-direction: column; align-items: flex-start; }
    .feed-right { width: 100%; justify-content: flex-end; }
    .status-bar { gap: 8px; font-size: 9px; }
    .mode-select-header { flex-direction: column; align-items: flex-start; }
    .panel-head { flex-direction: column; align-items: flex-start; }
  }

  /* ── View Picker ── */
  .view-picker-section {
    margin-top: 24px;
    padding: 0 24px 16px;
  }
  .view-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 10px;
  }
  .view-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    border: 1px solid rgba(232, 150, 125, 0.2);
    border-radius: 10px;
    background: rgba(10, 26, 18, 0.6);
    color: var(--txt60);
    cursor: pointer;
    transition: all 0.18s ease;
    font-family: var(--fm);
  }
  .view-card:hover {
    border-color: rgba(232, 150, 125, 0.5);
    background: rgba(10, 26, 18, 0.85);
    transform: translateY(-2px);
    color: var(--txt);
  }
  .view-card.active {
    border-color: var(--coral);
    background: rgba(232, 150, 125, 0.1);
    color: var(--txt);
    box-shadow: 0 0 16px rgba(232, 150, 125, 0.15), inset 0 0 8px rgba(232, 150, 125, 0.06);
  }
  .vc-icon {
    font-size: 22px;
    line-height: 1;
  }
  .vc-name {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
  .vc-desc {
    font-size: 9px;
    opacity: 0.55;
  }
  @media (max-width: 700px) {
    .view-cards { grid-template-columns: repeat(2, 1fr); }
  }
</style>
