import { describe, expect, it } from 'vitest';
import {
  MacroCalendarResponseSchema,
  PatternCaptureResponseSchema,
  TerminalAlertCreateRequestSchema,
  TerminalExportJobResponseSchema,
  TerminalPinsResponseSchema,
  TerminalWatchlistResponseSchema,
} from './terminalPersistence';

describe('terminalPersistence contract', () => {
  it('parses watchlist response with preview metrics', () => {
    const parsed = TerminalWatchlistResponseSchema.parse({
      ok: true,
      schemaVersion: 1,
      items: [
        {
          symbol: 'BTCUSDT',
          timeframe: '4h',
          sortOrder: 0,
          active: true,
          preview: {
            price: 102345.67,
            change24h: 2.4,
            bias: 'bullish',
            confidence: 'high',
          },
        },
      ],
      activeSymbol: 'BTCUSDT',
      updatedAt: '2026-04-15T10:00:00+00:00',
    });

    expect(parsed.items[0]?.preview?.bias).toBe('bullish');
    expect(parsed.activeSymbol).toBe('BTCUSDT');
  });

  it('rejects invalid pin type', () => {
    const parsed = TerminalPinsResponseSchema.safeParse({
      ok: true,
      schemaVersion: 1,
      pins: [
        {
          id: 'pin-1',
          pinType: 'invalid',
          timeframe: '4h',
          payload: {},
          createdAt: '2026-04-15T10:00:00+00:00',
          updatedAt: '2026-04-15T10:00:00+00:00',
        },
      ],
      updatedAt: '2026-04-15T10:00:00+00:00',
    });

    expect(parsed.success).toBe(false);
  });

  it('parses alert create request with source context', () => {
    const parsed = TerminalAlertCreateRequestSchema.parse({
      symbol: 'ETHUSDT',
      timeframe: '1h',
      kind: 'risk_guard',
      params: { invalidation: '3520' },
      sourceContext: { origin: 'terminal', activeSymbol: 'ETHUSDT' },
    });

    expect(parsed.sourceContext.origin).toBe('terminal');
    expect(parsed.enabled).toBe(true);
  });

  it('parses export job response', () => {
    const parsed = TerminalExportJobResponseSchema.parse({
      ok: true,
      schemaVersion: 1,
      job: {
        id: 'exp-1',
        exportType: 'terminal_report',
        status: 'queued',
        symbol: 'SOLUSDT',
        timeframe: '4h',
        title: 'SOL setup',
        requestPayload: { panel: 'terminal' },
        createdAt: '2026-04-15T10:00:00+00:00',
        updatedAt: '2026-04-15T10:00:00+00:00',
      },
    });

    expect(parsed.job.status).toBe('queued');
  });

  it('parses macro calendar response', () => {
    const parsed = MacroCalendarResponseSchema.parse({
      ok: true,
      schemaVersion: 1,
      items: [
        {
          id: 'macro-us-open',
          title: 'US Cash Open',
          scheduledAt: '2026-04-15T13:30:00+00:00',
          countdownSeconds: 1200,
          impact: 'medium',
          affectedAssets: ['BTC', 'ETH', 'SPX'],
          summary: 'US cash open often resets DXY and beta correlation.',
        },
      ],
      updatedAt: '2026-04-15T10:00:00+00:00',
    });

    expect(parsed.items[0]?.affectedAssets).toContain('BTC');
  });

  it('parses pattern capture response', () => {
    const parsed = PatternCaptureResponseSchema.parse({
      ok: true,
      schemaVersion: 1,
      records: [
        {
          id: 'cap-1',
          symbol: 'BTCUSDT',
          timeframe: '4h',
          contextKind: 'symbol',
          triggerOrigin: 'manual',
          patternSlug: 'tradoor-v1',
          snapshot: { price: 102100.4, change24h: 1.2, funding: 0.01, oiDelta: 4.2 },
          decision: { verdict: 'bullish', action: 'wait pullback', confidence: 0.67 },
          sourceFreshness: { market: 'recent' },
          createdAt: '2026-04-15T10:00:00+00:00',
          updatedAt: '2026-04-15T10:00:00+00:00',
        },
      ],
      updatedAt: '2026-04-15T10:00:00+00:00',
    });

    expect(parsed.records[0]?.triggerOrigin).toBe('manual');
  });
});
