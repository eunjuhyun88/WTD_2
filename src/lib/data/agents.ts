// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Agent Bridge (v3 AGENT_POOL → AgentDef[])
// ═══════════════════════════════════════════════════════════════
//
// S-01: data/agents.ts를 AGENT_POOL 기반 브릿지로 교체.
// AgentDef interface + AGDEFS export 유지 → 16개 소비 파일 import 경로 불변.
// guardian/commander/scanner 제거, VPA/ICT/VALUATION/MACRO 자동 추가.

import { AGENT_POOL, getAllAgents } from '$lib/engine/agents';
import type { AgentDefinition } from '$lib/engine/types';

// ─── Legacy AgentDef interface (UI 소비용 — 하위호환) ─────────
export interface AgentDef {
  id: string;
  name: string;
  nameKR: string;
  icon: string;
  color: string;
  role: string;
  source: string;
  dir: 'LONG' | 'SHORT' | 'NEUTRAL';
  conf: number;
  abilities: { analysis: number; accuracy: number; speed: number; instinct: number };
  specialty: string[];
  finding: { title: string; detail: string };
  speech: { scout: string; vote: string; win: string; lose: string };
  img: { def: string; alt: string; win: string };
  characterSet: [string, string, string];
  characters: string[];
}

// ─── UI-only metadata per agent (v3에 없는 레거시 필드) ───────
const UI_META: Record<string, Omit<AgentDef, 'id' | 'name' | 'nameKR' | 'icon' | 'color' | 'role'>> = {
  STRUCTURE: {
    source: 'binance', dir: 'LONG', conf: 82,
    abilities: { analysis: 82, accuracy: 71, speed: 65, instinct: 55 },
    specialty: ['OHLCV candle structure', 'ICT OB/FVG detection', 'BOS/CHoCH pivot points'],
    finding: { title: '4H CHoCH Uptrend', detail: 'OB $95,400 reaction with BOS confirmation' },
    speech: { scout: 'such chart. wow candle', vote: 'very LONG. much structure', win: 'WOW TP HIT!!', lose: 'such sad. no structure' },
    img: { def: '/doge/char-structure.png', alt: '/doge/state-retro.png', win: '/doge/state-win-arrow.png' },
    characterSet: ['/doge/char-structure.png', '/doge/state-retro.png', '/doge/state-win-arrow.png'],
    characters: ['/doge/char-structure.png', '/doge/state-retro.png', '/doge/state-win-arrow.png', '/doge/state-bull-phone.png'],
  },
  VPA: {
    source: 'binance', dir: 'LONG', conf: 74,
    abilities: { analysis: 78, accuracy: 72, speed: 68, instinct: 60 },
    specialty: ['CVD trend analysis', 'Volume profile POC', 'Absorption & climax detection'],
    finding: { title: 'CVD Bullish Divergence', detail: 'Strong buying absorption at POC with climax signal' },
    speech: { scout: 'such volume. wow delta', vote: 'LONG. volume confirms', win: 'volume never lies!!', lose: 'volume faked us out...' },
    img: { def: '/doge/char-structure.png', alt: '/doge/state-neutral.png', win: '/doge/state-win-arrow.png' },
    characterSet: ['/doge/char-structure.png', '/doge/state-neutral.png', '/doge/state-win-arrow.png'],
    characters: ['/doge/char-structure.png', '/doge/state-neutral.png', '/doge/state-win-arrow.png', '/doge/state-excited.png'],
  },
  ICT: {
    source: 'binance', dir: 'LONG', conf: 76,
    abilities: { analysis: 80, accuracy: 75, speed: 62, instinct: 72 },
    specialty: ['Liquidity pool targeting', 'FVG identification', 'Order block reactions'],
    finding: { title: 'Bullish OB + FVG Confluence', detail: 'Discount zone entry with displacement confirmation' },
    speech: { scout: 'hunting liquidity. much smart', vote: 'LONG. smart money says so', win: 'smart money always wins!!', lose: 'liquidity swept us...' },
    img: { def: '/doge/char-commander.png', alt: '/doge/state-alliance.png', win: '/doge/state-win-pixel.png' },
    characterSet: ['/doge/char-commander.png', '/doge/state-alliance.png', '/doge/state-win-pixel.png'],
    characters: ['/doge/char-commander.png', '/doge/state-alliance.png', '/doge/state-win-pixel.png', '/doge/state-win-flex.png'],
  },
  DERIV: {
    source: 'coinglass', dir: 'LONG', conf: 75,
    abilities: { analysis: 76, accuracy: 74, speed: 70, instinct: 62 },
    specialty: ['FR/OI real-time analysis', 'Liquidation heatmap detection', 'Squeeze signal detection'],
    finding: { title: 'OI +4.2% Buy Bias', detail: 'FR normal with liquidation wall at $96k' },
    speech: { scout: 'wow. much open interest', vote: 'LONG. derivatives say so', win: 'derivatives always right!!', lose: 'even derivatives wrong sometimes...' },
    img: { def: '/doge/char-deriv.png', alt: '/doge/state-bear-down.png', win: '/doge/state-win-grin.png' },
    characterSet: ['/doge/char-deriv.png', '/doge/state-bear-down.png', '/doge/state-win-grin.png'],
    characters: ['/doge/char-deriv.png', '/doge/state-bear-down.png', '/doge/state-win-grin.png', '/doge/state-bull-phone.png'],
  },
  VALUATION: {
    source: 'glassnode', dir: 'LONG', conf: 70,
    abilities: { analysis: 74, accuracy: 80, speed: 45, instinct: 68 },
    specialty: ['MVRV zone analysis', 'NUPL trend tracking', 'Cycle position estimation'],
    finding: { title: 'MVRV Mid-Range · Healthy', detail: 'NUPL rising with supply in profit stable' },
    speech: { scout: 'checking on-chain value...', vote: 'LONG. undervalued still', win: 'value investing works!!', lose: 'overvalued after all...' },
    img: { def: '/doge/char-guardian.png', alt: '/doge/state-lose-sweat.png', win: '/doge/state-thumbsup.png' },
    characterSet: ['/doge/char-guardian.png', '/doge/state-lose-sweat.png', '/doge/state-thumbsup.png'],
    characters: ['/doge/char-guardian.png', '/doge/state-lose-sweat.png', '/doge/state-thumbsup.png', '/doge/state-bear-down.png'],
  },
  FLOW: {
    source: 'onchain', dir: 'LONG', conf: 71,
    abilities: { analysis: 70, accuracy: 78, speed: 60, instinct: 68 },
    specialty: ['Exchange net flows', 'Whale wallet monitoring', 'ETF flow tracking'],
    finding: { title: '$128M Net Outflow Accumulation', detail: 'Cold wallet transfers with smart money' },
    speech: { scout: 'much money flow. wow whale', vote: 'LONG! such confident', win: 'many profit!! wow', lose: 'where money go...' },
    img: { def: '/doge/char-flow.png', alt: '/doge/state-neutral.png', win: '/doge/state-win-flex.png' },
    characterSet: ['/doge/char-flow.png', '/doge/state-neutral.png', '/doge/state-win-flex.png'],
    characters: ['/doge/char-flow.png', '/doge/state-neutral.png', '/doge/state-win-flex.png', '/doge/state-thumbsup.png'],
  },
  SENTI: {
    source: 'social', dir: 'LONG', conf: 68,
    abilities: { analysis: 65, accuracy: 62, speed: 80, instinct: 75 },
    specialty: ['KOL sentiment tracking', 'Social mention analysis', 'Fear & Greed interpretation'],
    finding: { title: 'KOL 72% Bullish Bias', detail: 'F&G 74 Greed with social volume up' },
    speech: { scout: 'much sentiment. very social', vote: 'LONG wow. such bullish', win: 'very profit!!', lose: 'such bearish. wow pain' },
    img: { def: '/doge/char-senti.png', alt: '/doge/state-lose-cry.png', win: '/doge/state-alert.png' },
    characterSet: ['/doge/char-senti.png', '/doge/state-lose-cry.png', '/doge/state-alert.png'],
    characters: ['/doge/char-senti.png', '/doge/state-lose-cry.png', '/doge/state-alert.png', '/doge/state-excited.png'],
  },
  MACRO: {
    source: 'tradingview', dir: 'LONG', conf: 72,
    abilities: { analysis: 72, accuracy: 70, speed: 50, instinct: 78 },
    specialty: ['DXY correlation analysis', 'Equity market correlation', 'FOMC/CPI event impact'],
    finding: { title: 'DXY Weakening · Risk-On', detail: 'Equity rally + yield drop favoring BTC' },
    speech: { scout: 'scanning macro landscape...', vote: 'LONG. macro aligns', win: 'macro called it!!', lose: 'macro shift caught us...' },
    img: { def: '/doge/char-scanner.png', alt: '/doge/state-neutral.png', win: '/doge/state-excited.png' },
    characterSet: ['/doge/char-scanner.png', '/doge/state-neutral.png', '/doge/state-excited.png'],
    characters: ['/doge/char-scanner.png', '/doge/state-neutral.png', '/doge/state-excited.png', '/doge/state-retro.png'],
  },
};

// ─── Bridge: AgentDefinition → AgentDef ──────────────────────
function toBridged(def: AgentDefinition): AgentDef {
  const meta = UI_META[def.id];
  if (!meta) throw new Error(`[agent-bridge] UI_META missing for ${def.id}`);
  return {
    id: def.id.toLowerCase(),
    name: def.name,
    nameKR: def.nameKR,
    icon: def.icon,
    color: def.color,
    role: def.description.split(' — ')[0] || def.role,
    ...meta,
  };
}

// ─── AGDEFS: 8 agents derived from AGENT_POOL ───────────────
export const AGDEFS: AgentDef[] = getAllAgents().map(toBridged);

// ═══ Character art sheets for decorative use ═══
export const CHARACTER_ART = {
  rpgLabeled: '/characters/rpg-agents-labeled.jpg',
  rpgAction: '/characters/rpg-agents-action.jpg',
  rpgFantasy: '/characters/rpg-agents-fantasy.jpg',
  rpgCover: '/characters/rpg-agents-cover.jpg',
  badgesDetailed: '/characters/badges-detailed.jpg',
  badgesTiers: '/characters/badges-tiers.jpg',
  gamingActions: '/characters/gaming-actions.jpg',
  gamingIcons: '/characters/gaming-icons.jpg',
  tradingStates: '/characters/trading-states.jpg',
  tradingScenes: '/characters/trading-scenes.jpg',
  expressionsCloseup: '/characters/expressions-closeup.jpg',
  expressionsAlt: '/characters/expressions-alt.jpg',
  cartoonBattle: '/characters/cartoon-battle.jpg',
  cartoonExpressive: '/characters/cartoon-expressive.jpg',
  animatedSet: '/characters/animated-set.jpg',
  stickerPack: '/characters/sticker-pack.jpg',
  stylizedMemes: '/characters/stylized-memes.jpg',
  minimalIcons: '/characters/minimal-icons.jpg',
  minimalistIcons: '/characters/minimalist-icons.jpg',
  tradeBull: '/doge/trade-bull.png',
  tradeBear: '/doge/trade-bear.png',
  tradePump: '/doge/trade-pump.png',
  tradeSurge: '/doge/trade-surge.png',
  tradeActions: '/doge/trade-actions.png',
  tradeSheet: '/doge/trade-sheet.png',
  tradeWhale: '/doge/trade-whale.png',
  tradeShield: '/doge/trade-shield.png',
  spriteActions: '/doge/sprite-actions.png',
  spriteEmojis: '/doge/sprite-emojis.png',
  actionVictory: '/doge/action-victory.png',
  actionCharge: '/doge/action-charge.png',
  actionPortal: '/doge/action-portal.png',
  actionCelebrate: '/doge/action-celebrate.png',
  badgeVerified: '/doge/badge-verified.png',
  badgeShield: '/doge/badge-shield.png',
  badgeRocket: '/doge/badge-rocket.png',
  badgeDiamond: '/doge/badge-diamond.png',
  memeBuff: '/doge/meme-buff.png',
  memeBodybuilder: '/doge/meme-bodybuilder.png',
  memeMoney: '/doge/meme-money.png',
  memeGreedy: '/doge/meme-greedy.png',
} as const;

// ─── SOURCES (data feed 표시용 — 변경 없음) ──────────────────
export const SOURCES = [
  { id: 'binance', icon: '📊', label: 'BINANCE', color: '#f0b90b', x: 0.08, y: 0.18, data: ['4H OHLCV', '거래량 $2.8B', '체결강도 62%'], tags: ['RSI 58', 'MACD↑', 'EMA200 ✓'] },
  { id: 'onchain', icon: '⛓', label: 'ON-CHAIN', color: '#00e68a', x: 0.92, y: 0.18, data: ['Net Flow -$128M', 'Whale 3건', 'Smart Money'], tags: ['Outflow↑', 'Whale Buy'] },
  { id: 'coinglass', icon: '🔮', label: 'COINGLASS', color: '#ff8c3b', x: 0.50, y: 0.08, data: ['OI +4.2%', 'FR 0.082%', 'Liq $96k'], tags: ['OI Buy', 'FR High'] },
  { id: 'social', icon: '💬', label: 'SOCIAL/X', color: '#8b5cf6', x: 0.08, y: 0.78, data: ['KOL 72% Bull', 'Volume ↑42%', 'F&G 74'], tags: ['Bullish', 'Greed'] },
  { id: 'glassnode', icon: '💎', label: 'GLASSNODE', color: '#a78bfa', x: 0.92, y: 0.78, data: ['MVRV 1.8', 'NUPL 0.52', 'SOPR 1.02'], tags: ['Healthy', 'Mid-Cycle'] },
  { id: 'tradingview', icon: '🌍', label: 'MACRO/TV', color: '#f43f5e', x: 0.50, y: 0.88, data: ['DXY 103.2', 'SPX +0.8%', 'US10Y 4.2%'], tags: ['Risk-On', 'DXY Down'] },
];
