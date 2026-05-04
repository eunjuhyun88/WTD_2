import { describe, it, expect } from 'vitest';

/**
 * PR6-AC3: Instance label suffix derivation logic.
 * When ≥2 instances share the same engineKey, each gets a "#N" suffix.
 * Single-instance families get an empty suffix.
 */

interface MockInstance {
  instanceId: string;
  engineKey: string;
  style: { visible: boolean };
  params: Record<string, number | string | boolean>;
}

const SUB_PANE_KINDS = new Set(['rsi', 'macd', 'oi', 'cvd', 'derivatives']);

/** Extracted pure function matching ChartBoard instanceLabelSuffix derivation. */
function deriveInstanceLabelSuffix(instances: MockInstance[]): Map<string, string> {
  const subInsts = instances.filter(
    (i) => i.style.visible && SUB_PANE_KINDS.has(i.engineKey),
  );
  const counts = new Map<string, number>();
  for (const inst of subInsts) counts.set(inst.engineKey, (counts.get(inst.engineKey) ?? 0) + 1);
  const idx = new Map<string, number>();
  const result = new Map<string, string>();
  for (const inst of subInsts) {
    const total = counts.get(inst.engineKey) ?? 1;
    if (total >= 2) {
      const n = (idx.get(inst.engineKey) ?? 0) + 1;
      idx.set(inst.engineKey, n);
      result.set(inst.instanceId, ` #${n}`);
    } else {
      result.set(inst.instanceId, '');
    }
  }
  return result;
}

describe('deriveInstanceLabelSuffix (PR6-AC3)', () => {
  it('returns empty suffix when only one instance of a family', () => {
    const instances: MockInstance[] = [
      { instanceId: 'a1', engineKey: 'rsi', style: { visible: true }, params: { period: 14 } },
    ];
    const result = deriveInstanceLabelSuffix(instances);
    expect(result.get('a1')).toBe('');
  });

  it('returns #1 and #2 when same family has two instances', () => {
    const instances: MockInstance[] = [
      { instanceId: 'r1', engineKey: 'rsi', style: { visible: true }, params: { period: 14 } },
      { instanceId: 'r2', engineKey: 'rsi', style: { visible: true }, params: { period: 21 } },
    ];
    const result = deriveInstanceLabelSuffix(instances);
    expect(result.get('r1')).toBe(' #1');
    expect(result.get('r2')).toBe(' #2');
  });

  it('returns #1 #2 #3 for three instances of same family', () => {
    const instances: MockInstance[] = [
      { instanceId: 'm1', engineKey: 'macd', style: { visible: true }, params: { fast: 12, slow: 26 } },
      { instanceId: 'm2', engineKey: 'macd', style: { visible: true }, params: { fast: 5, slow: 13 } },
      { instanceId: 'm3', engineKey: 'macd', style: { visible: true }, params: { fast: 8, slow: 21 } },
    ];
    const result = deriveInstanceLabelSuffix(instances);
    expect(result.get('m1')).toBe(' #1');
    expect(result.get('m2')).toBe(' #2');
    expect(result.get('m3')).toBe(' #3');
  });

  it('handles mixed families independently', () => {
    const instances: MockInstance[] = [
      { instanceId: 'r1', engineKey: 'rsi', style: { visible: true }, params: { period: 14 } },
      { instanceId: 'r2', engineKey: 'rsi', style: { visible: true }, params: { period: 21 } },
      { instanceId: 'o1', engineKey: 'oi', style: { visible: true }, params: { window: 7 } },
    ];
    const result = deriveInstanceLabelSuffix(instances);
    expect(result.get('r1')).toBe(' #1');
    expect(result.get('r2')).toBe(' #2');
    expect(result.get('o1')).toBe(''); // single oi instance — no suffix
  });

  it('excludes invisible instances from label derivation', () => {
    const instances: MockInstance[] = [
      { instanceId: 'r1', engineKey: 'rsi', style: { visible: true }, params: { period: 14 } },
      { instanceId: 'r2', engineKey: 'rsi', style: { visible: false }, params: { period: 21 } },
    ];
    const result = deriveInstanceLabelSuffix(instances);
    expect(result.get('r1')).toBe(''); // only one visible — no suffix
    expect(result.has('r2')).toBe(false); // invisible — not in result
  });

  it('excludes non-sub-pane kinds', () => {
    const instances: MockInstance[] = [
      { instanceId: 'e1', engineKey: 'ema', style: { visible: true }, params: { period: 20 } },
      { instanceId: 'e2', engineKey: 'ema', style: { visible: true }, params: { period: 50 } },
    ];
    const result = deriveInstanceLabelSuffix(instances);
    // ema is not in SUB_PANE_KINDS — neither should appear
    expect(result.has('e1')).toBe(false);
    expect(result.has('e2')).toBe(false);
  });
});
