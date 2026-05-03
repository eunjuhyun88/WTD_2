import { describe, it, expect } from 'vitest';
import { INDICATOR_REGISTRY } from './registry';

const TV_TA_KEYS = ['rsi', 'macd', 'ema', 'bb', 'vwap', 'atr_bands', 'volume_ta', 'oi_ta', 'cvd_ta', 'derivatives_ta'] as const;
const EXPECTED_TOTAL = 29; // 19 market-data + 10 TV TA

describe('INDICATOR_REGISTRY (W-0400 Phase 1A)', () => {
  it('AC1A-1: contains expected total entry count', () => {
    expect(Object.keys(INDICATOR_REGISTRY).length).toBe(EXPECTED_TOTAL);
  });

  it('AC1A-2: all TV TA indicators have engineKey and category === "TA"', () => {
    for (const key of TV_TA_KEYS) {
      const def = INDICATOR_REGISTRY[key];
      expect(def, `missing: ${key}`).toBeDefined();
      expect(def.engineKey, `${key} missing engineKey`).toBeTruthy();
      expect(def.category, `${key} category`).toBe('TA');
    }
  });

  it('AC1A-3: original market-data entries have no engineKey or category', () => {
    const marketDataKeys = Object.keys(INDICATOR_REGISTRY).filter(
      k => !(TV_TA_KEYS as readonly string[]).includes(k)
    );
    for (const key of marketDataKeys) {
      const def = INDICATOR_REGISTRY[key];
      expect(def.engineKey, `${key} should not have engineKey`).toBeUndefined();
      expect(def.category, `${key} should not have category`).toBeUndefined();
    }
  });

  it('AC1A-4: TV TA 10종 각각 최소 2개 KO 동의어', () => {
    const koPattern = /[가-힣]/; // Korean unicode range
    for (const key of TV_TA_KEYS) {
      const synonyms = INDICATOR_REGISTRY[key].aiSynonyms ?? [];
      const koSynonyms = synonyms.filter(s => koPattern.test(s));
      expect(koSynonyms.length, `${key} needs ≥2 Korean synonyms`).toBeGreaterThanOrEqual(2);
    }
  });

  it('AC1A-5: engineKey values match expected IndicatorKind strings', () => {
    const expectedEngineKeys: Record<string, string> = {
      rsi: 'rsi',
      macd: 'macd',
      ema: 'ema',
      bb: 'bb',
      vwap: 'vwap',
      atr_bands: 'atr_bands',
      volume_ta: 'volume',
      oi_ta: 'oi',
      cvd_ta: 'cvd',
      derivatives_ta: 'derivatives',
    };
    for (const [regKey, expectedEk] of Object.entries(expectedEngineKeys)) {
      expect(INDICATOR_REGISTRY[regKey].engineKey).toBe(expectedEk);
    }
  });
});
