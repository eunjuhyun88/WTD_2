import {
  buildDeepLink,
  buildTerminalLink,
  buildLabLink,
  buildDashboardLink,
} from '$lib/utils/deepLinks';

export type AppSurfaceId = 'home' | 'dashboard' | 'terminal' | 'scanner' | 'lab' | 'passport' | 'patterns';

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
    description: 'my stuff inbox — saved setups, live watches, next actions',
    homeDetail: 'my inbox',
    href: buildDashboardLink(),
    activePatterns: ['/dashboard'],
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    shortLabel: 'TERM',
    mobileIcon: '~',
    description: 'review + capture — chart, inspect, save setup',
    homeDetail: 'review & capture',
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
    description: 'evaluate + inspect + iterate — run and compare setups',
    homeDetail: 'evaluate setups',
    href: buildLabLink(),
    activePatterns: ['/lab'],
    highlight: true,
  },
  passport: {
    id: 'passport',
    label: 'Passport',
    shortLabel: 'PASS',
    mobileIcon: '◈',
    description: 'your identity — wallet, achievements, strategy passport',
    homeDetail: 'my passport',
    href: buildDeepLink('/passport'),
    activePatterns: ['/passport'],
  },
  patterns: {
    id: 'patterns',
    label: 'Patterns',
    shortLabel: 'PAT',
    mobileIcon: '◎',
    description: 'pattern engine — live phase states, entry candidates, verdict ledger',
    homeDetail: 'pattern library',
    href: '/patterns',
    activePatterns: ['/patterns'],
  },
};

// Day-1 IA: TERMINAL > LAB > DASHBOARD
export const DESKTOP_NAV_SURFACES = [
  SURFACE_MAP.terminal,
  SURFACE_MAP.patterns,
  SURFACE_MAP.lab,
  SURFACE_MAP.dashboard,
] as const;

// Mobile nav: Home | Terminal | Dashboard | Passport (+ More popover in component)
export const MOBILE_NAV_SURFACES = [
  SURFACE_MAP.home,
  SURFACE_MAP.terminal,
  SURFACE_MAP.dashboard,
  SURFACE_MAP.passport,
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
