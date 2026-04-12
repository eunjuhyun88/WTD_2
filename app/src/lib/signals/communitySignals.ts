import { timeSince } from '$lib/utils/time';

export { timeSince };

export type SignalPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type SignalSource = 'arena' | 'trade' | 'tracked' | 'agent';

export interface SignalAgent {
  id: string;
  name: string;
  color: string;
  icon: string;
  img?: { def?: string };
  role?: string;
  dir: string;
  conf: number;
  finding: { title: string; detail: string };
}

export interface SignalVote {
  agentId: string;
  name: string;
  dir: string;
  conf: number;
}

export interface MatchRecordInput {
  id: string;
  matchN: number;
  win: boolean;
  timestamp: number;
  agentVotes?: SignalVote[] | null;
}

export interface TradeInput {
  id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number | null;
  sl: number | null;
  pnlPercent: number;
  openedAt: number;
}

export interface TrackedSignalInput {
  id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  source: string;
  confidence: number;
  entryPrice: number;
  pnlPercent: number;
  trackedAt: number;
}

export interface PriceStateInput {
  prices?: {
    BTC?: number;
    ETH?: number;
    SOL?: number;
  };
}

export interface Signal {
  id: string;
  agent: SignalAgent | null;
  pair: string;
  dir: 'LONG' | 'SHORT';
  conf: number;
  entry: number;
  tp: number;
  sl: number;
  rr: string;
  time: string;
  priority: SignalPriority;
  source: SignalSource;
  reason: string;
  active: boolean;
}

export interface CommunityIdea {
  id: string;
  signal: Signal;
  timeframe: '5m' | '15m' | '30m' | '1H' | '4H' | '1D';
  strategy: string;
  subscribers: number;
  category: 'crypto' | 'arena' | 'trade' | 'tracked';
}

const TF_ROTATION: CommunityIdea['timeframe'][] = ['4H', '1D', '1H', '15m', '30m', '5m'];


export function buildArenaSignals(recs: MatchRecordInput[], agents: SignalAgent[], state: PriceStateInput): Signal[] {
  return recs.slice(0, 10).flatMap((r) => {
    if (!r.agentVotes) return [];
    return r.agentVotes.map((vote) => {
      const ag = agents.find((a) => a.id === vote.agentId) ?? agents[0] ?? null;
      const base = state.prices?.BTC || 97000;
      const dir: Signal['dir'] = vote.dir === 'SHORT' ? 'SHORT' : 'LONG';
      return {
        id: `arena-${r.id}-${vote.agentId}`,
        agent: ag,
        pair: 'BTC/USDT',
        dir,
        conf: vote.conf,
        entry: Math.round(base),
        tp: Math.round(dir === 'LONG' ? base * 1.02 : base * 0.98),
        sl: Math.round(dir === 'LONG' ? base * 0.99 : base * 1.01),
        rr: '1:2.0',
        time: timeSince(r.timestamp),
        priority: vote.conf >= 80 ? 'CRITICAL' : vote.conf >= 70 ? 'HIGH' : 'MEDIUM',
        source: 'arena',
        reason: `Arena Match #${r.matchN} - ${r.win ? 'WIN' : 'LOSS'} (${vote.name}: ${dir} ${vote.conf}%)`,
        active: true
      };
    });
  });
}

export function buildTradeSignals(trades: TradeInput[]): Signal[] {
  return trades.map((t) => ({
    id: `trade-${t.id}`,
    agent: null,
    pair: t.pair,
    dir: t.dir,
    conf: 75,
    entry: Math.round(t.entry),
    tp: t.tp ? Math.round(t.tp) : Math.round(t.dir === 'LONG' ? t.entry * 1.02 : t.entry * 0.98),
    sl: t.sl ? Math.round(t.sl) : Math.round(t.dir === 'LONG' ? t.entry * 0.99 : t.entry * 1.01),
    rr: '1:2.0',
    time: timeSince(t.openedAt),
    priority: Math.abs(t.pnlPercent) > 3 ? 'HIGH' : 'MEDIUM',
    source: 'trade',
    reason: `Open position: ${t.dir} ${t.pair} @ $${Math.round(t.entry).toLocaleString()} (PnL: ${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%)`,
    active: true
  }));
}

export function buildTrackedSignals(signals: TrackedSignalInput[], agents: SignalAgent[]): Signal[] {
  return signals.map((s) => ({
    id: `tracked-${s.id}`,
    agent: agents.find((a) => a.name === s.source) || null,
    pair: s.pair,
    dir: s.dir,
    conf: s.confidence,
    entry: Math.round(s.entryPrice),
    tp: Math.round(s.dir === 'LONG' ? s.entryPrice * 1.02 : s.entryPrice * 0.98),
    sl: Math.round(s.dir === 'LONG' ? s.entryPrice * 0.99 : s.entryPrice * 1.01),
    rr: '1:2.0',
    time: timeSince(s.trackedAt),
    priority: s.confidence >= 80 ? 'HIGH' : 'MEDIUM',
    source: 'tracked',
    reason: `Tracked signal from ${s.source}: ${s.dir} ${s.pair} (PnL: ${s.pnlPercent >= 0 ? '+' : ''}${s.pnlPercent.toFixed(2)}%)`,
    active: true
  }));
}

export function buildAgentSignals(agents: SignalAgent[], state: PriceStateInput): Signal[] {
  if (agents.length === 0) return [];
  const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
  return agents.slice(0, 5).map((ag, i) => {
    const pair = pairs[i % pairs.length];
    const base = pair.startsWith('BTC') ? (state.prices?.BTC || 97000)
      : pair.startsWith('ETH') ? (state.prices?.ETH || 3400)
      : (state.prices?.SOL || 190);
    const dir: Signal['dir'] = ag.dir === 'SHORT' ? 'SHORT' : 'LONG';
    const spread = base * 0.02;
    return {
      id: `agent-${ag.id}`,
      agent: ag,
      pair,
      dir,
      conf: ag.conf,
      entry: Math.round(base),
      tp: Math.round(dir === 'LONG' ? base + spread : base - spread),
      sl: Math.round(dir === 'LONG' ? base - spread * 0.5 : base + spread * 0.5),
      rr: `1:${(1.5 + Math.random()).toFixed(1)}`,
      time: 'LIVE',
      priority: ag.conf >= 78 ? 'CRITICAL' : ag.conf >= 70 ? 'HIGH' : 'MEDIUM',
      source: 'agent',
      reason: `${ag.finding.title} - ${ag.finding.detail}`,
      active: true
    };
  });
}

function toCommunityCategory(sig: Signal): CommunityIdea['category'] {
  if (sig.source === 'arena') return 'arena';
  if (sig.source === 'trade') return 'trade';
  if (sig.source === 'tracked') return 'tracked';
  return 'crypto';
}

function toStrategyTitle(sig: Signal): string {
  const base = sig.reason.split('·')[0]?.trim() || sig.reason;
  if (base.length > 26) return `${base.slice(0, 26)}...`;
  return base;
}

function toSubscribers(sig: Signal, idx: number): number {
  return 36000 + sig.conf * 120 + idx * 170;
}

export function buildCommunityIdeas(
  signals: Signal[],
  filter: 'all' | 'crypto' | 'arena' | 'trade' | 'tracked'
): CommunityIdea[] {
  return signals
    .map((sig, idx) => ({
      id: `idea-${sig.id}`,
      signal: sig,
      timeframe: TF_ROTATION[idx % TF_ROTATION.length],
      strategy: toStrategyTitle(sig),
      subscribers: toSubscribers(sig, idx),
      category: toCommunityCategory(sig)
    }))
    .filter((idea) => filter === 'all' || idea.category === filter)
    .slice(0, 12);
}
