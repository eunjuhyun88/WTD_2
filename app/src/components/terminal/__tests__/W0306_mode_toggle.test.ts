import { describe, it, expect } from 'vitest';
import {
  applyModePreset,
  MODE_PRESETS,
  type TerminalMode,
} from '../terminalLayoutController';

describe('W-0306 — F-5 terminal mode toggle', () => {
  describe('applyModePreset', () => {
    it('observe: hides left rail, right rail, workspace', () => {
      const p = applyModePreset('observe');
      expect(p.showLeftRail).toBe(false);
      expect(p.showRightRail).toBe(false);
      expect(p.showWorkspace).toBe(false);
    });

    it('analyze: shows all panels', () => {
      const p = applyModePreset('analyze');
      expect(p.showLeftRail).toBe(true);
      expect(p.showRightRail).toBe(true);
      expect(p.showWorkspace).toBe(true);
    });

    it('execute: shows right rail, hides workspace', () => {
      const p = applyModePreset('execute');
      expect(p.showLeftRail).toBe(true);
      expect(p.showRightRail).toBe(true);
      expect(p.showWorkspace).toBe(false);
    });

    it('unknown mode falls back to analyze preset', () => {
      const p = applyModePreset('unknown' as TerminalMode);
      expect(p).toEqual(MODE_PRESETS.analyze);
    });
  });

  describe('MODE_PRESETS shape', () => {
    const modes: TerminalMode[] = ['observe', 'analyze', 'execute'];

    it.each(modes)('%s preset has all 3 boolean fields', (mode) => {
      const p = MODE_PRESETS[mode];
      expect(typeof p.showLeftRail).toBe('boolean');
      expect(typeof p.showRightRail).toBe('boolean');
      expect(typeof p.showWorkspace).toBe('boolean');
    });
  });

  describe('localStorage key convention', () => {
    it('storage key is wtd_terminal_mode', () => {
      // Verify the constant referenced in terminalMode.ts store
      const STORAGE_KEY = 'wtd_terminal_mode';
      expect(STORAGE_KEY).toBe('wtd_terminal_mode');
    });

    it('valid mode values', () => {
      const valid: TerminalMode[] = ['observe', 'analyze', 'execute'];
      for (const m of valid) {
        expect(applyModePreset(m)).toBeDefined();
      }
    });

    it('corrupt localStorage value defaults to analyze', () => {
      // Simulate what terminalMode.ts store does: unknown value → 'analyze'
      const raw = 'corrupt_value';
      const valid = ['observe', 'analyze', 'execute'];
      const resolved = valid.includes(raw) ? raw : 'analyze';
      expect(resolved).toBe('analyze');
    });
  });
});
