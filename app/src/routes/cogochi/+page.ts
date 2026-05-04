import type { PageLoad } from './$types';
import type { RightPanelTab } from '$lib/hubs/terminal/shell.store';

const SHORT_CODE_MAP: Record<string, RightPanelTab> = {
  scn: 'research',
  anl: 'decision',
  jdg: 'judge',
  pat: 'pattern',
  vdt: 'verdict',
};

const LONG_NAMES = new Set<RightPanelTab>(['research', 'decision', 'judge', 'pattern', 'verdict']);

function normalizePanel(raw: string | null): RightPanelTab | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower in SHORT_CODE_MAP) return SHORT_CODE_MAP[lower];
  if (LONG_NAMES.has(lower as RightPanelTab)) return lower as RightPanelTab;
  return null;
}

export const load: PageLoad = ({ url }) => {
  const legacy = url.searchParams.get('cogochi_legacy') === '1';
  const initialTab = normalizePanel(url.searchParams.get('panel'));
  // PR7-AC3: ?decide=<verdictId> — pre-open JDG decide drawer
  const decideId = url.searchParams.get('decide') ?? null;
  return { legacy, initialTab, decideId };
};
