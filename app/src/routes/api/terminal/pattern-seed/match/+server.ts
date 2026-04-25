import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
  PatternDraftParserMetaSchema,
  PatternDraftSchema,
  type PatternDraft,
  type PatternDraftParserMeta,
  type PatternDraftPhase,
} from '$lib/contracts/terminalPersistence';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

type SeedSignal =
  | 'oi_spike'
  | 'dump_then_reclaim'
  | 'higher_lows_sequence'
  | 'funding_flip_negative_to_positive'
  | 'range_high_break'
  | 'volume_breakout'
  | 'short_funding_pressure'
  | 'long_funding_pressure';

type MatchCandidate = {
  symbol: string;
  source: 'engine';
  score: number;
  matchedSignals: SeedSignal[];
  missingSignals: SeedSignal[];
  summary: string;
};

const DEFAULT_PATTERN_FAMILY = 'tradoor_ptb_oi_reversal';
const DEFAULT_PATTERN_SLUG = 'tradoor-oi-reversal-v1';
const SIGNAL_VOCAB_VERSION = 'signal-vocab-v1';
const DEFAULT_TOP_K = 10;
const DEFAULT_TIMEFRAME = '15m';
const DEFAULT_LOOKBACK_BARS = 160;

const TIMEFRAME_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const TIMEFRAME_FAMILY: Record<string, string[]> = {
  '5m': ['5m', '15m', '1h'],
  '15m': ['15m', '30m', '1h', '4h'],
  '30m': ['15m', '30m', '1h', '4h'],
  '1h': ['15m', '1h', '4h'],
  '4h': ['1h', '4h'],
  '1d': ['4h', '1d'],
};

const SIGNAL_PATTERNS: Record<SeedSignal, RegExp[]> = {
  oi_spike: [
    /(oi|open interest|미결|오아이).*(급등|증가|스파이크|spike|surge|expand)/i,
    /(급등|증가|스파이크|spike|surge).*(oi|open interest|미결|오아이)/i,
  ],
  dump_then_reclaim: [
    /(급락|덤프|하락|dump|flush).*(반등|회복|reclaim|되돌림)/i,
    /(반등|회복|reclaim|되돌림).*(급락|덤프|하락|dump|flush)/i,
  ],
  higher_lows_sequence: [
    /(higher low|higher lows|저점.*높|우상향.*저점|저점 상향)/i,
  ],
  funding_flip_negative_to_positive: [
    /(funding.*flip|펀딩.*flip|음수 펀딩.*양수|negative funding.*positive funding|funding flip)/i,
  ],
  range_high_break: [
    /(range high|range breakout|range break|박스 상단|횡보 상단|고점 돌파|상단 돌파)/i,
  ],
  volume_breakout: [
    /(거래량.*(폭발|급등|스파이크|breakout)|volume.*(spike|breakout|surge)|빔|breakout)/i,
  ],
  short_funding_pressure: [
    /(숏 ?펀딩|short funding|negative funding|음수 펀딩|펀딩 음수)/i,
  ],
  long_funding_pressure: [
    /(롱 ?펀딩|long funding|positive funding|양수 펀딩|펀딩 양수)/i,
  ],
};

const MatchRequestBodySchema = z.object({
  thesis: z.string().trim().min(1),
  activeSymbol: z.string().trim().min(1).optional(),
  timeframe: z.string().trim().min(1).optional(),
  snapshotNames: z.array(z.string().min(1)).max(6).default([]),
  boardSymbols: z.array(z.string().min(1)).max(64).default([]),
  assets: z
    .array(z.union([z.string().min(1), z.object({ symbol: z.string().min(1) })]))
    .max(64)
    .optional(),
});

class MatchRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function isSeedSignal(value: unknown): value is SeedSignal {
  return typeof value === 'string' && value in SIGNAL_PATTERNS;
}

function dedupeSignals(values: SeedSignal[]): SeedSignal[] {
  return dedupe(values) as SeedSignal[];
}

function normalizeBoardSymbols(body: z.infer<typeof MatchRequestBodySchema>): string[] {
  const assetSymbols = (body.assets ?? []).map((asset) =>
    typeof asset === 'string' ? asset : asset.symbol,
  );
  return dedupe([...body.boardSymbols, ...assetSymbols]).slice(0, 32);
}

function parseSignals(thesis: string): SeedSignal[] {
  const matches = Object.entries(SIGNAL_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(thesis)))
    .map(([signal]) => signal as SeedSignal);

  if (matches.length > 0) return matches;
  return ['oi_spike', 'dump_then_reclaim', 'higher_lows_sequence'];
}

function buildThesisBullets(thesis: string): string[] {
  const segments = thesis
    .split(/\n+/)
    .flatMap((line) => line.split(/[.!?;]+/))
    .map((line) => line.trim())
    .filter(Boolean);
  return dedupe(segments).slice(0, 4);
}

function timeframeFamily(referenceTimeframe: string): string[] {
  return dedupe([
    referenceTimeframe,
    ...(TIMEFRAME_FAMILY[referenceTimeframe] ?? [referenceTimeframe, '1h', '4h']),
  ]);
}

function buildSyntheticViewport(referenceTimeframe: string): { timeFrom: number; timeTo: number } {
  const now = Date.now();
  const timeframeMs = TIMEFRAME_MS[referenceTimeframe] ?? TIMEFRAME_MS[DEFAULT_TIMEFRAME];
  return {
    timeFrom: now - timeframeMs * DEFAULT_LOOKBACK_BARS,
    timeTo: now,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pickSignals(
  detectedSignals: SeedSignal[],
  candidates: SeedSignal[],
  limit?: number,
): SeedSignal[] {
  const picked = candidates.filter((signal) => detectedSignals.includes(signal));
  return typeof limit === 'number' ? picked.slice(0, limit) : picked;
}

function buildPatternDraft(params: {
  thesis: string;
  symbol: string;
  timeframe: string;
  boardSymbols: string[];
}): {
  patternDraft: PatternDraft;
  parserMeta: PatternDraftParserMeta;
  detectedSignals: SeedSignal[];
} {
  const detectedSignals = parseSignals(params.thesis);
  const thesisBullets = buildThesisBullets(params.thesis);
  const ambiguities: string[] = [];
  const matchedExplicitSignal = Object.values(SIGNAL_PATTERNS).some((patterns) =>
    patterns.some((pattern) => pattern.test(params.thesis)),
  );
  if (
    detectedSignals.length === 3 &&
    detectedSignals.includes('oi_spike') &&
    detectedSignals.includes('dump_then_reclaim') &&
    detectedSignals.includes('higher_lows_sequence') &&
    !matchedExplicitSignal
  ) {
    ambiguities.push('No explicit canonical signal phrase detected; defaulted to TRADOOR core path.');
  }

  const realDumpRequired = pickSignals(detectedSignals, ['oi_spike', 'dump_then_reclaim'], 2);
  const realDumpPreferred = pickSignals(detectedSignals, ['short_funding_pressure', 'volume_breakout']);
  const accumulationRequired = pickSignals(detectedSignals, ['higher_lows_sequence', 'funding_flip_negative_to_positive'], 2);
  const accumulationPreferred = pickSignals(detectedSignals, ['dump_then_reclaim', 'long_funding_pressure', 'volume_breakout']);
  const breakoutRequired = pickSignals(detectedSignals, ['range_high_break'], 1);
  const breakoutPreferred = pickSignals(detectedSignals, ['volume_breakout', 'long_funding_pressure']);

  const phases: PatternDraftPhase[] = [
    {
      phaseId: 'real_dump',
      label: 'Real Dump',
      sequenceOrder: 0,
      description: 'Trigger event with dump / OI expansion / funding stress.',
      timeframe: params.timeframe,
      signalsRequired: realDumpRequired.length > 0 ? realDumpRequired : ['dump_then_reclaim'],
      signalsPreferred: realDumpPreferred,
      signalsForbidden: [],
      evidenceText: thesisBullets[0],
      importance: 0.9,
    },
    {
      phaseId: 'accumulation',
      label: 'Accumulation',
      sequenceOrder: 1,
      description: 'Reclaim and higher-lows structure after the dump.',
      timeframe: params.timeframe,
      signalsRequired: accumulationRequired.length > 0 ? accumulationRequired : ['higher_lows_sequence'],
      signalsPreferred: accumulationPreferred,
      signalsForbidden: [],
      evidenceText: thesisBullets[1] ?? thesisBullets[0],
      importance: 0.95,
    },
  ];

  if (breakoutRequired.length > 0 || breakoutPreferred.length > 0) {
    phases.push({
      phaseId: 'breakout',
      label: 'Breakout',
      sequenceOrder: 2,
      description: 'Range expansion after accumulation.',
      timeframe: params.timeframe,
      signalsRequired: breakoutRequired,
      signalsPreferred: breakoutPreferred,
      signalsForbidden: [],
      evidenceText: thesisBullets[2] ?? thesisBullets[0],
      importance: 0.75,
    });
  }

  const mustHaveSignals = dedupeSignals([
    ...pickSignals(detectedSignals, ['oi_spike', 'dump_then_reclaim', 'higher_lows_sequence']),
    ...pickSignals(detectedSignals, ['range_high_break'], 1),
  ]);

  const confidence = Number(
    Math.min(0.92, 0.46 + detectedSignals.length * 0.08 + phases.length * 0.05).toFixed(2),
  );

  const patternDraft = PatternDraftSchema.parse({
    schemaVersion: 1,
    patternFamily: DEFAULT_PATTERN_FAMILY,
    patternLabel: thesisBullets[0]?.slice(0, 80) || 'Pattern Seed Scout draft',
    sourceType: 'manual_note',
    sourceText: params.thesis,
    symbolCandidates: dedupe([params.symbol]).slice(0, 16),
    timeframe: params.timeframe,
    thesis: thesisBullets.length > 0 ? thesisBullets : [params.thesis],
    phases,
    tradePlan: {
      entry_phase: 'accumulation',
      entry_trigger: ['higher lows hold', 'phase transition confirmation'],
      stop_rule: 'invalidate on accumulation failure',
      target_rule: 'review similar-live outcome set',
    },
    searchHints: {
      mustHaveSignals,
      preferredTimeframes: timeframeFamily(params.timeframe),
      similarityFocus: ['phase_path', 'required_signals', 'feature_snapshot'],
      symbolScope: dedupe([params.symbol, ...params.boardSymbols]).slice(0, 32),
    },
    confidence,
    ambiguities,
  });

  const parserMeta = PatternDraftParserMetaSchema.parse({
    parserRole: 'pattern_seed_parser',
    parserModel: 'heuristic-v1',
    parserPromptVersion: 'pattern-seed-heuristic-v1',
    patternDraftSchemaVersion: patternDraft.schemaVersion,
    signalVocabVersion: SIGNAL_VOCAB_VERSION,
    confidence: patternDraft.confidence ?? null,
    ambiguityCount: patternDraft.ambiguities.length,
  });

  return { patternDraft, parserMeta, detectedSignals };
}

function toEnginePatternDraft(patternDraft: PatternDraft): Record<string, unknown> {
  return {
    schema_version: patternDraft.schemaVersion,
    pattern_family: patternDraft.patternFamily,
    pattern_label: patternDraft.patternLabel,
    source_type: patternDraft.sourceType,
    source_text: patternDraft.sourceText,
    symbol_candidates: patternDraft.symbolCandidates ?? [],
    timeframe: patternDraft.timeframe,
    thesis: patternDraft.thesis ?? [],
    phases: (patternDraft.phases ?? []).map((phase) => ({
      phase_id: phase.phaseId,
      label: phase.label,
      sequence_order: phase.sequenceOrder,
      description: phase.description,
      timeframe: phase.timeframe,
      signals_required: phase.signalsRequired ?? [],
      signals_preferred: phase.signalsPreferred ?? [],
      signals_forbidden: phase.signalsForbidden ?? [],
      directional_belief: phase.directionalBelief,
      evidence_text: phase.evidenceText,
      time_hint: phase.timeHint,
      importance: phase.importance,
    })),
    trade_plan: patternDraft.tradePlan ?? {},
    search_hints: {
      must_have_signals: patternDraft.searchHints?.mustHaveSignals ?? [],
      preferred_timeframes: patternDraft.searchHints?.preferredTimeframes ?? [],
      exclude_patterns: patternDraft.searchHints?.excludePatterns ?? [],
      similarity_focus: patternDraft.searchHints?.similarityFocus ?? [],
      symbol_scope: patternDraft.searchHints?.symbolScope ?? [],
    },
    confidence: patternDraft.confidence,
    ambiguities: patternDraft.ambiguities ?? [],
  };
}

function toEngineParserMeta(parserMeta: PatternDraftParserMeta): Record<string, unknown> {
  return {
    parser_role: parserMeta.parserRole,
    parser_model: parserMeta.parserModel,
    parser_prompt_version: parserMeta.parserPromptVersion,
    pattern_draft_schema_version: parserMeta.patternDraftSchemaVersion,
    signal_vocab_version: parserMeta.signalVocabVersion,
    confidence: parserMeta.confidence,
    ambiguity_count: parserMeta.ambiguityCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getNumeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function signalMatched(signal: SeedSignal, result: Record<string, unknown>): boolean {
  const snapshot = isRecord(result.canonical_feature_snapshot)
    ? result.canonical_feature_snapshot
    : {};
  const phase = typeof result.phase === 'string' ? result.phase.toUpperCase() : '';
  const path = typeof result.path === 'string' ? result.path.toUpperCase() : '';
  const oiZscore = getNumeric(snapshot.oi_zscore);
  const fundingZscore = getNumeric(snapshot.funding_rate_zscore);
  const volumePercentile = getNumeric(snapshot.volume_percentile);

  switch (signal) {
    case 'oi_spike':
      return oiZscore !== null && oiZscore >= 1.5;
    case 'dump_then_reclaim':
      return Boolean(snapshot.dump_then_reclaim) || (path.includes('REAL_DUMP') && (path.includes('ACCUMULATION') || path.includes('BREAKOUT')));
    case 'higher_lows_sequence':
      return Boolean(snapshot.higher_lows_sequence) || phase === 'ACCUMULATION' || path.includes('ACCUMULATION');
    case 'funding_flip_negative_to_positive':
      return Boolean(snapshot.funding_flip_negative_to_positive) || Boolean(snapshot.funding_flip_flag);
    case 'range_high_break':
      return Boolean(snapshot.range_high_break) || phase === 'BREAKOUT' || path.includes('BREAKOUT');
    case 'volume_breakout':
      return volumePercentile !== null && volumePercentile >= 0.75;
    case 'short_funding_pressure':
      return fundingZscore !== null && fundingZscore <= -1.0;
    case 'long_funding_pressure':
      return fundingZscore !== null && fundingZscore >= 1.0;
  }
}

function buildSummary(result: Record<string, unknown>): string {
  const snapshot = isRecord(result.canonical_feature_snapshot)
    ? result.canonical_feature_snapshot
    : {};
  const phase = typeof result.phase === 'string' ? result.phase : 'UNKNOWN';
  const path = typeof result.path === 'string' ? result.path : '';
  const similarityScore = getNumeric(result.similarity_score);
  const rankingScore = getNumeric(result.ranking_score);
  const oiZscore = getNumeric(snapshot.oi_zscore);
  const fundingZscore = getNumeric(snapshot.funding_rate_zscore);
  const volumePercentile = getNumeric(snapshot.volume_percentile);

  const segments = [
    path || phase,
    rankingScore !== null ? `rank ${(rankingScore * 100).toFixed(0)}` : null,
    similarityScore !== null ? `sim ${(similarityScore * 100).toFixed(0)}` : null,
    oiZscore !== null ? `OI z ${oiZscore.toFixed(1)}` : null,
    fundingZscore !== null ? `fund z ${fundingZscore.toFixed(1)}` : null,
    volumePercentile !== null ? `vol p${Math.round(volumePercentile * 100)}` : null,
  ].filter((value): value is string => Boolean(value));

  return segments.join(' · ');
}

function mapCandidate(result: Record<string, unknown>, requestedSignals: SeedSignal[]): MatchCandidate | null {
  const symbol = typeof result.symbol === 'string' ? result.symbol : null;
  if (!symbol) return null;

  const matchedSignals = requestedSignals.filter((signal) => signalMatched(signal, result));
  const missingSignals = requestedSignals.filter((signal) => !matchedSignals.includes(signal));
  const rankingScore = getNumeric(result.ranking_score);
  const similarityScore = getNumeric(result.similarity_score);
  const score = clampScore(
    typeof rankingScore === 'number'
      ? rankingScore * 100
      : typeof similarityScore === 'number'
        ? similarityScore * 100
        : matchedSignals.length * 20,
  );

  return {
    symbol,
    source: 'engine',
    score,
    matchedSignals,
    missingSignals,
    summary: buildSummary(result),
  };
}

async function parseEngineJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const payload = JSON.parse(text);
    return isRecord(payload) ? payload : {};
  } catch {
    return { error: text };
  }
}

async function engineRequest(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  try {
    const response = await engineFetch(path, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await parseEngineJson(response);
    if (!response.ok) {
      const detail =
        typeof payload.detail === 'string'
          ? payload.detail
          : typeof payload.error === 'string'
            ? payload.error
            : `Engine request failed: ${response.status}`;
      throw new MatchRouteError(response.status >= 500 ? 502 : response.status, detail);
    }
    return payload;
  } catch (error) {
    if (error instanceof MatchRouteError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MatchRouteError(504, `Engine request timed out for ${path}`);
    }
    throw new MatchRouteError(502, `Engine unavailable for ${path}`);
  }
}

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

    const body = MatchRequestBodySchema.parse(await request.json());
    const symbol = body.activeSymbol ?? normalizeBoardSymbols(body)[0] ?? 'BTCUSDT';
    const timeframe = body.timeframe ?? DEFAULT_TIMEFRAME;
    const boardSymbols = normalizeBoardSymbols(body);
    const { patternDraft, parserMeta, detectedSignals } = buildPatternDraft({
      thesis: body.thesis,
      symbol,
      timeframe,
      boardSymbols,
    });
    const viewport = buildSyntheticViewport(timeframe);

    const capturePayload = {
      capture_kind: 'manual_hypothesis',
      user_id: user.id,
      symbol,
      pattern_slug: DEFAULT_PATTERN_SLUG,
      timeframe,
      user_note: body.thesis,
      chart_context: {
        snapshot: {
          viewport,
        },
        pattern_seed: {
          snapshot_names: body.snapshotNames,
          origin: 'pattern_seed_scout',
        },
      },
      research_context: {
        pattern_family: patternDraft.patternFamily,
        thesis: patternDraft.thesis,
        research_tags: ['pattern_seed_scout', 'find_similar'],
        source: {
          kind: 'manual_note',
          title: 'PatternSeedScout',
          text: body.thesis,
          image_refs: body.snapshotNames,
        },
        pattern_draft: toEnginePatternDraft(patternDraft),
        parser_meta: toEngineParserMeta(parserMeta),
      },
    };

    const captureResult = await engineRequest('/captures', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(capturePayload),
    });
    const capture = isRecord(captureResult.capture) ? captureResult.capture : null;
    const captureId = typeof capture?.capture_id === 'string' ? capture.capture_id : null;
    if (!captureId) throw new MatchRouteError(502, 'Engine capture response missing capture_id');

    const benchmarkResult = await engineRequest(`/captures/${captureId}/benchmark_search`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
    });
    const artifact = isRecord(benchmarkResult.artifact) ? benchmarkResult.artifact : {};
    const searchQuerySpec = isRecord(artifact.search_query_spec) ? artifact.search_query_spec : null;
    const requestedSignals = Array.isArray(searchQuerySpec?.must_have_signals)
      ? searchQuerySpec.must_have_signals.filter(isSeedSignal)
      : dedupeSignals(detectedSignals);

    const patternSlug =
      typeof benchmarkResult.benchmark_pack === 'object' &&
      benchmarkResult.benchmark_pack &&
      typeof (benchmarkResult.benchmark_pack as Record<string, unknown>).pattern_slug === 'string'
        ? String((benchmarkResult.benchmark_pack as Record<string, unknown>).pattern_slug)
        : DEFAULT_PATTERN_SLUG;

    const similarLiveResult = await engineRequest(
      `/patterns/${patternSlug}/similar-live?top_k=${DEFAULT_TOP_K}&min_similarity_score=0.2`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      },
    );

    const candidates = Array.isArray(similarLiveResult.results)
      ? similarLiveResult.results
          .map((result) => (isRecord(result) ? mapCandidate(result, requestedSignals) : null))
          .filter((candidate): candidate is MatchCandidate => candidate !== null)
      : [];

    return json({
      ok: true,
      seed: {
        thesis: body.thesis,
        patternFamily: patternDraft.patternFamily,
        patternSlug,
        captureId,
        researchRunId:
          typeof benchmarkResult.research_run === 'object' &&
          benchmarkResult.research_run &&
          typeof (benchmarkResult.research_run as Record<string, unknown>).research_run_id === 'string'
            ? String((benchmarkResult.research_run as Record<string, unknown>).research_run_id)
            : undefined,
        searchQuerySpec,
        requestedSignals,
        detectedSignals,
        snapshotCount: body.snapshotNames.length,
      },
      candidates,
      scannedAt: Date.now(),
    });
    return json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ ok: false, error: 'Invalid pattern seed payload' }, { status: 400 });
    }
    if (error instanceof MatchRouteError) {
      return json({ ok: false, error: error.message }, { status: error.status });
    }
    return json(
      { ok: false, error: `Failed to match pattern seed: ${String(error)}` },
      { status: 500 },
    );
  }
};
