import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(
  resolve(__dirname, '../CaptureReviewDrawer.svelte'),
  'utf-8',
);

/**
 * W-0354: CaptureReviewDrawer 5-verdict alignment
 * Structural tests via readFileSync — verifies source without DOM.
 */
describe('CaptureReviewDrawer — W-0354 5-verdict alignment', () => {
  it('AC1: onVerdict prop type includes all 5 labels', () => {
    expect(SRC).toContain("'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late'");
  });

  it('AC1: _submitVerdict signature includes all 5 labels', () => {
    expect(SRC).toContain("verdict: 'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late'");
  });

  it('AC1: 5 verdict buttons present', () => {
    expect(SRC).toContain("_submitVerdict('valid')");
    expect(SRC).toContain("_submitVerdict('invalid')");
    expect(SRC).toContain("_submitVerdict('near_miss')");
    expect(SRC).toContain("_submitVerdict('too_early')");
    expect(SRC).toContain("_submitVerdict('too_late')");
  });

  it('AC1: missed button absent', () => {
    // "missed" should not appear as a _submitVerdict argument
    expect(SRC).not.toContain("_submitVerdict('missed')");
  });

  it('AC4: "missed" string absent from onVerdict type and _submitVerdict signature', () => {
    // Check that neither the type union nor the submit function use "missed"
    const verdictTypeMatch = SRC.match(/onVerdict\?.*\n.*verdict:.*'missed'/);
    expect(verdictTypeMatch).toBeNull();
    const submitMatch = SRC.match(/_submitVerdict\(verdict:.*'missed'/);
    expect(submitMatch).toBeNull();
  });

  it('VERDICT_LABEL map has 5 entries, no missed', () => {
    expect(SRC).toContain('near_miss:');
    expect(SRC).toContain('too_early:');
    expect(SRC).toContain('too_late:');
    expect(SRC).not.toContain("missed:  '");
  });

  it('verdict-badge CSS covers all 5 verdicts', () => {
    expect(SRC).toContain('verdict-valid');
    expect(SRC).toContain('verdict-invalid');
    expect(SRC).toContain('verdict-near_miss');
    expect(SRC).toContain('verdict-too_early');
    expect(SRC).toContain('verdict-too_late');
    expect(SRC).not.toContain('verdict-missed');
  });

  it('AC3: all verdict buttons have min-height 44px', () => {
    expect(SRC).toContain('min-height: 44px');
  });

  it('verdict buttons use grid layout for narrow viewports', () => {
    expect(SRC).toContain('display: grid');
    expect(SRC).toContain('grid-template-columns');
  });

  it('AC2: POST body uses verdict value directly (no transformation)', () => {
    expect(SRC).toContain('JSON.stringify({ verdict, user_note');
  });

  it('tooltip titles present for context labels', () => {
    expect(SRC).toContain('title="Pattern valid, entry successful"');
    expect(SRC).toContain('title="Pattern itself was wrong"');
    expect(SRC).toContain('title="Pattern valid, narrowly missed"');
  });
});
