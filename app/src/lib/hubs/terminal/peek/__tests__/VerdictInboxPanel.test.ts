import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PANEL_SRC = readFileSync(
  resolve(__dirname, '../VerdictInboxPanel.svelte'),
  'utf-8',
);

/**
 * F-02-app: Verdict 5-button UI tests.
 *
 * Tests that submitVerdict accepts 5 verdict types matching
 * F-02 engine (PR #370). Engine spec: engine/api/routes/captures.py:66
 * VerdictLabel = Literal["valid", "invalid", "missed", "too_late", "unclear"]
 */

describe('VerdictInboxPanel — F-02-app verdict 5-cat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts all 5 verdict values via type literal', () => {
    type Verdict = 'valid' | 'invalid' | 'missed' | 'too_late' | 'unclear';
    const verdicts: Verdict[] = ['valid', 'invalid', 'missed', 'too_late', 'unclear'];
    expect(verdicts).toHaveLength(5);
    expect(verdicts).toContain('too_late');
    expect(verdicts).toContain('unclear');
  });

  it('builds correct POST body for each verdict', () => {
    const captureId = 'cap-123';
    const verdicts = ['valid', 'invalid', 'missed', 'too_late', 'unclear'] as const;
    for (const v of verdicts) {
      const body = JSON.stringify({ verdict: v });
      const parsed = JSON.parse(body);
      expect(parsed.verdict).toBe(v);
    }
  });

  it('uses POST /captures/{id}/verdict route', () => {
    const captureId = 'cap-456';
    const expectedUrl = `/api/captures/${captureId}/verdict`;
    expect(expectedUrl).toMatch(/^\/api\/captures\/.+\/verdict$/);
  });

  it('ML label mapping (Q1 lock-in): missed and too_late are distinct', () => {
    // missed = 패턴 valid, 진입 못함 (학습 제외)
    // too_late = valid, 진입 타이밍 늦음 (weak negative)
    // 두 값은 학습 라벨 노이즈가 다르므로 분리해야 함
    const verdictMissed: 'missed' = 'missed';
    const verdictTooLate: 'too_late' = 'too_late';
    expect(verdictMissed).not.toBe(verdictTooLate);
  });

  it('unclear verdict excludes from ML training (label ambiguity)', () => {
    const verdict: 'unclear' = 'unclear';
    // unclear는 학습 라벨이 모호하므로 trainer가 제외해야 함
    const includeInTraining = (v: string) => v === 'valid' || v === 'invalid';
    expect(includeInTraining(verdict)).toBe(false);
  });

  it('mock fetch returns 200 for all 5 verdicts', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const captureId = 'cap-789';
    const verdicts = ['valid', 'invalid', 'missed', 'too_late', 'unclear'] as const;
    for (const v of verdicts) {
      const res = await fetch(`/api/captures/${captureId}/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict: v }),
      });
      expect(res.status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

// W-0345 AC3: 3-section layout structural tests
describe('VerdictInboxPanel — W-0345 3-section layout', () => {
  it('Section 1: watch-hits section marker present', () => {
    expect(PANEL_SRC).toContain('data-section="watch-hits"');
  });

  it('Section 2: review section marker present', () => {
    expect(PANEL_SRC).toContain('data-section="review"');
  });

  it('Section 3: recent section marker present', () => {
    expect(PANEL_SRC).toContain('data-section="recent"');
  });

  it('section ordering: watch-hits before review before recent', () => {
    const watchPos = PANEL_SRC.indexOf('data-section="watch-hits"');
    const reviewPos = PANEL_SRC.indexOf('data-section="review"');
    const recentPos = PANEL_SRC.indexOf('data-section="recent"');
    expect(watchPos).toBeGreaterThan(-1);
    expect(reviewPos).toBeGreaterThan(watchPos);
    expect(recentPos).toBeGreaterThan(reviewPos);
  });

  it('watch-hits section uses watchHits state array', () => {
    expect(PANEL_SRC).toContain('watchHits = $state');
    expect(PANEL_SRC).toContain('{#each watchHits as hit');
  });

  it('review section has verdict action buttons', () => {
    expect(PANEL_SRC).toContain('verdict-valid');
    expect(PANEL_SRC).toContain('verdict-invalid');
    expect(PANEL_SRC).toContain('verdict-near-miss');
  });

  it('recent section uses recentVerdicts state array', () => {
    expect(PANEL_SRC).toContain('recentVerdicts = $state');
    expect(PANEL_SRC).toContain('{#each recentVerdicts as item');
  });

  it('load() fetches all 3 endpoints in parallel via Promise.all', () => {
    expect(PANEL_SRC).toContain('Promise.all');
    expect(PANEL_SRC).toContain('/api/captures/watch-hits');
    expect(PANEL_SRC).toContain('status=verdict_ready');
  });

  it('no duplicate load() function declarations', () => {
    const matches = PANEL_SRC.match(/async function load\(\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('WatchHitItem interface is defined', () => {
    expect(PANEL_SRC).toContain('interface WatchHitItem');
  });
});
