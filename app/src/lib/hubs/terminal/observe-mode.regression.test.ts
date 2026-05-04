/**
 * PR8-AC3: observe-mode .chart-header--tv regression test.
 *
 * W-0402 lesson: CSS in observe-mode accidentally hid .chart-header--tv with
 * `display: none`. This test reads the TerminalHub.svelte source and asserts
 * that no such rule exists anywhere in the terminal hub CSS files.
 *
 * Static source-code check — no DOM required.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TERMINAL_DIR = __dirname;

function readSrc(filename: string): string {
  return readFileSync(resolve(TERMINAL_DIR, filename), 'utf8');
}

describe('observe-mode .chart-header--tv regression (PR8-AC3)', () => {
  it('TerminalHub.svelte has no .chart-header--tv display:none rule', () => {
    const src = readSrc('TerminalHub.svelte');

    // The regression pattern: .chart-header--tv { display: none } (with any whitespace)
    const badPattern = /\.chart-header--tv\s*\{[^}]*display\s*:\s*none/;
    expect(
      badPattern.test(src),
      'Found .chart-header--tv { display: none } in TerminalHub.svelte — this hides the chart header in observe mode',
    ).toBe(false);
  });

  it('TerminalHub.svelte contains the observe-mode work-mode logic', () => {
    const src = readSrc('TerminalHub.svelte');
    // workMode is wired — confirm it's referenced in the template/script
    expect(src).toContain('workMode');
  });

  it('TerminalHub.svelte has no observe class that could hide chart-header', () => {
    const src = readSrc('TerminalHub.svelte');
    // Ensure there's no CSS rule where .observe or [data-mode="observe"] hides chart-header--tv
    const hiddenInObserve = /\.observe[^}]*\.chart-header--tv[^}]*display\s*:\s*none|\.chart-header--tv[^}]*\.observe[^}]*display\s*:\s*none/s;
    expect(hiddenInObserve.test(src)).toBe(false);
  });

  it('StatusBar.svelte contains HoldTimeStrip (PR8-AC4)', () => {
    const src = readSrc('StatusBar.svelte');
    expect(src).toContain('HoldTimeStrip');
    expect(src).toContain('holdP50');
    expect(src).toContain('holdP90');
  });

  it('telemetry.ts exports trackPanelFoldToggle with dual-emit (PR8-AC5)', () => {
    const src = readSrc('telemetry.ts');
    expect(src).toContain('trackPanelFoldToggle');
    expect(src).toContain('panel_fold_toggle');
    expect(src).toContain('wave6.panel_fold_toggle');
    expect(src).toContain('PanelFoldToggleSchema');
  });

  it('TerminalHub.svelte wires trackPanelFoldToggle on keyboard shortcuts (PR8-AC1)', () => {
    const src = readSrc('TerminalHub.svelte');
    // All 4 shortcuts should trigger telemetry
    expect(src).toContain("key: '⌘['");
    expect(src).toContain("key: '⌘]'");
    expect(src).toContain("key: '⌘\\\\'");
    expect(src).toContain("key: '⌘0'");
  });
});
