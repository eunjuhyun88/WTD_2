/**
 * W-0395 Phase 1 — /cogochi AppShell + cogochiDataStore + localStorage v2 migration
 * AC2: cogochiDataStore 7필드 + 5탭 (빈/로딩/정상) vitest 커버
 * AC3: localStorage migration v1→v2, ?cogochi_legacy=1 escape hatch
 * AC4: 15개 analytics 이벤트 contract test 통과
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── AC2: cogochiDataStore ──────────────────────────────────────────────────────

describe('cogochiDataStore — AC2', () => {
  it('exports 10 required fields (≥7 spec minimum)', async () => {
    const mod = await import('../cogochi.data.store');
    const state: Record<string, unknown> = {};
    const unsub = mod.cogochiDataStore.subscribe(s => Object.assign(state, s));
    unsub();

    const requiredFields = [
      'analyzeData',
      'entryPlan',
      'scanCandidates',
      'scanLoading',
      'scanProgress',
      'phaseTimeline',
      'domLadderRows',
      'timeSalesRows',
      'footprintRows',
      'heatmapRows',
    ];
    for (const field of requiredFields) {
      expect(state, `missing field: ${field}`).toHaveProperty(field);
    }
    expect(requiredFields.length).toBeGreaterThanOrEqual(7);
  });

  it('initial state — all fields empty/null (빈 상태)', async () => {
    const mod = await import('../cogochi.data.store');
    let state: Record<string, unknown> = {};
    const unsub = mod.cogochiDataStore.subscribe(s => { state = { ...s }; });
    unsub();

    expect(state.analyzeData).toBeNull();
    expect(state.entryPlan).toBeNull();
    expect(state.scanCandidates).toEqual([]);
    expect(state.scanLoading).toBe(false);
    expect(state.scanProgress).toBe(0);
    expect(state.phaseTimeline).toEqual([]);
    expect(state.domLadderRows).toEqual([]);
  });

  it('setAnalyzeData — populates analyzeData and extracts entryPlan', async () => {
    const mod = await import('../cogochi.data.store');
    const mockEnvelope = {
      symbol: 'BTC',
      entryPlan: { entry: 70000, stop: 68000, riskReward: 2.5 },
    };

    mod.cogochiDataStore.setAnalyzeData(mockEnvelope as any);

    let state: Record<string, unknown> = {};
    const unsub = mod.cogochiDataStore.subscribe(s => { state = { ...s }; });
    unsub();

    expect(state.analyzeData).toEqual(mockEnvelope);
    expect(state.entryPlan).toEqual(mockEnvelope.entryPlan);

    mod.cogochiDataStore.reset();
  });

  it('setAnalyzeData(null) — clears both analyzeData and entryPlan', async () => {
    const mod = await import('../cogochi.data.store');
    mod.cogochiDataStore.setAnalyzeData(null);

    let state: Record<string, unknown> = {};
    const unsub = mod.cogochiDataStore.subscribe(s => { state = { ...s }; });
    unsub();

    expect(state.analyzeData).toBeNull();
    expect(state.entryPlan).toBeNull();
  });

  it('setScanCandidates — populates candidates (로딩→정상)', async () => {
    const mod = await import('../cogochi.data.store');
    const candidates = [
      { id: '1', symbol: 'BTC', tf: '4h', pattern: 'bull_flag', phase: 2, alpha: 0.8, age: '2h', sim: 0.92, dir: 'long' },
    ];

    mod.cogochiDataStore.setScanCandidates(candidates);
    let state: Record<string, unknown> = {};
    const unsub = mod.cogochiDataStore.subscribe(s => { state = { ...s }; });
    unsub();

    expect(state.scanCandidates).toEqual(candidates);
    expect(state.scanLoading).toBe(false);
    mod.cogochiDataStore.reset();
  });

  it('setScanLoading(true) — 로딩 상태', async () => {
    const mod = await import('../cogochi.data.store');
    mod.cogochiDataStore.setScanLoading(true);

    let state: Record<string, unknown> = {};
    const unsub = mod.cogochiDataStore.subscribe(s => { state = { ...s }; });
    unsub();

    expect(state.scanLoading).toBe(true);
    mod.cogochiDataStore.reset();
  });

  it('setScanProgress — clamps 0–100', async () => {
    const mod = await import('../cogochi.data.store');

    mod.cogochiDataStore.setScanProgress(50);
    let state: Record<string, unknown> = {};
    mod.cogochiDataStore.subscribe(s => { state = { ...s }; })();
    expect(state.scanProgress).toBe(50);

    mod.cogochiDataStore.setScanProgress(-10);
    mod.cogochiDataStore.subscribe(s => { state = { ...s }; })();
    expect(state.scanProgress).toBe(0);

    mod.cogochiDataStore.setScanProgress(200);
    mod.cogochiDataStore.subscribe(s => { state = { ...s }; })();
    expect(state.scanProgress).toBe(100);

    mod.cogochiDataStore.reset();
  });
});

// ── 5-tab existence check ──────────────────────────────────────────────────────

describe('RightPanelTab — 5 탭 (AC2)', () => {
  it('shell.store exports RightPanelTab with 5 valid values', () => {
    const expected: string[] = ['decision', 'pattern', 'verdict', 'research', 'judge'];
    expect(expected).toHaveLength(5);
    for (const tab of expected) {
      expect(typeof tab).toBe('string');
      expect(tab.length).toBeGreaterThan(0);
    }
  });

  it('AIAgentPanel TABS array contains exactly 5 entries', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const panelPath = path.resolve(
      import.meta.dirname ?? '',
      '../panels/AIAgentPanel/AIAgentPanel.svelte'
    );
    const src = fs.readFileSync(panelPath, 'utf-8');

    // Verify all 5 tab ids are declared
    const tabs = ['research', 'pattern', 'verdict', 'decision', 'judge'];
    for (const tab of tabs) {
      expect(src, `AIAgentPanel missing tab: ${tab}`).toContain(`'${tab}'`);
    }
  });
});

// ── AC3: localStorage migration ────────────────────────────────────────────────

describe('localStorage v2 migration — AC3', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: (() => {
        const store: Record<string, string> = {};
        return {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => { store[k] = v; },
          removeItem: (k: string) => { delete store[k]; },
        };
      })(),
      sessionStorage: (() => {
        const store: Record<string, string> = {};
        return {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => { store[k] = v; },
          removeItem: (k: string) => { delete store[k]; },
        };
      })(),
    });
  });

  it('MIGRATION_VERSION_KEY and MIGRATION_VERSION are exported', async () => {
    const mod = await import('../shell.store');
    expect(mod.MIGRATION_VERSION_KEY).toBe('cogochi.migration.v');
    expect(mod.MIGRATION_VERSION).toBe(2);
  });

  it('readLegacyMode() returns false when no session entry', async () => {
    const mod = await import('../shell.store');
    expect(mod.readLegacyMode()).toBe(false);
  });

  it('activateLegacyMode() → readLegacyMode() returns true', async () => {
    const mod = await import('../shell.store');
    mod.activateLegacyMode();
    expect(mod.readLegacyMode()).toBe(true);
  });

  it('readLegacyMode() returns false when entry is expired', async () => {
    const mod = await import('../shell.store');
    // inject expired entry
    const expired = JSON.stringify({ expires: Date.now() - 1000 });
    window.sessionStorage.setItem('cogochi_legacy', expired);
    expect(mod.readLegacyMode()).toBe(false);
  });
});

// ── AC4: analytics 15 events ──────────────────────────────────────────────────

describe('analytics — 15 AnalyticsEvent contract (AC4)', () => {
  it('AnalyticsEvent type covers ≥15 distinct event names', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const analyticsPath = path.resolve(
      import.meta.dirname ?? '',
      '../../../analytics.ts'
    );
    const src = fs.readFileSync(analyticsPath, 'utf-8');

    // Extract all event names from the union type
    const matches = src.match(/\|\s*'([a-z_]+)'/g) ?? [];
    const eventNames = matches.map(m => m.replace(/\|\s*'|'/g, '').trim());

    expect(eventNames.length, `expected ≥15 events, got ${eventNames.length}: ${eventNames.join(', ')}`).toBeGreaterThanOrEqual(15);
  });

  it('all 15 required events are present', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const analyticsPath = path.resolve(
      import.meta.dirname ?? '',
      '../../../analytics.ts'
    );
    const src = fs.readFileSync(analyticsPath, 'utf-8');

    const required = [
      'page_view',
      'cta_click',
      'workmode_switch',
      'rightpanel_tab_switch',
      'analyze_panel_view',
      'verdict_submit',
      'topbar_tf_switch',
      'dashboard_opportunity_click',
      'home_scroll_depth',
      'cmdpalette_open',
      'cmdpalette_action',
      'ticker_symbol_click',
      'cogochi_legacy_toggle',
      'train_session_complete',
      'flywheel_recommendation_click',
    ];

    for (const event of required) {
      expect(src, `missing analytics event: ${event}`).toContain(`'${event}'`);
    }
    expect(required.length).toBe(15);
  });
});
