// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Living Battle Engine
// ═══════════════════════════════════════════════════════════════
//
// Replaces the legacy random-walk battle simulation with:
//   1. Real-time candle monitoring via Binance WebSocket
//   2. TP/SL checking against actual candle highs/lows
//   3. Decision Window consequence logic (CUT/ADD/FLIP)
//   4. Checkpoint generation for STANDARD/MARATHON games
//   5. Template-based agent commentary (no LLM cost)

import type {
  Direction,
  BinanceKline,
  BattleMode,
  BattleResolution,
  ActiveGame,
  Checkpoint,
  CheckpointAgentComment,
  DecisionAction,
  DWResult,
  AgentOutput,
} from './types';
import {
  getBattleMode,
  getTimeframeDurationMs,
  getCheckpointIntervalMs,
} from './types';
import { subscribeKlines, fetchPrice, pairToSymbol } from '$lib/api/binance';
import { getPrice } from '$lib/stores/priceStore';

// ─── Constants ──────────────────────────────────────────────

const DW_DEADLINE_MS = 5 * 60 * 1000;   // 5 minutes to respond
const AUTO_HOLD_ACTION: DecisionAction = 'HOLD';
const ADD_MULTIPLIER = 1.5;
const MAX_CONCURRENT_GAMES = 3;

// ─── Battle State (per active game) ────────────────────────

export interface BattleState {
  game: ActiveGame;
  unsub: (() => void) | null;            // WebSocket unsubscribe
  checkpointTimer: ReturnType<typeof setInterval> | null;
  onUpdate: (game: ActiveGame) => void;  // callback to push state updates
  onCheckpoint: (cp: Checkpoint) => void;
  onResolution: (game: ActiveGame, resolution: BattleResolution) => void;
  destroyed: boolean;
}

// Registry of active battles
const activeBattles = new Map<string, BattleState>();

// ─── Create Initial ActiveGame ─────────────────────────────

export interface CreateGameParams {
  matchId: string;
  pair: string;
  timeframe: string;
  direction: Direction;
  entryPrice: number;
  tp: number;
  sl: number;
  stakedLP: number;
  selectedAgents: string[];
  agentOutputs: AgentOutput[] | null;
  hypothesis: { dir: Direction; conf: number; rr: number } | null;
}

export function createActiveGame(params: CreateGameParams): ActiveGame {
  const now = Date.now();
  const battleMode = getBattleMode(params.timeframe);
  const durationMs = getTimeframeDurationMs(params.timeframe);

  return {
    matchId: params.matchId,
    pair: params.pair,
    timeframe: params.timeframe,
    battleMode,
    direction: params.direction,
    entryPrice: params.entryPrice,
    currentPrice: params.entryPrice,
    tp: params.tp,
    sl: params.sl,
    stakedLP: params.stakedLP,
    positionMultiplier: 1.0,
    flippedDirection: null,
    flippedEntry: null,
    checkpoints: [],
    resolution: null,
    exitPrice: null,
    startedAt: now,
    expiresAt: now + durationMs,
    selectedAgents: params.selectedAgents,
    agentOutputs: params.agentOutputs,
    hypothesis: params.hypothesis,
  };
}

// ─── TP/SL Check Logic ────────────────────────────────────

export interface TPSLResult {
  hit: boolean;
  resolution: BattleResolution | null;
  exitPrice: number | null;
}

/**
 * Check if a candle triggers TP or SL.
 * For same-candle double-hit, SL takes priority (worst case).
 */
export function checkTPSL(
  candle: { high: number; low: number; close: number },
  game: ActiveGame
): TPSLResult {
  const dir = game.flippedDirection ?? game.direction;
  const tp = game.tp;
  const sl = game.sl;

  const isLong = dir === 'LONG';

  // SL check first (worst case priority)
  const slHit = isLong ? candle.low <= sl : candle.high >= sl;
  if (slHit) {
    return { hit: true, resolution: 'SL_HIT', exitPrice: sl };
  }

  // TP check
  const tpHit = isLong ? candle.high >= tp : candle.low <= tp;
  if (tpHit) {
    return { hit: true, resolution: 'TP_HIT', exitPrice: tp };
  }

  return { hit: false, resolution: null, exitPrice: null };
}

/**
 * Check if the game has expired by time.
 */
export function checkTimeExpiry(game: ActiveGame): TPSLResult {
  if (Date.now() >= game.expiresAt) {
    return { hit: true, resolution: 'TIME_EXPIRY', exitPrice: game.currentPrice };
  }
  return { hit: false, resolution: null, exitPrice: null };
}

// ─── Decision Window Consequence Logic ─────────────────────

/**
 * Apply a Decision Window action to the active game.
 * Returns updated game + resolution if CUT terminates it.
 */
export function applyDWAction(
  game: ActiveGame,
  action: DecisionAction,
  currentPrice: number
): { game: ActiveGame; terminated: boolean; resolution: BattleResolution | null } {
  switch (action) {
    case 'HOLD':
      // No changes
      return { game, terminated: false, resolution: null };

    case 'CUT': {
      // Close position immediately at current price
      const updated: ActiveGame = {
        ...game,
        exitPrice: currentPrice,
        resolution: 'USER_CUT',
      };
      return { game: updated, terminated: true, resolution: 'USER_CUT' };
    }

    case 'ADD': {
      // Increase position multiplier by 1.5x
      const updated: ActiveGame = {
        ...game,
        positionMultiplier: game.positionMultiplier * ADD_MULTIPLIER,
      };
      return { game: updated, terminated: false, resolution: null };
    }

    case 'FLIP': {
      // Close current position and open opposite
      const newDir: Direction = (game.flippedDirection ?? game.direction) === 'LONG' ? 'SHORT' : 'LONG';
      const updated: ActiveGame = {
        ...game,
        flippedDirection: newDir,
        flippedEntry: currentPrice,
        positionMultiplier: 1.0, // Reset multiplier on flip
        // Recalculate TP/SL for the new direction
        // TP and SL swap (mirrored around current price)
        tp: computeFlippedLevel(currentPrice, game.tp, game.entryPrice, newDir),
        sl: computeFlippedLevel(currentPrice, game.sl, game.entryPrice, newDir),
      };
      return { game: updated, terminated: false, resolution: null };
    }

    default:
      return { game, terminated: false, resolution: null };
  }
}

/**
 * Compute new TP/SL after a FLIP.
 * Mirrors the same R:R distance from the new entry.
 */
function computeFlippedLevel(
  newEntry: number,
  oldLevel: number,
  oldEntry: number,
  _newDir: Direction
): number {
  const distance = Math.abs(oldLevel - oldEntry);
  // For the flipped direction, mirror the distance
  // If old was LONG entry=100 TP=105 → FLIP at 102 → new SHORT TP=97
  // If old was LONG entry=100 SL=98 → FLIP at 102 → new SHORT SL=104
  if (oldLevel > oldEntry) {
    // Was a TP for LONG or SL for SHORT → becomes opposite
    return newEntry - distance;
  }
  return newEntry + distance;
}

// ─── P&L Calculation ──────────────────────────────────────

/**
 * Calculate unrealized P&L percentage for the current position.
 */
export function calculatePnL(game: ActiveGame): number {
  const dir = game.flippedDirection ?? game.direction;
  const entry = game.flippedEntry ?? game.entryPrice;
  if (entry <= 0) return 0;

  const pnlPct = dir === 'LONG'
    ? ((game.currentPrice - entry) / entry) * 100
    : ((entry - game.currentPrice) / entry) * 100;

  return pnlPct * game.positionMultiplier;
}

/**
 * Calculate final P&L at exit.
 */
export function calculateFinalPnL(game: ActiveGame, exitPrice: number): number {
  const dir = game.flippedDirection ?? game.direction;
  const entry = game.flippedEntry ?? game.entryPrice;
  if (entry <= 0) return 0;

  const pnlPct = dir === 'LONG'
    ? ((exitPrice - entry) / entry) * 100
    : ((entry - exitPrice) / entry) * 100;

  return pnlPct * game.positionMultiplier;
}

// ─── Checkpoint Generation ────────────────────────────────

/**
 * Generate a checkpoint with template-based agent comments.
 * No LLM calls — uses deterministic templates based on P&L + direction.
 */
export function generateCheckpoint(
  game: ActiveGame,
  checkpointN: number
): Checkpoint {
  const pnl = calculatePnL(game);
  const dir = game.flippedDirection ?? game.direction;
  const agentComments = generateAgentComments(game.selectedAgents, pnl, dir, game);

  return {
    checkpointN,
    timestamp: Date.now(),
    price: game.currentPrice,
    unrealizedPnL: pnl,
    agentComments,
    dwAction: null,
    dwDeadline: Date.now() + DW_DEADLINE_MS,
    resolved: false,
  };
}

/**
 * Template-based agent comments — no LLM, deterministic.
 */
function generateAgentComments(
  agentIds: string[],
  pnl: number,
  dir: Direction,
  game: ActiveGame
): CheckpointAgentComment[] {
  const entry = game.flippedEntry ?? game.entryPrice;
  const slDist = entry > 0 ? Math.abs(game.sl - game.currentPrice) / entry * 100 : 999;
  const tpDist = entry > 0 ? Math.abs(game.tp - game.currentPrice) / entry * 100 : 999;

  return agentIds.slice(0, 3).map((agentId) => {
    const { comment, recommendation } = pickAgentComment(agentId, pnl, dir, slDist, tpDist);
    return { agentId, comment, recommendation };
  });
}

interface CommentTemplate {
  comment: string;
  recommendation: 'HOLD' | 'CUT' | 'ADD';
}

/**
 * Pick a comment template based on market conditions relative to the position.
 */
function pickAgentComment(
  agentId: string,
  pnl: number,
  dir: Direction,
  slDist: number,
  tpDist: number
): CommentTemplate {
  // Near SL (< 1% away)
  if (slDist < 1.0) {
    return COMMENT_TEMPLATES.nearSL[agentId] ?? COMMENT_TEMPLATES.nearSL._default;
  }

  // Near TP (< 1% away)
  if (tpDist < 1.0) {
    return COMMENT_TEMPLATES.nearTP[agentId] ?? COMMENT_TEMPLATES.nearTP._default;
  }

  // Strong profit (> 1.5%)
  if (pnl > 1.5) {
    return COMMENT_TEMPLATES.strongProfit[agentId] ?? COMMENT_TEMPLATES.strongProfit._default;
  }

  // Mild profit (0-1.5%)
  if (pnl > 0) {
    return COMMENT_TEMPLATES.mildProfit[agentId] ?? COMMENT_TEMPLATES.mildProfit._default;
  }

  // Mild loss (-1.5% to 0%)
  if (pnl > -1.5) {
    return COMMENT_TEMPLATES.mildLoss[agentId] ?? COMMENT_TEMPLATES.mildLoss._default;
  }

  // Heavy loss (< -1.5%)
  return COMMENT_TEMPLATES.heavyLoss[agentId] ?? COMMENT_TEMPLATES.heavyLoss._default;
}

type TemplateCategory = Record<string, CommentTemplate>;

const COMMENT_TEMPLATES: Record<string, TemplateCategory> = {
  nearSL: {
    STRUCTURE: { comment: '차트 구조 무너지고 있어. SL 3% 남았어. CUT 고려해.', recommendation: 'CUT' },
    VPA: { comment: '거래량 감소 + SL 근접. 위험 구간이야.', recommendation: 'CUT' },
    ICT: { comment: 'OB 이탈 확인. SL 근접 — 빠져야 해.', recommendation: 'CUT' },
    DERIV: { comment: '펀딩비 불리해. SL 가까워. CUT 추천.', recommendation: 'CUT' },
    FLOW: { comment: '온체인 유출 가속. SL 터질 수 있어.', recommendation: 'CUT' },
    SENTI: { comment: '공포 지수 급등. SL 근접. 조심해.', recommendation: 'CUT' },
    MACRO: { comment: '매크로 역풍. SL 근접 — 리스크 관리 우선.', recommendation: 'CUT' },
    VALUATION: { comment: '밸류에이션 이탈. SL 가까워.', recommendation: 'CUT' },
    _default: { comment: '위험! SL 3% 남았어. CUT 고려해.', recommendation: 'CUT' },
  },
  nearTP: {
    STRUCTURE: { comment: '거의 다 왔어! 차트 구조 유지 중. 조금만 더!', recommendation: 'HOLD' },
    VPA: { comment: 'TP 근접. 거래량 유지 중 — 좋은 신호야!', recommendation: 'HOLD' },
    ICT: { comment: 'TP 근처 유동성 풀 있어. 도달 가능!', recommendation: 'HOLD' },
    DERIV: { comment: 'OI 증가 + TP 근접. 유지 추천.', recommendation: 'HOLD' },
    FLOW: { comment: '고래 매수세 유지. TP 거의 도달!', recommendation: 'HOLD' },
    SENTI: { comment: '감성 긍정. TP 거의 왔어!', recommendation: 'HOLD' },
    MACRO: { comment: '매크로 순풍. TP 근접 — HOLD!', recommendation: 'HOLD' },
    VALUATION: { comment: '적정가 근접. TP 거의 왔어.', recommendation: 'HOLD' },
    _default: { comment: '거의 다 왔어! 조금만 더!', recommendation: 'HOLD' },
  },
  strongProfit: {
    STRUCTURE: { comment: '완벽한 구조! 예상대로 진행 중. HOLD 유지.', recommendation: 'HOLD' },
    VPA: { comment: '강한 거래량과 함께 수익 확대 중. 좋아!', recommendation: 'HOLD' },
    ICT: { comment: 'OB → BOS 확인. 추세 유지 중. ADD도 고려.', recommendation: 'ADD' },
    DERIV: { comment: '펀딩비 유리. 수익 확대 중.', recommendation: 'HOLD' },
    FLOW: { comment: '온체인 신호 일관적. 추가 매수(ADD) 가능.', recommendation: 'ADD' },
    SENTI: { comment: '시장 감성 우호적. 수익 유지!', recommendation: 'HOLD' },
    MACRO: { comment: '매크로 환경 유리. 포지션 유지 추천.', recommendation: 'HOLD' },
    VALUATION: { comment: '아직 저평가 구간. 더 갈 수 있어.', recommendation: 'ADD' },
    _default: { comment: '예상대로 진행 중. HOLD 추천.', recommendation: 'HOLD' },
  },
  mildProfit: {
    STRUCTURE: { comment: '소폭 수익 중. 구조 유지 확인. HOLD.', recommendation: 'HOLD' },
    VPA: { comment: '거래량 보통. 아직 방향성 유효.', recommendation: 'HOLD' },
    ICT: { comment: 'OB 지지 유지 중. 아직 괜찮아.', recommendation: 'HOLD' },
    DERIV: { comment: '파생시장 중립. 관망 중.', recommendation: 'HOLD' },
    FLOW: { comment: '온체인 흐름 평탄. 큰 변동 없음.', recommendation: 'HOLD' },
    SENTI: { comment: '감성 중립. 흐름 지켜보자.', recommendation: 'HOLD' },
    MACRO: { comment: '매크로 변수 없음. 유지.', recommendation: 'HOLD' },
    VALUATION: { comment: '적정가 범위 내. 유지 추천.', recommendation: 'HOLD' },
    _default: { comment: '소폭 수익 중. 유지 추천.', recommendation: 'HOLD' },
  },
  mildLoss: {
    STRUCTURE: { comment: '단기 조정이야. 구조는 아직 유지 중.', recommendation: 'HOLD' },
    VPA: { comment: '거래량 소강. 일시적 조정 가능성.', recommendation: 'HOLD' },
    ICT: { comment: 'OB 재테스트 중. 아직 유효해.', recommendation: 'HOLD' },
    DERIV: { comment: '일시적 역풍. 펀딩비 정상화 중.', recommendation: 'HOLD' },
    FLOW: { comment: '온체인 큰 변화 없음. 인내 필요.', recommendation: 'HOLD' },
    SENTI: { comment: '단기 공포. 보통 반등 구간이야.', recommendation: 'HOLD' },
    MACRO: { comment: '매크로 노이즈. 기본 방향 유지.', recommendation: 'HOLD' },
    VALUATION: { comment: '소폭 할인 구간. 추가 매수 가능.', recommendation: 'ADD' },
    _default: { comment: '단기 조정이야. 구조는 유지 중.', recommendation: 'HOLD' },
  },
  heavyLoss: {
    STRUCTURE: { comment: '차트 구조 훼손 심각. CUT 고려해야 해.', recommendation: 'CUT' },
    VPA: { comment: '매도 거래량 급증. 위험 신호야.', recommendation: 'CUT' },
    ICT: { comment: 'OB 완전 이탈. 구조 깨졌어. CUT 추천.', recommendation: 'CUT' },
    DERIV: { comment: '청산 물량 급증. 빠져나와야 해.', recommendation: 'CUT' },
    FLOW: { comment: '고래 대량 매도. FLIP 고려할 시점.', recommendation: 'CUT' },
    SENTI: { comment: '극도의 공포. 손절이 현명해.', recommendation: 'CUT' },
    MACRO: { comment: '매크로 악재 부각. 리스크 회피 우선.', recommendation: 'CUT' },
    VALUATION: { comment: '밸류에이션 지지선 이탈. 위험.', recommendation: 'CUT' },
    _default: { comment: '큰 손실 중. CUT 고려해.', recommendation: 'CUT' },
  },
};

// ─── DW Evaluation (Post-Battle) ──────────────────────────

/**
 * Evaluate the quality of a user's DW action after the battle ends.
 * Used for the DW component of FBS scoring.
 */
export function evaluateDWResult(
  action: DecisionAction,
  priceAtDW: number,
  exitPrice: number,
  direction: Direction
): DWResult {
  const isLong = direction === 'LONG';
  const priceMovedFavorably = isLong
    ? exitPrice > priceAtDW
    : exitPrice < priceAtDW;

  let wasCorrect: boolean | null = null;
  let pointsEarned = 0;

  switch (action) {
    case 'HOLD':
      // HOLD is correct if price kept moving favorably
      wasCorrect = priceMovedFavorably;
      pointsEarned = wasCorrect ? 20 : 5;
      break;

    case 'CUT':
      // CUT is correct if price reversed against us
      wasCorrect = !priceMovedFavorably;
      pointsEarned = wasCorrect ? 30 : 0;
      break;

    case 'ADD':
      // ADD is correct if price continued favorably
      wasCorrect = priceMovedFavorably;
      pointsEarned = wasCorrect ? 25 : 0;
      break;

    case 'FLIP':
      // FLIP is correct if the NEW direction was profitable
      // After flip, direction reversed, so "favorable" for flipped = !original favorable
      wasCorrect = !priceMovedFavorably;
      pointsEarned = wasCorrect ? 35 : 0;
      break;
  }

  return {
    windowN: 0, // Caller should set this
    action,
    priceAt: priceAtDW,
    wasCorrect,
    pointsEarned,
  };
}

/**
 * Calculate the DW score component (0-100) from all DW results in a match.
 */
export function calculateDWScore(results: DWResult[]): number {
  if (results.length === 0) return 50; // No DW → neutral score

  const maxPossible = results.reduce((sum, r) => {
    // Max points per action type
    switch (r.action) {
      case 'HOLD': return sum + 20;
      case 'CUT': return sum + 30;
      case 'ADD': return sum + 25;
      case 'FLIP': return sum + 35;
      default: return sum + 20;
    }
  }, 0);

  const earned = results.reduce((sum, r) => sum + r.pointsEarned, 0);
  return maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 50;
}

// ─── Sprint Battle Runner ─────────────────────────────────

/**
 * Start a SPRINT battle (1m-15m).
 * Subscribes to real-time klines and monitors TP/SL.
 * Returns a cleanup function.
 */
export function startSprintBattle(
  game: ActiveGame,
  callbacks: {
    onPriceUpdate: (game: ActiveGame, candle: BinanceKline) => void;
    onResolution: (game: ActiveGame, resolution: BattleResolution) => void;
  }
): { unsub: () => void; getGame: () => ActiveGame } {
  let currentGame = { ...game };
  let destroyed = false;

  const symbol = pairToSymbol(game.pair);

  const unsub = subscribeKlines(symbol, game.timeframe, (candle) => {
    if (destroyed) return;

    // Update current price
    currentGame = { ...currentGame, currentPrice: candle.close };

    // Check TP/SL
    const result = checkTPSL(candle, currentGame);
    if (result.hit && result.resolution && result.exitPrice != null) {
      destroyed = true;
      currentGame = {
        ...currentGame,
        resolution: result.resolution,
        exitPrice: result.exitPrice,
      };
      callbacks.onResolution(currentGame, result.resolution);
      return;
    }

    // Check time expiry
    const timeResult = checkTimeExpiry(currentGame);
    if (timeResult.hit) {
      destroyed = true;
      currentGame = {
        ...currentGame,
        resolution: 'TIME_EXPIRY',
        exitPrice: candle.close,
      };
      callbacks.onResolution(currentGame, 'TIME_EXPIRY');
      return;
    }

    callbacks.onPriceUpdate(currentGame, candle);
  });

  return {
    unsub: () => {
      destroyed = true;
      unsub();
    },
    getGame: () => currentGame,
  };
}

/**
 * Start a checkpoint-based battle (STANDARD/MARATHON: 1h+).
 * Uses periodic price polling + checkpoint generation.
 * Returns controls for DW actions and cleanup.
 */
export function startCheckpointBattle(
  game: ActiveGame,
  callbacks: {
    onPriceUpdate: (game: ActiveGame) => void;
    onCheckpoint: (game: ActiveGame, checkpoint: Checkpoint) => void;
    onResolution: (game: ActiveGame, resolution: BattleResolution) => void;
  }
): {
  unsub: () => void;
  getGame: () => ActiveGame;
  submitDW: (action: DecisionAction) => void;
} {
  let currentGame = { ...game };
  let destroyed = false;
  let checkpointCount = 0;

  const symbol = pairToSymbol(game.pair);
  const checkpointIntervalMs = getCheckpointIntervalMs(game.timeframe);

  // Subscribe to real-time klines for price monitoring
  const wsSub = subscribeKlines(symbol, game.timeframe, (candle) => {
    if (destroyed) return;
    currentGame = { ...currentGame, currentPrice: candle.close };

    // TP/SL check on every candle
    const result = checkTPSL(candle, currentGame);
    if (result.hit && result.resolution && result.exitPrice != null) {
      destroyed = true;
      currentGame = {
        ...currentGame,
        resolution: result.resolution,
        exitPrice: result.exitPrice,
      };
      if (cpTimer) clearInterval(cpTimer);
      callbacks.onResolution(currentGame, result.resolution);
      return;
    }

    // Time expiry check
    const timeResult = checkTimeExpiry(currentGame);
    if (timeResult.hit) {
      destroyed = true;
      currentGame = {
        ...currentGame,
        resolution: 'TIME_EXPIRY',
        exitPrice: candle.close,
      };
      if (cpTimer) clearInterval(cpTimer);
      callbacks.onResolution(currentGame, 'TIME_EXPIRY');
      return;
    }

    callbacks.onPriceUpdate(currentGame);
  });

  // Checkpoint timer
  const cpTimer = checkpointIntervalMs > 0
    ? setInterval(() => {
        if (destroyed) return;
        checkpointCount++;
        const cp = generateCheckpoint(currentGame, checkpointCount);
        currentGame = {
          ...currentGame,
          checkpoints: [...currentGame.checkpoints, cp],
        };
        callbacks.onCheckpoint(currentGame, cp);

        // Auto-resolve unresolved checkpoints after deadline
        setTimeout(() => {
          if (destroyed) return;
          const lastCp = currentGame.checkpoints[currentGame.checkpoints.length - 1];
          if (lastCp && !lastCp.resolved) {
            // Auto-HOLD if user didn't respond
            const resolved: Checkpoint = { ...lastCp, dwAction: AUTO_HOLD_ACTION, resolved: true };
            currentGame = {
              ...currentGame,
              checkpoints: currentGame.checkpoints.map(c =>
                c.checkpointN === resolved.checkpointN ? resolved : c
              ),
            };
          }
        }, DW_DEADLINE_MS);
      }, checkpointIntervalMs)
    : null;

  // DW submission handler
  function submitDW(action: DecisionAction) {
    if (destroyed) return;

    // Find the latest unresolved checkpoint
    const unresolvedIdx = currentGame.checkpoints.findIndex(c => !c.resolved);
    if (unresolvedIdx === -1) return;

    const cp = currentGame.checkpoints[unresolvedIdx];
    const resolvedCp: Checkpoint = { ...cp, dwAction: action, resolved: true };

    // Apply DW action to game
    const { game: updatedGame, terminated, resolution } = applyDWAction(
      currentGame,
      action,
      currentGame.currentPrice
    );

    currentGame = {
      ...updatedGame,
      checkpoints: currentGame.checkpoints.map(c =>
        c.checkpointN === resolvedCp.checkpointN ? resolvedCp : c
      ),
    };

    if (terminated && resolution) {
      destroyed = true;
      wsSub();
      if (cpTimer) clearInterval(cpTimer);
      callbacks.onResolution(currentGame, resolution);
    }
  }

  return {
    unsub: () => {
      destroyed = true;
      wsSub();
      if (cpTimer) clearInterval(cpTimer);
    },
    getGame: () => currentGame,
    submitDW,
  };
}

// ─── Unified Battle Starter ───────────────────────────────

export type BattleControls = {
  unsub: () => void;
  getGame: () => ActiveGame;
  submitDW?: (action: DecisionAction) => void;
};

/**
 * Start a battle with the appropriate engine based on timeframe.
 * SPRINT → real-time candle monitoring, immediate resolution.
 * STANDARD/MARATHON → checkpoint-based with DW interactions.
 */
export function startBattle(
  game: ActiveGame,
  callbacks: {
    onPriceUpdate: (game: ActiveGame, candle?: BinanceKline) => void;
    onCheckpoint?: (game: ActiveGame, checkpoint: Checkpoint) => void;
    onResolution: (game: ActiveGame, resolution: BattleResolution) => void;
  }
): BattleControls {
  if (game.battleMode === 'SPRINT') {
    const sprint = startSprintBattle(game, {
      onPriceUpdate: (g, candle) => callbacks.onPriceUpdate(g, candle),
      onResolution: callbacks.onResolution,
    });
    return {
      unsub: sprint.unsub,
      getGame: sprint.getGame,
    };
  }

  // STANDARD or MARATHON
  const checkpoint = startCheckpointBattle(game, {
    onPriceUpdate: (g) => callbacks.onPriceUpdate(g),
    onCheckpoint: (g, cp) => callbacks.onCheckpoint?.(g, cp),
    onResolution: callbacks.onResolution,
  });

  return {
    unsub: checkpoint.unsub,
    getGame: checkpoint.getGame,
    submitDW: checkpoint.submitDW,
  };
}

// ─── Utility: Get current live price for a pair ──────────

/**
 * Get the current live price for a pair from the priceStore.
 * Falls back to Binance REST API if not available.
 */
export async function getCurrentPrice(pair: string): Promise<number> {
  // Try priceStore first (instant, from WebSocket)
  const base = pair.split('/')[0];
  const storePrice = getPrice(base);
  if (storePrice > 0) return storePrice;

  // Fallback to REST
  const symbol = pairToSymbol(pair);
  return fetchPrice(symbol);
}

// ─── Concurrent Game Limit Check ──────────────────────────

export function canStartNewGame(currentActiveCount: number): boolean {
  return currentActiveCount < MAX_CONCURRENT_GAMES;
}

export { MAX_CONCURRENT_GAMES, DW_DEADLINE_MS };
