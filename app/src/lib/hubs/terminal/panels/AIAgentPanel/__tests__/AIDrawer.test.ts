import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve(__dirname, '..');

const DRAWER_SRC = readFileSync(resolve(DIR, 'AIDrawer.svelte'), 'utf-8');
const PANEL_SRC  = readFileSync(resolve(DIR, 'AIAgentPanel.svelte'), 'utf-8');

/**
 * W-0402 PR10: AIDrawer structural tests
 * Uses readFileSync to verify source without DOM — matches project test convention.
 */
describe('AIDrawer — W-0402 PR10 slide-out drawer', () => {

  // ── Component exists and has correct props ────────────────────────────────

  it('AC1: AIDrawer accepts open, tab, and onClose props', () => {
    expect(DRAWER_SRC).toContain('open: boolean');
    expect(DRAWER_SRC).toContain('tab: string | null');
    expect(DRAWER_SRC).toContain('onClose: () => void');
  });

  // ── Visibility: hidden when closed (translateX(100%)), visible when open ──

  it('AC2: drawer is hidden off-screen when closed via translateX(100%)', () => {
    expect(DRAWER_SRC).toContain('transform: translateX(100%)');
  });

  it('AC2: drawer slides in when open class is set (translateX(0))', () => {
    expect(DRAWER_SRC).toContain('transform: translateX(0)');
    expect(DRAWER_SRC).toContain('.ai-drawer.open');
  });

  // ── Transition timing ─────────────────────────────────────────────────────

  it('AC3: transition is 200ms ease', () => {
    expect(DRAWER_SRC).toContain('transition: transform 200ms ease');
  });

  // ── Escape key dismissal ──────────────────────────────────────────────────

  it('AC4: Escape key calls onClose via svelte:window onkeydown handler', () => {
    expect(DRAWER_SRC).toContain("e.key === 'Escape'");
    expect(DRAWER_SRC).toContain('onClose()');
    expect(DRAWER_SRC).toContain('svelte:window');
  });

  // ── Backdrop click dismissal ──────────────────────────────────────────────

  it('AC5: backdrop button exists and calls onBackdropClick → onClose', () => {
    expect(DRAWER_SRC).toContain('ai-drawer-backdrop');
    expect(DRAWER_SRC).toContain('onBackdropClick');
    // onBackdropClick body calls onClose()
    expect(DRAWER_SRC).toMatch(/function onBackdropClick[\s\S]*?onClose\(\)/);
  });

  // ── Close button ──────────────────────────────────────────────────────────

  it('AC6: close button with aria-label="Close AI drawer" calls onClose', () => {
    expect(DRAWER_SRC).toContain('aria-label="Close AI drawer"');
    expect(DRAWER_SRC).toContain('onclick={onClose}');
  });

  // ── Width ─────────────────────────────────────────────────────────────────

  it('AC7: drawer width uses --ai-w CSS variable (320px)', () => {
    expect(DRAWER_SRC).toContain('width: var(--ai-w, 320px)');
  });

  // ── Tab content: all 5 tabs have placeholder rows ─────────────────────────

  it('AC8: all 5 tab IDs have content defined in TAB_ROWS', () => {
    expect(DRAWER_SRC).toContain("decision:");
    expect(DRAWER_SRC).toContain("pattern:");
    expect(DRAWER_SRC).toContain("verdict:");
    expect(DRAWER_SRC).toContain("research:");
    expect(DRAWER_SRC).toContain("judge:");
  });

  it('AC9: each tab shows "{TAB} — drill-down details (placeholder)" subtitle', () => {
    expect(DRAWER_SRC).toContain('drill-down details (placeholder)');
  });

  // ── A11y ──────────────────────────────────────────────────────────────────

  it('AC10: drawer has role="dialog" and aria-modal="true"', () => {
    expect(DRAWER_SRC).toContain('role="dialog"');
    expect(DRAWER_SRC).toContain('aria-modal="true"');
  });

  // ── Position: overlay (not push) ─────────────────────────────────────────

  it('AC11: drawer is position absolute (overlays, does not push content)', () => {
    expect(DRAWER_SRC).toContain('position: absolute');
  });

  // ── Design tokens ─────────────────────────────────────────────────────────

  it('AC12: uses --surface-1, --border-subtle, --text-primary design tokens', () => {
    expect(DRAWER_SRC).toContain('--surface-1');
    expect(DRAWER_SRC).toContain('--border-subtle');
    expect(DRAWER_SRC).toContain('--text-primary');
  });

  it('AC13: no raw px font sizes below 11px (uses var(--ui-text-xs) instead)', () => {
    // Match font-size: Npx where N < 11 — should be absent
    const smallFontRx = /font-size:\s*([1-9]|10)px/g;
    expect(smallFontRx.test(DRAWER_SRC)).toBe(false);
  });

  // ── AIAgentPanel wiring ───────────────────────────────────────────────────

  it('AC14: AIAgentPanel imports AIDrawer and mounts it', () => {
    expect(PANEL_SRC).toContain("import AIDrawer from './AIDrawer.svelte'");
    expect(PANEL_SRC).toContain('<AIDrawer');
  });

  it('AC15: openDrawer() sets aiDrawerOpen=true and aiDrawerTab=tab', () => {
    expect(PANEL_SRC).toContain('aiDrawerOpen = true');
    expect(PANEL_SRC).toContain('aiDrawerTab  = tab');
  });

  it('AC16: all 5 tabs have a Details/openDrawer button in AIAgentPanel', () => {
    expect(PANEL_SRC).toContain("openDrawer('decision')");
    expect(PANEL_SRC).toContain("openDrawer('pattern')");
    expect(PANEL_SRC).toContain("openDrawer('verdict')");
    expect(PANEL_SRC).toContain("openDrawer('research')");
    expect(PANEL_SRC).toContain("openDrawer('judge')");
  });
});
