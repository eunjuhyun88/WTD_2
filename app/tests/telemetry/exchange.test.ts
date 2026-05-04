import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock analytics module
vi.mock('$lib/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '$lib/analytics';
import {
  trackExchangeKeyRegistered,
  trackExchangeKeyDeleted,
  trackExchangeKeyValidationFailed,
  trackExchangeGuideViewed,
} from '$lib/telemetry/exchange';

describe('exchange telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trackExchangeKeyRegistered calls track with correct event', () => {
    trackExchangeKeyRegistered('binance', true);
    expect(track).toHaveBeenCalledWith('exchange_key_registered', {
      exchange: 'binance',
      ip_restrict: true,
    });
  });

  it('trackExchangeKeyDeleted calls track with correct event', () => {
    trackExchangeKeyDeleted('binance');
    expect(track).toHaveBeenCalledWith('exchange_key_deleted', { exchange: 'binance' });
  });

  it('trackExchangeKeyValidationFailed includes code', () => {
    trackExchangeKeyValidationFailed('binance', 'trading_enabled');
    expect(track).toHaveBeenCalledWith('exchange_key_validation_failed', {
      exchange: 'binance',
      code: 'trading_enabled',
    });
  });

  it('trackExchangeGuideViewed calls track', () => {
    trackExchangeGuideViewed('binance');
    expect(track).toHaveBeenCalledWith('exchange_guide_viewed', { exchange: 'binance' });
  });

  it('0 PII: no api_key or secret in any event payload', () => {
    trackExchangeKeyRegistered('binance', false);
    const calls = vi.mocked(track).mock.calls;
    const allPayloads = JSON.stringify(calls);
    expect(allPayloads).not.toMatch(/api_key/i);
    expect(allPayloads).not.toMatch(/secret/i);
    expect(allPayloads).not.toMatch(/user_id/i);
  });
});
