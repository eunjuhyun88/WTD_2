// ═══════════════════════════════════════════════════════════════
// intentClassifier — zero-cost intent detection
// ═══════════════════════════════════════════════════════════════
//
// Pure function. No LLM. No I/O. Determines what the user wants
// so the server can allocate the minimum token budget needed.
//
// Saves ~30-80% tokens per request by:
//   1. Sending only the tools that might be called
//   2. Adjusting maxTokens to response length expectations
//   3. Skipping snapshot injection for intents that don't need it
//   4. Routing simple intents to faster/cheaper providers

export type Intent =
  | 'greeting'      // "ㅎㅇ", "hey", reactions — no tools needed
  | 'quick_ask'     // "BTC 어때?", coin-specific — analyze_market
  | 'deep_analyze'  // "전체 분석해줘" — full tool set
  | 'scan'          // "뭐가 핫해", "스캔해" — scan_market
  | 'social'        // "커뮤니티 어때" — check_social
  | 'chart_ctrl'    // "4H로 바꿔" — chart_control only
  | 'pattern_save'  // "기억해", "패턴 저장" — save_pattern
  | 'convo';        // everything else — no tools

export interface IntentBudget {
  intent: Intent;
  /** tool names to include in this request (subset of all 7) */
  tools: readonly string[];
  /** LLM response token budget */
  maxTokens: number;
  /** how many history turns to include (0 = none) */
  historyDepth: number;
  /**
   * whether to inject snapshot into system prompt.
   * 'if_same_symbol' = only when snapshot.symbol matches detected symbol
   * AND snapshot was computed within snapshotMaxAgeMs
   */
  includeSnapshot: 'always' | 'if_same_symbol' | 'never';
  /** preferred provider key — server still falls back on failure */
  preferredProvider: 'cerebras' | 'gemini' | 'groq' | 'default';
}

// ─── Patterns ────────────────────────────────────────────────

const GREETING_PATTERNS = [
  /^[ㅎㅠㅜㅋㅎㄱㅇ]{1,4}$/,           // ㅎㅇ, ㅠㅜ, ㅋㅋ, ㄱㄱ
  /^(안녕|하이|헬로|방가|오|어|야|웅|응|넹)$/,
  /^(hey|hi|yo|sup|hello|hola|test|테스트)$/i,
  /^(ㅇㅇ|ㄴㄴ|ㅇㅋ|ㄳ|ㄷㄷ|ㅅㄱ|ㅂㅂ|ㄹㅇ)$/,
  /^(맞아|틀렸|틀려|ㄷ|ㅗ|ㄴ|ㅈ)$/,
  /^(lol|lmao|nice|good|ok|okay|yep|nope|nah|yeah)$/i,
];

const DEEP_ANALYZE_PATTERNS = [
  /전체\s*분석|상세|다\s*봐|자세히|풀\s*분석|딥\s*분석/,
  /full\s*anal|deep\s*anal|detailed|show\s*all|complete/i,
];

const SCAN_PATTERNS = [
  /스캔|핫한|핫해|뭐가\s*좋|top\s*코인|코인\s*스캔|알파\s*높|와이코프\s*뜬|bb\s*스퀴즈/,
  /scan|what'?s?\s*(hot|trending|moving)|top\s*coins?|highest\s*alpha|market\s*overview/i,
];

const SOCIAL_PATTERNS = [
  /커뮤니티|소셜|분위기|트위터|레딧|sentiment|sns|소셜분위기/,
  /community|social|twitter|reddit|sentiment|trending\s*topic/i,
];

const CHART_CTRL_PATTERNS = [
  /(\d[hHmMdDwW])\s*(봐|로|차트|보여)|(차트|캔들)\s*(바꿔|바꾸|변경)/,
  /(4h|1h|1d|15m|5m|1w)\s*(chart|candle|view)|(change|switch|show)\s*(chart|timeframe|tf)/i,
  /일봉|4시간|1시간|주봉|15분봉|5분봉/,
];

const PATTERN_SAVE_PATTERNS = [
  /기억해|저장해|패턴\s*저장|이거\s*저장|save\s*pattern|remember\s*this/i,
];

// Known crypto symbols — fast Set lookup
const KNOWN_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC',
  'DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'MEME', 'BOME',
  'SUI', 'APT', 'OP', 'ARB', 'BASE',
  'NEAR', 'FTM', 'ATOM', 'INJ', 'TIA', 'PYTH',
  'JTO', 'JUP', 'RNDR', 'FET', 'AGIX', 'WLD', 'TAO',
  'LTC', 'BCH', 'ETC', 'ALGO', 'VET', 'ONE',
  '비트', '이더', '솔라나', '리플', '도지', '에이다',
  'BITCOIN', 'ETHEREUM', 'SOLANA', 'RIPPLE', 'DOGECOIN',
]);

const SYMBOL_PATTERN = /\b([A-Z]{2,8})(USDT)?\b|비트코인|이더리움|솔라나|리플|도지코인/gi;

function detectSymbol(text: string): boolean {
  // Check known symbols first
  const upper = text.toUpperCase();
  for (const sym of KNOWN_SYMBOLS) {
    if (upper.includes(sym)) return true;
  }
  // Regex fallback for pattern like "XXX 어때", "XXX USDT"
  const matches = text.toUpperCase().match(SYMBOL_PATTERN);
  return matches !== null && matches.length > 0;
}

// ─── Intent config table ─────────────────────────────────────

const INTENT_CONFIG: Record<Intent, IntentBudget> = {
  greeting: {
    intent: 'greeting',
    tools: [],
    maxTokens: 80,
    historyDepth: 0,
    includeSnapshot: 'never',
    preferredProvider: 'cerebras',
  },
  quick_ask: {
    intent: 'quick_ask',
    tools: ['analyze_market', 'chart_control'],
    maxTokens: 280,
    historyDepth: 3,
    includeSnapshot: 'if_same_symbol',
    preferredProvider: 'cerebras',
  },
  deep_analyze: {
    intent: 'deep_analyze',
    tools: ['analyze_market', 'chart_control', 'save_pattern'],
    maxTokens: 600,
    historyDepth: 4,
    includeSnapshot: 'always',
    preferredProvider: 'default',
  },
  scan: {
    intent: 'scan',
    tools: ['scan_market'],
    maxTokens: 450,
    historyDepth: 0,
    includeSnapshot: 'never',
    preferredProvider: 'cerebras',
  },
  social: {
    intent: 'social',
    tools: ['check_social'],
    maxTokens: 220,
    historyDepth: 0,
    includeSnapshot: 'never',
    preferredProvider: 'cerebras',
  },
  chart_ctrl: {
    intent: 'chart_ctrl',
    tools: ['chart_control'],
    maxTokens: 80,
    historyDepth: 0,
    includeSnapshot: 'never',
    preferredProvider: 'cerebras',
  },
  pattern_save: {
    intent: 'pattern_save',
    tools: ['save_pattern', 'query_memory'],
    maxTokens: 200,
    historyDepth: 4,
    includeSnapshot: 'if_same_symbol',
    preferredProvider: 'cerebras',
  },
  convo: {
    intent: 'convo',
    tools: [],
    maxTokens: 160,
    historyDepth: 3,
    includeSnapshot: 'never',
    preferredProvider: 'cerebras',
  },
};

// ─── Classifier ──────────────────────────────────────────────

/**
 * Classify a user message into an intent and return the token budget.
 * Pure function — no I/O, no LLM, O(n) string scan.
 */
export function classifyIntent(message: string): IntentBudget {
  const text = message.trim();

  // Empty or very short
  if (text.length === 0) return INTENT_CONFIG.greeting;

  // Greeting: short messages matching greeting patterns
  if (text.length <= 12) {
    for (const pattern of GREETING_PATTERNS) {
      if (pattern.test(text)) return INTENT_CONFIG.greeting;
    }
  }

  // Explicit deep analyze
  if (DEEP_ANALYZE_PATTERNS.some(p => p.test(text))) {
    return INTENT_CONFIG.deep_analyze;
  }

  // Pattern save
  if (PATTERN_SAVE_PATTERNS.some(p => p.test(text))) {
    return INTENT_CONFIG.pattern_save;
  }

  // Scan
  if (SCAN_PATTERNS.some(p => p.test(text))) {
    return INTENT_CONFIG.scan;
  }

  // Social
  if (SOCIAL_PATTERNS.some(p => p.test(text))) {
    return INTENT_CONFIG.social;
  }

  // Chart control
  if (CHART_CTRL_PATTERNS.some(p => p.test(text))) {
    return INTENT_CONFIG.chart_ctrl;
  }

  // Quick ask: message mentions a known coin symbol
  if (detectSymbol(text)) {
    return INTENT_CONFIG.quick_ask;
  }

  // Fallback: general conversation
  return INTENT_CONFIG.convo;
}

/** Max snapshot age before it's considered stale (5 minutes) */
export const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
