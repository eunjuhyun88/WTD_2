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

// Known crypto symbols — fast path (자주 쓰이는 것만, 전수 커버리지 불필요)
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

// 일반 영단어 — 티커로 오탐되지 않도록 제외
const COMMON_WORDS = new Set([
  'I','A','AN','THE','AND','OR','IS','IT','TO','OF','IN','FOR','ON','AT','BY','UP',
  'DO','GO','BE','AS','NO','SO','IF','MY','WE','HE','ME','US','AM','PM','OK',
  'BUT','NOT','ALL','CAN','GET','HOW','WHO','OUT','NEW','NOW','ANY','TWO','WAY',
  'MAY','SAY','USE','HER','HIS','HAD','HAS','WAS','ARE','YES','YEP','NAH',
  'BEEN','HAVE','WITH','FROM','THIS','THAT','THEY','WHAT','WHEN','WILL',
  'JUST','VERY','ALSO','WELL','INTO','OVER','SOME','MAKE','TAKE','GOOD',
  'FULL','LONG','HIGH','LAST','NEXT','SHOW','OPEN','GIVE','LOOK','KNOW',
  'NEED','WANT','KEEP','WORK','MUCH','MORE','MOST','LOL','LMAO','NICE',
  'TEST','HELP','INFO','DATA','TIME','FAST','HOLD','SAME','WAIT','REAL',
  'MOVE','NEWS','BULL','BEAR','TOP','LOW','HMM','WOW','YO','HEY','HI',
]);

// 트레이딩/시장 맥락 단어 — 긴 메시지에서 미지 티커 확정용
const TRADE_CONTEXT = /어때|분석|봐|봐줘|체크|확인|지금|현재|가격|전망|올라|내려|펌핑|덤핑|숏|롱|매수|매도|들어가|진입|타겟|수익|손절|\b(analysis|analyze|check|price|pump|dump|long|short|buy|sell|entry|target|chart)\b/i;

function detectSymbol(text: string): boolean {
  const upper = text.toUpperCase();

  // 1. 빠른 경로: 알려진 심볼
  for (const sym of KNOWN_SYMBOLS) {
    if (upper.includes(sym)) return true;
  }

  // 2. 명시적 USDT 쌍: TRUMPUSDT, TRUMP/USDT, FARTCOINUSDT 등
  if (/\b[A-Z]{2,12}(\/USDT|USDT)\b/i.test(text)) return true;

  // 3. 한국어 코인명
  if (/비트코인|이더리움|솔라나|리플|도지코인|에이다|폴카닷|체인링크|아발란체|수이|앱토스/.test(text)) return true;

  // 4. 미지 티커 감지: 대문자 2~12자 중 일반 영단어 아닌 것
  const words = upper.match(/\b[A-Z]{2,12}\b/g) ?? [];
  const hasTicker = words.some(w => !COMMON_WORDS.has(w));

  if (!hasTicker) return false;

  // 짧은 메시지(≤20자)는 티커 쿼리로 간주: "TRUMP?", "FARTCOIN 봐"
  if (text.trim().length <= 20) return true;

  // 긴 메시지는 트레이딩 맥락 단어가 있어야 확정
  return TRADE_CONTEXT.test(text);
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
