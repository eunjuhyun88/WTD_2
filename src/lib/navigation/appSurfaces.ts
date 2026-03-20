import {
  buildAgentLink,
  buildBattleLink,
  buildCreateLink,
  buildMarketLink,
  buildDeepLink,
  buildTerminalLink,
  buildWorldLink,
} from '$lib/utils/deepLinks';

export type AppSurfaceId = 'home' | 'create' | 'terminal' | 'world' | 'battle' | 'agent' | 'market';

export interface AppSurface {
  id: AppSurfaceId;
  label: string;
  shortLabel: string;
  mobileIcon: string;
  description: string;
  homeDetail: string;
  href: string;
  activePatterns: string[];
}

const SURFACE_MAP: Record<AppSurfaceId, AppSurface> = {
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'HOME',
    mobileIcon: '⌂',
    description: 'understand the loop and choose a first action',
    homeDetail: 'start here',
    href: buildDeepLink('/'),
    activePatterns: ['/'],
  },
  create: {
    id: 'create',
    label: 'Create',
    shortLabel: 'CRT',
    mobileIcon: '+',
    description: 'mint the character-agent and bind the brain',
    homeDetail: 'mint and bind',
    href: buildCreateLink(),
    activePatterns: ['/create'],
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    shortLabel: 'TERM',
    mobileIcon: '~',
    description: 'train the brain and inspect readiness',
    homeDetail: 'train the brain',
    href: buildTerminalLink(),
    activePatterns: ['/terminal'],
  },
  world: {
    id: 'world',
    label: 'World',
    shortLabel: 'WRLD',
    mobileIcon: '◎',
    description: 'deploy the run and follow the chart-map',
    homeDetail: 'deploy the run',
    href: buildWorldLink(),
    activePatterns: ['/world'],
  },
  battle: {
    id: 'battle',
    label: 'Battle',
    shortLabel: 'BTTL',
    mobileIcon: '⚔',
    description: 'resolve whale encounters under pressure',
    homeDetail: 'resolve encounter',
    href: buildBattleLink(),
    activePatterns: ['/arena', '/arena-war', '/arena-v2'],
  },
  agent: {
    id: 'agent',
    label: 'Agent',
    shortLabel: 'AGENT',
    mobileIcon: '@',
    description: 'grow proof, train memory, and manage release state',
    homeDetail: 'prove and grow',
    href: buildAgentLink(),
    activePatterns: ['/agent', '/lab', '/passport', '/agents'],
  },
  market: {
    id: 'market',
    label: 'Market',
    shortLabel: 'MKT',
    mobileIcon: '#',
    description: 'follow signals, proof, and public trust',
    homeDetail: 'signals and proof',
    href: buildMarketLink(),
    activePatterns: ['/signals', '/market', '/oracle', '/creator'],
  },
};

export const DESKTOP_NAV_SURFACES = [
  SURFACE_MAP.create,
  SURFACE_MAP.terminal,
  SURFACE_MAP.world,
  SURFACE_MAP.agent,
] as const;

export const MOBILE_NAV_SURFACES = [
  SURFACE_MAP.home,
  SURFACE_MAP.create,
  SURFACE_MAP.terminal,
  SURFACE_MAP.world,
  SURFACE_MAP.agent,
] as const;

export const HOME_SURFACES = [
  SURFACE_MAP.create,
  SURFACE_MAP.terminal,
  SURFACE_MAP.world,
  SURFACE_MAP.battle,
  SURFACE_MAP.agent,
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
