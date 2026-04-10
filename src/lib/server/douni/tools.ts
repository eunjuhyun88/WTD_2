// ═══════════════════════════════════════════════════════════════
// DOUNI — Tool Definitions (OpenAI-compatible function calling)
// ═══════════════════════════════════════════════════════════════
//
// LLM이 자율적으로 호출할 수 있는 도구 5종.
// Groq, Grok, DeepSeek, Kimi, Qwen 모두 OpenAI tool format 지원.

import type { ToolDefinition } from './types';

// ─── analyze_market ──────────────────────────────────────────
// DOUNI가 시장 분석이 필요하다고 판단하면 자동 호출

export const TOOL_ANALYZE_MARKET: ToolDefinition = {
  type: 'function',
  function: {
    name: 'analyze_market',
    description: `Run a 15-layer signal analysis on a crypto symbol. Returns SignalSnapshot with Alpha Score, Wyckoff phase, CVD state, funding rate, and all layer scores. Use this when:
- User asks about a specific coin (e.g. "BTC 어때?", "이더 분석해줘")
- You need fresh market data to answer a question
- Current analysis data is stale or missing`,
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Trading pair symbol (e.g. "BTCUSDT", "ETHUSDT")',
        },
        timeframe: {
          type: 'string',
          enum: ['1h', '4h', '1d'],
          description: 'Chart timeframe for analysis (default: 4h)',
        },
      },
      required: ['symbol'],
    },
  },
};

// ─── chart_control ──────────────────────────────────────────
// 프론트엔드 차트를 조작하는 도구

export const TOOL_CHART_CONTROL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'chart_control',
    description: `Control the terminal chart display. Use when:
- User asks to change timeframe ("4시간봉 보여줘", "일봉으로")
- User asks to switch symbol ("이더 차트", "솔라나로 바꿔")
- You want to highlight a specific chart region`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['change_symbol', 'change_timeframe', 'add_indicator'],
          description: 'Chart action to perform',
        },
        symbol: {
          type: 'string',
          description: 'New symbol (for change_symbol)',
        },
        timeframe: {
          type: 'string',
          enum: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
          description: 'New timeframe (for change_timeframe)',
        },
        indicator: {
          type: 'string',
          enum: ['ema', 'bb', 'volume', 'cvd'],
          description: 'Indicator to add (for add_indicator)',
        },
      },
      required: ['action'],
    },
  },
};

// ─── save_pattern ───────────────────────────────────────────
// 대화에서 식별된 패턴을 Doctrine에 저장

export const TOOL_SAVE_PATTERN: ToolDefinition = {
  type: 'function',
  function: {
    name: 'save_pattern',
    description: `Extract and save a trading pattern from the current analysis. Use when:
- You identify a notable pattern worth remembering
- User says "이거 기억해", "패턴 저장", "이 조건 기억"
- A confirmed prediction deserves pattern extraction`,
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Pattern name (e.g. "CVD 다이버전스 숏 셋업")',
        },
        description: {
          type: 'string',
          description: 'Brief description of the pattern',
        },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'SignalSnapshot field path (e.g. "l11.cvd_state", "l2.fr", "alphaScore")' },
              operator: { type: 'string', enum: ['eq', 'gt', 'lt', 'gte', 'lte', 'contains'] },
              value: { description: 'Comparison value' },
            },
            required: ['field', 'operator', 'value'],
          },
          description: 'Array of conditions that define this pattern',
        },
        direction: {
          type: 'string',
          enum: ['LONG', 'SHORT', 'NEUTRAL'],
          description: 'Expected trade direction',
        },
      },
      required: ['name', 'conditions', 'direction'],
    },
  },
};

// ─── submit_feedback ────────────────────────────────────────
// 사용자가 분석 결과에 피드백

export const TOOL_SUBMIT_FEEDBACK: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_feedback',
    description: `Record user feedback on a previous analysis or pattern. Use when:
- User confirms a prediction was right ("맞았다!", "적중")
- User says a prediction was wrong ("틀렸네", "실패")
- User rates an analysis`,
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['analysis', 'pattern'],
          description: 'What the feedback is about',
        },
        result: {
          type: 'string',
          enum: ['correct', 'incorrect', 'partial'],
          description: 'Outcome of the prediction',
        },
        note: {
          type: 'string',
          description: 'Optional note about what went right or wrong',
        },
      },
      required: ['target', 'result'],
    },
  },
};

// ─── query_memory ───────────────────────────────────────────
// 이전 분석/패턴 기억 조회

export const TOOL_QUERY_MEMORY: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_memory',
    description: `Search DOUNI's memory for past analyses, patterns, or conversations. Use when:
- User asks "이전에 뭐라고 했었지?", "지난번 분석 보여줘"
- You need context from a previous session
- User asks about pattern hit rate or history`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query',
        },
        type: {
          type: 'string',
          enum: ['analysis', 'pattern', 'feedback', 'all'],
          description: 'Type of memory to search',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
};

// ─── check_social ──────────────────────────────────────────
// 소셜 센티먼트·Galaxy Score·AltRank 조회 (LunarCrush-style)

export const TOOL_CHECK_SOCIAL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'check_social',
    description: `Check social media sentiment, engagement, and buzz for a crypto topic. Returns Galaxy Score, AltRank, sentiment, social dominance, and recent top posts. Use when:
- User asks about social buzz ("BTC 커뮤니티 분위기 어때?", "도지 소셜 어때?")
- User wants to know trending coins or topics
- You need social context to complement technical analysis
- User asks about influencer posts or news sentiment`,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Crypto topic or symbol (e.g. "bitcoin", "$btc", "$eth", "solana", "dogecoin")',
        },
        include_posts: {
          type: 'boolean',
          description: 'Include top social posts (default: true)',
        },
      },
      required: ['topic'],
    },
  },
};

// ─── scan_market ───────────────────────────────────────────
// 멀티 코인 17-layer 기술적 스캐너 (Binance 기반)
// Returns each coin's alphaScore, alphaLabel, verdict, regime, and flag
// badges (wyckoff, mtf_triple, bb_squeeze, liq_alert, fr_extreme).

export const TOOL_SCAN_MARKET: ToolDefinition = {
  type: 'function',
  function: {
    name: 'scan_market',
    description: `Run the 17-layer technical scanner across multiple coins on Binance and return a ranked list with alpha scores, layer flags, price, and 24h change. Use when the user wants a multi-coin market overview or to discover what's setting up right now.

Trigger keywords (non-exhaustive):
- Korean: "지금 뭐가 핫해?", "어떤 코인이 주목받고 있어?", "스캔해", "top 10 보여줘", "알파 높은 거", "와이코프 뜬 거", "BB 스퀴즈 있는 거"
- English: "scan the market", "what's hot", "top coins", "what's trending", "show me the scan", "anything setting up?", "highest alpha right now", "any bb squeezes?"

Flags each coin may carry: wyckoff (MARKUP/MARKDOWN), mtf_triple (MTF ★), bb_squeeze, liq_alert, fr_extreme. Use these in your summary when present.`,
    parameters: {
      type: 'object',
      properties: {
        sort: {
          type: 'string',
          enum: ['alphaScore', 'change24h', 'volume24h'],
          description: 'Sort criteria (default: alphaScore by absolute magnitude)',
        },
        sector: {
          type: 'string',
          enum: ['defi', 'meme', 'layer-1', 'layer-2', 'ai', 'gaming', 'nft'],
          description: 'Optional sector filter for topN mode',
        },
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional custom list of coin symbols (e.g. ["BTC","ETH","SOL"]). Overrides sector/limit when provided.',
        },
        limit: {
          type: 'number',
          description: 'Number of results (default: 10, max: 10 for terminal context)',
        },
      },
    },
  },
};

// ─── All Tools ──────────────────────────────────────────────

export const DOUNI_TOOLS: ToolDefinition[] = [
  TOOL_ANALYZE_MARKET,
  TOOL_CHECK_SOCIAL,
  TOOL_SCAN_MARKET,
  TOOL_CHART_CONTROL,
  TOOL_SAVE_PATTERN,
  TOOL_SUBMIT_FEEDBACK,
  TOOL_QUERY_MEMORY,
];

/** Tool names for validation */
export type DouniToolName =
  | 'analyze_market'
  | 'check_social'
  | 'scan_market'
  | 'chart_control'
  | 'save_pattern'
  | 'submit_feedback'
  | 'query_memory';

export const VALID_TOOL_NAMES = new Set<string>([
  'analyze_market',
  'check_social',
  'scan_market',
  'chart_control',
  'save_pattern',
  'submit_feedback',
  'query_memory',
]);
