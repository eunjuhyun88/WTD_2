/**
 * W-0395 Ph1 PR5 — AC2: HoldTimeStrip color threshold vitest
 *
 * Tests the color() logic in HoldTimeStrip.svelte via source-level regex,
 * matching the three cases:
 *   < 5h  → --g4   (green / neutral)
 *   5-20h → --amb  (amber)
 *   > 20h → --neg  (red)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const STRIP_SRC = readFileSync(
  resolve(__dirname, '../HoldTimeStrip.svelte'),
  'utf-8',
);

describe('HoldTimeStrip — W-0395 AC2 color thresholds', () => {
  it('AC2-case1: v < 5 → --g4 (neutral / short hold)', () => {
    // color fn returns g4 for small values
    expect(STRIP_SRC).toContain("if (v < 5) return 'var(--g4");
  });

  it('AC2-case2: 5 <= v < 20 → --amb (amber / medium hold)', () => {
    expect(STRIP_SRC).toContain("if (v < 20) return 'var(--amb");
  });

  it('AC2-case3: v >= 20 → --neg (red / long hold overdue)', () => {
    expect(STRIP_SRC).toContain("return 'var(--neg");
  });

  it('AC1: null → "—" display', () => {
    expect(STRIP_SRC).toContain("v == null ? '—'");
  });

  it('AC1: null → g6 color (muted)', () => {
    expect(STRIP_SRC).toContain("if (v == null) return 'var(--g6");
  });
});

describe('HoldTimeStrip — structure', () => {
  it('renders p50 and p90 labels', () => {
    expect(STRIP_SRC).toContain('p50 {fmt(p50)}');
    expect(STRIP_SRC).toContain('p90 {fmt(p90)}');
  });

  it('has hold-strip class wrapper', () => {
    expect(STRIP_SRC).toContain('class="hold-strip"');
  });
});
