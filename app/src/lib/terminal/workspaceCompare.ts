import type { ChallengeTimeframe, ParsedQuery } from '$lib/contracts';
import { parseBlockSearchWithHints } from './blockSearchParser';

export interface WorkspaceCompareIntent {
  kind: 'compare';
  raw: string;
  symbols: string[];
  timeframe: ChallengeTimeframe;
  focusTerms: string[];
}

export interface WorkspaceCompareCard {
  symbol: string;
  timeframe: ChallengeTimeframe;
  price: number;
  change24h: number;
  chartData: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
  snapshot: any;
  derivatives: any;
  annotations: any[];
  indicators: any;
}

export interface WorkspaceCompareBlock {
  id: string;
  query: string;
  timeframe: ChallengeTimeframe;
  symbols: string[];
  focusTerms: string[];
  previewQuery: ParsedQuery | null;
  cards: WorkspaceCompareCard[];
  failedSymbols: string[];
}

export interface WorkspaceCompareMutation {
  raw: string;
  timeframe: ChallengeTimeframe | null;
  nextSymbols: string[] | null;
  focusTerms: string[];
  summary: string;
}

const COMPARE_TRIGGER = /(^|[\s,(])(?:compare|vs|versus|비교)(?=$|[\s),])/iu;
const TIMEFRAME_PATTERNS: Array<[RegExp, ChallengeTimeframe]> = [
  [/(?<![\p{L}\p{N}_])(1h|1시간)(?![\p{L}\p{N}_])/iu, '1h'],
  [/(?<![\p{L}\p{N}_])(4h|4시간)(?![\p{L}\p{N}_])/iu, '4h'],
  [/(?<![\p{L}\p{N}_])(1d|일봉|daily)(?![\p{L}\p{N}_])/iu, '1d'],
];

const RESERVED_COMPARE_TOKENS = new Set([
  'COMPARE',
  'VS',
  'VERSUS',
  '비교',
  'ON',
  'WITH',
  'AND',
  'OR',
  'THEN',
  'SHOW',
  'ONLY',
  'KEEP',
  'LEFT',
  'CHANGE',
  'SWITCH',
  'TO',
  'ADD',
  'INCLUDE',
  'REMOVE',
  'DROP',
  'EXCLUDE',
  'UPDATE',
  'CHART',
  'CHARTS',
  'PRICE',
  'RECENT',
  'RANGE',
  'SYNC',
  'NORMALIZE',
  'LOG',
  'MOMENTUM',
  'FUNDING',
  'OPEN',
  'INTEREST',
  'OI',
  'CVD',
  'DIVERGENCE',
  'STRENGTH',
  'RELATIVE',
  'FLOW',
  'VOLUME',
  'PERP',
  'CROWDED',
]);

const ADD_TRIGGER = /(add|include|append|추가|더해|붙여|넣어|합쳐)/iu;
const REMOVE_TRIGGER = /(remove|drop|exclude|빼|제거|없애|지워)/iu;
const KEEP_ONLY_TRIGGER = /(only|keep|만 남겨|만 비교|만 보여)/iu;
const CHANGE_TRIGGER = /(change|switch|바꿔|변경|전환)/iu;

function extractTimeframe(input: string): ChallengeTimeframe | null {
  for (const [pattern, timeframe] of TIMEFRAME_PATTERNS) {
    if (pattern.test(input)) return timeframe;
  }
  return null;
}

function normalizeSymbolCandidate(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (RESERVED_COMPARE_TOKENS.has(upper)) return null;
  if (/^\d+$/.test(upper)) return null;
  if (TIMEFRAME_PATTERNS.some(([pattern]) => pattern.test(trimmed))) return null;

  if (/^[A-Z0-9]{2,10}USDT$/.test(upper)) return upper;
  if (!/^[A-Z0-9]{2,10}$/.test(upper)) return null;
  return `${upper}USDT`;
}

export function collectCompareSymbols(input: string): string[] {
  const seen = new Set<string>();
  const matches = input.match(/[A-Za-z0-9]+/g) ?? [];

  for (const match of matches) {
    const symbol = normalizeSymbolCandidate(match);
    if (symbol) seen.add(symbol);
  }

  return Array.from(seen);
}

function extractFocusTerms(input: string, symbols: string[]): string[] {
  let cleaned = input;

  for (const symbol of symbols) {
    const bare = symbol.replace(/USDT$/i, '');
    cleaned = cleaned.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${symbol}(?![\\p{L}\\p{N}_])`, 'igu'), ' ');
    cleaned = cleaned.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${bare}(?![\\p{L}\\p{N}_])`, 'igu'), ' ');
  }

  cleaned = cleaned
    .replace(/(^|[\s,(])(?:compare|vs|versus|비교)(?=$|[\s),])/giu, ' ')
    .replace(/(?<![\p{L}\p{N}_])(1h|4h|1d|1시간|4시간|일봉|daily)(?![\p{L}\p{N}_])/giu, ' ')
    .replace(/[,+/]/g, ' ');

  return cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !RESERVED_COMPARE_TOKENS.has(token.toUpperCase()))
    .slice(0, 4);
}

export function formatTerminalCompareSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, '');
}

export function buildCompareRunLabel(symbols: string[], timeframe: ChallengeTimeframe): string {
  return `${symbols.map(formatTerminalCompareSymbol).join(' · ')} ${timeframe.toUpperCase()}`;
}

export function createWorkspaceCompareId(): string {
  return `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function hasPreviewQuery(query: ParsedQuery | null | undefined): query is ParsedQuery {
  return !!query && query.confidence === 'high' && query.blocks.length > 0;
}

function parseFocusTermPreviewQuery(
  focusTerms: string[],
  timeframe: ChallengeTimeframe
): ParsedQuery | null {
  const seed = focusTerms.join(' ').trim();
  if (!seed) return null;
  const parsed = parseBlockSearchWithHints(`${seed} ${timeframe}`).query;
  return hasPreviewQuery(parsed) ? { ...parsed, raw: seed, timeframe } : null;
}

export function buildWorkspaceComparePreviewQuery(args: {
  raw: string;
  timeframe: ChallengeTimeframe;
  focusTerms: string[];
  previous?: ParsedQuery | null;
}): ParsedQuery | null {
  const parsedFromRaw = parseBlockSearchWithHints(args.raw).query;
  if (hasPreviewQuery(parsedFromRaw)) {
    return { ...parsedFromRaw, timeframe: args.timeframe };
  }

  const parsedFromFocusTerms = parseFocusTermPreviewQuery(args.focusTerms, args.timeframe);
  if (parsedFromFocusTerms) return parsedFromFocusTerms;

  if (hasPreviewQuery(args.previous)) {
    return { ...args.previous, timeframe: args.timeframe };
  }

  return null;
}

export function bindWorkspaceComparePreviewQuery(
  query: ParsedQuery | null,
  symbol: string,
  timeframe: ChallengeTimeframe
): ParsedQuery | null {
  if (!hasPreviewQuery(query)) return null;
  return {
    ...query,
    symbol,
    timeframe,
  };
}

export function parseWorkspaceCompareIntent(input: string): WorkspaceCompareIntent | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!COMPARE_TRIGGER.test(raw)) return null;

  const symbols = collectCompareSymbols(raw).slice(0, 4);
  if (symbols.length < 2) return null;

  return {
    kind: 'compare',
    raw,
    symbols,
    timeframe: extractTimeframe(raw) ?? '4h',
    focusTerms: extractFocusTerms(raw, symbols),
  };
}

export function parseWorkspaceCompareMutation(
  input: string,
  selectedBlock: WorkspaceCompareBlock | null
): WorkspaceCompareMutation | null {
  if (!selectedBlock) return null;

  const raw = input.trim();
  if (!raw || COMPARE_TRIGGER.test(raw)) return null;

  const symbols = collectCompareSymbols(raw).slice(0, 4);
  const timeframe = extractTimeframe(raw);
  const wantsAdd = ADD_TRIGGER.test(raw);
  const wantsRemove = REMOVE_TRIGGER.test(raw);
  const wantsKeepOnly = KEEP_ONLY_TRIGGER.test(raw);
  const wantsChange = CHANGE_TRIGGER.test(raw);

  let nextSymbols: string[] | null = null;
  let summary = '';

  if (wantsKeepOnly && symbols.length > 0) {
    nextSymbols = symbols;
    summary = `kept ${symbols.map(formatTerminalCompareSymbol).join(', ')}`;
  } else if (wantsAdd && symbols.length > 0) {
    nextSymbols = Array.from(new Set([...selectedBlock.symbols, ...symbols])).slice(0, 4);
    const added = nextSymbols.filter((symbol) => !selectedBlock.symbols.includes(symbol));
    if (added.length > 0) {
      summary = `added ${added.map(formatTerminalCompareSymbol).join(', ')}`;
    }
  } else if (wantsRemove && symbols.length > 0) {
    nextSymbols = selectedBlock.symbols.filter((symbol) => !symbols.includes(symbol));
    const removed = selectedBlock.symbols.filter((symbol) => !nextSymbols?.includes(symbol));
    if (removed.length > 0) {
      summary = `removed ${removed.map(formatTerminalCompareSymbol).join(', ')}`;
    }
  }

  if (!summary && timeframe && wantsChange) {
    summary = `switched to ${timeframe.toUpperCase()}`;
  }

  if (!summary && timeframe && symbols.length === 0) {
    summary = `switched to ${timeframe.toUpperCase()}`;
  }

  if (!summary && nextSymbols && timeframe) {
    summary = `updated compare set and switched to ${timeframe.toUpperCase()}`;
  }

  if (!summary) return null;

  return {
    raw,
    timeframe,
    nextSymbols,
    focusTerms: extractFocusTerms(raw, nextSymbols ?? selectedBlock.symbols),
    summary,
  };
}
