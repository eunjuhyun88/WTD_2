/**
 * Cogochi ChartGame Engine
 * ChartGame.com 스타일: 캔들 한 봉씩 공개, Long/Short 진입, PnL 추적.
 * + AI 시그널 오버레이.
 */

import type { BinanceKline } from '$lib/engine/types';
import type { SignalSnapshot, CogDecision, Doctrine } from './cogochiTypes';
import { DEFAULT_DOCTRINE } from './cogochiTypes';
import { makeDecision } from './cogochiDoctrine';

// ─── Game State ───

export type GamePhase = 'loading' | 'playing' | 'ended';

export interface GamePosition {
	dir: 'LONG' | 'SHORT';
	entry: number;
	shares: number;
	openedAtBar: number;
}

export interface GameTrade {
	dir: 'LONG' | 'SHORT';
	entry: number;
	exit: number;
	shares: number;
	pnl: number;
	pnlPct: number;
	openedAtBar: number;
	closedAtBar: number;
	aiSuggested: CogDecision | null;
	agreedWithAI: boolean | null;
}

export interface GameAction {
	barIndex: number;
	type: 'LONG' | 'SHORT' | 'CLOSE' | 'SKIP';
	price: number;
	aiSuggestion: CogDecision | null;
}

export interface GameState {
	phase: GamePhase;
	symbol: string;
	interval: string;
	allCandles: BinanceKline[];
	visibleCount: number;
	initialVisible: number;
	totalBars: number;

	cash: number;
	position: GamePosition | null;
	trades: GameTrade[];
	actions: GameAction[];

	aiDecision: CogDecision | null;
	doctrine: Doctrine;

	startDate: string;
	endDate: string;
}

// ─── Constants ───

const INITIAL_CASH = 100_000;
const INITIAL_VISIBLE = 50;
const TOTAL_BARS = 100;

// ─── Create Game ───

export function createGame(
	candles: BinanceKline[],
	symbol: string,
	interval: string,
	doctrine: Doctrine = DEFAULT_DOCTRINE,
): GameState {
	const limited = candles.slice(0, TOTAL_BARS);
	return {
		phase: 'playing',
		symbol,
		interval,
		allCandles: limited,
		visibleCount: Math.min(INITIAL_VISIBLE, limited.length),
		initialVisible: INITIAL_VISIBLE,
		totalBars: limited.length,
		cash: INITIAL_CASH,
		position: null,
		trades: [],
		actions: [],
		aiDecision: null,
		doctrine,
		startDate: formatDate(limited[0]?.time ?? 0),
		endDate: formatDate(limited[limited.length - 1]?.time ?? 0),
	};
}

// ─── Next Bar ───

export function nextBar(state: GameState): GameState {
	if (state.phase !== 'playing') return state;
	if (state.visibleCount >= state.totalBars) {
		return endGame(state);
	}

	const newVisible = state.visibleCount + 1;

	// 기록: SKIP
	const price = state.allCandles[newVisible - 1].close;
	const actions = [...state.actions, {
		barIndex: newVisible - 1,
		type: 'SKIP' as const,
		price,
		aiSuggestion: state.aiDecision,
	}];

	// AI 시그널 갱신
	const aiDecision = computeAIDecision(state.allCandles, newVisible, state.doctrine);

	return { ...state, visibleCount: newVisible, actions, aiDecision };
}

// ─── Open Position ───

export function openPosition(state: GameState, dir: 'LONG' | 'SHORT'): GameState {
	if (state.phase !== 'playing' || state.position) return state;

	const currentBar = state.allCandles[state.visibleCount - 1];
	const price = currentBar.close;
	const shares = Math.floor(state.cash / price);

	if (shares <= 0) return state;

	const position: GamePosition = {
		dir,
		entry: price,
		shares,
		openedAtBar: state.visibleCount - 1,
	};

	const agreedWithAI = state.aiDecision
		? state.aiDecision.action === dir
		: null;

	const actions = [...state.actions, {
		barIndex: state.visibleCount - 1,
		type: dir,
		price,
		aiSuggestion: state.aiDecision,
	}];

	return { ...state, position, actions };
}

// ─── Close Position ───

export function closePosition(state: GameState): GameState {
	if (!state.position) return state;

	const currentBar = state.allCandles[state.visibleCount - 1];
	const exitPrice = currentBar.close;
	const { dir, entry, shares, openedAtBar } = state.position;

	const pnl = dir === 'LONG'
		? (exitPrice - entry) * shares
		: (entry - exitPrice) * shares;
	const pnlPct = dir === 'LONG'
		? (exitPrice - entry) / entry
		: (entry - exitPrice) / entry;

	// agreedWithAI 판단: 진입 시점의 AI 추천과 비교
	const entryAction = state.actions.find(
		a => a.barIndex === openedAtBar && (a.type === 'LONG' || a.type === 'SHORT'),
	);
	const agreedWithAI = entryAction?.aiSuggestion
		? entryAction.aiSuggestion.action === dir
		: null;

	const trade: GameTrade = {
		dir,
		entry,
		exit: exitPrice,
		shares,
		pnl: Math.round(pnl * 100) / 100,
		pnlPct: Math.round(pnlPct * 10000) / 10000,
		openedAtBar,
		closedAtBar: state.visibleCount - 1,
		aiSuggested: entryAction?.aiSuggestion ?? null,
		agreedWithAI,
	};

	const actions = [...state.actions, {
		barIndex: state.visibleCount - 1,
		type: 'CLOSE' as const,
		price: exitPrice,
		aiSuggestion: state.aiDecision,
	}];

	return {
		...state,
		position: null,
		trades: [...state.trades, trade],
		cash: state.cash + pnl,
		actions,
	};
}

// ─── End Game ───

export function endGame(state: GameState): GameState {
	let finalState = state;
	if (finalState.position) {
		finalState = closePosition(finalState);
	}
	return { ...finalState, phase: 'ended' };
}

// ─── Unrealized P/L ───

export function getUnrealizedPnl(state: GameState): { pnl: number; pnlPct: number } | null {
	if (!state.position) return null;
	const currentPrice = state.allCandles[state.visibleCount - 1]?.close ?? 0;
	const { dir, entry, shares } = state.position;
	const pnl = dir === 'LONG'
		? (currentPrice - entry) * shares
		: (entry - currentPrice) * shares;
	const pnlPct = dir === 'LONG'
		? (currentPrice - entry) / entry
		: (entry - currentPrice) / entry;
	return { pnl: Math.round(pnl * 100) / 100, pnlPct };
}

// ─── Visible Candles ───

export function getVisibleCandles(state: GameState): BinanceKline[] {
	return state.allCandles.slice(0, state.visibleCount);
}

export function getCurrentPrice(state: GameState): number {
	return state.allCandles[state.visibleCount - 1]?.close ?? 0;
}

export function getBarsRemaining(state: GameState): number {
	return state.totalBars - state.visibleCount;
}

// ─── Game Stats ───

export function getGameStats(state: GameState) {
	const wins = state.trades.filter(t => t.pnl > 0).length;
	const losses = state.trades.filter(t => t.pnl < 0).length;
	const totalPnl = state.trades.reduce((s, t) => s + t.pnl, 0);

	const aiAgreedTrades = state.trades.filter(t => t.agreedWithAI === true);
	const aiDisagreedTrades = state.trades.filter(t => t.agreedWithAI === false);

	const aiAgreedWins = aiAgreedTrades.filter(t => t.pnl > 0).length;
	const aiDisagreedWins = aiDisagreedTrades.filter(t => t.pnl > 0).length;

	return {
		totalTrades: state.trades.length,
		wins,
		losses,
		winRate: state.trades.length > 0 ? wins / state.trades.length : 0,
		totalPnl: Math.round(totalPnl * 100) / 100,
		cashFinal: Math.round(state.cash * 100) / 100,
		returnPct: (state.cash - INITIAL_CASH) / INITIAL_CASH,
		aiAgreedWinRate: aiAgreedTrades.length > 0 ? aiAgreedWins / aiAgreedTrades.length : null,
		aiDisagreedWinRate: aiDisagreedTrades.length > 0 ? aiDisagreedWins / aiDisagreedTrades.length : null,
		aiAgreedCount: aiAgreedTrades.length,
		aiDisagreedCount: aiDisagreedTrades.length,
	};
}

// ─── AI Decision (simplified — rule-based, no Ollama needed) ───

function computeAIDecision(
	candles: BinanceKline[],
	visibleCount: number,
	doctrine: Doctrine,
): CogDecision | null {
	if (visibleCount < 15) return null;

	const visible = candles.slice(0, visibleCount);
	const snapshot = buildSimpleSnapshot(visible);
	const decision = makeDecision(snapshot, doctrine);

	return decision.action === 'FLAT' ? null : decision;
}

function buildSimpleSnapshot(candles: BinanceKline[]): SignalSnapshot {
	const recent = candles.slice(-14);
	const current = candles[candles.length - 1];
	const prev = candles[candles.length - 2];

	// Simple ATR
	let atrSum = 0;
	for (let i = 1; i < recent.length; i++) {
		const tr = Math.max(
			recent[i].high - recent[i].low,
			Math.abs(recent[i].high - recent[i - 1].close),
			Math.abs(recent[i].low - recent[i - 1].close),
		);
		atrSum += tr;
	}
	const atr = atrSum / (recent.length - 1);
	const atrPct = (atr / current.close) * 100;

	// Simple CVD proxy (volume direction)
	const buyVol = recent.filter(c => c.close > c.open).reduce((s, c) => s + c.volume, 0);
	const sellVol = recent.filter(c => c.close <= c.open).reduce((s, c) => s + c.volume, 0);
	const cvdValue = buyVol - sellVol;

	// Price trend (HTF proxy)
	const ma20 = candles.slice(-20).reduce((s, c) => s + c.close, 0) / 20;
	const htfStructure: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
		current.close > ma20 * 1.005 ? 'BULLISH' :
		current.close < ma20 * 0.995 ? 'BEARISH' : 'NEUTRAL';

	// CVD state
	const priceTrend = current.close > prev.close ? 'up' : 'down';
	const volTrend = cvdValue > 0 ? 'up' : 'down';
	let cvdState: SignalSnapshot['cvdState'] = 'NEUTRAL';
	if (priceTrend === 'up' && volTrend === 'down') cvdState = 'BEARISH_DIVERGENCE';
	if (priceTrend === 'down' && volTrend === 'up') cvdState = 'BULLISH_DIVERGENCE';
	if (priceTrend === 'up' && volTrend === 'up') cvdState = 'BULLISH';
	if (priceTrend === 'down' && volTrend === 'down') cvdState = 'BEARISH';

	// Composite score
	const compositeScore = Math.min(1.0, Math.abs(cvdValue) / (buyVol + sellVol + 1) + (atrPct > 2 ? 0.3 : 0));

	return {
		primaryZone: atrPct > 4 ? 'VOLATILE' : compositeScore > 0.6 ? 'TRENDING' : 'RANGING',
		modifiers: [],
		cvdState,
		cvdValue,
		oiChange1h: 0,
		fundingRate: 0,
		fundingLabel: 'NEUTRAL',
		htfStructure,
		atrPct: Math.round(atrPct * 10) / 10,
		vwapDistance: 0,
		compositeScore: Math.round(compositeScore * 100) / 100,
		regime: atrPct > 4 ? 'VOLATILE' : compositeScore > 0.5 ? 'TRENDING' : 'RANGING',
		currentPrice: current.close,
		timestamp: current.time,
	};
}

// ─── Helpers ───

function formatDate(timestampSec: number): string {
	if (!timestampSec) return '???';
	return new Date(timestampSec * 1000).toLocaleDateString('en-US', {
		year: 'numeric', month: 'short', day: 'numeric',
	});
}
