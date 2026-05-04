export type AIQueryAction =
  | { type: 'add-indicator'; indicatorId: string }
  | { type: 'set-timeframe'; tf: string }
  | { type: 'pattern-recall' }
  | { type: 'set-tab'; tab: 'decision' | 'pattern' | 'verdict' | 'research' | 'judge' }
  | { type: 'ai-overlay'; overlayType: 'price-line' | 'range-box'; label: string }
  | { type: 'analyze' }
  | { type: 'toggle-drawing' }
  | { type: 'open-whale-data' }
  | { type: 'save-setup' };

interface RouteRule {
  patterns: RegExp[];
  action: (match: RegExpMatchArray) => AIQueryAction;
}

const RULES: RouteRule[] = [
  // TF 변경
  {
    patterns: [/(\d+m|1h|4h|1d)으?로?\s*(바|바꿔|변경)/i, /change\s+to\s+(\d+m|1h|4h|1d)/i],
    action: (m) => ({ type: 'set-timeframe', tf: m[1].toLowerCase() }),
  },
  // OI 인디케이터
  {
    patterns: [/\boi\b(?:.*?(1h|4h|1d))?/i, /open\s+interest/i, /오픈\s*인터레스트/i],
    action: (m) => ({ type: 'add-indicator', indicatorId: m[1] ? `oi_change_${m[1].toLowerCase()}` : 'oi_change_4h' }),
  },
  // RSI
  {
    patterns: [/\brsi\b/i],
    action: () => ({ type: 'add-indicator', indicatorId: 'rsi' }),
  },
  // Funding Rate
  {
    patterns: [/funding\s*rate/i, /펀딩\s*레이트?/i, /펀딩률?/i],
    action: () => ({ type: 'add-indicator', indicatorId: 'funding_rate' }),
  },
  // MACD
  {
    patterns: [/\bmacd\b/i],
    action: () => ({ type: 'add-indicator', indicatorId: 'macd' }),
  },
  // 패턴 찾기
  {
    patterns: [/find\s+similar\s+pattern/i, /비슷한\s*패턴/i, /패턴\s*찾/i, /similar\s+pattern/i],
    action: () => ({ type: 'pattern-recall' }),
  },
  // AI overlay — 저항
  {
    patterns: [/(\d[\d,]+)\s*(저항|resistance)/i],
    action: (m) => ({ type: 'ai-overlay', overlayType: 'price-line', label: `Resistance ${m[1]}` }),
  },
  // AI overlay — 지지
  {
    patterns: [/(\d[\d,]+)\s*(지지|support)/i],
    action: (m) => ({ type: 'ai-overlay', overlayType: 'price-line', label: `Support ${m[1]}` }),
  },
  // 고래 데이터
  {
    patterns: [/whale/i, /고래/i],
    action: () => ({ type: 'open-whale-data' }),
  },
  // 분석 요청
  {
    patterns: [/long\s+(?:들어가|go)/i, /지금\s*(?:매수|롱|진입)/i, /should\s+i\s+(?:long|buy)/i, /분석해/i],
    action: () => ({ type: 'analyze' }),
  },
  // 탭 전환
  {
    patterns: [/decision\s*tab/i, /결정\s*탭/i],
    action: () => ({ type: 'set-tab', tab: 'decision' }),
  },
  {
    patterns: [/verdict\s*tab/i, /판정\s*탭/i],
    action: () => ({ type: 'set-tab', tab: 'verdict' }),
  },
  {
    patterns: [/pattern\s*tab/i, /패턴\s*탭/i],
    action: () => ({ type: 'set-tab', tab: 'pattern' }),
  },
  {
    patterns: [/research\s*tab/i, /리서치\s*탭/i],
    action: () => ({ type: 'set-tab', tab: 'research' }),
  },
  {
    patterns: [/judge\s*tab/i, /판단\s*탭/i],
    action: () => ({ type: 'set-tab', tab: 'judge' }),
  },
  // 드로잉 모드
  {
    patterns: [/draw(?:ing)?\s*mode/i, /드로잉\s*모드/i, /그리기/i],
    action: () => ({ type: 'toggle-drawing' }),
  },
  // 저장
  {
    patterns: [/save\s+setup/i, /세팅\s*저장/i],
    action: () => ({ type: 'save-setup' }),
  },
];

export function routeQuery(query: string): AIQueryAction | null {
  const q = query.trim();
  if (!q) return null;
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      const m = q.match(pat);
      if (m) return rule.action(m);
    }
  }
  if (q.length > 3) return { type: 'analyze' };
  return null;
}

// ── classifyAsk — slash-first NL classifier ────────────────────────────────

export type AskIntent = 'scan' | 'why' | 'judge' | 'recall' | 'inbox' | 'unknown';
export type AskSource = 'slash' | 'nl';

export interface AskResult {
  intent: AskIntent;
  source: AskSource;
  tab: 'research' | 'decision' | 'judge' | 'pattern' | 'verdict';
  query: string;
}

const SLASH_RE = /^\/(scan|why|judge|recall|inbox)\b\s*(.*)/i;

// NL fallback rules: [patterns, intent, tab]
const NL_RULES: Array<[RegExp[], AskIntent, AskResult['tab']]> = [
  [
    [/비슷한\s*패턴/i, /similar\s+pattern/i, /패턴\s*찾/i, /recall/i, /pattern/i],
    'recall',
    'pattern',
  ],
  [
    [/왜\s*빠/i, /왜\s*올/i, /why/i, /분석/i, /explain/i, /이유/i],
    'why',
    'decision',
  ],
  [
    [/judge/i, /판정/i, /판단/i],
    'judge',
    'judge',
  ],
  [
    [/scan/i, /find/i, /screening/i, /스캔/i, /찾아/i],
    'scan',
    'research',
  ],
  [
    [/inbox/i, /unverified/i, /verdict/i, /미검증/i],
    'inbox',
    'verdict',
  ],
];

export function classifyAsk(input: string): AskResult {
  const q = input.trim();

  // 1. Slash branch — deterministic
  const slashMatch = q.match(SLASH_RE);
  if (slashMatch) {
    const cmd = slashMatch[1].toLowerCase() as 'scan' | 'why' | 'judge' | 'recall' | 'inbox';
    const rest = slashMatch[2].trim();
    const tabMap: Record<typeof cmd, AskResult['tab']> = {
      scan: 'research',
      why: 'decision',
      judge: 'judge',
      recall: 'pattern',
      inbox: 'verdict',
    };
    return { intent: cmd, source: 'slash', tab: tabMap[cmd], query: rest };
  }

  // 2. NL fallback
  for (const [patterns, intent, tab] of NL_RULES) {
    for (const pat of patterns) {
      if (pat.test(q)) {
        return { intent, source: 'nl', tab, query: q };
      }
    }
  }

  // 3. Unknown — default to research tab
  return { intent: 'unknown', source: 'nl', tab: 'research', query: q };
}
