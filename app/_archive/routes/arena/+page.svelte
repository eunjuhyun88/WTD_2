<script lang="ts">
  import '$lib/styles/arena-tone.css';
  import { gameState } from '$lib/stores/gameState';
  import { recordAgentMatch } from '$lib/stores/agentData';
  import { AGDEFS, SOURCES } from '$lib/data/agents';
  import { sfx } from '$lib/audio/sfx';
  import { PHASE_LABELS, DOGE_DEPLOYS, DOGE_GATHER, DOGE_BATTLE, DOGE_WIN, DOGE_LOSE, DOGE_VOTE_LONG, DOGE_WORDS, WIN_MOTTOS, LOSE_MOTTOS } from '$lib/engine/phases';
  import { normalizeAgentId } from '$lib/engine/agents';
  import { startMatch as engineStartMatch, advancePhase, setPhaseInitCallback, resetPhaseInit, startAnalysisFromDraft } from '$lib/engine/gameLoop';
  import { calculateLP, determineConsensus, computeFBS, determineActualDirection } from '$lib/engine/scoring';
  import Lobby from '../../components/arena/Lobby.svelte';
  import ChartPanel from '../../components/arena/ChartPanel.svelte';
  import HypothesisPanel from '../../components/arena/HypothesisPanel.svelte';
  import ArenaEventCard from '../../components/arena/ArenaEventCard.svelte';
  import ArenaRewardModal from '../../components/arena/ArenaRewardModal.svelte';
  import SquadConfig from '../../components/arena/SquadConfig.svelte';
  import MatchHistory from '../../components/arena/MatchHistory.svelte';
  import { pushFeedItem, clearFeed } from '$lib/stores/battleFeedStore';
  import { addMatchRecord, type MatchRecord } from '$lib/stores/matchHistoryStore';
  import { matchRecordToReplayData, generateReplaySteps, createReplayState, type ReplayStep } from '$lib/engine/replay';
  import { addPnLEntry } from '$lib/stores/pnlStore';
  import type { Phase, Direction } from '$lib/stores/gameState';
  import { onMount, onDestroy } from 'svelte';
  import { isWalletConnected, openWalletModal, recordMatch as recordWalletMatch } from '$lib/stores/walletStore';
  import { formatTimeframeLabel } from '$lib/utils/timeframe';
  import { createArenaMatch, submitArenaDraft, runArenaAnalysis, submitArenaHypothesis, resolveArenaMatch, getTournamentBracket } from '$lib/api/arenaApi';
  import type { AnalyzeResponse, TournamentBracketMatch } from '$lib/api/arenaApi';
  import type { DraftSelection } from '$lib/engine/types';
  import { createBattleResolver, type BattleTickState } from '$lib/engine/battleResolver';
  import { mapAnalysisToC02, buildChartAnnotations, buildAgentMarkers } from '../../components/arena/arenaState';
  import ViewPicker from '../../components/arena/ViewPicker.svelte';
  import PhaseGuide from '../../components/arena/PhaseGuide.svelte';
  import ResultPanel from '../../components/arena/ResultPanel.svelte';
  import ChartWarView from '../../components/arena/views/ChartWarView.svelte';
  import AgentArenaView from '../../components/arena/views/AgentArenaView.svelte';
  import MissionControlView from '../../components/arena/views/MissionControlView.svelte';
  import CardDuelView from '../../components/arena/views/CardDuelView.svelte';

  $: walletOk = $isWalletConnected;

  $: state = $gameState;
  $: modeLabel = state.arenaMode;
  $: tournamentInfo = state.tournament;
  $: resultOverlayTitle = state.arenaMode === 'TOURNAMENT'
    ? (resultData.win ? '🏆 TOURNAMENT WIN 🏆' : '☠ TOURNAMENT LOSS ☠')
    : state.arenaMode === 'PVP'
      ? (resultData.win ? '🏆 YOU WIN! 🏆' : '💀 YOU LOSE 💀')
      : (resultData.win ? '🏁 PVE CLEAR' : '❌ PVE FAILED');
  // Active agents for this match
  $: activeAgents = AGDEFS.filter(a => state.selectedAgents.includes(a.id));
  $: railRank = [...activeAgents].sort((a, b) => b.conf - a.conf);
  $: longBalance = Math.max(0, Math.min(100, Math.round(state.score)));

  // UI state
  let findings: Array<{def: typeof AGDEFS[0]; visible: boolean}> = [];
  let agentStates: Record<string, {state: string; speech: string; energy: number; voteDir: string; posX?: number; posY?: number}> = {};
  let verdictVisible = false;
  let resultVisible = false;
  let resultData = { win: false, lp: 0, tag: '', motto: '' };
  let floatingWords: Array<{id: number; text: string; color: string; x: number; dur: number}> = [];
  let feedMessages: Array<{icon: string; name: string; color: string; text: string; dir?: string; isNew?: boolean}> = [];
  let councilActive = false;

  // ═══════ CHARACTER-CENTERED ARENA STATE ═══════
  // 9-state character state machine
  type CharState = 'idle' | 'patrol' | 'lock' | 'windup' | 'cast' | 'impact' | 'recover' | 'celebrate' | 'panic';
  // 8 action types
  type ActionType = 'dash' | 'ping' | 'shield' | 'burst' | 'hook' | 'taunt' | 'assist' | 'finisher';
  interface CharAction {
    type: ActionType;
    label: string;
    emoji: string;
    duration: number; // ms for cast animation
    shakeLevel: 'light' | 'medium' | 'heavy';
    flashColor: 'white' | 'green' | 'red' | 'gold';
  }
  const ACTION_CATALOG: Record<ActionType, CharAction> = {
    dash:     { type: 'dash',     label: '돌진!',     emoji: '💨', duration: 400,  shakeLevel: 'light',  flashColor: 'white' },
    ping:     { type: 'ping',     label: '핑!',       emoji: '📡', duration: 300,  shakeLevel: 'light',  flashColor: 'white' },
    shield:   { type: 'shield',   label: '방어!',     emoji: '🛡️', duration: 600,  shakeLevel: 'light',  flashColor: 'green' },
    burst:    { type: 'burst',    label: '폭발!',     emoji: '💥', duration: 500,  shakeLevel: 'medium', flashColor: 'gold' },
    hook:     { type: 'hook',     label: '훅!',       emoji: '🪝', duration: 450,  shakeLevel: 'medium', flashColor: 'red' },
    taunt:    { type: 'taunt',    label: '도발!',     emoji: '😤', duration: 350,  shakeLevel: 'light',  flashColor: 'white' },
    assist:   { type: 'assist',   label: '지원!',     emoji: '✨', duration: 500,  shakeLevel: 'light',  flashColor: 'green' },
    finisher: { type: 'finisher', label: '필살기!',   emoji: '⚡', duration: 800,  shakeLevel: 'heavy',  flashColor: 'gold' },
  };
  // Per-character role → preferred actions
  const CHAR_ACTIONS: Record<string, ActionType[]> = {
    STRUCTURE: ['dash', 'shield', 'burst', 'finisher'],
    ICT:       ['hook', 'shield', 'taunt', 'finisher'],
    VPA:       ['burst', 'dash', 'assist', 'finisher'],
    FLOW:      ['ping', 'dash', 'assist', 'finisher'],
    MACRO:     ['shield', 'assist', 'burst', 'finisher'],
    DERIV:     ['burst', 'hook', 'dash', 'finisher'],
    SENTI:     ['taunt', 'ping', 'assist', 'finisher'],
    VALUATION: ['ping', 'shield', 'burst', 'finisher'],
  };
  // Character sprite state per agent
  interface CharSpriteState {
    charState: CharState;
    x: number;       // % position in arena
    y: number;       // % position in arena
    targetX: number;
    targetY: number;
    actionEmoji: string;
    actionLabel: string;
    flipX: boolean;
    hp: number;       // 0-100
    energy: number;   // 0-100
    showHit: boolean;
    hitText: string;
    hitColor: string;
  }
  let charSprites: Record<string, CharSpriteState> = {};
  // Arena combat state
  let vsMeter = 50;
  let vsMeterTarget = 50;
  interface BattleTurn {
    agent: typeof AGDEFS[0];
    attackName: string;
    action: ActionType;
    effectiveness: 'super' | 'normal' | 'weak';
    isCritical: boolean;
    meterShift: number;
    dirSign: number;
    damage: number;
  }
  let battleTurns: BattleTurn[] = [];
  let currentTurnIdx = -1;
  let battleNarration = '';
  let turnTimers: ReturnType<typeof setTimeout>[] = [];
  let showVsSplash = false;
  let showMarkers = true;
  // Game HUD state
  let missionText = '';
  let enemyHP = 100;
  let enemyMomentum = 50;
  let comboCount = 0;
  let lastHitTime = 0;
  let showCritical = false;
  let showCombo = false;
  let criticalText = '';
  let battleRoundTime = 0; // 0-90 seconds
  let battlePhaseLabel = 'STANDBY';
  // Arena chat log (secondary)
  let chatMessages: Array<{id: number; agentId: string; name: string; icon: string; color: string; text: string; isAction?: boolean}> = [];
  // Particles floating in arena
  let arenaParticles: Array<{id: number; x: number; y: number; size: number; speed: number; opacity: number}> = [];

  $: missionText = state.hypothesis
    ? `${state.hypothesis.dir} R:R 1:${state.hypothesis.rr?.toFixed(1) || '?'} · TP $${Math.round(state.hypothesis.tp || 0).toLocaleString()}`
    : 'STANDBY — 포지션을 설정하세요';

  // Initialize sprite positions in circular formation
  function initCharSprites() {
    const total = activeAgents.length;
    charSprites = {};
    activeAgents.forEach((ag, i) => {
      const pos = getFormPos(i, total);
      charSprites[ag.id] = {
        charState: 'idle',
        x: pos.x, y: pos.y,
        targetX: pos.x, targetY: pos.y,
        actionEmoji: '', actionLabel: '',
        flipX: pos.x > 50,
        hp: 100, energy: 0,
        showHit: false, hitText: '', hitColor: '',
      };
    });
    // Spawn floating particles
    arenaParticles = Array.from({length: 12}, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 3,
      speed: 0.5 + Math.random() * 1.5,
      opacity: 0.1 + Math.random() * 0.2,
    }));
  }

  function getFormPos(idx: number, total: number): { x: number; y: number } {
    if (total <= 0) return { x: 50, y: 50 };
    const angle = ((idx / total) * 360 - 90) * (Math.PI / 180);
    return {
      x: 50 + Math.cos(angle) * 30,
      y: 50 + Math.sin(angle) * 34
    };
  }

  // State machine transition
  function setCharState(agId: string, newState: CharState, duration = 0) {
    if (!charSprites[agId]) return;
    charSprites[agId] = { ...charSprites[agId], charState: newState };
    charSprites = charSprites; // trigger reactivity
    if (duration > 0) {
      const t = setTimeout(() => {
        if (charSprites[agId]) {
          charSprites[agId] = { ...charSprites[agId], charState: 'idle' };
          charSprites = charSprites;
        }
      }, duration);
      turnTimers.push(t);
    }
  }

  // Move character to position with animation
  function moveChar(agId: string, tx: number, ty: number) {
    if (!charSprites[agId]) return;
    charSprites[agId] = {
      ...charSprites[agId],
      targetX: tx, targetY: ty,
      x: tx, y: ty,
      flipX: tx > charSprites[agId].x,
    };
    charSprites = charSprites;
  }

  // Show floating hit text on a character
  function showCharHit(agId: string, text: string, color: string) {
    if (!charSprites[agId]) return;
    charSprites[agId] = { ...charSprites[agId], showHit: true, hitText: text, hitColor: color };
    charSprites = charSprites;
    const t = setTimeout(() => {
      if (charSprites[agId]) {
        charSprites[agId] = { ...charSprites[agId], showHit: false };
        charSprites = charSprites;
      }
    }, 1200);
    turnTimers.push(t);
  }

  // Show action emoji above character
  function showCharAction(agId: string, emoji: string, label: string) {
    if (!charSprites[agId]) return;
    charSprites[agId] = { ...charSprites[agId], actionEmoji: emoji, actionLabel: label };
    charSprites = charSprites;
    const t = setTimeout(() => {
      if (charSprites[agId]) {
        charSprites[agId] = { ...charSprites[agId], actionEmoji: '', actionLabel: '' };
        charSprites = charSprites;
      }
    }, 1300);
    turnTimers.push(t);
  }

  // Combo tracker
  function trackCombo() {
    const now = Date.now();
    if (now - lastHitTime < 3000) {
      comboCount++;
      showCombo = true;
      const t = setTimeout(() => { showCombo = false; }, 1000);
      turnTimers.push(t);
    } else {
      comboCount = 1;
    }
    lastHitTime = now;
  }

  const ATTACK_NAMES: Record<string, string> = {
    STRUCTURE: '차트 분석', VPA: '거래량 델타', ICT: '유동성 스윕',
    DERIV: '파생 분석', FLOW: '고래 추적', SENTI: '소셜 스캔',
    MACRO: '매크로 분석', VALUATION: '온체인 밸류'
  };
  const ATTACK_SUPER: Record<string, string> = {
    STRUCTURE: '강세 브레이크아웃!', VPA: '거래량 폭발!', ICT: '스마트머니 포착!',
    DERIV: 'OI 급증!', FLOW: '대형 매수!', SENTI: '분위기 폭등!',
    MACRO: '글로벌 확인!', VALUATION: '저평가 발견!'
  };
  const ATTACK_WEAK: Record<string, string> = {
    STRUCTURE: '패턴 불분명...', VPA: '거래량 약세...', ICT: '유동성 부족...',
    DERIV: '데이터 혼재...', FLOW: '흐름 불확실...', SENTI: '분위기 혼조...',
    MACRO: '신호 약함...', VALUATION: '밸류 중립...'
  };
  let phaseLabel = PHASE_LABELS.DRAFT;
  let pvpVisible = false;
  let matchHistory: Array<{n: number; win: boolean; lp: number; score: number; streak: number}> = [];
  let historyOpen = false;
  let matchHistoryOpen = false;
  let arenaRailTab: 'rank' | 'log' | 'map' = 'rank';

  type ArenaLiveEvent = {
    id: number;
    icon: string;
    title: string;
    detail: string;
    severity: 'LOW' | 'MID' | 'HIGH';
    tint: string;
    expiresAt: number;
  };
  const LIVE_EVENT_TTL_MS = 8000;
  const LIVE_EVENT_DECK: Record<'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE', Array<Omit<ArenaLiveEvent, 'id' | 'expiresAt'>>> = {
    ANALYSIS: [
      { icon: '🛰️', title: 'VOL SHIFT', detail: 'Micro volatility spike detected on last swing.', severity: 'MID', tint: '#6fd6ff' },
      { icon: '🐋', title: 'WHALE TRACE', detail: 'On-chain flow leaning to directional build-up.', severity: 'LOW', tint: '#7ef0c2' },
      { icon: '📡', title: 'SOCIAL PULSE', detail: 'Narrative momentum rising in high-beta clusters.', severity: 'LOW', tint: '#89a8ff' },
    ],
    HYPOTHESIS: [
      { icon: '⏱️', title: 'ENTRY WINDOW', detail: 'Timing edge narrows. Tighten your trigger zone.', severity: 'MID', tint: '#7ecbff' },
      { icon: '🧭', title: 'BIAS CHECK', detail: 'Model confidence diverges across macro and flow.', severity: 'HIGH', tint: '#ff8ea5' },
      { icon: '🛡️', title: 'RISK GATE', detail: 'Suggested risk budget below 2% per attempt.', severity: 'LOW', tint: '#76f2bf' },
    ],
    BATTLE: [
      { icon: '🌌', title: 'MOMENTUM BURST', detail: 'Directional acceleration in active candle range.', severity: 'HIGH', tint: '#ff9b7f' },
      { icon: '💥', title: 'LIQUIDITY SWEEP', detail: 'Fast wick event cleared a nearby stop pocket.', severity: 'MID', tint: '#ffb26f' },
      { icon: '📈', title: 'TREND HOLD', detail: 'Price structure remains aligned with current bias.', severity: 'LOW', tint: '#65f4c0' },
    ],
  };

  let liveEvents: ArenaLiveEvent[] = [];
  let liveEventTimer: ReturnType<typeof setInterval> | null = null;
  let rewardVisible = false;
  let rewardXp = 0;
  let rewardStreak = 0;
  let rewardBadges: string[] = [];

  $: hudPhaseProgress = ({ DRAFT: 0.1, ANALYSIS: 0.35, HYPOTHESIS: 0.55, BATTLE: 0.78, RESULT: 1 } as const)[state.phase] ?? 0.1;

  // ═══════ SERVER SYNC STATE ═══════
  let serverMatchId: string | null = null;
  let serverAnalysis: AnalyzeResponse | null = null;
  let apiError: string | null = null;

  // Squad Config handlers
  async function onSquadDeploy(e: { config: import('$lib/stores/gameState').SquadConfig }) {
    gameState.update(s => ({ ...s, squadConfig: e.config }));
    clearFeed();
    pushFeedItem({
      agentId: 'system', agentName: 'SYSTEM', agentIcon: '🐕',
      agentColor: '#E8967D',
      text: `Squad configured! Risk: ${e.config.riskLevel.toUpperCase()} · TF: ${formatTimeframeLabel(e.config.timeframe)} · Analysis starting...`,
      phase: 'DRAFT'
    });

    // ── Server sync: create match + submit draft ──
    const currentState = $gameState;
    try {
      apiError = null;
      const matchRes = await createArenaMatch(currentState.pair, e.config.timeframe);
      serverMatchId = matchRes.matchId;

      // Build draft from selected agents (equal weight for now)
      const agentCount = currentState.selectedAgents.length;
      if (agentCount <= 0) throw new Error('No agents selected for draft');
      const weight = Math.round(100 / agentCount);
      const draft: DraftSelection[] = currentState.selectedAgents.map((agentId, i) => ({
        agentId: normalizeAgentId(agentId),
        specId: 'base',
        weight: i === agentCount - 1 ? 100 - weight * (agentCount - 1) : weight,
      }));
      await submitArenaDraft(serverMatchId, draft);
    } catch (err) {
      console.warn('[Arena] Server sync failed (match continues locally):', err);
      apiError = (err as Error).message;
    }

    startAnalysisFromDraft();
  }

  function onSquadBack() {
    // Go back to lobby
    gameState.update(s => ({ ...s, inLobby: true, running: false, phase: 'DRAFT', timer: 0 }));
  }

  // ═══════ HYPOTHESIS STATE ═══════
  let hypothesisVisible = false;
  let hypothesisTimer = 45;
  let hypothesisInterval: ReturnType<typeof setInterval> | null = null;
  let _battleInterval: ReturnType<typeof setInterval> | null = null;
  let _battleResolver: ReturnType<typeof createBattleResolver> | null = null;
  let _battleResolverUnsub: (() => void) | null = null;

  // ═══════ REPLAY STATE ═══════
  let replayState = createReplayState();
  let replaySteps: ReplayStep[] = [];
  let replayTimer: ReturnType<typeof setTimeout> | null = null;

  function startReplay(record: MatchRecord) {
    const data = matchRecordToReplayData(record);
    replaySteps = generateReplaySteps(data);
    replayState = { active: true, data, currentStep: 0, totalSteps: replaySteps.length, paused: false };

    // Close history panel
    historyOpen = false;

    addFeed('🎬', 'REPLAY', '#66CCE6', `Replaying Match #${record.matchN}...`);
    executeReplayStep(0);
  }

  function executeReplayStep(stepIdx: number) {
    if (stepIdx >= replaySteps.length || !replayState.active) {
      // Replay finished
      replayState = { ...replayState, active: false };
      addFeed('🎬', 'REPLAY', '#66CCE6', 'Replay complete!');
      return;
    }

    replayState = { ...replayState, currentStep: stepIdx };
    const step = replaySteps[stepIdx];
    const speed = state.speed || 3;

    switch (step.type) {
      case 'deploy':
        addFeed('🐕', 'REPLAY', '#66CCE6', `Agents deployed: ${step.agents.length} agents`);
        break;
      case 'hypothesis':
        if (step.hypothesis) {
          addFeed('🐕', 'REPLAY', '#66CCE6', `Your call: ${step.hypothesis.dir} · R:R 1:${step.hypothesis.rr.toFixed(1)}`);
        }
        break;
      case 'scout':
        step.agentVotes.forEach((v, i) => {
          safeTimeout(() => {
            addFeed(v.icon, v.name, v.color, `${v.dir} — ${v.conf}% confidence`);
          }, i * 300 / speed);
        });
        break;
      case 'council':
        addFeed('🗳', 'REPLAY', '#66CCE6', 'Council deliberation...');
        break;
      case 'verdict':
        addFeed('★', 'REPLAY', '#66CCE6', `Consensus: ${step.consensusType?.toUpperCase() || 'UNKNOWN'}`);
        break;
      case 'battle':
        addFeed('⚔', 'REPLAY', '#66CCE6', `Battle result: ${step.battleResult?.toUpperCase() || 'UNKNOWN'}`);
        break;
      case 'result':
        addFeed(step.win ? '🏆' : '😢', 'REPLAY', step.win ? '#00CC88' : '#FF5E7A',
          `${step.win ? 'WIN' : 'LOSS'} · ${step.lp > 0 ? '+' : ''}${step.lp} LP`);
        break;
    }

    // Auto-advance to next step
    replayTimer = setTimeout(() => {
      executeReplayStep(stepIdx + 1);
    }, 2000 / speed);
  }

  function exitReplay() {
    if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; }
    replayState = createReplayState();
    replaySteps = [];
  }

  // ═══════ PREVIEW STATE ═══════
  let previewVisible = false;
  let previewAutoTimer: ReturnType<typeof setTimeout> | null = null;

  // ═══════ FLOATING DIR BAR STATE ═══════
  let floatDir: 'LONG' | 'SHORT' | null = null;

  // ═══════ COMPARE STATE ═══════
  let compareVisible = false;
  let compareData = {
    userDir: 'LONG' as string,
    agentDir: 'LONG' as string,
    userEntry: 0, userTp: 0, userSl: 0,
    agentScore: 0,
    consensus: { type: 'partial', lpMult: 1.0, badge: 'PARTIAL x1.0' },
    agentVotes: [] as Array<{name: string; icon: string; color: string; dir: string; conf: number}>
  };

  // ═══════ CHART POSITION STATE ═══════
  let showChartPosition = false;
  let chartPosEntry: number | null = null;
  let chartPosTp: number | null = null;
  let chartPosSl: number | null = null;
  let chartPosDir = 'LONG';

  // ═══════ CHART AGENT MARKERS ═══════
  let chartAgentMarkers: Array<{
    time: number;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
    text: string;
  }> = [];

  // ═══════ CHART ANNOTATIONS ═══════
  let chartAnnotations: Array<{
    id: string; icon: string; name: string; color: string;
    label: string; detail: string;
    yPercent: number; xPercent: number;
    type: 'ob' | 'funding' | 'whale' | 'signal';
  }> = [];

  function generateAnnotations() {
    chartAnnotations = buildChartAnnotations(activeAgents);
  }

  function generateAgentMarkers() {
    chartAgentMarkers = buildAgentMarkers(activeAgents);
  }

  function initAgentStates() {
    agentStates = {};
    for (const ag of activeAgents) {
      agentStates[ag.id] = { state: 'idle', speech: '', energy: 0, voteDir: '' };
    }
  }

  // Typing animation state
  let speechTimers: Record<string, ReturnType<typeof setInterval>> = {};

  function setSpeech(agentId: string, text: string, dur = 1500) {
    // Clear any existing typing timer for this agent
    if (speechTimers[agentId]) { clearInterval(speechTimers[agentId]); delete speechTimers[agentId]; }

    // Start typing effect: reveal one char at a time
    let charIdx = 0;
    const fullText = text;
    agentStates[agentId] = { ...agentStates[agentId], speech: '' };
    agentStates = { ...agentStates };

    speechTimers[agentId] = setInterval(() => {
      charIdx++;
      if (charIdx >= fullText.length) {
        // Typing complete
        clearInterval(speechTimers[agentId]);
        delete speechTimers[agentId];
        agentStates[agentId] = { ...agentStates[agentId], speech: fullText };
        agentStates = { ...agentStates };

        // Clear after duration
        if (dur > 0) safeTimeout(() => {
          if (agentStates[agentId]) {
            agentStates[agentId] = { ...agentStates[agentId], speech: '' };
            agentStates = { ...agentStates };
          }
        }, dur);
      } else {
        agentStates[agentId] = { ...agentStates[agentId], speech: fullText.slice(0, charIdx) + '|' };
        agentStates = { ...agentStates };
      }
    }, 30);
  }

  // Bridge: legacy agent state → char sprite state mapping
  const AGENT_TO_CHAR_STATE: Record<string, CharState> = {
    idle: 'idle', walk: 'patrol', think: 'lock', alert: 'lock',
    charge: 'windup', vote: 'cast', jump: 'celebrate', sad: 'panic',
  };
  function setAgentState(agentId: string, st: string) {
    if (agentStates[agentId]) {
      agentStates[agentId] = { ...agentStates[agentId], state: st };
      agentStates = { ...agentStates };
    }
    // Sync char sprite state
    const mapped = AGENT_TO_CHAR_STATE[st] || 'idle';
    if (charSprites[agentId]) {
      charSprites[agentId] = { ...charSprites[agentId], charState: mapped as CharState };
      charSprites = charSprites;
    }
  }

  function setAgentEnergy(agentId: string, e: number) {
    if (agentStates[agentId]) {
      agentStates[agentId] = { ...agentStates[agentId], energy: e };
      agentStates = { ...agentStates };
    }
    // Sync to char sprite
    if (charSprites[agentId]) {
      charSprites[agentId] = { ...charSprites[agentId], energy: Math.min(100, e) };
      charSprites = charSprites;
    }
  }

  let feedCursorTimer: ReturnType<typeof setTimeout> | null = null;
  let compareAutoTimer: ReturnType<typeof setTimeout> | null = null;
  let pvpShowTimer: ReturnType<typeof setTimeout> | null = null;
  let _arenaDestroyed = false; // guard for fire-and-forget timers after unmount
  const _pendingTimers = new Set<ReturnType<typeof setTimeout>>(); // track unnamed timers for cleanup
  /** Tracked setTimeout that auto-cleans from the set and respects _arenaDestroyed */
  function safeTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => { _pendingTimers.delete(id); if (!_arenaDestroyed) fn(); }, ms);
    _pendingTimers.add(id);
    return id;
  }

  function addFeed(icon: string, name: string, color: string, text: string, dir?: string) {
    // Add with 'new' flag for slide-in animation + blinking cursor
    const msg = { icon, name, color, text, dir, isNew: true };
    feedMessages = [...feedMessages.map(m => ({ ...m, isNew: false })), msg].slice(-10);

    // Remove cursor after 500ms
    if (feedCursorTimer) clearTimeout(feedCursorTimer);
    feedCursorTimer = setTimeout(() => {
      feedMessages = feedMessages.map(m => ({ ...m, isNew: false }));
    }, 500);
  }

  function dogeFloat() {
    const colors = ['#FF5E7A', '#E8967D', '#66CCE6', '#00CC88', '#DCB970', '#F0EDE4'];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      safeTimeout(() => {
        const id = Date.now() + i;
        floatingWords = [...floatingWords, {
          id,
          text: DOGE_WORDS[Math.floor(Math.random() * DOGE_WORDS.length)],
          color: colors[Math.floor(Math.random() * colors.length)],
          x: 10 + Math.random() * 80,
          dur: 1.5 + Math.random() * 1
        }];
        safeTimeout(() => { floatingWords = floatingWords.filter(w => w.id !== id); }, 2500);
      }, i * 200);
    }
  }

  // ═══════ GAME JUICE UTILITIES ═══════
  function juice_shake(intensity: 'light'|'medium'|'heavy' = 'medium') {
    const el = document.querySelector('.battle-layout');
    if (!el) return;
    el.classList.remove('jc-shake-light','jc-shake-medium','jc-shake-heavy');
    void (el as HTMLElement).offsetHeight;
    el.classList.add(`jc-shake-${intensity}`);
    setTimeout(() => el.classList.remove(`jc-shake-${intensity}`), 400);
  }
  function juice_flash(color: 'white'|'green'|'red'|'gold' = 'white') {
    const d = document.createElement('div');
    d.className = `jc-flash jc-flash-${color}`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 400);
  }
  function juice_flyNumber(text: string, x: number, y: number, color: string) {
    const s = document.createElement('span');
    s.className = 'jc-fly-number';
    s.textContent = text;
    s.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }
  function juice_confetti(count = 30) {
    const cols = ['#FF5E7A','#00CC88','#66CCE6','#DCB970','#E8967D','#8b5cf6','#ffcc00'];
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const d = document.createElement('div');
        d.className = 'jc-confetti';
        const sz = 4 + Math.random() * 6;
        d.style.cssText = `left:${10+Math.random()*80}vw;width:${sz}px;height:${sz}px;background:${cols[i%cols.length]};animation-delay:${Math.random()*0.3}s;animation-duration:${1.5+Math.random()*1}s;border-radius:${Math.random()>0.5?'50%':'2px'}`;
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 3000);
      }, i * 25);
    }
  }

  // ═══════ TURN SYSTEM (Character-Centered) ═══════
  function scheduleBattleTurns(): BattleTurn[] {
    const lastActions: Record<string, ActionType> = {};
    return activeAgents.map(ag => {
      const r = Math.random();
      const eff: 'super'|'normal'|'weak' = r < 0.2 ? 'super' : r > 0.8 ? 'weak' : 'normal';
      const crit = Math.random() < 0.12;
      // Pick action from character's repertoire (anti-repetition)
      const pool = CHAR_ACTIONS[ag.id] || ['burst', 'dash', 'shield', 'finisher'];
      let action: ActionType;
      if (crit || eff === 'super') {
        action = 'finisher'; // Big moments → finisher
      } else {
        const filtered = pool.filter(a => a !== lastActions[ag.id] && a !== 'finisher');
        action = filtered[Math.floor(Math.random() * filtered.length)] || pool[0];
      }
      lastActions[ag.id] = action;
      const eMult = eff === 'super' ? 1.5 : eff === 'weak' ? 0.5 : 1.0;
      const cMult = crit ? 2.0 : 1.0;
      const ds = ag.dir === 'LONG' ? 1 : -1;
      const baseDamage = (eff === 'super' ? 18 : eff === 'weak' ? 5 : 10) * cMult;
      return {
        agent: ag, attackName: ATTACK_NAMES[ag.id]||'분석',
        action, effectiveness: eff, isCritical: crit,
        meterShift: ag.conf * 0.3 * ds * eMult * cMult,
        dirSign: ds, damage: baseDamage,
      };
    });
  }

  // executeTurn with full state machine: windup → cast → impact → recover
  function executeTurn(turn: BattleTurn, idx: number) {
    currentTurnIdx = idx;
    const agId = turn.agent.id;
    const act = ACTION_CATALOG[turn.action];

    // ── Phase 1: LOCK (0ms) — character focuses
    setCharState(agId, 'lock');
    setAgentState(agId, 'alert');
    battleNarration = `${turn.agent.name} 준비 중...`;
    battlePhaseLabel = `${turn.agent.name} TURN`;

    // ── Phase 2: WINDUP (400ms) — character charges
    const t1 = setTimeout(() => {
      setCharState(agId, 'windup');
      setAgentState(agId, 'charge');
      sfx.charge();
      showCharAction(agId, '⚡', '차징...');
      battleNarration = `${turn.agent.name}: ${act.label}`;
      addChatMsg(turn.agent, `${turn.attackName} ${act.emoji} ${act.label}`, true);
      // Move toward center for attack
      const homePos = getFormPos(activeAgents.indexOf(turn.agent), activeAgents.length);
      moveChar(agId, 50 + (homePos.x - 50) * 0.3, 50 + (homePos.y - 50) * 0.3);
    }, 400);
    turnTimers.push(t1);

    // ── Phase 3: CAST (900ms) — action executes
    const t2 = setTimeout(() => {
      setCharState(agId, 'cast');
      showCharAction(agId, act.emoji, act.label);
    }, 900);
    turnTimers.push(t2);

    // ── Phase 4: IMPACT (1300ms) — damage/effect resolves
    const t3 = setTimeout(() => {
      setCharState(agId, 'impact');
      trackCombo();

      if (turn.isCritical) {
        juice_shake('heavy'); juice_flash('gold'); sfx.verdict();
        battleNarration = `💥 CRITICAL! ${turn.agent.name} ${ATTACK_SUPER[agId]||'필살!'}`;
        showCharHit(agId, `CRITICAL! -${Math.round(turn.damage)}`, '#ffcc00');
        showCritical = true; criticalText = `💥 ${turn.agent.name} CRITICAL!`;
        addChatMsg(turn.agent, `급소!! ${ATTACK_SUPER[agId]||''} 🔥`);
        const tc = setTimeout(() => { showCritical = false; }, 1200);
        turnTimers.push(tc);
      } else if (turn.effectiveness === 'super') {
        juice_shake('medium'); juice_flash('white'); sfx.impact();
        battleNarration = `⚡ ${turn.attackName}! ${ATTACK_SUPER[agId]||'효과 굉장!'}`;
        showCharHit(agId, `-${Math.round(turn.damage)}`, '#00ff88');
        addChatMsg(turn.agent, `${ATTACK_SUPER[agId]||'효과 굉장!'} ⚡`);
      } else if (turn.effectiveness === 'weak') {
        sfx.step();
        battleNarration = `${turn.attackName}... ${ATTACK_WEAK[agId]||'효과 약함'}`;
        showCharHit(agId, 'WEAK', '#ff5e7a');
        addChatMsg(turn.agent, `${ATTACK_WEAK[agId]||'효과 약함...'} 😐`);
      } else {
        juice_shake('light'); sfx.impact();
        battleNarration = `${turn.attackName}! 나쁘지 않다!`;
        showCharHit(agId, `-${Math.round(turn.damage)}`, '#fff');
        addChatMsg(turn.agent, `나쁘지 않다! 💪`);
      }

      // Update VS meter
      vsMeterTarget = Math.max(5, Math.min(95, vsMeterTarget + turn.meterShift));
      vsMeter = vsMeterTarget;
      // Update enemy HP
      enemyHP = Math.max(0, Math.min(100, enemyHP - turn.damage * (turn.dirSign > 0 ? 1 : -1) * 0.5));
      enemyMomentum = Math.max(0, Math.min(100, enemyMomentum + turn.meterShift * 0.3));
      // Update character energy
      const cSprite = charSprites[agId];
      if (cSprite) {
        cSprite.energy = Math.min(100, cSprite.energy + 25 + (turn.isCritical ? 20 : 0));
        charSprites = charSprites;
      }
      const en = Math.min(100, (agentStates[agId]?.energy||0) + 30 + (turn.isCritical?20:0));
      setAgentEnergy(agId, en);
    }, 1300);
    turnTimers.push(t3);

    // ── Phase 5: RECOVER (2000ms) — return to position (celebrate on big hits)
    const bigHit = turn.effectiveness === 'super' || turn.isCritical;
    const t4 = setTimeout(() => {
      setCharState(agId, bigHit ? 'celebrate' : 'recover');
      setAgentState(agId, bigHit ? 'jump' : 'idle');
      // Move back to home position
      const homePos = getFormPos(activeAgents.indexOf(turn.agent), activeAgents.length);
      moveChar(agId, homePos.x, homePos.y);
      battlePhaseLabel = 'COMBAT';
    }, 2000);
    turnTimers.push(t4);

    // ── Phase 6: IDLE (2500ms) — ready for next turn
    const t5 = setTimeout(() => {
      setCharState(agId, 'idle');
    }, 2500);
    turnTimers.push(t5);
  }

  function addChatMsg(ag: typeof AGDEFS[0], text: string, isAction = false) {
    chatMessages = [...chatMessages, { id: Date.now()+Math.random(), agentId: ag.id, name: ag.name, icon: ag.icon, color: ag.color, text, isAction }].slice(-20);
  }

  function clearTurnTimers() { turnTimers.forEach(t => clearTimeout(t)); turnTimers = []; }

  function startBattleTurnSequence() {
    battleTurns = scheduleBattleTurns();
    vsMeter = 50; vsMeterTarget = 50;
    currentTurnIdx = -1; chatMessages = []; battleNarration = '';
    enemyHP = 100; enemyMomentum = 50; comboCount = 0;
    battlePhaseLabel = 'VS SPLASH';
    initCharSprites();
    showVsSplash = true;
    juice_shake('heavy'); sfx.enter();
    addChatMsg({ id:'SYS', name:'SYSTEM', icon:'⚔', color:'#ff5e7a' } as any,
      state.hypothesis?.dir === 'LONG' ? '🔥 LONG SQUAD vs MARKET 🔥' : '🔥 SHORT SQUAD vs MARKET 🔥', true);

    // All characters patrol during splash
    activeAgents.forEach(ag => setCharState(ag.id, 'patrol', 1500));

    const t0 = setTimeout(() => {
      showVsSplash = false;
      battlePhaseLabel = 'COMBAT';
    }, 1500);
    turnTimers.push(t0);

    // Execute turns with spacing
    battleTurns.forEach((turn, i) => {
      const delay = 1800 + i * 2800;
      const t = setTimeout(() => executeTurn(turn, i), delay);
      turnTimers.push(t);
    });

    // Suspense before result
    const suspenseDelay = 1800 + battleTurns.length * 2800;
    const ts = setTimeout(() => {
      battleNarration = '⏳ 시장이 결정한다...';
      battlePhaseLabel = 'JUDGMENT';
      addChatMsg({ id:'SYS', name:'MARKET', icon:'🌑', color:'#ffcc00' } as any, '시장이 결정한다...', true);
      juice_shake('light');
      // All characters lock during suspense
      activeAgents.forEach(ag => setCharState(ag.id, 'lock'));
    }, suspenseDelay);
    turnTimers.push(ts);
  }

  function clearLiveEventTimer() {
    if (liveEventTimer) {
      clearInterval(liveEventTimer);
      liveEventTimer = null;
    }
  }

  function trimExpiredEvents() {
    const now = Date.now();
    liveEvents = liveEvents.filter((ev) => ev.expiresAt > now);
  }

  function pushLiveEvent(phase: 'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE') {
    const bucket = LIVE_EVENT_DECK[phase];
    if (!bucket || bucket.length === 0) return;
    const picked = bucket[Math.floor(Math.random() * bucket.length)];
    const ev: ArenaLiveEvent = {
      ...picked,
      id: Date.now() + Math.floor(Math.random() * 10000),
      expiresAt: Date.now() + LIVE_EVENT_TTL_MS
    };
    liveEvents = [ev, ...liveEvents].slice(0, 3);
    addFeed(ev.icon, 'EVENT', ev.tint, `${ev.title} · ${ev.detail}`);
    safeTimeout(() => {
      liveEvents = liveEvents.filter((item) => item.id !== ev.id);
    }, LIVE_EVENT_TTL_MS + 60);
  }

  function startLiveEventStream(phase: 'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE') {
    clearLiveEventTimer();
    trimExpiredEvents();
    pushLiveEvent(phase);
    const cadence = phase === 'BATTLE' ? 3600 : phase === 'HYPOTHESIS' ? 4400 : 5000;
    liveEventTimer = setInterval(() => {
      if (_arenaDestroyed) return;
      trimExpiredEvents();
      pushLiveEvent(phase);
    }, Math.max(2200, Math.round(cadence / Math.max(1, state.speed || 1))));
  }

  function clearArenaDynamics() {
    clearLiveEventTimer();
    liveEvents = [];
    rewardVisible = false;
    rewardXp = 0;
    rewardStreak = 0;
    rewardBadges = [];
  }

  // ═══════ HYPOTHESIS HANDLERS ═══════
  function onHypothesisSubmit(h: { dir: Direction; conf: number; tf: string; vmode: 'tpsl' | 'close'; closeN: number; tags: string[]; reason: string; entry: number; tp: number; sl: number; rr: number }) {
    // Clear timer
    if (hypothesisInterval) { clearInterval(hypothesisInterval); hypothesisInterval = null; }
    hypothesisVisible = false;

    // Set hypothesis in game state
    gameState.update(s => ({
      ...s,
      hypothesis: {
        dir: h.dir,
        conf: h.conf,
        tags: new Set(),
        tf: h.tf,
        vmode: h.vmode,
        closeN: h.closeN,
        entry: h.entry,
        tp: h.tp,
        sl: h.sl,
        rr: h.rr
      },
      pos: {
        entry: h.entry,
        tp: h.tp,
        sl: h.sl,
        dir: h.dir,
        rr: h.rr,
        size: 0,
        lev: 0
      }
    }));

    // Show position on chart
    showChartPosition = true;
    chartPosEntry = h.entry;
    chartPosTp = h.tp;
    chartPosSl = h.sl;
    chartPosDir = h.dir;

    addFeed('🐕', 'YOU', '#E8967D', `${h.dir} · TP $${h.tp.toLocaleString()} · SL $${h.sl.toLocaleString()} · R:R 1:${h.rr}`, h.dir);
    sfx.vote();

    // ── Server sync: submit hypothesis ──
    if (serverMatchId) {
      const dirMap: Record<string, 'LONG' | 'SHORT' | 'NEUTRAL'> = { LONG: 'LONG', SHORT: 'SHORT', NEUTRAL: 'NEUTRAL' };
      submitArenaHypothesis(serverMatchId, dirMap[h.dir] || 'NEUTRAL', h.conf)
        .catch(err => console.warn('[Arena] Hypothesis sync failed:', err));
    }

    // HYPOTHESIS -> PREVIEW -> BATTLE
    initPreview();
  }

  // Floating direction bar handler
  function selectFloatDir(d: 'LONG' | 'SHORT') {
    floatDir = d;
  }

  // Chart drag handlers
  function onDragTP(e: CustomEvent) {
    chartPosTp = e.detail.price;
    // Also update hypothesis panel if visible
    gameState.update(s => {
      if (s.hypothesis) {
        return { ...s, hypothesis: { ...s.hypothesis, tp: e.detail.price, rr: Math.abs(e.detail.price - (s.hypothesis.entry || 0)) / Math.max(1, Math.abs((s.hypothesis.entry || 0) - (s.hypothesis.sl || 0))) } };
      }
      return s;
    });
  }

  function onDragSL(e: CustomEvent) {
    chartPosSl = e.detail.price;
    gameState.update(s => {
      if (s.hypothesis) {
        return { ...s, hypothesis: { ...s.hypothesis, sl: e.detail.price, rr: Math.abs((s.hypothesis.tp || 0) - (s.hypothesis.entry || 0)) / Math.max(1, Math.abs((s.hypothesis.entry || 0) - e.detail.price)) } };
      }
      return s;
    });
  }

  function onDragEntry(e: CustomEvent) {
    chartPosEntry = e.detail.price;
    gameState.update(s => {
      if (s.hypothesis) {
        return { ...s, hypothesis: { ...s.hypothesis, entry: e.detail.price } };
      }
      return s;
    });
  }

  // ═══════ PHASE HANDLERS ═══════
  function onPhaseInit(phase: Phase) {
    phaseLabel = PHASE_LABELS[phase] || PHASE_LABELS.DRAFT;

    switch (phase) {
      case 'DRAFT': initDraft(); break;
      case 'ANALYSIS': initAnalysis(); break;
      case 'HYPOTHESIS': initHypothesis(); break;
      case 'BATTLE': initBattle(); break;
      case 'RESULT': initResult(); break;
    }
  }

  function initDraft() {
    clearArenaDynamics();
    findings = [];
    verdictVisible = false;
    resultVisible = false;
    pvpVisible = false;
    councilActive = false;
    hypothesisVisible = false;
    gameState.update(s => ({ ...s, arenaView: 'arena' }));
    compareVisible = false;
    previewVisible = false;
    floatDir = null;
    showChartPosition = false;
    chartPosEntry = null;
    chartPosTp = null;
    chartPosSl = null;
    chartAnnotations = [];
    chartAgentMarkers = [];
    initAgentStates();
    sfx.enter();
    dogeFloat();
    addFeed('🐕', 'ARENA', '#E8967D', 'Draft locked. Preparing analysis...');
    activeAgents.forEach((ag, i) => {
      safeTimeout(() => {
        setAgentState(ag.id, 'alert');
        setSpeech(ag.id, DOGE_DEPLOYS[i % DOGE_DEPLOYS.length], 800);
      }, i * 200);
    });
  }

  function initAnalysis() {
    startLiveEventStream('ANALYSIS');
    initCharSprites(); // Initialize character positions in arena
    initScout();
    initGather();
    initCouncil();
    addFeed('🔍', 'ANALYSIS', '#66CCE6', '5-agent analysis pipeline running...');

    // ── Server sync: run analysis in background ──
    if (serverMatchId) {
      runArenaAnalysis(serverMatchId)
        .then(res => {
          serverAnalysis = res;
          const c02 = mapAnalysisToC02(res);
          gameState.update(s => ({ ...s, orpoOutput: c02.orpo, ctxBeliefs: c02.ctx, guardianCheck: c02.guardian, commanderVerdict: c02.commander }));
        })
        .catch(err => {
          console.warn('[Arena] Server analysis failed:', err);
        });
    }
  }

  function initHypothesis() {
    startLiveEventStream('HYPOTHESIS');
    // Show hypothesis panel for user prediction
    hypothesisVisible = true;
    floatDir = null; // Reset floating dir bar
    // ═══ BET Phase Juice ═══
    juice_shake('light');
    sfx.charge();
    battleNarration = '🎯 포지션을 설정하세요!';
    addChatMsg({ id:'SYS', name:'SYSTEM', icon:'🎯', color:'#ffcc00' } as any, '배팅 타임! LONG or SHORT?', true);
    const speed = state.speed || 3;
    hypothesisTimer = Math.round(30 / speed);

    // Countdown timer
    if (hypothesisInterval) clearInterval(hypothesisInterval);
    hypothesisInterval = setInterval(() => {
      hypothesisTimer -= 1;
      if (hypothesisTimer <= 0) {
        // Auto-skip if time runs out
        if (hypothesisInterval) { clearInterval(hypothesisInterval); hypothesisInterval = null; }
        hypothesisVisible = false;

        // Default: NEUTRAL (skip)
        const price = state.prices.BTC;
        gameState.update(s => ({
          ...s,
          hypothesis: {
            dir: 'NEUTRAL', conf: 1, tags: new Set(), tf: '1h', vmode: 'tpsl', closeN: 3,
            entry: price, tp: price * 1.02, sl: price * 0.985, rr: 1.3
          },
          pos: {
            entry: price,
            tp: price * 1.02,
            sl: price * 0.985,
            dir: 'NEUTRAL',
            rr: 1.3,
            size: 0,
            lev: 0
          }
        }));
        showChartPosition = true;
        chartPosEntry = price;
        chartPosTp = price * 1.02;
        chartPosSl = price * 0.985;
        chartPosDir = 'NEUTRAL';
        addFeed('⏰', 'TIMEOUT', '#93A699', 'Time expired — auto-skip');
        advancePhase();
      }
    }, 1000);

    addFeed('🐕', 'ARENA', '#66CCE6', 'HYPOTHESIS: pick direction and set TP/SL.');

    // Agents go into think state
    activeAgents.forEach((ag, i) => {
      safeTimeout(() => {
        setAgentState(ag.id, 'think');
        setSpeech(ag.id, '🤔...', 600);
      }, i * 300);
    });
  }

  function initPreview() {
    previewVisible = true;
    const h = state.hypothesis;
    addFeed('👁', 'PREVIEW', '#DCB970', `Position: ${h?.dir || 'NEUTRAL'} · Entry $${(h?.entry || 0).toLocaleString()} · R:R 1:${(h?.rr || 1).toFixed(1)}`);

    // Agents look at the position
    activeAgents.forEach((ag, i) => {
      safeTimeout(() => {
        setAgentState(ag.id, 'think');
        setSpeech(ag.id, '📋 reviewing...', 600);
      }, i * 200);
    });

    // Auto-advance after 5s if user doesn't confirm
    const speed = state.speed || 3;
    previewAutoTimer = setTimeout(() => {
      confirmPreview();
    }, 5000 / speed);
  }

  function confirmPreview() {
    if (previewAutoTimer) { clearTimeout(previewAutoTimer); previewAutoTimer = null; }
    previewVisible = false;
    sfx.charge();
    addFeed('✅', 'CONFIRMED', '#00CC88', 'Position confirmed — scouting begins!');
    advancePhase();
  }

  function initScout() {
    addFeed('🔍', 'SCOUT', '#66CCE6', 'Agents scouting data sources...');
    // Generate chart annotations from active agents
    generateAnnotations();
    // Generate agent signal markers on chart
    generateAgentMarkers();
    const speed = state.speed || 3;

    // Map agents to their nearest data source
    const sourceMap: Record<string, typeof SOURCES[0]> = {};
    const agentSourcePairs: Array<{agentId: string; source: typeof SOURCES[0]}> = [
      { agentId: 'structure', source: SOURCES.find(s => s.id === 'binance')! },
      { agentId: 'deriv', source: SOURCES.find(s => s.id === 'coinglass')! },
      { agentId: 'flow', source: SOURCES.find(s => s.id === 'onchain')! },
      { agentId: 'senti', source: SOURCES.find(s => s.id === 'social')! },
      { agentId: 'macro', source: SOURCES.find(s => s.id === 'feargreed')! },
    ];

    activeAgents.forEach((ag, i) => {
      const pair = agentSourcePairs.find(p => p.agentId === ag.id);
      const targetSource = pair?.source || SOURCES[i % SOURCES.length];

      safeTimeout(() => {
        // Phase 1: Walk toward data source — move character sprite
        setAgentState(ag.id, 'walk');
        if (targetSource) {
          moveChar(ag.id, targetSource.x * 100, targetSource.y * 100);
        }
        sfx.scan();
        battleNarration = `🔍 ${ag.name}가 데이터를 스캔 중...`;
        addChatMsg(ag, `📡 ${targetSource?.label || 'data source'} 스캔 중...`);

        safeTimeout(() => {
          // Phase 2: Arrive at source + charge up energy
          setAgentState(ag.id, 'charge');
          setAgentEnergy(ag.id, 30);
          setSpeech(ag.id, ag.speech.scout, 800 / speed);
          showCharAction(ag.id, '🔍', 'SCAN');

          safeTimeout(() => {
            // Phase 3: Energy full → show finding
            setAgentEnergy(ag.id, 75);
            addFeed(ag.icon, ag.name, ag.color, ag.finding.title, ag.dir);
            battleNarration = `📊 ${ag.name}: ${ag.finding.title}`;
            addChatMsg(ag, `${ag.finding.title} · ${ag.finding.detail}`);
            showCharAction(ag.id, ag.icon, ag.finding.title.slice(0, 12));

            safeTimeout(() => {
              // Phase 4: Full charge + decision — return to formation
              setAgentEnergy(ag.id, 100);
              sfx.charge();
              setAgentState(ag.id, 'alert');
              const homePos = getFormPos(i, activeAgents.length);
              moveChar(ag.id, homePos.x, homePos.y);

              findings = [...findings, { def: ag, visible: true }];

              // Phase 5: Return to idle stance
              safeTimeout(() => {
                setAgentState(ag.id, 'idle');
              }, 500 / speed);
            }, 300 / speed);
          }, 300 / speed);
        }, 500 / speed);
      }, i * 500 / speed);
    });
  }

  function initGather() {
    councilActive = true;
    addFeed('📊', 'GATHER', '#66CCE6', 'Gathering analysis data...');
    battleNarration = '📊 에이전트들이 분석 데이터를 수집 중...';
    activeAgents.forEach((ag, i) => {
      safeTimeout(() => {
        setAgentState(ag.id, 'vote');
        setSpeech(ag.id, DOGE_GATHER[i % DOGE_GATHER.length], 400);
        addChatMsg(ag, `${ag.finding.detail}`);
      }, i * 150);
    });
  }

  function initCouncil() {
    addFeed('🗳', 'COUNCIL', '#E8967D', 'Agents voting on direction...');
    battleNarration = '🗳 에이전트 투표 시작!';
    activeAgents.forEach((ag, i) => {
      safeTimeout(() => {
        const dir = ag.dir;
        agentStates[ag.id] = { ...agentStates[ag.id], voteDir: dir };
        agentStates = { ...agentStates };
        setSpeech(ag.id, ag.speech.vote, 600);
        sfx.vote();
        addFeed(ag.icon, ag.name, ag.color, `Vote: ${dir} (${ag.conf}%)`, dir);
        battleNarration = `🗳 ${ag.name}: ${dir} (${ag.conf}% 확신)`;
        addChatMsg(ag, `${ag.speech.vote} · ${dir} ${ag.conf}%`);
      }, i * 400 / (state.speed || 3));
    });
  }

  function initVerdict() {
    const score = Math.round(state.score);
    const bullish = activeAgents.filter(a => a.dir === 'LONG').length;
    const agentDir = score >= 60 ? 'LONG' : 'WAIT';
    verdictVisible = true;

    // Set position from hypothesis
    const curPrice = state.prices.BTC;
    gameState.update(s => ({
      ...s,
      pos: s.hypothesis ? {
        entry: s.hypothesis.entry, tp: s.hypothesis.tp, sl: s.hypothesis.sl,
        dir: s.hypothesis.dir as any, rr: s.hypothesis.rr, size: 0, lev: 0
      } : {
        entry: curPrice, tp: curPrice * 1.02, sl: curPrice * 0.985,
        dir: 'LONG', rr: 1.3, size: 0, lev: 0
      }
    }));

    // Update chart position to match
    const h = state.hypothesis;
    if (h) {
      showChartPosition = true;
      chartPosEntry = h.entry;
      chartPosTp = h.tp;
      chartPosSl = h.sl;
      chartPosDir = h.dir;
    }

    sfx.verdict();
    dogeFloat();
    addFeed('⭐', 'VERDICT', '#E8967D', `Agent verdict: ${agentDir} · Score ${score} · ${bullish}/${activeAgents.length} agree`, agentDir);
    activeAgents.forEach((ag, i) => {
      safeTimeout(() => {
        setAgentState(ag.id, 'jump');
        setSpeech(ag.id, DOGE_VOTE_LONG[i % DOGE_VOTE_LONG.length], 600);
      }, i * 100);
    });
  }

  function initCompare() {
    // Compare user hypothesis vs agent consensus
    const h = state.hypothesis;
    const userDir = h?.dir || 'NEUTRAL';
    const agentDirs = activeAgents.map(a => a.dir);
    const longs = agentDirs.filter(d => d === 'LONG').length;
    const agentDir = longs > agentDirs.length / 2 ? 'LONG' : 'SHORT';
    const consensus = determineConsensus(userDir, agentDirs, false);

    compareData = {
      userDir,
      agentDir,
      userEntry: h?.entry || 0,
      userTp: h?.tp || 0,
      userSl: h?.sl || 0,
      agentScore: Math.round(state.score),
      consensus,
      agentVotes: activeAgents.map(ag => ({
        name: ag.name,
        icon: ag.icon,
        color: ag.color,
        dir: ag.dir,
        conf: ag.conf
      }))
    };
    compareVisible = true;

    // Update consensus in game state
    gameState.update(s => ({
      ...s,
      hypothesis: s.hypothesis ? { ...s.hypothesis, consensusType: consensus.type, lpMult: consensus.lpMult } : s.hypothesis
    }));

    addFeed('⚔️', 'COMPARE', '#DCB970', `${consensus.badge} — You: ${userDir} vs Agents: ${agentDir}`);
    sfx.charge();

    // Auto-advance after compare display
    const speed = state.speed || 3;
    if (compareAutoTimer) clearTimeout(compareAutoTimer);
    compareAutoTimer = setTimeout(() => {
      compareAutoTimer = null;
      if (_arenaDestroyed) return;
      compareVisible = false;
      advancePhase();
    }, 4000 / speed);
  }

  function initBattle() {
    startLiveEventStream('BATTLE');
    verdictVisible = false;
    compareVisible = false;
    addFeed('⚔', 'BATTLE', '#FF5E7A', 'Battle in progress!');
    activeAgents.forEach((ag, i) => {
      setAgentState(ag.id, 'alert');
      setSpeech(ag.id, DOGE_BATTLE[i % DOGE_BATTLE.length], 400);
    });

    // ═══ Start 4-Mode Battle Turn Sequence ═══
    startBattleTurnSequence();

    // ═══ Real-time Battle Resolution (via Binance WebSocket) ═══
    const fallbackPos = state.hypothesis
      ? {
        entry: state.hypothesis.entry,
        tp: state.hypothesis.tp,
        sl: state.hypothesis.sl,
        dir: state.hypothesis.dir,
        rr: state.hypothesis.rr,
        size: 0,
        lev: 0
      }
      : null;
    const pos = state.pos || fallbackPos;
    if (!pos) {
      gameState.update(s => ({ ...s, battleResult: null, running: false }));
      safeTimeout(() => advancePhase(), 3000);
      return;
    }

    // Clean up any previous resolver
    if (_battleResolverUnsub) { _battleResolverUnsub(); _battleResolverUnsub = null; }
    if (_battleResolver) { _battleResolver.destroy(); _battleResolver = null; }

    _battleResolver = createBattleResolver({
      entryPrice: pos.entry,
      tpPrice: pos.tp,
      slPrice: pos.sl,
      direction: pos.dir === 'LONG' || pos.dir === 'SHORT' ? pos.dir : 'LONG',
      speed: state.speed || 3,
    });

    gameState.update(s => ({
      ...s,
      battleTick: null,
      battlePriceHistory: [],
      battleEntryTime: Date.now(),
      battleExitTime: 0,
      battleExitPrice: 0,
    }));

    _battleResolverUnsub = _battleResolver.subscribe((tick: BattleTickState) => {
      if (_arenaDestroyed) return;

      // Update gameState with live battle tick
      gameState.update(s => ({
        ...s,
        battleTick: tick,
        battlePriceHistory: tick.priceHistory,
      }));

      // Tie agent animations to price movement
      if (tick.pnlPercent > 0) {
        // Price moving favorably — agents in positive states
        const topAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        if (topAgent && tick.distToTP > 50 && Math.random() < 0.15) {
          setAgentState(topAgent.id, 'jump');
          setSpeech(topAgent.id, tick.distToTP > 80 ? 'Almost there!' : 'Looking good!', 300);
        }
      } else if (tick.pnlPercent < -0.3) {
        // Price moving against — agents show concern
        const worriedAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        if (worriedAgent && tick.distToSL > 50 && Math.random() < 0.1) {
          setAgentState(worriedAgent.id, 'sad');
          setSpeech(worriedAgent.id, tick.distToSL > 80 ? 'Danger zone!' : 'Hold steady...', 300);
        }
      }

      // Update VS meter based on real price movement
      const tpWeight = tick.distToTP;
      const slWeight = tick.distToSL;
      const total = tpWeight + slWeight;
      if (total > 0) {
        vsMeter = 50 + ((tpWeight - slWeight) / total) * 45;
        vsMeterTarget = vsMeter;
      }

      // Update enemy HP inversely to TP progress
      enemyHP = Math.max(0, 100 - tick.distToTP);

      // Battle resolved!
      if (tick.status !== 'running' && tick.result) {
        const result = tick.result === 'timeout_win' ? 'time_win'
          : tick.result === 'timeout_loss' ? 'time_loss'
          : tick.result;

        gameState.update(s => ({
          ...s,
          battleResult: result,
          battleExitTime: tick.exitTime || Date.now(),
          battleExitPrice: tick.exitPrice || tick.currentPrice,
        }));

        // Clean up resolver
        if (_battleResolverUnsub) { _battleResolverUnsub(); _battleResolverUnsub = null; }
        _battleResolver = null;

        addFeed(
          result === 'tp' ? '🎯' : result === 'sl' ? '🛑' : '⏱',
          'RESULT',
          result === 'tp' || result === 'time_win' ? '#00ff88' : '#ff5e7a',
          result === 'tp' ? `TP HIT at $${Math.round(tick.exitPrice || 0).toLocaleString()}`
            : result === 'sl' ? `SL HIT at $${Math.round(tick.exitPrice || 0).toLocaleString()}`
            : `Time expired at $${Math.round(tick.exitPrice || 0).toLocaleString()}`
        );

        safeTimeout(() => advancePhase(), 1500);
      }
    });
  }

  function initResult() {
    clearLiveEventTimer();
    clearTurnTimers();
    liveEvents = [];
    const myScore = Math.round(state.score);
    const oppScore = Math.round(50 + Math.random() * 35);
    const br = state.battleResult;

    let win = false;
    let resultTag = '';
    if (br === 'tp') { win = true; resultTag = 'TP HIT! ✅'; }
    else if (br === 'sl') { win = false; resultTag = 'SL HIT ❌'; }
    else if (br === 'close_win' || br === 'time_win') { win = true; resultTag = 'Profit ✅'; }
    else if (br === 'close_loss' || br === 'time_loss') { win = false; resultTag = 'Loss ❌'; }
    else { win = myScore > oppScore; resultTag = 'Score'; }

    const consensus = determineConsensus(
      state.hypothesis?.dir || 'LONG',
      activeAgents.map(a => a.dir),
      false
    );
    const lpChange = calculateLP(win, state.streak, consensus.lpMult);

    // ── FBS Scoring (C02-aligned) ──
    const hyp = state.hypothesis;
    const exitPrice = state.prices.BTC;
    const entryPrice = hyp?.entry || state.bases.BTC;
    const priceChange = entryPrice > 0 ? (exitPrice - entryPrice) / entryPrice : 0;
    const actualDir = determineActualDirection(priceChange);
    const orpoDir = state.orpoOutput?.direction || 'NEUTRAL';

    const fbsResult = computeFBS({
      userDir: (hyp?.dir as Direction) || 'NEUTRAL',
      userConfidence: hyp?.conf || 50,
      userEntry: entryPrice,
      userTP: hyp?.tp || entryPrice * 1.02,
      userSL: hyp?.sl || entryPrice * 0.985,
      userRR: hyp?.rr || 1.5,
      orpoDir: orpoDir as Direction,
      orpoKeyLevels: state.orpoOutput?.keyLevels,
      guardianViolations: state.guardianCheck?.violations || [],
      userOverrodeGuardian: false,
      actualDir,
      exitPrice,
      optimalEntry: serverAnalysis?.entryPrice,
    });

    gameState.update(s => ({
      ...s,
      matchN: s.matchN + 1,
      wins: win ? s.wins + 1 : s.wins,
      losses: win ? s.losses : s.losses + 1,
      streak: win ? s.streak + 1 : 0,
      lp: Math.max(0, s.lp + lpChange),
      fbScore: fbsResult,
    }));

    // Update progression (wallet + per-agent)
    recordWalletMatch(win, lpChange);
    activeAgents.forEach(ag => {
      recordAgentMatch(ag.id, {
        matchN: state.matchN + 1,
        dir: ag.dir,
        conf: ag.conf,
        win,
        lp: lpChange
      });
    });

    // History (local + persistent store)
    matchHistory = [{ n: state.matchN + 1, win, lp: lpChange, score: myScore, streak: win ? state.streak + 1 : 0 }, ...matchHistory].slice(0, 30);

    // Persist to matchHistoryStore
    addMatchRecord({
      matchN: state.matchN + 1,
      win,
      lp: lpChange,
      score: myScore,
      streak: win ? state.streak + 1 : 0,
      agents: state.selectedAgents,
      agentVotes: activeAgents.map(ag => ({
        agentId: ag.id, name: ag.name, icon: ag.icon, color: ag.color, dir: ag.dir, conf: ag.conf
      })),
      hypothesis: state.hypothesis ? {
        dir: state.hypothesis.dir, conf: state.hypothesis.conf,
        tf: state.hypothesis.tf, entry: state.hypothesis.entry,
        tp: state.hypothesis.tp, sl: state.hypothesis.sl, rr: state.hypothesis.rr
      } : null,
      battleResult: state.battleResult,
      consensusType: consensus.type,
      lpMult: consensus.lpMult,
      signals: activeAgents.map(ag => `${ag.name}: ${ag.dir} ${ag.conf}%`)
    });

    // Record PnL entry
    addPnLEntry(
      'arena',
      `match-${state.matchN + 1}`,
      lpChange,
      `${win ? 'WIN' : 'LOSS'} · M${state.matchN + 1} · ${state.hypothesis?.dir || 'NEUTRAL'} · ${consensus.type}`
    );

    // ── Server sync: resolve match ──
    if (serverMatchId) {
      const exitP = state.prices.BTC;
      resolveArenaMatch(serverMatchId, exitP)
        .catch(err => console.warn('[Arena] Resolve sync failed:', err));
    }

    resultData = {
      win,
      lp: lpChange,
      tag: resultTag,
      motto: win ? WIN_MOTTOS[Math.floor(Math.random() * WIN_MOTTOS.length)] : LOSE_MOTTOS[Math.floor(Math.random() * LOSE_MOTTOS.length)]
    };

    const streakNow = win ? state.streak + 1 : 0;
    const scoreBonus = Math.round(Math.max(0, myScore - 45) * 1.15);
    const winBonus = win ? 42 : 12;
    const streakBonus = streakNow >= 2 ? streakNow * 10 : 0;
    const consensusBonus = Math.round(consensus.lpMult * 16);
    rewardXp = winBonus + scoreBonus + streakBonus + consensusBonus;
    rewardStreak = streakNow;
    rewardBadges = [
      win ? 'MISSION CLEAR' : 'FIELD REPORT',
      myScore >= 80 ? 'PRECISION+' : '',
      consensus.type === 'consensus' ? 'COUNCIL SYNC' : consensus.type === 'partial' ? 'PARTIAL READ' : 'HIGH DIVERGENCE',
      streakNow >= 3 ? 'STREAK ENGINE' : ''
    ].filter(Boolean);
    rewardVisible = true;

    resultVisible = true;

    if (win) {
      sfx.win();
      dogeFloat();
      juice_confetti(40);
      juice_flash('green');
      juice_shake('medium');
      battleNarration = `🏆 승리! +${lpChange} LP!`;
      addChatMsg({ id:'SYS', name:'SYSTEM', icon:'🏆', color:'#00ff88' } as any, `승리!! +${lpChange} LP! ${resultTag}`, true);
      activeAgents.forEach(ag => {
        setAgentState(ag.id, 'jump');
        setCharState(ag.id, 'celebrate');
        showCharAction(ag.id, '🎉', 'WIN!');
        setSpeech(ag.id, DOGE_WIN[Math.floor(Math.random() * DOGE_WIN.length)], 800);
      });
    } else {
      sfx.lose();
      juice_shake('light');
      juice_flash('red');
      // Near-miss detection
      const nearMiss = br === 'sl' && state.hypothesis ? Math.abs(state.prices.BTC - state.hypothesis.tp) / state.hypothesis.tp < 0.003 : false;
      battleNarration = nearMiss ? `😱 아깝다! TP까지 ${(Math.abs(state.prices.BTC - (state.hypothesis?.tp||0))).toFixed(0)}$ 남았었다!` : `💀 패배... ${resultTag}`;
      addChatMsg({ id:'SYS', name:'SYSTEM', icon:'💀', color:'#ff5e7a' } as any, nearMiss ? '아깝다!! 거의 TP 도달이었는데...' : `패배... ${resultTag}`, true);
      activeAgents.forEach(ag => {
        setAgentState(ag.id, 'sad');
        setCharState(ag.id, 'panic');
        setSpeech(ag.id, DOGE_LOSE[Math.floor(Math.random() * DOGE_LOSE.length)], 800);
      });
    }

    addFeed(win ? '🏆' : '💀', 'RESULT', win ? '#00CC88' : '#FF5E7A',
      win ? `WIN! +${lpChange} LP [${resultTag}]` : `LOSE [${resultTag}] ${lpChange} LP`);

    if (pvpShowTimer) clearTimeout(pvpShowTimer);
    pvpShowTimer = setTimeout(() => { pvpShowTimer = null; if (!_arenaDestroyed) pvpVisible = true; }, 1500);
    gameState.update((s) => ({ ...s, running: false, timer: 0 }));
  }

  function initCooldown() {
    clearArenaDynamics();
    verdictVisible = false;
    resultVisible = false;
    councilActive = false;
    compareVisible = false;
    previewVisible = false;
    showChartPosition = false;
    activeAgents.forEach(ag => {
      setAgentState(ag.id, 'idle');
      setAgentEnergy(ag.id, 0);
    });
    gameState.update(s => ({ ...s, running: false }));
  }

  function goLobby() {
    initCooldown();
    serverMatchId = null;
    serverAnalysis = null;
    apiError = null;
    pvpVisible = false;
    hypothesisVisible = false;
    floatDir = null;
    if (hypothesisInterval) { clearInterval(hypothesisInterval); hypothesisInterval = null; }
    gameState.update(s => ({
      ...s,
      inLobby: true,
      running: false,
      phase: 'DRAFT',
      timer: 0,
      tournament: {
        tournamentId: null,
        round: null,
        type: null,
        pair: null,
        entryFeeLp: null,
      }
    }));
  }

  function playAgain() {
    initCooldown();
    serverMatchId = null;
    serverAnalysis = null;
    apiError = null;
    pvpVisible = false;
    hypothesisVisible = false;
    floatDir = null;
    findings = [];
    resetPhaseInit();
    engineStartMatch();
  }

  // ═══════ BRACKET STATE ═══════
  let bracketMatches: TournamentBracketMatch[] = [];
  let bracketRound = 1;
  let bracketLoading = false;

  async function loadBracket() {
    if (!state.tournament?.tournamentId) return;
    bracketLoading = true;
    try {
      const res = await getTournamentBracket(state.tournament.tournamentId);
      bracketMatches = res.matches;
      bracketRound = res.round;
    } catch (e) {
      console.warn('[Arena] bracket load failed:', e);
    } finally {
      bracketLoading = false;
    }
  }

  // Load bracket when switching to MAP tab in tournament mode
  $: if ((arenaRailTab as string) === 'map' && state.arenaMode === 'TOURNAMENT') {
    loadBracket();
  }

  // ═══════ ESC KEY HANDLER ═══════
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !state.inLobby) {
      e.preventDefault();
      if (state.phase === 'RESULT' || pvpVisible || resultVisible) {
        goLobby();
      } else if (confirmingExit) {
        confirmingExit = false;
      } else {
        confirmingExit = true;
        safeTimeout(() => { confirmingExit = false; }, 3000);
      }
    }
  }

  let confirmingExit = false;

  function confirmGoLobby() {
    if (state.phase === 'RESULT' || pvpVisible || state.phase === 'DRAFT') {
      goLobby();
    } else if (confirmingExit) {
      goLobby();
    } else {
      confirmingExit = true;
      safeTimeout(() => { confirmingExit = false; }, 3000);
    }
  }

  onMount(() => {
    setPhaseInitCallback(onPhaseInit);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
    _arenaDestroyed = true;
    if (hypothesisInterval) clearInterval(hypothesisInterval);
    if (_battleInterval) clearInterval(_battleInterval);
    if (_battleResolverUnsub) { _battleResolverUnsub(); _battleResolverUnsub = null; }
    if (_battleResolver) { _battleResolver.destroy(); _battleResolver = null; }
    if (previewAutoTimer) clearTimeout(previewAutoTimer);
    if (replayTimer) clearTimeout(replayTimer);
    if (feedCursorTimer) clearTimeout(feedCursorTimer);
    if (compareAutoTimer) clearTimeout(compareAutoTimer);
    if (pvpShowTimer) clearTimeout(pvpShowTimer);
    clearLiveEventTimer();
    // Clean up typing timers
    Object.values(speechTimers).forEach(t => clearInterval(t));
    // Clean up all fire-and-forget timers
    _pendingTimers.forEach(t => clearTimeout(t));
    _pendingTimers.clear();
  });
</script>

<div class="arena-page arena-space-theme">
  <!-- Wallet Gate Overlay (temporarily disabled for dev) -->
  {#if false && !walletOk}
    <div class="wallet-gate">
      <div class="wg-card">
        <div class="wg-icon">🔗</div>
        <div class="wg-title">CONNECT WALLET</div>
        <div class="wg-sub">Connect your wallet to access the Arena and start trading battles</div>
        <button class="wg-btn" onclick={openWalletModal}>
          <span>⚡</span> CONNECT WALLET
        </button>
        <div class="wg-hint">Supported: MetaMask · WalletConnect · Coinbase</div>
      </div>
    </div>
  {/if}

  <!-- API Sync Status -->
  {#if apiError}
    <div class="api-status error">⚠️ Offline mode</div>
  {:else if serverMatchId}
    <div class="api-status synced">🟢 Synced</div>
  {/if}

  {#if state.inLobby}
    <Lobby />
  {:else if state.phase === 'DRAFT'}
    <SquadConfig selectedAgents={state.selectedAgents} ondeploy={onSquadDeploy} onback={onSquadBack} />
  {:else}
    <!-- ═══════ TOP ARENA NAV BAR ═══════ -->
    <div class="arena-topbar">
      <button class="atb-back" onclick={confirmGoLobby}>
        {#if confirmingExit}
          <span class="atb-confirm-pulse">EXIT? CLICK AGAIN</span>
        {:else}
          <span class="atb-arrow">←</span> LOBBY
        {/if}
      </button>
      <div class="atb-phase-track">
        <div class="atb-phase done">
          <span class="atp-dot"></span><span class="atp-label">DRAFT</span>
        </div>
        <div class="atb-connector"></div>
        <div class="atb-phase" class:active={state.phase === 'ANALYSIS'} class:done={['HYPOTHESIS','BATTLE','RESULT'].includes(state.phase)}>
          <span class="atp-dot"></span><span class="atp-label">SCAN</span>
        </div>
        <div class="atb-connector"></div>
        <div class="atb-phase" class:active={state.phase === 'HYPOTHESIS'} class:done={['BATTLE','RESULT'].includes(state.phase)}>
          <span class="atp-dot"></span><span class="atp-label">HYPO</span>
        </div>
        <div class="atb-connector"></div>
        <div class="atb-phase" class:active={state.phase === 'BATTLE'} class:done={state.phase === 'RESULT'}>
          <span class="atp-dot"></span><span class="atp-label">BATTLE</span>
        </div>
        <div class="atb-connector"></div>
        <div class="atb-phase" class:active={state.phase === 'RESULT'}>
          <span class="atp-dot"></span><span class="atp-label">RESULT</span>
        </div>
      </div>
      <div class="atb-right">
        <div class="atb-mode" class:pvp={state.arenaMode === 'PVP'} class:tour={state.arenaMode === 'TOURNAMENT'}>
          {modeLabel}{#if state.arenaMode === 'TOURNAMENT' && tournamentInfo.round} · R{tournamentInfo.round}{/if}
        </div>
        <div class="atb-stats">
          <span class="atb-lp">⚡{state.lp}</span>
          <span class="atb-wl">{state.wins}W-{state.losses}L</span>
        </div>
        <button class="atb-hist" onclick={() => matchHistoryOpen = !matchHistoryOpen}>📋</button>
      </div>
    </div>
    <MatchHistory visible={matchHistoryOpen} onclose={() => matchHistoryOpen = false} />

    <!-- ═══════ PHASE GUIDE (all views) ═══════ -->
    <div class="phase-guide-wrap">
      <PhaseGuide phase={state.phase} pair={state.pair} timeframe={state.timeframe} />
    </div>

    <!-- ═══════ VIEW PICKER (always visible) ═══════ -->
    <div class="view-picker-bar">
      <ViewPicker current={state.arenaView} on:select={(e) => gameState.update(s => ({ ...s, arenaView: e.detail }))} />
    </div>

    <!-- ═══════ VIEW SWITCHING ═══════ -->
    {#if state.arenaView !== 'arena'}
      <div class="view-container">
        {#if state.arenaView === 'chart'}
          <ChartWarView
            phase={state.phase}
            battleTick={state.battleTick}
            hypothesis={state.hypothesis}
            prices={{ BTC: state.prices.BTC }}
            battleResult={state.battleResult}
            battlePriceHistory={state.battlePriceHistory}
            activeAgents={activeAgents.map(a => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, dir: a.dir, conf: a.conf }))}
          />
        {:else if state.arenaView === 'mission'}
          <MissionControlView
            phase={state.phase}
            battleTick={state.battleTick}
            hypothesis={state.hypothesis}
            prices={{ BTC: state.prices.BTC }}
            battleResult={state.battleResult}
            battlePriceHistory={state.battlePriceHistory}
            activeAgents={activeAgents.map(a => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, dir: a.dir, conf: a.conf }))}
          />
        {:else if state.arenaView === 'card'}
          <CardDuelView
            phase={state.phase}
            battleTick={state.battleTick}
            hypothesis={state.hypothesis}
            prices={{ BTC: state.prices.BTC }}
            battleResult={state.battleResult}
            battlePriceHistory={state.battlePriceHistory}
            activeAgents={activeAgents.map(a => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, dir: a.dir, conf: a.conf }))}
          />
        {/if}

        <!-- Result Panel for new views -->
        {#if state.phase === 'RESULT' && resultVisible}
          <div class="result-panel-wrap">
            <ResultPanel
              win={resultData.win}
              battleResult={state.battleResult || ''}
              entryPrice={state.hypothesis?.entry || state.bases.BTC}
              exitPrice={state.battleExitPrice || state.prices.BTC}
              tpPrice={state.hypothesis?.tp || 0}
              slPrice={state.hypothesis?.sl || 0}
              direction={state.hypothesis?.dir || 'LONG'}
              priceHistory={state.battlePriceHistory}
              duration={state.battleTick?.elapsed || 0}
              maxRunup={state.battleTick?.maxRunup || 0}
              maxDrawdown={state.battleTick?.maxDrawdown || 0}
              rAchieved={state.battleTick?.rAchieved || 0}
              fbScore={state.fbScore}
              lpChange={resultData.lp}
              streak={state.streak}
              agents={activeAgents.map(a => ({ name: a.name, icon: a.icon, color: a.color, dir: a.dir, conf: a.conf }))}
              actualDirection={determineActualDirection(state.prices.BTC > (state.hypothesis?.entry || 0) ? 0.01 : -0.01)}
              onPlayAgain={playAgain}
              onLobby={goLobby}
            />
          </div>
        {/if}
      </div>
    {:else}
      <div class="battle-layout">
      <!-- ═══════ LEFT: CHART ═══════ -->
      <div class="chart-side">
        <ChartPanel
          showPosition={showChartPosition}
          posEntry={chartPosEntry}
          posTp={chartPosTp}
          posSl={chartPosSl}
          posDir={chartPosDir}
          agentAnnotations={showMarkers ? chartAnnotations : []}
          agentMarkers={showMarkers ? chartAgentMarkers : []}
          on:dragTP={onDragTP}
          on:dragSL={onDragSL}
          on:dragEntry={onDragEntry}
        />

        <!-- Hypothesis Panel on right side during hypothesis phase -->
        {#if hypothesisVisible}
          <div class="hypo-sidebar">
            <HypothesisPanel timeLeft={hypothesisTimer} onsubmit={onHypothesisSubmit} />
          </div>
        {/if}

        <!-- Floating LONG/SHORT Direction Bar (hypothesis phase) -->
        {#if hypothesisVisible}
          <div class="dir-float-bar">
            <button class="dfb-btn long" class:sel={floatDir === 'LONG'} onclick={() => selectFloatDir('LONG')}>
              ▲ LONG
            </button>
            <div class="dfb-divider"></div>
            <button class="dfb-btn short" class:sel={floatDir === 'SHORT'} onclick={() => selectFloatDir('SHORT')}>
              ▼ SHORT
            </button>
          </div>
        {/if}

        <!-- Position Preview Overlay -->
        {#if previewVisible && state.hypothesis}
          <div class="preview-overlay">
            <div class="preview-card">
              <div class="preview-header">
                <span class="prev-icon">👁</span>
                <span class="prev-title">POSITION PREVIEW</span>
              </div>
              <div class="preview-dir {state.hypothesis.dir.toLowerCase()}">
                {state.hypothesis.dir === 'LONG' ? '▲' : state.hypothesis.dir === 'SHORT' ? '▼' : '●'} {state.hypothesis.dir}
              </div>
              <div class="preview-levels">
                <div class="prev-row">
                  <span class="prev-lbl">ENTRY</span>
                  <span class="prev-val">${Math.round(state.hypothesis.entry).toLocaleString()}</span>
                </div>
                <div class="prev-row tp">
                  <span class="prev-lbl">TP</span>
                  <span class="prev-val">${Math.round(state.hypothesis.tp).toLocaleString()}</span>
                </div>
                <div class="prev-row sl">
                  <span class="prev-lbl">SL</span>
                  <span class="prev-val">${Math.round(state.hypothesis.sl).toLocaleString()}</span>
                </div>
              </div>
              <div class="preview-rr">
                R:R <span class="prev-rr-val">1:{state.hypothesis.rr.toFixed(1)}</span>
              </div>
              <div class="preview-config">
                {state.squadConfig.riskLevel.toUpperCase()} · {formatTimeframeLabel(state.squadConfig.timeframe)} · Lev {state.squadConfig.leverageBias}x
              </div>
              <button class="preview-confirm" onclick={confirmPreview}>
                ✅ CONFIRM & SCOUT
              </button>
            </div>
          </div>
        {/if}

        <div class="score-bar">
          <div class="sr">
            <svg viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3"/>
              <circle cx="22" cy="22" r="18" fill="none" stroke={state.score >= 60 ? '#00CC88' : '#FF5E7A'} stroke-width="3"
                stroke-dasharray="{state.score * 1.13} 200" stroke-linecap="round" transform="rotate(-90 22 22)"/>
            </svg>
            <span class="n">{state.score}</span>
          </div>
          <div>
            <div class="sdir" style="color:{state.score >= 60 ? '#00CC88' : '#FF5E7A'}">{state.score >= 60 ? 'LONG' : 'SHORT'}</div>
            <div class="smeta">{activeAgents.length} agents · M{state.matchN}</div>
          </div>
          <div class="score-stats">
            <span class="ss-item">🔥{state.streak}</span>
            <span class="ss-item">{state.wins}W-{state.losses}L</span>
            <span class="ss-item lp">⚡{state.lp} LP</span>
          </div>
          <div class="mode-badge" class:tour={state.arenaMode === 'TOURNAMENT'} class:pvp={state.arenaMode === 'PVP'}>
            {modeLabel}
            {#if state.arenaMode === 'TOURNAMENT' && tournamentInfo.tournamentId}
              · R{tournamentInfo.round ?? 1}
            {/if}
          </div>
          {#if state.hypothesis}
            <div class="hypo-badge {state.hypothesis.dir.toLowerCase()}">
              {state.hypothesis.dir} · R:R 1:{state.hypothesis.rr.toFixed(1)}
            </div>
          {/if}
          <!-- Chart Toggle Buttons -->
          <div class="chart-toggles">
            <button class="ct-btn" class:on={showMarkers} onclick={() => showMarkers = !showMarkers} title="에이전트 마커">🏷</button>
            <button class="ct-btn" class:on={showChartPosition} onclick={() => showChartPosition = !showChartPosition} title="TP/SL 라인">📏</button>
          </div>
          <button class="mbtn" onclick={goLobby}>↺ LOBBY</button>
        </div>
      </div>

      <!-- ═══════ RIGHT: SPATIAL BATTLE ARENA ═══════ -->
      <div class="arena-sidebar">
        <!-- ── MISSION BAR + CLOSE ── -->
        <div class="mission-bar">
          <div class="mission-top">
            <div class="mission-phase">
              <span class="mp-dot" style="background:{phaseLabel.color}"></span>
              <span class="mp-label" style="color:{phaseLabel.color}">{battlePhaseLabel || phaseLabel.name}</span>
              {#if state.timer > 0}<span class="mp-timer">{Math.ceil(state.timer)}s</span>{/if}
            </div>
            <button class="mission-close" onclick={goLobby} title="LOBBY">✕</button>
          </div>
          <div class="mission-text">{missionText}</div>
        </div>

        <!-- ── COMBAT HUD ── -->
        <div class="combat-hud">
          <!-- VS Meter -->
          <div class="hud-vs">
            <span class="hud-side long-side">LONG</span>
            <div class="hud-vs-track">
              <div class="hud-vs-fill" style="width:{vsMeter}%"></div>
              <div class="hud-vs-pip" style="left:{vsMeter}%">⚡</div>
            </div>
            <span class="hud-side short-side">SHORT</span>
          </div>
          <!-- Enemy HP -->
          <div class="hud-enemy">
            <span class="hud-enemy-label">MARKET</span>
            <div class="hud-hp-track">
              <div class="hud-hp-fill" style="width:{enemyHP}%;background:linear-gradient(90deg,#ff5e7a,{enemyHP > 50 ? '#ffaa00' : '#ff2d55'})"></div>
            </div>
            <span class="hud-hp-num">{Math.round(enemyHP)}</span>
          </div>
          <!-- Price -->
          <div class="hud-price">${Number.isFinite(state.prices.BTC) ? Math.round(state.prices.BTC).toLocaleString() : '--'}</div>
        </div>

        <!-- ═══ SPATIAL ARENA (THE GAME WORLD) ═══ -->
        <div class="game-arena">
          <!-- Grid background -->
          <div class="arena-grid-bg"></div>

          <!-- Floating particles -->
          {#each arenaParticles as p (p.id)}
            <div class="arena-particle"
              style="left:{p.x}%;top:{p.y}%;width:{p.size}px;height:{p.size}px;opacity:{p.opacity};animation-duration:{p.speed * 4}s">
            </div>
          {/each}

          <!-- SVG Connection lines between agents and center -->
          <svg class="arena-connections" viewBox="0 0 100 100" preserveAspectRatio="none">
            {#each activeAgents as ag}
              {@const cs = charSprites[ag.id]}
              {#if cs}
                <line x1={cs.x} y1={cs.y} x2="50" y2="50"
                  stroke={ag.color} stroke-width="0.3" stroke-opacity="0.2"
                  stroke-dasharray="1 1" />
              {/if}
            {/each}
          </svg>

          <!-- Center battle node -->
          <div class="arena-center-node">
            <div class="acn-icon">⚔</div>
            <div class="acn-price">${Number.isFinite(state.prices.BTC) ? Math.round(state.prices.BTC).toLocaleString() : '--'}</div>
          </div>

          <!-- CHARACTER SPRITES -->
          {#each activeAgents as ag, i}
            {@const cs = charSprites[ag.id] || { charState: 'idle', x: 50, y: 50, actionEmoji: '', actionLabel: '', flipX: false, hp: 100, energy: 0, showHit: false, hitText: '', hitColor: '' }}
            {@const isActiveTurn = currentTurnIdx >= 0 && battleTurns[currentTurnIdx]?.agent.id === ag.id}
            <div class="char-sprite cs-{cs.charState}"
              class:active-turn={isActiveTurn}
              style="left:{cs.x}%;top:{cs.y}%;--ag-color:{ag.color};--ag-delay:{i * 0.15}s;{cs.flipX ? 'transform:translate(-50%,-50%) scaleX(-1)' : ''}"
            >
              <!-- Action emoji popup -->
              {#if cs.actionEmoji}
                <div class="char-action-popup">
                  <span class="cap-emoji">{cs.actionEmoji}</span>
                  <span class="cap-label">{cs.actionLabel}</span>
                </div>
              {/if}

              <!-- Hit text flyout -->
              {#if cs.showHit}
                <div class="char-hit-fly" style="color:{cs.hitColor}">{cs.hitText}</div>
              {/if}

              <!-- Character body -->
              <div class="char-body">
                {#if isActiveTurn}
                  <div class="char-turn-ring"></div>
                {/if}
                <div class="char-img-wrap" style="border-color:{ag.color}">
                  {#if ag.img.def}
                    <img src={ag.img.def} alt={ag.name} class="char-img" />
                  {:else}
                    <span class="char-emoji">{ag.icon}</span>
                  {/if}
                </div>
                <!-- Energy aura -->
                <div class="char-aura" style="--aura-color:{ag.color};opacity:{cs.energy > 50 ? 0.3 : 0.1}"></div>
              </div>

              <!-- Name tag -->
              <div class="char-nametag" style="border-color:{ag.color}">{ag.name}</div>

              <!-- HP + Energy bars -->
              <div class="char-bars">
                <div class="char-hpbar"><div class="char-hpfill" style="width:{cs.hp}%;background:{cs.hp > 50 ? '#00ff88' : cs.hp > 25 ? '#ffaa00' : '#ff2d55'}"></div></div>
                <div class="char-ebar"><div class="char-efill" style="width:{cs.energy}%;background:{ag.color}"></div></div>
              </div>

              <!-- Vote direction badge -->
              {#if agentStates[ag.id]?.voteDir}
                <div class="char-vote-badge {agentStates[ag.id].voteDir.toLowerCase()}">{agentStates[ag.id].voteDir === 'LONG' ? '▲' : '▼'}</div>
              {/if}
            </div>
          {/each}

          <!-- VS SPLASH OVERLAY -->
          {#if showVsSplash}
            <div class="arena-vs-splash">
              <span class="avs-team long">LONG</span>
              <span class="avs-x">⚔</span>
              <span class="avs-team short">SHORT</span>
            </div>
          {/if}

          <!-- CRITICAL POPUP -->
          {#if showCritical}
            <div class="arena-critical-popup">{criticalText}</div>
          {/if}

          <!-- COMBO COUNTER -->
          {#if showCombo && comboCount >= 2}
            <div class="arena-combo">COMBO x{comboCount}</div>
          {/if}
        </div>

        <!-- ── NARRATION BAR ── -->
        <div class="sb-narration">
          <div class="narr-icon">⚡</div>
          <div class="narr-text">{battleNarration || '에이전트 대기 중...'}</div>
        </div>

        <!-- ── BATTLE LOG (mini chat) ── -->
        <div class="battle-log">
          {#each chatMessages.slice(-5) as msg (msg.id)}
            <div class="bl-line" class:action={msg.isAction}>
              <span class="bl-icon" style="color:{msg.color}">{msg.icon}</span>
              <span class="bl-name" style="color:{msg.color}">{msg.name}</span>
              <span class="bl-text">{msg.text}</span>
            </div>
          {/each}
          {#if chatMessages.length === 0}
            <div class="bl-empty">대기 중...</div>
          {/if}
        </div>

        <!-- ═══════ COMPARE OVERLAY ═══════ -->
        <ArenaRewardModal
          visible={rewardVisible}
          xpGain={rewardXp}
          streak={rewardStreak}
          badges={rewardBadges}
          onclose={() => { rewardVisible = false; }}
        />

        {#if compareVisible}
          <div class="compare-overlay">
            <div class="compare-card">
              <div class="compare-header">
                <span class="compare-icon">⚔️</span>
                <span class="compare-title">COMPARE</span>
              </div>

              <!-- User vs Agents -->
              <div class="compare-vs">
                <div class="compare-side user">
                  <div class="compare-label">YOUR CALL</div>
                  <div class="compare-dir {compareData.userDir.toLowerCase()}">{compareData.userDir}</div>
                  <div class="compare-levels">
                    <span class="cmp-tp">TP ${Math.round(compareData.userTp).toLocaleString()}</span>
                    <span class="cmp-entry">Entry ${Math.round(compareData.userEntry).toLocaleString()}</span>
                    <span class="cmp-sl">SL ${Math.round(compareData.userSl).toLocaleString()}</span>
                  </div>
                </div>

                <div class="compare-badge-wrap">
                  <div class="compare-consensus-badge {compareData.consensus.type}">
                    {compareData.consensus.badge}
                  </div>
                  <div class="compare-vs-icon">VS</div>
                </div>

                <div class="compare-side agents">
                  <div class="compare-label">AGENT COUNCIL</div>
                  <div class="compare-dir {compareData.agentDir.toLowerCase()}">{compareData.agentDir}</div>
                  <div class="compare-score">Score: {compareData.agentScore}</div>
                  <div class="compare-votes">
                    {#each compareData.agentVotes as vote}
                      <div class="compare-vote">
                        <span style="color:{vote.color}">{vote.icon}</span>
                        <span class="cv-dir {vote.dir.toLowerCase()}">{vote.dir}</span>
                        <span class="cv-conf">{vote.conf}%</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- LP Multiplier -->
              <div class="compare-mult">
                LP MULTIPLIER: <span class="mult-val" style="color:{compareData.consensus.lpMult >= 1.5 ? '#00CC88' : compareData.consensus.lpMult >= 1 ? '#DCB970' : '#FF5E7A'}">x{compareData.consensus.lpMult}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Verdict Overlay -->
        {#if verdictVisible}
          <div class="verdict-overlay">
            <div class="verdict-card">
              <div class="verdict-score">
                <svg viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(0,0,0,.1)" stroke-width="3"/>
                  <circle cx="22" cy="22" r="18" fill="none" stroke={state.score >= 60 ? '#00CC88' : '#FF5E7A'} stroke-width="3"
                    stroke-dasharray="{state.score * 1.13} 200" stroke-linecap="round" transform="rotate(-90 22 22)"/>
                </svg>
                <span class="vs-num">{Math.round(state.score)}</span>
              </div>
              <div class="verdict-dir" class:long={state.score >= 60} class:short={state.score < 60}>
                {state.score >= 60 ? 'MUCH LONG' : 'SUCH WAIT'}
              </div>
              <div class="verdict-meta">
                Council: {activeAgents.filter(a => a.dir === 'LONG').length}/{activeAgents.length} · Score: {Math.round(state.score)}
              </div>
            </div>
          </div>
        {/if}

        <!-- Result Overlay -->
        {#if resultVisible}
          <div class="result-overlay" class:win={resultData.win} class:lose={!resultData.win}>
            <div class="result-text">{resultData.win ? 'VERY WIN WOW!' : 'SUCH SAD'}</div>
            <div class="result-lp">{resultData.tag}<br>{resultData.lp >= 0 ? '+' : ''}{resultData.lp} LP</div>
            {#if state.streak >= 3}
              <div class="result-streak">🔥×{state.streak} MUCH STREAK</div>
            {/if}
            {#if state.fbScore}
              <div class="fbs-card">
                <div class="fbs-title">FBS SCORECARD</div>
                <div class="fbs-row">
                  <span class="fbs-label">DS</span>
                  <div class="fbs-bar"><div class="fbs-fill" style="width:{state.fbScore.ds}%;background:#e8967d"></div></div>
                  <span class="fbs-val">{state.fbScore.ds}</span>
                </div>
                <div class="fbs-row">
                  <span class="fbs-label">RE</span>
                  <div class="fbs-bar"><div class="fbs-fill" style="width:{state.fbScore.re}%;background:#66cce6"></div></div>
                  <span class="fbs-val">{state.fbScore.re}</span>
                </div>
                <div class="fbs-row">
                  <span class="fbs-label">CI</span>
                  <div class="fbs-bar"><div class="fbs-fill" style="width:{state.fbScore.ci}%;background:#00cc88"></div></div>
                  <span class="fbs-val">{state.fbScore.ci}</span>
                </div>
                <div class="fbs-total">
                  <span>FBS</span>
                  <span class="fbs-total-val">{state.fbScore.fbs}</span>
                </div>
              </div>
            {/if}
            <div class="result-motto">{resultData.motto}</div>
          </div>
        {/if}

        <!-- PvP Result Screen -->
        {#if pvpVisible}
          <div class="pvp-overlay">
            <div class="pvp-card">
              <div class="pvp-title">{resultOverlayTitle}</div>
              {#if state.arenaMode === 'TOURNAMENT' && tournamentInfo.tournamentId}
                <div class="pvp-label tour-meta">
                  {tournamentInfo.type ?? 'TOURNAMENT'} · {tournamentInfo.pair ?? state.pair} · ROUND {tournamentInfo.round ?? 1}
                </div>
              {/if}
              <div class="pvp-scores">
                <div class="pvp-side">
                  <div class="pvp-label">YOUR SCORE</div>
                  <div class="pvp-score">{Math.round(state.score)}</div>
                </div>
                <div class="pvp-vs">VS</div>
                <div class="pvp-side">
                  <div class="pvp-label">OPPONENT</div>
                  <div class="pvp-score">{Math.round(50 + Math.random() * 35)}</div>
                </div>
              </div>
              <div class="pvp-lp" class:pos={resultData.lp >= 0} class:neg={resultData.lp < 0}>
                {resultData.lp >= 0 ? '+' : ''}{resultData.lp} LP
              </div>
              {#if state.hypothesis}
                <div class="pvp-hypo">
                  Your call: <span class="{state.hypothesis.dir.toLowerCase()}">{state.hypothesis.dir}</span>
                  · R:R 1:{state.hypothesis.rr.toFixed(1)}
                  {#if state.hypothesis.consensusType}
                    · <span class="pvp-consensus">{state.hypothesis.consensusType.toUpperCase()}</span>
                  {/if}
                </div>
              {/if}
              <div class="pvp-btns">
                <button class="pvp-btn lobby" onclick={goLobby}>↺ LOBBY</button>
                <button class="pvp-btn again" onclick={playAgain}>🐕 PLAY AGAIN</button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Replay Banner -->
        {#if replayState.active}
          <div class="replay-banner">
            <span class="replay-icon">🎬</span>
            <span class="replay-text">REPLAY — Match #{replayState.data?.matchN}</span>
            <span class="replay-step">{replayState.currentStep + 1}/{replayState.totalSteps}</span>
            <button class="replay-exit" onclick={exitReplay}>✕ EXIT REPLAY</button>
          </div>
        {/if}

        <!-- Floating Doge Words (Game Juice) -->
        {#each floatingWords as w (w.id)}
          <div class="doge-float" style="left:{w.x}%;color:{w.color};animation-duration:{w.dur}s">{w.text}</div>
        {/each}
      </div>
    </div>
    {/if}
  {/if}
</div>

<style>
  /* ═══ View Switching + New Components ═══ */
  .lobby-view-picker {
    position: relative;
    z-index: 20;
    padding: 0 16px 16px;
  }
  .view-picker-bar {
    position: relative;
    z-index: 20;
    padding: 0 12px;
    border-bottom: 1px solid rgba(255,105,180,.08);
  }
  .phase-guide-wrap {
    position: relative;
    z-index: 35;
    padding: 0 10px;
  }
  .view-container {
    flex: 1;
    min-height: 0;
    overflow: auto;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    gap: 12px;
  }
  .result-panel-wrap {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.7);
    backdrop-filter: blur(8px);
  }

  .arena-page { width: 100%; height: 100%; position: relative; overflow: hidden; display: flex; flex-direction: column; }
  .arena-space-theme {
    --space-line: rgba(232, 150, 125, 0.25);
    --space-line-strong: rgba(232, 150, 125, 0.45);
    --space-surface: rgba(10, 26, 18, 0.9);
    --space-surface-soft: rgba(10, 26, 18, 0.65);
    --space-text: #f0ede4;
    --space-text-soft: rgba(240, 237, 228, 0.75);
    --space-accent: #e8967d;
    --space-accent-2: #66cce6;
    --space-good: #00cc88;
    --space-bad: #ff5e7a;
  }
  .arena-space-theme::before {
    content: '';
    position: absolute;
    inset: -20% -10%;
    pointer-events: none;
    z-index: 0;
    background:
      radial-gradient(circle at 16% 18%, rgba(232, 150, 125, 0.12), transparent 36%),
      radial-gradient(circle at 85% 12%, rgba(102, 204, 230, 0.08), transparent 34%),
      radial-gradient(circle at 70% 82%, rgba(0, 204, 136, 0.06), transparent 38%);
    animation: spaceDrift 30s linear infinite alternate;
  }
  .arena-space-theme::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image: radial-gradient(circle at center, rgba(255,255,255,.55) 0 1px, transparent 1.5px);
    background-size: 3px 3px;
    opacity: 0.065;
    mix-blend-mode: screen;
  }
  @keyframes spaceDrift {
    from { transform: translate3d(-2%, 0, 0) scale(1); }
    to { transform: translate3d(2%, -2%, 0) scale(1.03); }
  }

  .battle-layout { display: grid; grid-template-columns: 1fr 380px; flex: 1; min-height: 0; overflow: hidden; }

  .arena-topbar {
    position: relative;
    z-index: 40;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--space-line);
    background:
      linear-gradient(180deg, rgba(8, 19, 13, 0.95), rgba(7, 16, 11, 0.9)),
      radial-gradient(circle at 8% -20%, rgba(232, 150, 125, 0.12), transparent 40%);
    backdrop-filter: blur(10px);
  }
  .atb-back {
    border: 1px solid var(--space-line-strong);
    border-radius: 999px;
    background: rgba(10, 26, 18, 0.72);
    color: var(--space-text);
    font: 800 10px/1 var(--fd);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    padding: 7px 13px;
    cursor: pointer;
    transition: transform .16s ease, border-color .16s ease, background .16s ease;
  }
  .atb-back:hover {
    transform: translateY(-1px);
    border-color: rgba(232, 150, 125, 0.7);
    background: rgba(10, 26, 18, 0.84);
  }
  .atb-arrow {
    margin-right: 5px;
  }
  .atb-confirm-pulse {
    color: #ff9c89;
    animation: pulseWarn .9s ease-in-out infinite;
  }
  @keyframes pulseWarn {
    0%, 100% { opacity: .8; }
    50% { opacity: 1; }
  }
  .atb-phase-track {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
  .atb-phase {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: .62;
    transition: opacity .2s ease, filter .2s ease;
  }
  .atb-phase.active,
  .atb-phase.done {
    opacity: 1;
  }
  .atp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(232, 150, 125, 0.35);
    background: rgba(232, 150, 125, 0.2);
    box-shadow: 0 0 0 rgba(232, 150, 125, 0);
  }
  .atb-phase.active .atp-dot {
    background: #e8967d;
    box-shadow: 0 0 10px rgba(232, 150, 125, 0.7);
  }
  .atb-phase.done .atp-dot {
    background: #1effa0;
    border-color: rgba(130, 255, 207, 0.9);
  }
  .atp-label {
    font: 800 8px/1 var(--fd);
    letter-spacing: 1.3px;
    color: var(--space-text-soft);
    white-space: nowrap;
  }
  .atb-connector {
    width: 20px;
    height: 1px;
    margin: 0 4px;
    background: linear-gradient(90deg, rgba(232, 150, 125, 0.1), rgba(232, 150, 125, 0.35), rgba(232, 150, 125, 0.1));
  }
  .atb-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .atb-mode {
    border: 1px solid rgba(232, 150, 125, 0.4);
    border-radius: 999px;
    background: rgba(232, 150, 125, 0.1);
    color: #e8967d;
    font: 800 8px/1 var(--fd);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    padding: 4px 8px;
  }
  .atb-mode.pvp {
    border-color: rgba(255, 158, 112, 0.7);
    background: rgba(198, 93, 52, 0.18);
    color: #ffd7bb;
  }
  .atb-mode.tour {
    border-color: rgba(249, 199, 127, 0.72);
    background: rgba(186, 133, 54, 0.18);
    color: #ffdeb2;
  }
  .atb-stats {
    display: flex;
    gap: 6px;
    align-items: center;
    font: 700 8px/1 var(--fm);
    color: var(--space-text-soft);
  }
  .atb-lp {
    color: #ffd39e;
  }
  .atb-hist {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid rgba(232, 150, 125, 0.4);
    background: rgba(10, 26, 18, 0.8);
    color: #f0ede4;
    font-size: 13px;
    cursor: pointer;
  }
  .atb-hist:hover {
    border-color: rgba(232, 150, 125, 0.6);
    background: rgba(232, 150, 125, 0.12);
  }

  .live-event-stack {
    position: absolute;
    z-index: 21;
    top: 70px;
    left: 10px;
    width: min(328px, calc(100% - 220px));
    display: grid;
    gap: 7px;
    pointer-events: none;
  }

  /* Match History Toggle */
  .mh-toggle {
    position: absolute;
    top: 8px; right: 8px;
    z-index: 55;
    padding: 4px 10px;
    border: 2px solid #000;
    border-radius: 8px;
    background: #fff;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 2px 2px 0 #000;
    transition: all .15s;
  }
  .mh-toggle:hover { background: #e8967d; }
  .chart-side { display: flex; flex-direction: column; background: #07130d; overflow: hidden; border-right: 1px solid rgba(232,150,125,.15); position: relative; }

  /* ═══════ SPATIAL BATTLE ARENA ═══════ */
  .arena-sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(180deg, #0a0a12 0%, #0d0a14 50%, #0a0a12 100%);
    border-left: 1px solid rgba(255,105,180,.15);
  }

  /* ── MISSION BAR ── */
  .mission-bar {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,105,180,.2);
    background: linear-gradient(90deg, rgba(255,105,180,.06), rgba(255,105,180,.02));
    flex-shrink: 0;
  }
  .mission-top {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
  }
  .mission-phase {
    display: flex; align-items: center; gap: 6px;
    font: 800 9px/1 var(--fd); letter-spacing: 1.5px;
  }
  .mp-dot { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 8px currentColor; flex-shrink: 0; }
  .mp-label { text-transform: uppercase; }
  .mp-timer { color: rgba(255,255,255,.4); font-size: 8px; margin-left: 8px; }
  .mission-close {
    width: 24px; height: 24px; border-radius: 6px;
    border: 1px solid rgba(255,105,180,.35);
    background: rgba(255,105,180,.1);
    color: rgba(255,255,255,.7);
    font-size: 12px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .15s; flex-shrink: 0;
  }
  .mission-close:hover { background: rgba(255,105,180,.25); color: #fff; }
  .mission-text {
    font: 700 8px/1.3 var(--fm); color: rgba(255,255,255,.5);
    letter-spacing: 0.5px;
  }

  /* ── COMBAT HUD ── */
  .combat-hud {
    padding: 6px 10px;
    border-bottom: 1px solid rgba(255,105,180,.15);
    background: rgba(0,0,0,.3);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hud-vs {
    display: flex; align-items: center; gap: 6px;
  }
  .hud-side {
    font: 900 9px/1 var(--fd); letter-spacing: 2px; width: 42px; text-align: center;
    text-shadow: 0 0 8px currentColor;
  }
  .hud-side.long-side { color: #00ff88; }
  .hud-side.short-side { color: #ff5e7a; }
  .hud-vs-track {
    flex: 1; height: 8px; background: rgba(255,94,122,.15); border-radius: 4px;
    position: relative; overflow: visible; border: 1px solid rgba(255,105,180,.2);
  }
  .hud-vs-fill {
    height: 100%; background: linear-gradient(90deg, #00ff88, #00cc66);
    border-radius: 4px 0 0 4px; transition: width .5s cubic-bezier(.4,0,.2,1);
  }
  .hud-vs-pip {
    position: absolute; top: 50%; transform: translate(-50%,-50%);
    font-size: 9px;
    filter: drop-shadow(0 0 4px rgba(255,200,0,.6));
    transition: left .5s cubic-bezier(.4,0,.2,1);
    z-index: 2;
  }
  .hud-enemy {
    display: flex; align-items: center; gap: 6px;
  }
  .hud-enemy-label {
    font: 800 6px/1 var(--fd); letter-spacing: 1.5px; color: #ff5e7a; width: 36px;
  }
  .hud-hp-track {
    flex: 1; height: 6px; background: rgba(255,94,122,.1); border-radius: 3px;
    overflow: hidden; border: 1px solid rgba(255,94,122,.2);
  }
  .hud-hp-fill { height: 100%; border-radius: 3px; transition: width .5s ease; }
  .hud-hp-num {
    font: 800 8px/1 var(--fd); color: #ff5e7a; width: 24px; text-align: right;
  }
  .hud-price {
    font: 900 10px/1 var(--fd); color: rgba(255,255,255,.5); text-align: center; letter-spacing: 1px;
    flex-shrink: 0;
  }

  /* ═══ GAME ARENA (THE SPATIAL WORLD) ═══ */
  .game-arena {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 200px;
    background:
      radial-gradient(circle at 50% 45%, rgba(255,105,180,.06), transparent 50%),
      radial-gradient(circle at 20% 80%, rgba(0,255,136,.04), transparent 40%),
      radial-gradient(circle at 80% 20%, rgba(102,204,230,.04), transparent 40%);
  }
  .arena-grid-bg {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(255,105,180,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,105,180,.06) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: .4;
  }
  .arena-particle {
    position: absolute; border-radius: 50%;
    background: rgba(255,105,180,.3);
    animation: particleFloat linear infinite alternate;
    pointer-events: none;
  }
  @keyframes particleFloat {
    0% { transform: translateY(0) translateX(0); opacity: .1; }
    50% { transform: translateY(-15px) translateX(8px); opacity: .3; }
    100% { transform: translateY(5px) translateX(-5px); opacity: .15; }
  }
  .arena-connections {
    position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;
  }
  /* Center battle node */
  .arena-center-node {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
    z-index: 5; text-align: center;
    width: 52px; height: 52px;
    border-radius: 50%;
    border: 2px solid rgba(255,105,180,.3);
    background: rgba(10,10,20,.8);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    box-shadow: 0 0 20px rgba(255,105,180,.15);
    animation: centerPulse 2s ease-in-out infinite alternate;
  }
  @keyframes centerPulse {
    from { box-shadow: 0 0 12px rgba(255,105,180,.1); }
    to { box-shadow: 0 0 28px rgba(255,105,180,.25); }
  }
  .acn-icon { font-size: 16px; }
  .acn-price { font: 800 7px/1 var(--fd); color: rgba(255,255,255,.5); letter-spacing: 0.5px; }

  /* ── CHARACTER SPRITES ── */
  .char-sprite {
    position: absolute; z-index: 10;
    transform: translate(-50%, -50%);
    transition: left .6s cubic-bezier(.4,0,.2,1), top .6s cubic-bezier(.4,0,.2,1);
    cursor: pointer;
    text-align: center;
  }
  .char-body { position: relative; display: inline-flex; flex-direction: column; align-items: center; }
  .char-img-wrap {
    width: 52px; height: 52px; border-radius: 14px;
    border: 3px solid; overflow: hidden;
    background: #fff;
    box-shadow: 3px 3px 0 rgba(0,0,0,.5);
    transition: all .15s;
  }
  .char-img {
    width: 100%; height: 100%; object-fit: cover; border-radius: 11px;
    filter: hue-rotate(330deg) saturate(1.2);
  }
  .char-emoji { font-size: 28px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
  .char-aura {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: 72px; height: 72px; border-radius: 50%;
    background: radial-gradient(circle, var(--aura-color) 0%, transparent 70%);
    z-index: -1; pointer-events: none;
    animation: charAuraPulse 1.5s ease-in-out infinite;
  }
  @keyframes charAuraPulse {
    0%,100% { transform: translate(-50%,-50%) scale(1); opacity: .15; }
    50% { transform: translate(-50%,-50%) scale(1.3); opacity: .3; }
  }
  .char-turn-ring {
    position: absolute; inset: -6px; border-radius: 18px;
    border: 2px solid var(--ag-color, #ff69b4);
    animation: turnRingSpin 1s linear infinite;
    box-shadow: 0 0 12px var(--ag-color, #ff69b4);
  }
  @keyframes turnRingSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .char-nametag {
    margin-top: 3px;
    font: 900 7px/1 var(--fd); letter-spacing: 1.5px;
    background: rgba(0,0,0,.7); color: #fff;
    padding: 2px 6px; border-radius: 4px;
    border: 1px solid; white-space: nowrap;
  }
  .char-bars {
    display: flex; flex-direction: column; gap: 1px; margin-top: 2px; width: 42px;
  }
  .char-hpbar {
    height: 4px; background: rgba(255,255,255,.1); border-radius: 2px; overflow: hidden;
    border: 1px solid rgba(255,255,255,.15);
  }
  .char-hpfill { height: 100%; border-radius: 2px; transition: width .5s; }
  .char-ebar {
    height: 3px; background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden;
  }
  .char-efill { height: 100%; border-radius: 2px; transition: width .3s; }
  .char-vote-badge {
    position: absolute; top: -4px; right: -8px;
    font: 900 8px/1 var(--fd); padding: 2px 4px; border-radius: 4px;
    border: 1px solid #000; z-index: 15;
  }
  .char-vote-badge.long { background: #00ff88; color: #000; }
  .char-vote-badge.short { background: #ff2d55; color: #fff; }

  /* ── Action popup (above character) ── */
  .char-action-popup {
    position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    animation: actionPopIn .3s ease;
    z-index: 20; pointer-events: none;
  }
  @keyframes actionPopIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(.7); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  .cap-emoji { font-size: 20px; filter: drop-shadow(0 0 8px rgba(255,200,0,.6)); }
  .cap-label {
    font: 900 8px/1 var(--fd); letter-spacing: 1px; color: #ffcc00;
    background: rgba(0,0,0,.7); padding: 2px 6px; border-radius: 4px;
    white-space: nowrap;
  }

  /* ── Hit text flyout ── */
  .char-hit-fly {
    position: absolute; top: -20px; left: 50%; transform: translateX(-50%);
    font: 900 14px/1 var(--fd); letter-spacing: 2px;
    text-shadow: 0 2px 6px rgba(0,0,0,.7);
    animation: hitFlyUp 1.2s ease-out forwards;
    z-index: 25; pointer-events: none; white-space: nowrap;
  }
  @keyframes hitFlyUp {
    0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(1.3); }
  }

  /* ── CHARACTER STATE ANIMATIONS ── */
  /* IDLE: gentle float */
  .cs-idle .char-body { animation: csIdle 1.4s ease-in-out infinite; animation-delay: var(--ag-delay, 0s); }
  @keyframes csIdle {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  /* PATROL: walking bounce */
  .cs-patrol .char-body { animation: csPatrol .4s ease-in-out infinite; }
  @keyframes csPatrol {
    0%,100% { transform: translateY(0) rotate(0); }
    25% { transform: translateY(-5px) rotate(-2deg); }
    75% { transform: translateY(-3px) rotate(2deg); }
  }
  /* LOCK: focused stillness + glow */
  .cs-lock .char-body { animation: csLock .6s ease infinite; }
  .cs-lock .char-img-wrap { box-shadow: 0 0 16px var(--ag-color, #ff69b4) !important; }
  @keyframes csLock {
    0%,100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  /* WINDUP: charging vibrate */
  .cs-windup .char-body { animation: csWindup .08s linear infinite; }
  .cs-windup .char-img-wrap { box-shadow: 0 0 22px var(--ag-color, #ffcc00) !important; }
  @keyframes csWindup {
    0% { transform: translate(-2px, 1px); }
    25% { transform: translate(2px, -1px); }
    50% { transform: translate(-1px, -2px); }
    75% { transform: translate(1px, 2px); }
  }
  /* CAST: lunge forward */
  .cs-cast .char-body { animation: csCast .4s ease; }
  .cs-cast .char-img-wrap { box-shadow: 0 0 28px var(--ag-color, #ff5e7a) !important; border-color: #fff !important; }
  @keyframes csCast {
    0% { transform: scale(1); }
    30% { transform: scale(1.15) translateY(-8px); }
    60% { transform: scale(1.1) translateY(-4px); }
    100% { transform: scale(1); }
  }
  /* IMPACT: flash + bounce */
  .cs-impact .char-body { animation: csImpact .3s ease; }
  @keyframes csImpact {
    0% { transform: scale(1.2); filter: brightness(2); }
    50% { transform: scale(0.95); filter: brightness(1.5); }
    100% { transform: scale(1); filter: brightness(1); }
  }
  /* RECOVER: shrink back */
  .cs-recover .char-body { animation: csRecover .4s ease; }
  @keyframes csRecover {
    0% { transform: scale(.9); opacity: .7; }
    100% { transform: scale(1); opacity: 1; }
  }
  /* CELEBRATE: happy jump */
  .cs-celebrate .char-body { animation: csCelebrate .4s ease-in-out infinite; }
  @keyframes csCelebrate {
    0%,100% { transform: translateY(0) rotate(0) scale(1); }
    25% { transform: translateY(-14px) rotate(-5deg) scale(1.08); }
    75% { transform: translateY(-6px) rotate(3deg) scale(1.04); }
  }
  /* PANIC: shaky sad */
  .cs-panic .char-body { animation: csPanic .2s ease infinite; }
  .cs-panic .char-img-wrap { filter: saturate(.4) brightness(.7); }
  @keyframes csPanic {
    0%,100% { transform: translateX(0) rotate(0); }
    25% { transform: translateX(-3px) rotate(-3deg); }
    75% { transform: translateX(3px) rotate(3deg); }
  }

  /* ── VS Splash (in-arena overlay) ── */
  .arena-vs-splash {
    position: absolute; inset: 0; z-index: 50;
    display: flex; align-items: center; justify-content: center; gap: 16px;
    background: rgba(0,0,0,.85);
    animation: vsSplashIn .4s ease;
  }
  .avs-team {
    font: 900 24px/1 var(--fc); letter-spacing: 4px;
    text-shadow: 0 0 20px currentColor;
  }
  .avs-team.long { color: #00ff88; }
  .avs-team.short { color: #ff5e7a; }
  .avs-x { font-size: 28px; animation: vsXPulse .3s ease infinite alternate; }
  @keyframes vsSplashIn { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
  @keyframes vsXPulse { from { transform: scale(1) rotate(-5deg); } to { transform: scale(1.2) rotate(5deg); } }

  /* ── Critical + Combo popups ── */
  .arena-critical-popup {
    position: absolute; top: 20%; left: 50%; transform: translateX(-50%);
    z-index: 60; pointer-events: none;
    font: 900 18px/1 var(--fc); color: #ffcc00; letter-spacing: 3px;
    text-shadow: 0 0 16px rgba(255,200,0,.8), 0 4px 8px rgba(0,0,0,.5);
    animation: criticalBoom .8s ease forwards;
  }
  @keyframes criticalBoom {
    0% { opacity: 0; transform: translateX(-50%) scale(2); }
    20% { opacity: 1; transform: translateX(-50%) scale(1); }
    80% { opacity: 1; transform: translateX(-50%) scale(1.05); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(.8); }
  }
  .arena-combo {
    position: absolute; top: 32%; right: 8%; z-index: 55; pointer-events: none;
    font: 900 14px/1 var(--fc); color: #ff69b4; letter-spacing: 2px;
    text-shadow: 0 0 12px rgba(255,105,180,.6);
    animation: comboPopIn .4s ease;
  }
  @keyframes comboPopIn {
    from { opacity: 0; transform: scale(2) rotate(-10deg); }
    to { opacity: 1; transform: scale(1) rotate(0); }
  }

  /* ═══ NARRATION BOX ═══ */
  .sb-narration {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px;
    border-top: 1px solid rgba(255,105,180,.15);
    background: rgba(255,105,180,.04);
    flex-shrink: 0; min-height: 32px;
  }
  .narr-icon { font-size: 11px; flex-shrink: 0; }
  .narr-text {
    font: 700 9px/1.3 var(--fm); color: rgba(255,255,255,.7);
    flex: 1; animation: narrFade .3s ease;
  }
  @keyframes narrFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  /* ═══ BATTLE LOG (mini chat) ═══ */
  .battle-log {
    max-height: 80px; overflow-y: auto; padding: 4px 8px;
    border-top: 1px solid rgba(255,105,180,.1);
    background: rgba(0,0,0,.2); flex-shrink: 0;
  }
  .battle-log::-webkit-scrollbar { width: 2px; }
  .battle-log::-webkit-scrollbar-thumb { background: rgba(255,105,180,.2); }
  .bl-line {
    display: flex; align-items: center; gap: 4px;
    font: 600 8px/1.3 var(--fm); color: rgba(255,255,255,.5);
    padding: 2px 0; animation: blSlideIn .3s ease;
  }
  .bl-line.action { color: rgba(255,105,180,.7); }
  @keyframes blSlideIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  .bl-icon { font-size: 9px; flex-shrink: 0; }
  .bl-name { font: 800 7px/1 var(--fd); letter-spacing: .5px; flex-shrink: 0; }
  .bl-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bl-empty { text-align: center; color: rgba(255,255,255,.15); font: 600 8px/1 var(--fm); padding: 8px 0; }

  /* ═══ GAME JUICE KEYFRAMES ═══ */
  :global(.jc-shake-light) { animation: jcShakeL .3s ease; }
  :global(.jc-shake-medium) { animation: jcShakeM .35s ease; }
  :global(.jc-shake-heavy) { animation: jcShakeH .4s ease; }
  @keyframes jcShakeL { 0%,100% { transform: none; } 25% { transform: translate(-2px, 1px); } 75% { transform: translate(2px, -1px); } }
  @keyframes jcShakeM { 0%,100% { transform: none; } 20% { transform: translate(-4px, 2px) rotate(-0.5deg); } 40% { transform: translate(3px, -2px); } 60% { transform: translate(-3px, 1px) rotate(0.3deg); } 80% { transform: translate(2px, -1px); } }
  @keyframes jcShakeH { 0%,100% { transform: none; } 10% { transform: translate(-6px, 3px) rotate(-1deg); } 30% { transform: translate(5px, -4px) rotate(0.8deg); } 50% { transform: translate(-4px, 2px) rotate(-0.5deg); } 70% { transform: translate(6px, -3px) rotate(1deg); } 90% { transform: translate(-3px, 1px); } }
  :global(.jc-flash) { position: fixed; inset: 0; z-index: 9999; pointer-events: none; animation: jcFlash .35s ease forwards; }
  :global(.jc-flash-white) { background: rgba(255,255,255,.6); }
  :global(.jc-flash-green) { background: rgba(0,255,136,.4); }
  :global(.jc-flash-red) { background: rgba(255,50,80,.4); }
  :global(.jc-flash-gold) { background: rgba(255,200,0,.5); }
  @keyframes jcFlash { from { opacity: 1; } to { opacity: 0; } }
  :global(.jc-fly-number) { position: fixed; z-index: 9998; pointer-events: none; font: 900 18px/1 var(--fd); letter-spacing: 2px; text-shadow: 0 2px 6px rgba(0,0,0,.5); animation: jcFly 1.2s ease-out forwards; }
  @keyframes jcFly { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-60px) scale(1.3); } }
  :global(.jc-confetti) { position: fixed; top: -10px; z-index: 9997; pointer-events: none; animation: jcConfettiFall ease-out forwards; }
  @keyframes jcConfettiFall { 0% { opacity: 1; transform: translateY(0) rotate(0deg); } 100% { opacity: 0; transform: translateY(100vh) rotate(720deg); } }

  /* ═══════ HYPOTHESIS SIDEBAR ═══════ */
  .hypo-sidebar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 50px;
    z-index: 30;
    overflow-y: auto;
    animation: hypoSlideIn .3s ease;
    filter: drop-shadow(-4px 0 20px rgba(0,0,0,.3));
  }
  @keyframes hypoSlideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* Score Bar */
  .score-bar {
    padding: 6px 12px; border-top: 1px solid rgba(232,150,125,.15);
    background: linear-gradient(90deg, rgba(10,26,18,.95), rgba(8,19,13,.95));
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .sr { position: relative; width: 40px; height: 40px; flex-shrink: 0; }
  .sr svg { width: 40px; height: 40px; }
  .sr .n { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; font-family: var(--fd); color: #fff; }
  .sdir { font-size: 13px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; text-shadow: 0 0 10px currentColor; }
  .smeta { font-size: 7px; color: #888; font-family: var(--fm); }
  .score-stats { display: flex; gap: 8px; margin-left: auto; }
  .ss-item { font-size: 8px; font-weight: 700; font-family: var(--fm); color: #aaa; }
  .ss-item.lp { color: #e8967d; }
  .mode-badge {
    padding: 3px 8px;
    border: 1.5px solid rgba(232,150,125,.55);
    background: rgba(232,150,125,.09);
    color: #e8967d;
    font-size: 8px;
    font-family: var(--fd);
    font-weight: 900;
    letter-spacing: 1px;
    border-radius: 7px;
    white-space: nowrap;
  }
  .mode-badge.pvp {
    border-color: rgba(102,204,230,.55);
    background: rgba(102,204,230,.1);
    color: #66cce6;
  }
  .mode-badge.tour {
    border-color: rgba(220,185,112,.65);
    background: rgba(220,185,112,.12);
    color: #dcb970;
  }

  /* Hypothesis Badge in score bar */
  .hypo-badge {
    padding: 3px 10px; border-radius: 8px; font-size: 8px; font-weight: 900;
    font-family: var(--fd); letter-spacing: 1px; border: 2px solid;
  }
  .hypo-badge.long { background: rgba(0,255,136,.15); border-color: #00ff88; color: #00ff88; }
  .hypo-badge.short { background: rgba(255,45,85,.15); border-color: #ff2d55; color: #ff2d55; }
  .hypo-badge.neutral { background: rgba(255,170,0,.15); border-color: #ffaa00; color: #ffaa00; }

  /* Chart Toggle Buttons */
  .chart-toggles {
    display: flex;
    gap: 3px;
    margin-left: 4px;
  }
  .ct-btn {
    width: 26px;
    height: 26px;
    border: 1px solid rgba(255,105,180,.2);
    border-radius: 6px;
    background: rgba(255,105,180,.05);
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .15s;
    opacity: .5;
  }
  .ct-btn.on {
    border-color: rgba(255,105,180,.5);
    background: rgba(255,105,180,.15);
    opacity: 1;
  }
  .ct-btn:hover { opacity: .8; background: rgba(255,105,180,.1); }

  .mbtn { padding: 6px 16px; border-radius: 16px; background: #E8967D; border: 3px solid #000; color: #000; font-family: var(--fd); font-size: 8px; font-weight: 900; letter-spacing: 2px; cursor: pointer; box-shadow: 3px 3px 0 #000; }
  .mbtn:hover { background: #d07a64; }

  /* Arena Background — Retro Space + Collage */
  .arena-texture {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    z-index: 0;
  }
  .arena-stars {
    background-image: url('/arena/references/14-o.png');
    opacity: .34;
    mix-blend-mode: screen;
    filter: saturate(1.1) contrast(1.12);
  }
  .arena-rainbow {
    background-image: url('/arena/references/03-o.png');
    opacity: .44;
    mix-blend-mode: screen;
    filter: saturate(1.2) contrast(1.06);
  }
  .arena-grid {
    background-image: url('/arena/references/02-o.png');
    opacity: .16;
    mix-blend-mode: lighten;
    transform: scale(1.05);
  }
  .arena-doodle {
    background-image: url('/arena/references/cs-robert-a1-o.png');
    opacity: .18;
    mix-blend-mode: soft-light;
    filter: grayscale(.12) contrast(1.2);
  }
  .arena-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background:
      radial-gradient(circle at 50% 54%, transparent 18%, rgba(2, 7, 18, .4) 58%, rgba(1, 4, 12, .7) 100%),
      linear-gradient(180deg, rgba(5, 8, 18, .04) 0%, rgba(1, 3, 11, .62) 100%);
  }
  .battle-floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    height: 14%;
    border-top: 1px solid rgba(232, 150, 125, .18);
    background:
      linear-gradient(180deg, rgba(10, 26, 18, .2) 0%, rgba(8, 19, 13, .82) 35%, rgba(7, 16, 11, .95) 100%),
      repeating-linear-gradient(90deg, rgba(232, 150, 125, .04) 0 1px, transparent 1px 46px);
    backdrop-filter: blur(2px);
  }
  .battle-floor span {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--fd);
    font-size: 8px;
    letter-spacing: 4px;
    color: rgba(240, 237, 228, .5);
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* Data Sources */
  .dsrc { position: absolute; z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none; transform: translate(-50%, -50%); }
  .dp { position: absolute; width: 48px; height: 48px; border-radius: 50%; background: transparent; border: 1px solid rgba(232,150,125,.2); animation: dpPulse 2s ease infinite; will-change: transform, opacity; contain: strict; }
  @keyframes dpPulse { 0%,100% { transform: scale(1); opacity: .3 } 50% { transform: scale(1.3); opacity: 0 } }
  .di {
    width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;
    background: rgba(10,26,18,.88);
    border: 2px solid;
    box-shadow: 0 0 0 1px rgba(232,150,125,.15), 0 10px 18px rgba(0,0,0,.4);
    backdrop-filter: blur(4px);
  }
  .dl {
    font-size: 7px; color: rgba(240,237,228,.7); letter-spacing: 2px; font-family: var(--fd); font-weight: 900;
    background: rgba(8,19,13,.8); padding: 2px 6px; border-radius: 8px;
    border: 1px solid rgba(232,150,125,.2);
  }

  /* Council Table */
  .ctable {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 108px; height: 58px; border-radius: 999px;
    border: 1px dashed rgba(232,150,125,.2);
    background: rgba(10,26,18,.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 4; transition: all .3s;
    backdrop-filter: blur(3px);
  }
  .ctable.on {
    border-color: rgba(232,150,125,.6);
    border-style: solid;
    background: rgba(10,26,18,.72);
    box-shadow: 0 0 28px rgba(232, 150, 125, .2);
  }
  .cl { font-size: 7px; color: rgba(240, 237, 228, .35); letter-spacing: 3px; font-family: var(--fd); font-weight: 900; }
  .ctable.on .cl { color: rgba(240,237,228,.7); }

  /* Agent Sprites */
  .ag {
    position: absolute; z-index: 10; width: 110px; text-align: center;
    transform: translate(-50%, -50%);
    cursor: pointer;
    transition: left .6s cubic-bezier(.4,0,.2,1), top .6s cubic-bezier(.4,0,.2,1);
    will-change: transform, left, top;
    contain: layout style;
  }
  .ag .sha {
    position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
    width: 48px; height: 8px; background: rgba(0,0,0,.5);
    border-radius: 50%; filter: blur(2px);
    transition: width .3s, opacity .3s;
  }
  .ag.jump .sha { width: 36px; opacity: .3; }
  .ag .wr { position: relative; display: flex; flex-direction: column; align-items: center; animation-delay: var(--ag-delay, 0s); }

  /* ── Idle: gentle float ── */
  .ag.idle .wr { animation: aI 1.4s ease-in-out infinite; }
  @keyframes aI {
    0%,100% { transform: translateY(0) rotate(0) }
    25% { transform: translateY(-3px) rotate(-0.5deg) }
    75% { transform: translateY(-2px) rotate(0.5deg) }
  }

  /* ── Walk: energetic run ── */
  .ag.walk .wr { animation: aW .25s ease-in-out infinite; }
  @keyframes aW {
    0%   { transform: translateX(0) translateY(0) rotate(0) }
    25%  { transform: translateX(-4px) translateY(-5px) rotate(-3deg) }
    50%  { transform: translateX(0) translateY(-2px) rotate(0) }
    75%  { transform: translateX(4px) translateY(-5px) rotate(3deg) }
    100% { transform: translateX(0) translateY(0) rotate(0) }
  }

  /* ── Think: head bob ── */
  .ag.think .wr { animation: aT 1.5s ease-in-out infinite; }
  @keyframes aT {
    0%,100% { transform: rotate(0) scale(1) }
    20% { transform: rotate(-4deg) scale(.98) }
    40% { transform: rotate(3deg) scale(1.01) }
    60% { transform: rotate(-2deg) scale(.99) }
    80% { transform: rotate(4deg) scale(1) }
  }

  /* ── Alert: pulse glow ── */
  .ag.alert .wr { animation: aA .4s ease infinite; }
  .ag.alert .agent-sprite { box-shadow: 0 0 20px var(--ag-color, #E8967D) !important; }
  @keyframes aA {
    0%,100% { transform: scale(1) }
    50% { transform: scale(1.08) }
  }

  /* ── Charge: intense vibrate ── */
  .ag.charge .wr { animation: aC .1s linear infinite; }
  .ag.charge .agent-sprite { box-shadow: 0 0 24px var(--ag-color, #ff0) !important; }
  @keyframes aC {
    0%  { transform: translateX(-2px) translateY(1px) }
    25% { transform: translateX(2px) translateY(-1px) }
    50% { transform: translateX(-1px) translateY(-2px) }
    75% { transform: translateX(1px) translateY(2px) }
  }

  /* ── Vote: bounce up ── */
  .ag.vote .wr { animation: aV .5s ease infinite; }
  @keyframes aV {
    0%,100% { transform: translateY(0) scale(1) }
    30% { transform: translateY(-8px) scale(1.06) }
    60% { transform: translateY(-2px) scale(1.02) }
  }

  /* ── Jump: victory leap ── */
  .ag.jump .wr { animation: aJ .4s ease-in-out infinite; }
  @keyframes aJ {
    0%,100% { transform: translateY(0) rotate(0) scale(1) }
    20% { transform: translateY(-18px) rotate(-5deg) scale(1.1) }
    50% { transform: translateY(-22px) rotate(3deg) scale(1.12) }
    80% { transform: translateY(-8px) rotate(-2deg) scale(1.05) }
  }

  /* ── Sad: droopy wobble ── */
  .ag.sad .wr { animation: aS 2s ease infinite; }
  @keyframes aS {
    0%,100% { transform: translateY(0) rotate(0) }
    30% { transform: translateY(4px) rotate(-4deg) }
    70% { transform: translateY(3px) rotate(3deg) }
  }

  /* ══ Energy Aura ══ */
  .energy-aura {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 72px; height: 72px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--aura-color) 0%, transparent 70%);
    opacity: .2;
    z-index: -1;
    animation: auraBreath 1.5s ease-in-out infinite;
    pointer-events: none;
    will-change: transform, opacity;
    contain: strict;
  }
  @keyframes auraBreath {
    0%,100% { transform: translate(-50%, -50%) scale(1); opacity: .15; }
    50% { transform: translate(-50%, -50%) scale(1.3); opacity: .3; }
  }

  /* ══ Trail Particles ══ */
  .trail-particles {
    position: absolute;
    bottom: -10px; left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .tp {
    position: absolute;
    font-size: 8px;
    color: var(--ag-color, #E8967D);
    opacity: 0;
    animation: tpFade .8s ease-out infinite;
    animation-delay: var(--tp-d, 0s);
    left: var(--tp-x, 0px);
    will-change: transform, opacity;
    contain: layout style;
  }
  @keyframes tpFade {
    0% { opacity: .8; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(12px) scale(.5); }
  }

  /* ══ Energy Bar Glow ══ */
  .ebar-glow {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    opacity: .4;
    animation: ebarGlow .5s ease infinite;
  }
  @keyframes ebarGlow { 0%,100% { opacity: .3 } 50% { opacity: .6 } }

  /* Speech Bubble */
  .sp { position: absolute; top: -32px; left: 50%; transform: translateX(-50%); background: #fff; border: 2px solid #000; border-radius: 10px 10px 10px 2px; padding: 3px 8px; font-size: 7px; font-weight: 700; white-space: nowrap; opacity: 0; transition: opacity .2s; z-index: 20; box-shadow: 2px 2px 0 #000; font-family: var(--fm); }
  .sp.v { opacity: 1; }

  /* Vote Badge */
  .vb { position: absolute; top: -18px; right: -10px; background: #00ff88; border: 2px solid #000; border-radius: 8px; padding: 1px 6px; font-size: 7px; font-weight: 900; font-family: var(--fd); letter-spacing: 1px; opacity: 0; transition: opacity .2s; z-index: 19; box-shadow: 2px 2px 0 #000; }
  .vb.v { opacity: 1; }
  .vb.long { background: #00ff88; color: #000; }
  .vb.short { background: #ff2d55; color: #fff; }
  .vb.neutral { background: #ffaa00; color: #000; }

  .agent-sprite {
    width: 80px; height: 80px; border-radius: 20px; border: 4px solid;
    display: flex; align-items: center; justify-content: center;
    background: #fff; box-shadow: 5px 5px 0 #000; transition: all .15s; overflow: hidden;
  }
  .sprite-icon { font-size: 34px; }
  .sprite-img { width: 100%; height: 100%; object-fit: cover; border-radius: 16px; }
  .ag .rbadge {
    position: absolute; top: -6px; right: -6px; width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 11px;
    border: 3px solid #000; z-index: 3; text-shadow: 0 1px 0 #000;
    box-shadow: 2px 2px 0 #000;
  }
  .ag .react {
    position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
    font-size: 6px; z-index: 15;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(232, 150, 125, .35);
    background: rgba(10, 26, 18, .8);
    color: rgba(240,237,228,.7);
    letter-spacing: 1.5px;
    font-family: var(--fd);
    font-weight: 900;
    text-transform: uppercase;
    filter: drop-shadow(0 4px 6px rgba(0,0,0,.35));
  }
  .ag .nm {
    font-size: 8px; font-weight: 900; letter-spacing: 2px; margin-top: 4px;
    font-family: var(--fd); background: #fff; padding: 2px 8px; border-radius: 8px;
    border: 2px solid #000; box-shadow: 2px 2px 0 #000;
  }
  .ag .ebar { width: 60px; height: 6px; margin: 3px auto 0; border-radius: 4px; background: #ddd; overflow: hidden; border: 2px solid #000; position: relative; }
  .ag .efill { height: 100%; border-radius: 2px; transition: width .3s; }

  /* Phase Display */
  .phase-display {
    position: absolute; top: 8px; right: 8px; z-index: 15;
    background: rgba(10, 26, 18, .88);
    border-radius: 12px;
    padding: 8px 14px;
    border: 1px solid rgba(232,150,125,.3);
    box-shadow: 0 10px 24px rgba(0,0,0,.4);
    text-align: center;
    backdrop-filter: blur(5px);
  }
  .phase-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    margin: 0 auto 6px;
    box-shadow: 0 0 10px currentColor;
  }
  .phase-name { font-size: 10px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; text-transform: uppercase; }
  .phase-timer { font-size: 9px; font-family: var(--fm); color: rgba(240,237,228,.5); font-weight: 700; }

  /* Agent Decision Card (below sprite) */
  .ag-decision {
    margin-top: 3px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 6px;
    padding: 3px 5px;
    box-shadow: 2px 2px 0 #000;
    font-family: var(--fm);
    animation: decisionSlideIn .3s ease;
    width: 80px;
  }
  @keyframes decisionSlideIn {
    from { opacity: 0; transform: translateY(-6px) scale(.9); }
    to { opacity: 1; transform: none; }
  }
  .agd-dir {
    font-size: 7px; font-weight: 900; letter-spacing: 1px;
    padding: 1px 4px; border-radius: 4px; text-align: center;
    border: 1.5px solid #000;
  }
  .agd-dir.long { background: #00ff88; color: #000; }
  .agd-dir.short { background: #ff2d55; color: #fff; }
  .agd-dir.neutral { background: #ffaa00; color: #000; }
  .agd-finding {
    font-size: 6px; color: #444; line-height: 1.3;
    margin-top: 2px; text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .agd-bar {
    height: 3px; border-radius: 2px; background: #eee;
    overflow: hidden; margin-top: 2px; border: 1px solid rgba(0,0,0,.15);
  }
  .agd-fill { height: 100%; border-radius: 2px; transition: width .5s; }

  /* Feed */
  .feed-panel { position: absolute; bottom: 14%; left: 8px; right: 8px; z-index: 14; max-height: 70px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .feed-msg {
    display: flex; align-items: center; gap: 4px; font-size: 7px; font-family: var(--fm);
    background: rgba(10, 26, 18, .8);
    border: 1px solid rgba(232, 150, 125, .2);
    color: rgba(240,237,228,.6);
    padding: 2px 6px;
    border-radius: 4px;
    backdrop-filter: blur(5px);
  }
  .feed-icon { font-size: 8px; }
  .feed-name { font-weight: 900; font-size: 7px; }
  .feed-text { color: rgba(240,237,228,.55); flex: 1; }
  .feed-dir { font-size: 6px; padding: 1px 4px; border-radius: 4px; font-weight: 900; }
  .feed-dir.long { background: #00ff88; color: #000; }
  .feed-dir.short { background: #ff2d55; color: #fff; }
  .feed-new { animation: feedSlideIn .3s ease; }
  @keyframes feedSlideIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .feed-cursor {
    animation: feedBlink .5s step-end infinite;
    color: #000;
    font-weight: 900;
  }
  @keyframes feedBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

  /* ═══════ COMPARE OVERLAY ═══════ */
  .compare-overlay {
    position: absolute; inset: 0; z-index: 32;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.25);
    animation: fadeIn .3s ease;
  }
  .compare-card {
    background: #fff; border: 4px solid #000; border-radius: 16px;
    padding: 14px 18px; box-shadow: 8px 8px 0 #000;
    min-width: 320px; animation: popIn .3s ease;
  }
  .compare-header {
    display: flex; align-items: center; gap: 8px;
    border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px;
  }
  .compare-icon { font-size: 18px; }
  .compare-title { font-size: 16px; font-weight: 900; font-family: var(--fc); letter-spacing: 3px; }
  .compare-vs {
    display: flex; align-items: flex-start; gap: 12px; justify-content: center;
  }
  .compare-side {
    flex: 1; text-align: center; padding: 8px;
    border: 2px solid #eee; border-radius: 10px;
  }
  .compare-side.user { background: rgba(232,150,125,.05); }
  .compare-side.agents { background: rgba(0,200,255,.05); }
  .compare-label {
    font-size: 7px; font-weight: 900; font-family: var(--fd);
    letter-spacing: 2px; color: #888; margin-bottom: 4px;
  }
  .compare-dir {
    font-size: 18px; font-weight: 900; font-family: var(--fc);
    letter-spacing: 2px;
  }
  .compare-dir.long { color: #00cc66; }
  .compare-dir.short { color: #ff2d55; }
  .compare-dir.neutral { color: #ffaa00; }
  .compare-levels {
    display: flex; flex-direction: column; gap: 1px;
    font-size: 7px; font-family: var(--fm); font-weight: 700;
    margin-top: 4px;
  }
  .cmp-tp { color: #00cc66; }
  .cmp-entry { color: #ffaa00; }
  .cmp-sl { color: #ff2d55; }
  .compare-score {
    font-size: 9px; font-weight: 900; font-family: var(--fd);
    color: #000; margin-top: 4px;
  }
  .compare-votes {
    display: flex; flex-wrap: wrap; gap: 3px; justify-content: center;
    margin-top: 4px;
  }
  .compare-vote {
    display: flex; align-items: center; gap: 2px;
    font-size: 7px; font-family: var(--fm);
    background: #f5f5f5; border-radius: 4px; padding: 2px 4px;
  }
  .cv-dir { font-weight: 900; font-size: 6px; padding: 1px 3px; border-radius: 3px; }
  .cv-dir.long { background: #00ff88; color: #000; }
  .cv-dir.short { background: #ff2d55; color: #fff; }
  .cv-conf { color: #888; font-size: 6px; }
  .compare-badge-wrap {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    min-width: 80px;
  }
  .compare-consensus-badge {
    padding: 4px 10px; border-radius: 8px; border: 3px solid #000;
    font-size: 8px; font-weight: 900; font-family: var(--fd); letter-spacing: 1px;
    box-shadow: 2px 2px 0 #000; text-align: center;
  }
  .compare-consensus-badge.consensus { background: #00ff88; color: #000; }
  .compare-consensus-badge.partial { background: #E8967D; color: #000; }
  .compare-consensus-badge.dissent { background: #ff2d55; color: #fff; }
  .compare-consensus-badge.override { background: #c840ff; color: #fff; }
  .compare-vs-icon {
    font-size: 14px; font-weight: 900; font-family: var(--fc); color: #000;
  }
  .compare-mult {
    text-align: center; margin-top: 10px; padding: 6px;
    background: #000; border-radius: 8px;
    font-size: 9px; font-weight: 900; font-family: var(--fd);
    letter-spacing: 2px; color: #888;
  }
  .mult-val { font-size: 16px; }

  /* Verdict Overlay */
  .verdict-overlay { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.2); }
  .verdict-card { background: #fff; border: 4px solid #000; border-radius: 16px; padding: 16px 24px; text-align: center; box-shadow: 6px 6px 0 #000; animation: popIn .3s ease; }
  .verdict-score { position: relative; width: 60px; height: 60px; margin: 0 auto 8px; }
  .verdict-score svg { width: 60px; height: 60px; }
  .vs-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; font-family: var(--fc); }
  .verdict-dir { font-size: 20px; font-weight: 900; font-family: var(--fc); letter-spacing: 3px; }
  .verdict-dir.long { color: #00cc66; }
  .verdict-dir.short { color: #ff2d55; }
  .verdict-meta { font-size: 8px; color: #888; font-family: var(--fm); margin-top: 4px; }

  /* Result Overlay */
  .result-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 35; text-align: center; animation: popIn .3s ease; padding: 16px 28px; border-radius: 16px; border: 1px solid rgba(232,150,125,.3); box-shadow: 0 8px 32px rgba(0,0,0,.5); backdrop-filter: blur(8px); }
  .result-overlay.win { background: linear-gradient(135deg, rgba(0,204,136,.25), rgba(0,180,100,.2)); border-color: rgba(0,204,136,.4); }
  .result-overlay.lose { background: linear-gradient(135deg, rgba(255,94,122,.25), rgba(200,50,70,.2)); border-color: rgba(255,94,122,.4); }
  .result-text { font-size: 22px; font-weight: 900; font-family: var(--fc); color: #f0ede4; letter-spacing: 3px; text-shadow: 0 0 12px rgba(232,150,125,.3); }
  .result-lp { font-size: 14px; font-weight: 900; font-family: var(--fd); color: #f0ede4; margin-top: 4px; }
  .result-streak { font-size: 10px; font-weight: 700; color: #e8967d; margin-top: 4px; }
  .result-motto { font-size: 8px; font-family: var(--fc); color: rgba(240,237,228,.6); margin-top: 8px; font-style: italic; }

  /* FBS Scorecard */
  .fbs-card {
    margin-top: 10px; padding: 8px 12px; border-radius: 10px;
    background: rgba(10,26,18,.85); border: 1px solid rgba(232,150,125,.2);
    text-align: left; min-width: 180px;
  }
  .fbs-title { font-size: 7px; font-weight: 900; letter-spacing: 2px; color: rgba(240,237,228,.5); font-family: var(--fd); margin-bottom: 6px; text-align: center; }
  .fbs-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .fbs-label { font-size: 8px; font-weight: 900; font-family: var(--fd); letter-spacing: 1px; width: 22px; color: rgba(240,237,228,.6); }
  .fbs-bar { flex: 1; height: 5px; background: rgba(240,237,228,.08); border-radius: 3px; overflow: hidden; }
  .fbs-fill { height: 100%; border-radius: 3px; transition: width .6s ease; }
  .fbs-val { font-size: 9px; font-weight: 900; font-family: var(--fd); width: 24px; text-align: right; color: #f0ede4; }
  .fbs-total { display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px solid rgba(232,150,125,.15); margin-top: 4px; font-size: 8px; font-weight: 900; font-family: var(--fd); color: rgba(240,237,228,.5); letter-spacing: 1px; }
  .fbs-total-val { font-size: 16px; color: #e8967d; text-shadow: 0 0 8px rgba(232,150,125,.3); }

  /* PvP Result */
  .pvp-overlay { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.6); backdrop-filter: blur(4px); animation: fadeIn .3s ease; }
  .pvp-card { background: rgba(10,26,18,.95); border: 1px solid rgba(232,150,125,.3); border-radius: 16px; padding: 20px 30px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,.5); min-width: 260px; }
  .pvp-title { font-size: 18px; font-weight: 900; font-family: var(--fc); letter-spacing: 3px; color: #f0ede4; }
  .pvp-scores { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 12px 0; }
  .pvp-side { text-align: center; }
  .pvp-label { font-size: 7px; color: #888; font-family: var(--fd); letter-spacing: 2px; }
  .pvp-label.tour-meta {
    margin-top: 2px;
    margin-bottom: 8px;
    font-size: 8px;
    color: #8b6c27;
    letter-spacing: 1px;
  }
  .pvp-score { font-size: 28px; font-weight: 900; font-family: var(--fc); }
  .pvp-vs { font-size: 14px; font-weight: 900; font-family: var(--fc); color: #888; }
  .pvp-lp { font-size: 16px; font-weight: 900; font-family: var(--fd); margin: 8px 0; }
  .pvp-lp.pos { color: #00cc66; }
  .pvp-lp.neg { color: #ff2d55; }
  .pvp-hypo {
    font-size: 9px; font-family: var(--fm); font-weight: 700;
    color: #666; margin: 4px 0 8px;
  }
  .pvp-hypo .long { color: #00cc66; }
  .pvp-hypo .short { color: #ff2d55; }
  .pvp-hypo .neutral { color: #ffaa00; }
  .pvp-consensus { color: #c840ff; }
  .pvp-btns { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }
  .pvp-btn { padding: 8px 20px; border-radius: 12px; border: 3px solid #000; font-family: var(--fd); font-size: 9px; font-weight: 900; letter-spacing: 2px; cursor: pointer; box-shadow: 3px 3px 0 #000; }
  .pvp-btn.lobby { background: #eee; color: #000; }
  .pvp-btn.again { background: #E8967D; color: #000; }
  .pvp-btn:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 #000; }

  /* Doge Float */
  .doge-float { position: absolute; z-index: 25; font-family: var(--fc); font-weight: 900; font-style: italic; font-size: 16px; letter-spacing: 2px; pointer-events: none; animation: dogeUp ease forwards; text-shadow: 2px 2px 0 #000, -1px -1px 0 #000; -webkit-text-stroke: 1px #000; }
  @keyframes dogeUp { 0% { opacity: 1; transform: translateY(0) rotate(-5deg) scale(1); } 100% { opacity: 0; transform: translateY(-100px) rotate(15deg) scale(1.5); } }

  /* History */
  .hist-btn {
    position: absolute; bottom: 14%; right: 8px; z-index: 16;
    padding: 4px 10px; border-radius: 8px;
    background: rgba(5, 11, 24, .8);
    border: 1px solid rgba(136, 171, 255, .5);
    color: #bdd8ff;
    font-size: 8px; font-weight: 700; cursor: pointer;
    box-shadow: 0 8px 18px rgba(0,0,0,.35);
  }
  .hist-panel {
    position: absolute; top: 0; right: 0; bottom: 0; width: 180px; z-index: 50;
    background: rgba(6, 11, 24, .94);
    border-left: 1px solid rgba(140, 174, 255, .42);
    color: #d4e7ff;
    padding: 10px; overflow-y: auto;
    box-shadow: -6px 0 20px rgba(0,0,0,.4);
    backdrop-filter: blur(4px);
  }
  .hist-header {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 9px; font-weight: 900; font-family: var(--fd);
    letter-spacing: 2px; margin-bottom: 8px;
    border-bottom: 1px solid rgba(151, 184, 255, .35);
    padding-bottom: 6px;
    color: #cfe4ff;
  }
  .hist-close { background: none; border: none; font-size: 14px; cursor: pointer; color: #9fc2ff; }
  .hitem {
    display: flex; align-items: center; gap: 4px; padding: 3px 0;
    border-bottom: 1px solid rgba(134, 166, 235, .15);
    font-size: 8px; font-family: var(--fm);
  }
  .hnum { font-weight: 700; color: #83a8df; width: 24px; }
  .hres { font-weight: 900; font-size: 7px; padding: 1px 5px; border-radius: 4px; }
  .hres.w { background: #00ff88; color: #000; }
  .hres.l { background: #ff2d55; color: #fff; }
  .hlp { font-weight: 700; }
  .hlp.pos { color: #00cc66; }
  .hlp.neg { color: #ff2d55; }
  .hscore { color: #8caedc; margin-left: auto; }
  .hstreak { font-size: 7px; }
  .hist-empty { text-align: center; color: #7f99bf; font-size: 9px; padding: 20px 0; }

  /* ═══════ REPLAY BANNER ═══════ */
  .replay-banner {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #c840ff;
    border: 3px solid #000;
    border-radius: 12px;
    padding: 6px 14px;
    box-shadow: 3px 3px 0 #000;
    animation: floatBarIn .3s ease;
  }
  .replay-icon { font-size: 14px; }
  .replay-text {
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #fff;
  }
  .replay-step {
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    color: rgba(255,255,255,.6);
  }
  .replay-exit {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 3px 8px;
    border: 2px solid #fff;
    border-radius: 6px;
    background: rgba(255,255,255,.15);
    color: #fff;
    cursor: pointer;
  }
  .replay-exit:hover { background: rgba(255,255,255,.3); }

  /* ═══════ FLOATING DIRECTION BAR ═══════ */
  .dir-float-bar {
    position: absolute;
    bottom: 55px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 0;
    background: #fff;
    border: 3px solid #000;
    border-radius: 20px;
    box-shadow: 4px 4px 0 #000;
    overflow: hidden;
    animation: floatBarIn .3s ease;
  }
  @keyframes floatBarIn {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .dfb-btn {
    padding: 10px 28px;
    border: none;
    font-family: var(--fd);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all .15s;
    background: #fafafa;
    color: #888;
  }
  .dfb-btn.long:hover { background: #e8fff0; color: #00aa44; }
  .dfb-btn.short:hover { background: #ffe8ec; color: #cc0033; }
  .dfb-btn.long.sel { background: #00ff88; color: #000; }
  .dfb-btn.short.sel { background: #ff2d55; color: #fff; }
  .dfb-divider { width: 2px; height: 28px; background: #000; }

  /* ═══════ POSITION PREVIEW OVERLAY ═══════ */
  .preview-overlay {
    position: absolute;
    inset: 0;
    z-index: 28;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.15);
    animation: fadeIn .3s ease;
  }
  .preview-card {
    background: #fff;
    border: 4px solid #000;
    border-radius: 16px;
    padding: 16px 22px;
    box-shadow: 6px 6px 0 #000;
    text-align: center;
    min-width: 240px;
    animation: popIn .3s ease;
  }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-bottom: 3px solid #000;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .prev-icon { font-size: 18px; }
  .prev-title {
    font-family: var(--fc);
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #000;
  }
  .preview-dir {
    font-family: var(--fc);
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 3px;
    margin-bottom: 8px;
  }
  .preview-dir.long { color: #00cc66; }
  .preview-dir.short { color: #ff2d55; }
  .preview-dir.neutral { color: #ffaa00; }
  .preview-levels {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }
  .prev-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    border-radius: 6px;
    background: #f8f8f8;
  }
  .prev-row.tp { background: rgba(0,255,136,.1); }
  .prev-row.sl { background: rgba(255,45,85,.08); }
  .prev-lbl {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #888;
  }
  .prev-val {
    font-family: var(--fd);
    font-size: 12px;
    font-weight: 900;
    color: #000;
  }
  .preview-rr {
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #888;
    background: #000;
    border-radius: 8px;
    padding: 4px 12px;
    margin-bottom: 6px;
    display: inline-block;
  }
  .prev-rr-val { font-size: 14px; color: #E8967D; }
  .preview-config {
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    color: #aaa;
    letter-spacing: 1px;
    margin-bottom: 10px;
  }
  .preview-confirm {
    font-family: var(--fd);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 2px;
    padding: 10px 28px;
    border: 3px solid #000;
    border-radius: 14px;
    background: linear-gradient(180deg, #00ff88, #00cc66);
    color: #000;
    cursor: pointer;
    box-shadow: 3px 3px 0 #000;
    transition: all .15s;
  }
  .preview-confirm:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 #000;
    background: linear-gradient(180deg, #33ffaa, #00dd77);
  }
  .preview-confirm:active {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 #000;
  }

  /* ═══════ PARTIAL REFERENCE UI LAYER (OUR TONE) ═══════ */
  .arena-rail {
    position: absolute;
    top: 52px;
    right: 10px;
    bottom: 38px;
    width: 190px;
    z-index: 14;
    border: 1px solid var(--arena-line);
    background: rgba(8, 18, 13, 0.92);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    backdrop-filter: blur(4px);
  }
  .rail-head {
    padding: 8px 10px;
    border-bottom: 1px solid var(--arena-line-soft);
    background: linear-gradient(180deg, rgba(232, 150, 125, 0.15), rgba(8, 18, 13, 0.2));
  }
  .rail-pair {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1px;
    color: var(--arena-accent);
  }
  .rail-price {
    margin-top: 3px;
    font-family: var(--fd);
    font-size: 14px;
    font-weight: 900;
    color: var(--arena-text);
    letter-spacing: 1px;
  }
  .rail-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid var(--arena-line-soft);
    border-bottom: 1px solid var(--arena-line-soft);
  }
  .rail-body {
    flex: 1;
    overflow-y: auto;
  }
  .rail-body::-webkit-scrollbar {
    width: 2px;
  }
  .rail-body::-webkit-scrollbar-thumb {
    background: rgba(232, 150, 125, 0.35);
  }
  .rail-row {
    display: grid;
    grid-template-columns: 14px 1fr auto auto;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--arena-line-soft);
  }
  .rail-rank {
    font-family: var(--fm);
    font-size: 7px;
    color: rgba(240, 237, 228, 0.45);
    text-align: center;
  }
  .rail-name {
    font-family: var(--fd);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rail-dir {
    font-family: var(--fm);
    font-size: 6px;
    border: 1px solid;
    padding: 1px 4px;
    letter-spacing: 1px;
  }
  .rail-dir.long {
    color: var(--arena-good);
    border-color: rgba(0, 204, 136, 0.45);
    background: rgba(0, 204, 136, 0.12);
  }
  .rail-dir.short {
    color: var(--arena-bad);
    border-color: rgba(255, 94, 122, 0.42);
    background: rgba(255, 94, 122, 0.1);
  }
  .rail-dir.neutral {
    color: var(--arena-warn);
    border-color: rgba(220, 185, 112, 0.5);
    background: rgba(220, 185, 112, 0.12);
  }
  .rail-conf {
    font-family: var(--fm);
    font-size: 7px;
    color: var(--arena-accent-2);
    min-width: 26px;
    text-align: right;
  }
  .rail-log {
    padding: 6px 8px;
    border-bottom: 1px solid var(--arena-line-soft);
    display: grid;
    gap: 2px;
  }
  .rl-name {
    font-family: var(--fd);
    font-size: 7px;
    letter-spacing: 1px;
    font-weight: 900;
  }
  .rl-text {
    font-family: var(--fm);
    font-size: 7px;
    line-height: 1.35;
    color: var(--arena-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rail-map {
    padding: 7px;
    display: grid;
    gap: 6px;
  }
  .rm-item {
    padding: 7px 8px;
    border: 1px solid var(--arena-line-soft);
    background: rgba(10, 22, 17, 0.78);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .rm-item span {
    font-family: var(--fm);
    font-size: 7px;
    color: var(--arena-text-muted);
    letter-spacing: 1px;
  }
  .rail-empty {
    padding: 18px 10px;
    text-align: center;
    color: rgba(240, 237, 228, 0.45);
    font-family: var(--fm);
    font-size: 8px;
  }

  .arena-balance {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 8px;
    z-index: 15;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
  }
  .ab-track {
    height: 6px;
    border: 1px solid var(--arena-line-soft);
    background: linear-gradient(90deg, rgba(0, 204, 136, 0.12), rgba(255, 94, 122, 0.18));
    position: relative;
    overflow: hidden;
  }
  .ab-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--arena-good), var(--arena-accent-2));
    transition: width .3s ease;
  }

  .feed-panel {
    left: 8px;
    right: 206px;
    max-height: 82px;
  }
  .feed-msg {
    border-color: var(--arena-line-soft);
    background: rgba(8, 18, 13, 0.78);
    color: var(--arena-text);
  }
  .feed-text {
    color: var(--arena-text-dim);
  }
  .hist-btn {
    right: 206px;
  }

  @media (max-width: 1150px) {
    .arena-rail {
      width: 170px;
    }
    .feed-panel {
      right: 184px;
    }
    .hist-btn {
      right: 184px;
    }
    .atb-phase-track {
      justify-content: flex-start;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .atb-phase-track::-webkit-scrollbar {
      display: none;
    }
    .live-event-stack {
      width: min(288px, calc(100% - 190px));
    }
  }
  @media (max-width: 900px) {
    .arena-rail {
      display: none;
    }
    .feed-panel {
      right: 8px;
    }
    .hist-btn {
      right: 8px;
    }
    .arena-topbar {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'back right'
        'track track';
      row-gap: 8px;
    }
    .atb-back {
      grid-area: back;
      justify-self: start;
    }
    .atb-right {
      grid-area: right;
      justify-self: end;
    }
    .atb-phase-track {
      grid-area: track;
      justify-content: flex-start;
      width: 100%;
    }
    .live-event-stack {
      width: min(300px, calc(100% - 18px));
      top: 106px;
    }
    .phase-display {
      top: 110px;
    }
  }

  @keyframes popIn { from { transform: translate(-50%, -50%) scale(.8); opacity: 0 } to { transform: translate(-50%, -50%) scale(1); opacity: 1 } }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

  @media (max-width: 768px) {
    .battle-layout { grid-template-columns: 1fr; grid-template-rows: 45% 1fr; }
    .chart-side { border-right: none; border-bottom: 4px solid #000; }
    .atp-label {
      font-size: 7px;
      letter-spacing: 1px;
    }
    .atb-connector {
      width: 12px;
      margin: 0 3px;
    }
    .atb-back {
      font-size: 9px;
      padding: 6px 10px;
    }
    .atb-hist {
      width: 28px;
      height: 28px;
    }
    .live-event-stack {
      top: 98px;
    }
  }

  /* ── Wallet Gate ── */
  .wallet-gate {
    position: absolute;
    inset: 0;
    z-index: 90;
    background: rgba(0,0,0,.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .wg-card {
    background: #111;
    border: 4px solid var(--yel);
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(232,150,125,.15), 8px 8px 0 #000;
    padding: 40px 48px;
    text-align: center;
    max-width: 400px;
    position: relative;
    overflow: hidden;
  }
  .wg-card::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: repeating-conic-gradient(transparent 0deg 8deg, rgba(232,150,125,.04) 8deg 16deg);
    animation: spin 60s linear infinite;
    z-index: 0;
  }
  .wg-icon { font-size: 48px; margin-bottom: 12px; position: relative; z-index: 1; }
  .wg-title {
    font-family: var(--fd);
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 4px;
    color: var(--yel);
    margin-bottom: 8px;
    position: relative; z-index: 1;
  }
  .wg-sub {
    font-family: var(--fm);
    font-size: 11px;
    color: rgba(255,255,255,.5);
    line-height: 1.5;
    margin-bottom: 20px;
    position: relative; z-index: 1;
  }
  .wg-btn {
    font-family: var(--fd);
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 3px;
    padding: 12px 32px;
    border-radius: 24px;
    border: 3px solid #000;
    box-shadow: 4px 4px 0 #000;
    cursor: pointer;
    background: var(--pk);
    color: #fff;
    transition: all .2s;
    position: relative; z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .wg-btn:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 #000; background: #ff1a8a; }
  .wg-btn:active { transform: translate(1px, 1px); box-shadow: 2px 2px 0 #000; }
  .wg-hint {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.25);
    margin-top: 14px;
    letter-spacing: .5px;
    position: relative; z-index: 1;
  }

  /* ═══════ API SYNC STATUS ═══════ */
  .api-status {
    position: fixed;
    bottom: 8px;
    right: 8px;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 8px;
    z-index: 100;
    opacity: 0.7;
    font-family: monospace;
  }
  .api-status.synced { background: rgba(0,170,68,0.2); color: #00aa44; }
  .api-status.error { background: rgba(255,45,85,0.15); color: #ff6666; }
</style>
