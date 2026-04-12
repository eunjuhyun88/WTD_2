// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — War Room Data Types (Terminal View)
// ═══════════════════════════════════════════════════════════════

export interface WRMessage {
  icon: string;
  name: string;
  color: string;
  vote: 'short' | 'long' | 'neutral';
  time: string;
  text: string;
  src: string;
}

// ═══ Multi-Token Agent Signals ═══
export interface AgentSignal {
  id: string;
  agentId: string;
  icon: string;
  name: string;
  color: string;
  token: string;
  pair: string;
  vote: 'long' | 'short' | 'neutral';
  conf: number;
  text: string;
  src: string;
  time: string;
  entry: number;
  tp: number;
  sl: number;
}

export function getConsensus(signals: AgentSignal[]): { dir: 'LONG' | 'SHORT' | 'NEUTRAL'; conf: number; count: { long: number; short: number; neutral: number } } {
  const count = { long: 0, short: 0, neutral: 0 };
  let totalConf = 0;
  signals.forEach(s => {
    count[s.vote]++;
    totalConf += s.conf;
  });
  const avgConf = signals.length ? Math.round(totalConf / signals.length) : 0;
  const dir = count.long > count.short ? 'LONG' : count.short > count.long ? 'SHORT' : 'NEUTRAL';
  return { dir, conf: avgConf, count };
}

export interface Headline {
  icon: string;
  time: string;
  text: string;
  bull: boolean;
  link?: string;
}

export interface EventData {
  tag: string;
  tagColor: string;
  time: string;
  text: string;
  src: string;
  borderColor: string;
}

export interface CommunityPost {
  name: string;
  avatar: string;
  avatarColor: string;
  time: string;
  text: string;
  signal?: 'long' | 'short';
}

export interface Prediction {
  question: string;
  yesPercent: number;
  pool: string;
  closes: string;
}
