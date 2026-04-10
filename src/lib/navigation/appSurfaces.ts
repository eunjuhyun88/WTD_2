import {
  buildAgentLink,
  buildBattleLink,
  buildMarketLink,
  buildDeepLink,
  buildTerminalLink,
  buildLabLink,
  buildDashboardLink,
  buildCopyLink,
} from '$lib/utils/deepLinks';

export type AppSurfaceId = 'home' | 'dashboard' | 'terminal' | 'scanner' | 'lab' | 'battle' | 'agent' | 'market' | 'copy';

export interface AppSurface {
  id: AppSurfaceId;
  label: string;
  shortLabel: string;
  mobileIcon: string;
  description: string;
  homeDetail: string;
  href: string;
  activePatterns: string[];
  /** When true, this tab gets accent-color highlighting in nav */
  highlight?: boolean;
}

const SURFACE_MAP: Record<AppSurfaceId, AppSurface> = {
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'HOME',
    mobileIcon: '⌂',
    description: 'landing — choose builder or copier path',
    homeDetail: 'start here',
    href: buildDeepLink('/'),
    activePatterns: ['/'],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'DASH',
    mobileIcon: '◻',
    description: 'daily hub — agent status, battle quota, revenue',
    homeDetail: 'daily hub',
    href: buildDashboardLink(),
    activePatterns: ['/dashboard'],
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    shortLabel: 'TERM',
    mobileIcon: '~',
    description: 'chart analysis — CVD, OI, Funding, Zone social',
    homeDetail: 'chart analysis',
    href: buildTerminalLink(),
    activePatterns: ['/terminal'],
  },
  scanner: {
    id: 'scanner',
    label: 'Scanner',
    shortLabel: 'SCAN',
    mobileIcon: '⊞',
    description: 'multi-coin scanner — 15-layer analysis, filters, watchlist',
    homeDetail: 'market scanner',
    href: buildTerminalLink(),
    activePatterns: ['/scanner', '/terminal', '/cogochi/scanner'],
  },
  lab: {
    id: 'lab',
    label: 'Lab',
    shortLabel: 'LAB',
    mobileIcon: '⚗',
    description: 'main screen — backtest, delta, Run Again',
    homeDetail: 'backtest & train',
    href: buildLabLink(),
    activePatterns: ['/lab'],
    highlight: true,
  },
  battle: {
    id: 'battle',
    label: 'Battle',
    shortLabel: 'BTTL',
    mobileIcon: '⚔',
    description: 'prove lab results under pressure — ERA battles',
    homeDetail: 'prove & battle',
    href: buildBattleLink(),
    activePatterns: ['/battle'],
  },
  agent: {
    id: 'agent',
    label: 'Agent',
    shortLabel: 'AGNT',
    mobileIcon: '@',
    description: 'agent HQ — doctrine, memory cards, versions',
    homeDetail: 'manage agents',
    href: buildAgentLink(),
    activePatterns: ['/agent', '/agents', '/passport'],
  },
  market: {
    id: 'market',
    label: 'Market',
    shortLabel: 'MKT',
    mobileIcon: '#',
    description: 'marketplace — browse and subscribe proven agents',
    homeDetail: 'agent marketplace',
    href: buildMarketLink(),
    activePatterns: ['/market'],
  },
  copy: {
    id: 'copy',
    label: 'Copy',
    shortLabel: 'COPY',
    mobileIcon: '↗',
    description: 'copy trading — subscribed agent positions & PnL',
    homeDetail: 'copy trading',
    href: buildCopyLink(),
    activePatterns: ['/copy'],
  },
};

// 제품 재구성: TERMINAL > SCANNER > LAB > DASHBOARD
export const DESKTOP_NAV_SURFACES = [
  SURFACE_MAP.terminal,
  SURFACE_MAP.lab,
  SURFACE_MAP.dashboard,
] as const;

export const MOBILE_NAV_SURFACES = [
  SURFACE_MAP.terminal,
  SURFACE_MAP.lab,
  SURFACE_MAP.dashboard,
] as const;

export const HOME_SURFACES = [
  SURFACE_MAP.terminal,
  SURFACE_MAP.lab,
] as const;

export function getAppSurface(id: AppSurfaceId): AppSurface {
  return SURFACE_MAP[id];
}

export function isAppSurfaceActive(id: AppSurfaceId, pathname: string): boolean {
  const surface = SURFACE_MAP[id];
  return surface.activePatterns.some((pattern) => matchesPattern(pathname, pattern));
}

function matchesPattern(pathname: string, pattern: string): boolean {
  return pathname === pattern || pathname.startsWith(`${pattern}/`);
}
