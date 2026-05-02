/**
 * W-0389 — Typography + UX AC verification (structural/file-based).
 * AC1/2: no sub-11px font sizes | AC3: TopBar L1 ≥8 | AC4: AIAgentPanel tabs
 * AC5: badges | AC6: ChartToolbar no emoji/select | AC7: StatusBar no mode btn
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// __dirname = app/src/lib/hubs/terminal/__tests__
// ../..     = app/src/lib/hubs
const HUB_ROOT = resolve(__dirname, '../..');

function readHub(rel: string) {
  return readFileSync(resolve(HUB_ROOT, rel), 'utf-8');
}

// ── Hub files to scan for sub-11px violations ───────────────────────────────
const HUB_DIRS = ['terminal', 'dashboard', 'lab', 'patterns', 'settings'] as const;
import { readdirSync, statSync } from 'fs';

function collectSvelteFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) {
        out.push(...collectSvelteFiles(full));
      } else if (entry.endsWith('.svelte')) {
        out.push(full);
      }
    }
  } catch { /* dir may not exist */ }
  return out;
}

describe('W-0389 AC1+AC2: no sub-11px font-size in hubs', () => {
  for (const hub of HUB_DIRS) {
    it(`${hub}/ has 0 hardcoded font-size < 11px`, () => {
      const files = collectSvelteFiles(resolve(HUB_ROOT, hub));
      const violations: string[] = [];
      for (const f of files) {
        const src = readFileSync(f, 'utf-8');
        const matches = src.match(/font-size:\s*(?:[78]|9|10)px/g);
        if (matches) violations.push(`${f}: ${matches.join(', ')}`);
      }
      expect(violations, `Font violations found:\n${violations.join('\n')}`).toHaveLength(0);
    });
  }
});

describe('W-0389 AC3: TopBar L1 has symbol, TF strip, price, H/L/Vol, mode', () => {
  it('TopBar.svelte contains H, L, Vol OHLC strip and mode segmented control', () => {
    const src = readHub('terminal/TopBar.svelte');
    expect(src).toContain('ohlc-strip');
    expect(src).toContain('high24h');
    expect(src).toContain('low24h');
    expect(src).toContain('vol24h');
    expect(src).toContain('mode-strip');
    expect(src).toContain('TIMEFRAMES');
  });
});

describe('W-0389 AC4+AC5: AIAgentPanel tab order and badges', () => {
  it('AIAgentPanel has Research→Pattern→Verdict→Decision→Judge tab order', () => {
    const src = readHub('terminal/panels/AIAgentPanel/AIAgentPanel.svelte');
    const researchIdx = src.indexOf("id: 'research'");
    const patternIdx = src.indexOf("id: 'pattern'");
    const verdictIdx = src.indexOf("id: 'verdict'");
    const decisionIdx = src.indexOf("id: 'decision'");
    const judgeIdx = src.indexOf("id: 'judge'");
    expect(researchIdx).toBeLessThan(patternIdx);
    expect(patternIdx).toBeLessThan(verdictIdx);
    expect(verdictIdx).toBeLessThan(decisionIdx);
    expect(decisionIdx).toBeLessThan(judgeIdx);
  });

  it('AIAgentPanel tab labels are full-word (no abbreviations)', () => {
    const src = readHub('terminal/panels/AIAgentPanel/AIAgentPanel.svelte');
    expect(src).toContain("label: 'Research'");
    expect(src).toContain("label: 'Pattern'");
    expect(src).toContain("label: 'Verdict'");
    expect(src).toContain("label: 'Decision'");
    expect(src).toContain("label: 'Judge'");
  });

  it('AIAgentPanel has numeric badges for Pattern and Verdict tabs', () => {
    const src = readHub('terminal/panels/AIAgentPanel/AIAgentPanel.svelte');
    expect(src).toContain('tab-badge');
    expect(src).toContain('verdictCount');
    expect(src).toContain('patternRecords.length');
  });
});

describe('W-0389 AC6: ChartToolbar — no emoji, no native select', () => {
  it('L1/ChartToolbar has no emoji characters', () => {
    const src = readHub('terminal/L1/ChartToolbar.svelte');
    // Match common emoji unicode ranges (basic emoji block)
    expect(src).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it('workspace/ChartToolbar has no native <select> element', () => {
    const src = readHub('terminal/workspace/ChartToolbar.svelte');
    expect(src).not.toContain('<select');
  });

  it('workspace/ChartToolbar has no emoji characters', () => {
    const src = readHub('terminal/workspace/ChartToolbar.svelte');
    expect(src).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});

describe('W-0389 AC7: StatusBar has no mode selector buttons', () => {
  it('StatusBar has no switchMode or mode-btn references', () => {
    const src = readHub('terminal/StatusBar.svelte');
    expect(src).not.toContain('switchMode');
    expect(src).not.toContain('mode-btn');
  });
});
