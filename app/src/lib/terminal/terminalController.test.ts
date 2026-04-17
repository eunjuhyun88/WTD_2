import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$lib/api/terminalPersistence', () => ({
  createPatternCapture: vi.fn(async () => null),
  createTerminalAlert: vi.fn(async () => null),
  createTerminalExport: vi.fn(async () => null),
  fetchTerminalExport: vi.fn(async () => null),
  deleteTerminalAlert: vi.fn(async () => true),
  saveTerminalPins: vi.fn(async (pins: unknown) => pins),
  saveTerminalWatchlist: vi.fn(async ({ items }: { items: unknown[] }) => ({ items })),
}));
vi.mock('$lib/api/terminalBackend', () => ({
  fetchMemoryRerank: vi.fn(async () => ({ queryId: '', records: [] })),
  sendMemoryDebugSession: vi.fn(async () => undefined),
  sendMemoryFeedback: vi.fn(async () => undefined),
}));
import {
  applyPatternTransitionBatch,
  buildTerminalBootstrapTasks,
  buildCompareBoardSymbols,
  emitTerminalMemoryFeedback,
  buildTerminalRefreshIntervals,
  buildTerminalRestorePlan,
  executeTerminalDockAction,
  getTerminalExportCompletionMessage,
  pollTerminalExportJobOnce,
  prunePatternTransitionAlerts,
  runTerminalMemoryRerank,
  runTerminalVisibilityRefresh,
  toggleAnalysisPin,
  toggleRiskAlert,
} from './terminalController';
import { createPatternCapture, createTerminalAlert, fetchTerminalExport } from '$lib/api/terminalPersistence';
import { fetchMemoryRerank, sendMemoryFeedback } from '$lib/api/terminalBackend';

describe('buildTerminalRestorePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers compare pin payload when present', () => {
    const plan = buildTerminalRestorePlan({
      watchlist: [],
      pins: [
        {
          id: 'compare:btc-eth:4h',
          pinType: 'compare',
          timeframe: '4h',
          payload: { symbols: ['BTCUSDT', 'ETHUSDT'] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      alerts: [],
      macro: [],
      latestExportJob: null,
    });

    expect(plan.layout).toBe('compare2x2');
    expect(plan.compareSymbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(plan.activeSymbol).toBe('BTCUSDT');
    expect(plan.activeTimeframe).toBe('4h');
  });

  it('falls back to active watchlist or latest analysis pin', () => {
    const plan = buildTerminalRestorePlan({
      watchlist: [{ symbol: 'SOLUSDT', timeframe: '1h', sortOrder: 0, active: true }],
      pins: [
        {
          id: 'analysis:BTCUSDT:4h',
          pinType: 'analysis',
          symbol: 'BTCUSDT',
          timeframe: '4h',
          payload: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      alerts: [],
      macro: [],
      latestExportJob: null,
    });

    expect(plan.layout).toBe('single');
    expect(plan.activeSymbol).toBe('SOLUSDT');
    expect(plan.activeTimeframe).toBe('4h');
  });

  it('builds compare symbols deterministically', () => {
    expect(buildCompareBoardSymbols('BTCUSDT', ['BTCUSDT', 'SOLUSDT'])).toEqual(['BTCUSDT', 'SOLUSDT', 'ETHUSDT']);
  });

  it('routes dock board refresh through callbacks', async () => {
    const loadAlerts = vi.fn(async () => {});
    const loadTerminalPersistenceState = vi.fn(async () => {});
    const loadAnalysis = vi.fn(async () => {});
    const loadActiveReadPath = vi.fn(async () => {});
    const loadTerminalReadPath = vi.fn(async () => {});
    const loadPatternCaptures = vi.fn(async () => {});

    const result = await executeTerminalDockAction({
      label: 'Board',
      prompt: 'Board',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      loadAlerts,
      loadTerminalPersistenceState,
      loadAnalysis,
      loadActiveReadPath,
      loadTerminalReadPath,
      loadPatternCaptures,
    });

    expect(result.handled).toBe(true);
    expect(result.messageKey).toBe('board_refreshed');
    expect(loadAnalysis).toHaveBeenCalledWith('BTCUSDT', '4h');
    expect(loadActiveReadPath).toHaveBeenCalledWith('BTCUSDT', '4h');
    expect(loadTerminalPersistenceState).toHaveBeenCalled();
  });

  it('builds bootstrap and refresh schedules deterministically', () => {
    const noop = () => {};
    expect(buildTerminalBootstrapTasks({
      loadTrending: noop,
      loadNews: noop,
      loadAlerts: noop,
      loadPatternPhases: noop,
      loadPatternCaptures: noop,
    }).map((item) => item.delayMs)).toEqual([120, 220, 320, 420, 520]);

    expect(buildTerminalRefreshIntervals({
      loadFlow: noop,
      loadTrending: noop,
      loadTerminalReadPath: noop,
      loadAlerts: noop,
      loadEvents: noop,
      loadPatternPhases: noop,
    }).map((item) => item.everyMs)).toEqual([15000, 60000, 60000, 300000, 60000, 60000]);
  });

  it('runs visibility refresh callbacks together', () => {
    const loadFlow = vi.fn();
    const loadEvents = vi.fn();
    const loadTerminalReadPath = vi.fn();
    runTerminalVisibilityRefresh({ loadFlow, loadEvents, loadTerminalReadPath });
    expect(loadFlow).toHaveBeenCalled();
    expect(loadEvents).toHaveBeenCalled();
    expect(loadTerminalReadPath).toHaveBeenCalled();
  });

  it('reranks evidence and records top retrieved feedback', async () => {
    (fetchMemoryRerank as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      queryId: 'q-1',
      records: [
        { id: 'flow', score: 0.9 },
        { id: 'oi', score: 0.7 },
      ],
    });

    const result = await runTerminalMemoryRerank({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      intent: 'risk',
      evidence: [
        { metric: 'flow', value: 'up', delta: '+2%', interpretation: 'bull', state: 'bullish', sourceCount: 1 },
        { metric: 'oi', value: 'flat', delta: '0%', interpretation: 'neutral', state: 'neutral', sourceCount: 1 },
      ],
    });

    expect(result?.queryId).toBe('q-1');
    expect(result?.topEvidenceIds).toEqual(['flow', 'oi']);
    expect(sendMemoryFeedback).toHaveBeenCalledTimes(2);
  });

  it('applies and prunes pattern transition alerts', async () => {
    const result = await applyPatternTransitionBatch({
      existingAlerts: [],
      items: [{ symbol: 'BTCUSDT', slug: 'wyckoff', phase: 'markup' }],
      timeframe: '4h',
    });

    expect(result.alerts).toHaveLength(1);
    expect(createPatternCapture).toHaveBeenCalledTimes(1);
    expect(prunePatternTransitionAlerts(result.alerts, Date.now() + 1_000)).toEqual([]);
  });

  it('toggles analysis pin through persistence helpers', async () => {
    const result = await toggleAnalysisPin({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      pins: [],
      watchlist: [],
      activeSymbol: 'BTCUSDT',
      payload: { evidence: [{ metric: 'flow' }] },
    });

    expect(result.pins).toHaveLength(1);
    expect(result.watchlist[0]?.symbol).toBe('BTCUSDT');
    expect(result.result.message).toContain('pinned');
  });

  it('creates a risk alert through persistence helpers', async () => {
    (createTerminalAlert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'alert-1',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      kind: 'risk_guard',
      params: {},
      enabled: true,
      sourceContext: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await toggleRiskAlert({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      alerts: [],
      payload: { riskPlan: { bias: 'bullish', invalidation: 'stop' }, verdict: { action: 'wait' } },
    });

    expect(result.alerts).toHaveLength(1);
    expect(result.result.message).toContain('saved');
  });

  it('polls export job completion through persistence helper', async () => {
    (fetchTerminalExport as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'export-1',
      exportType: 'terminal_report',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      status: 'succeeded',
      payload: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await pollTerminalExportJobOnce('export-1');

    expect(result.job?.id).toBe('export-1');
    expect(result.completed).toBe(true);
    expect(getTerminalExportCompletionMessage('succeeded')).toBe('Terminal report export completed');
  });

  it('emits used/confirmed feedback through helper', async () => {
    await emitTerminalMemoryFeedback({
      queryId: 'q-2',
      evidenceIds: ['flow', 'oi', 'funding'],
      event: 'confirmed',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      intent: 'save_setup',
    });

    expect(sendMemoryFeedback).toHaveBeenCalledTimes(2);
    expect(sendMemoryFeedback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ queryId: 'q-2', memoryId: 'flow', event: 'confirmed' }),
    );
  });
});
