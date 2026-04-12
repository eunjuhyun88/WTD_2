// ═══════════════════════════════════════════════════════════════
//  STOCKCLAW — Home Page Static Data & Tracking Helpers
//  Extracted from +page.svelte for maintainability
// ═══════════════════════════════════════════════════════════════

// ─── GTM / Funnel Tracking ───────────────────────────────────

export type HomeFunnelStep = 'hero_view' | 'hero_feature_select' | 'hero_cta_click';
export type HomeFunnelStatus = 'view' | 'click';

interface GTMWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

/** Push a custom event to the GTM dataLayer */
export function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const w = window as GTMWindow;
  if (!Array.isArray(w.dataLayer)) return;
  w.dataLayer.push({
    event,
    area: 'home',
    ...payload,
  });
}

/** Track a home page funnel step via GTM */
export function trackHomeFunnel(
  step: HomeFunnelStep,
  status: HomeFunnelStatus,
  payload: Record<string, unknown> = {}
) {
  gtmEvent('home_funnel', {
    step,
    status,
    ...payload,
  });
}

// ─── Feature Cards ───────────────────────────────────────────

export interface FeatureItem {
  label: string;
  sub: string;
  brief: string;
  img: string;
  path: string;
  detail: string;
  stats: { k: string; v: string }[];
}

export const FEATURES: FeatureItem[] = [
  { label: 'TERMINAL', sub: 'WAR ROOM', brief: 'ORPO READS THE CHART. CONTEXT AGENTS WATCH BEYOND IT.', img: '/blockparty/f5-doge-chart.png', path: '/terminal',
    detail: 'ORPO PROCESSES 90 INDICATORS PER PAIR. DERIV, FLOW, MACRO & SENTI FEED REAL-TIME CONTEXT. COMMANDER RESOLVES ALL CONFLICTS INTO ONE ENTRY SCORE.',
    stats: [{ k: 'INDICATORS', v: '90' }, { k: 'CONTEXT AGENTS', v: '4' }, { k: 'ENTRY SCORE', v: 'LIVE' }] },
  { label: 'ARENA', sub: 'AI VS YOU', brief: 'YOUR CALL FIRST. THEN ORPO CHALLENGES EVERY ANGLE.', img: '/blockparty/f5-doge-muscle.png', path: '/arena',
    detail: '5-PHASE STRESS TEST: SKILL SELECT → DRAFT → HYPOTHESIS → BATTLE → PASSPORT RECORD. INDEPENDENT JUDGMENT WINS.',
    stats: [{ k: 'PHASES', v: '5' }, { k: 'SKILLS', v: '6' }, { k: 'REWARDS', v: 'XP+RANK' }] },
  { label: 'SCANNER', sub: 'ANOMALY DETECTION', brief: '28 PATTERNS DETECT WHAT HUMANS MISS. REAL-TIME PUSH.', img: '/blockparty/f5-doge-fire.png', path: '/signals',
    detail: 'FR EXTREMES, WHALE $50M+ DEPOSITS, DXY SPIKES, LIQUIDATION CLUSTERS — 4 CONTEXT AGENTS CONVERGE INTO ACTIONABLE SIGNALS.',
    stats: [{ k: 'PATTERNS', v: '28' }, { k: 'CYCLE', v: '15 MIN' }, { k: 'ALERTS', v: 'PUSH' }] },
  { label: 'PASSPORT', sub: 'SKILL = DATA', brief: 'YOUR TRACK RECORD. IMMUTABLE. ON-CHAIN PROOF.', img: '/blockparty/f5-doge-excited.png', path: '/passport',
    detail: 'WIN RATE · LP SCORE · TIER · BEST SKILL · IDS (INDEPENDENT DECISION SCORE) — EVERY ARENA BATTLE BUILDS YOUR PASSPORT.',
    stats: [{ k: 'METRICS', v: '5+' }, { k: 'HISTORY', v: 'ALL' }, { k: 'PROOF', v: 'ON-CHAIN' }] },
  { label: 'ORACLE', sub: 'META INTELLIGENCE', brief: 'WHICH COMBOS ACTUALLY HIT? THE LEADERBOARD REVEALS ALL.', img: '/blockparty/f5-doge-bull.png', path: '/oracle',
    detail: 'ORPO SKILL × CONTEXT SPEC ACCURACY LEADERBOARD. SEE WHAT STRATEGIES TOP TRADERS USE AND WHERE ALPHA LIVES.',
    stats: [{ k: 'SKILLS', v: '6' }, { k: 'SPECS', v: '4' }, { k: 'RANKING', v: 'LIVE' }] },
];

// ─── Scanner Categories ──────────────────────────────────────

export interface ScanCategory {
  id: string;
  icon: string;
  label: string;
  desc: string;
  count: number;
}

export const SCAN_CATS: ScanCategory[] = [
  { id: 'D', icon: '📊', label: 'DERIV', desc: 'FR / OI / LIQUIDATION CLUSTERS — DERIVATIVES OVERHEATING', count: 7 },
  { id: 'F', icon: '🐋', label: 'FLOW', desc: 'WHALE DEPOSITS $50M+, EXCHANGE FLOWS — SMART MONEY TRACKING', count: 6 },
  { id: 'M', icon: '🌍', label: 'MACRO', desc: 'DXY / RATES / VIX — MACRO HEADWIND & TAILWIND DETECTION', count: 5 },
  { id: 'S', icon: '💬', label: 'SENTI', desc: 'FEAR & GREED INDEX, SOCIAL EXPLOSIONS — CROWD SENTIMENT', count: 5 },
];

// ─── Squad Display ───────────────────────────────────────────

export interface SquadMember {
  name: string;
  role: string;
  color: string;
  conf: number;
  desc: string;
}

/** Squad display — v7 architecture mapping (ORPO + 4 Context + COMMANDER) */
export const SQUAD_DISPLAY: SquadMember[] = [
  { name: 'ORPO', role: 'CHART PROFESSOR', color: '#e8967d', conf: 92, desc: '90 indicators × thousands of charts. Reads only the chart.' },
  { name: 'DERIV', role: 'DERIVATIVES CONTEXT', color: '#ff6b4a', conf: 75, desc: 'FR, OI, liquidation clusters — derivatives overheating.' },
  { name: 'FLOW', role: 'WHALE TRACKER', color: '#4acfff', conf: 71, desc: 'Exchange flows, whale deposits — smart money signals.' },
  { name: 'MACRO', role: 'MACRO WATCHDOG', color: '#ffd060', conf: 72, desc: 'DXY, rates, VIX — macro headwind & tailwind.' },
  { name: 'SENTI', role: 'CROWD READER', color: '#c840ff', conf: 68, desc: 'Fear & Greed, social data — crowd sentiment gauge.' },
  { name: 'COMMANDER', role: 'CONFLICT RESOLVER', color: '#00ff88', conf: 88, desc: 'ORPO vs Context conflict → Entry Score. Your edge.' },
];

// ─── Flow Steps ──────────────────────────────────────────────

export interface FlowStep {
  num: string;
  title: string;
  desc: string;
  img: string;
  pct: number;
}

export const FLOW_STEPS: FlowStep[] = [
  { num: '01', title: 'CONNECT', desc: 'LINK WALLET IN 30 SECONDS. NO KYC. START FREE.', img: '/blockparty/f5-doge-excited.png', pct: 100 },
  { num: '02', title: 'SCAN', desc: 'ORPO READS THE CHART. 4 CONTEXT AGENTS WATCH THE WORLD BEYOND IT.', img: '/blockparty/f5-doge-chart.png', pct: 85 },
  { num: '03', title: 'DECIDE', desc: 'YOUR JUDGMENT FIRST. THEN COMPARE WITH ORPO. INDEPENDENT THINKING WINS.', img: '/blockparty/f5-doge-fire.png', pct: 90 },
  { num: '04', title: 'EARN', desc: 'ARENA BATTLES → PASSPORT STATS → LP REWARDS. SKILL COMPOUNDS.', img: '/blockparty/f5-doge-muscle.png', pct: 95 },
];
