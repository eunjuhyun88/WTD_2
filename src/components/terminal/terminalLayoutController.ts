import { clampPercent } from './terminalHelpers';

export const BP_MOBILE = 768;
export const BP_TABLET = 1024;

export type DragTarget = 'left' | 'right' | null;
export type MobileTab = 'warroom' | 'chart' | 'intel';
export type MobileResizeAxis = 'x' | 'y';
export type DesktopPanelKey = 'left' | 'center' | 'right';
export type TabletPanelKey = 'left' | 'center' | 'bottom';
export type TabletSplitResizeAxis = 'x' | 'y';

export type MobilePanelSize = { widthPct: number; heightPct: number };
export type DesktopPanelSize = { widthPct: number; heightPct: number };
export type TabletPanelSize = { widthPct: number; heightPct: number };

export type MobileResizeState = {
  tab: MobileTab;
  axis: MobileResizeAxis;
  pointerId: number;
  startClient: number;
  startPct: number;
  basisPx: number;
};

export type MobileTouchResizeState = {
  tab: MobileTab;
  axis: MobileResizeAxis;
  touchId: number;
  startClient: number;
  startPct: number;
  basisPx: number;
};

export type TabletSplitResizeState = {
  axis: TabletSplitResizeAxis;
  pointerId: number;
  startClient: number;
  startValue: number;
};

export const MOBILE_TAB_META: Record<MobileTab, { label: string; icon: string; desc: string }> = {
  warroom: { label: 'War Room', icon: '🎖', desc: 'Signal stream and quick trade actions' },
  chart: { label: 'Chart', icon: '📊', desc: 'Execution chart with drawing and indicators' },
  intel: { label: 'Intel', icon: '🧠', desc: 'News, community and agent chat' },
};

const MOBILE_PANEL_MIN_W = 72;
const MOBILE_PANEL_MAX_W = 100;
const MOBILE_PANEL_MIN_H = 58;
const MOBILE_PANEL_MAX_H = 100;
const MOBILE_PANEL_STEP = 3;

const DESKTOP_PANEL_MIN_W = 72;
const DESKTOP_PANEL_MAX_W = 100;
const DESKTOP_PANEL_MIN_H = 64;
const DESKTOP_PANEL_MAX_H = 100;
const DESKTOP_PANEL_STEP = 3;

const TABLET_LEFT_MIN = 188;
const TABLET_LEFT_MAX = 360;
const TABLET_BOTTOM_MIN = 200;
const TABLET_BOTTOM_MAX = 360;
const TABLET_SPLIT_STEP = 12;

const MIN_LEFT = 200;
const MAX_LEFT = 450;
const MIN_RIGHT = 220;
const MAX_RIGHT = 500;

export function getViewportFlags(windowWidth: number) {
  return {
    isMobile: windowWidth < BP_MOBILE,
    isTablet: windowWidth >= BP_MOBILE && windowWidth < BP_TABLET,
    isDesktop: windowWidth >= BP_TABLET,
  };
}

export function createDefaultMobilePanelSizes(): Record<MobileTab, MobilePanelSize> {
  return {
    warroom: { widthPct: 100, heightPct: 100 },
    chart: { widthPct: 100, heightPct: 100 },
    intel: { widthPct: 100, heightPct: 100 },
  };
}

export function createDefaultDesktopPanelSizes(): Record<DesktopPanelKey, DesktopPanelSize> {
  return {
    left: { widthPct: 100, heightPct: 100 },
    center: { widthPct: 100, heightPct: 100 },
    right: { widthPct: 100, heightPct: 100 },
  };
}

export function createDefaultTabletPanelSizes(): Record<TabletPanelKey, TabletPanelSize> {
  return {
    left: { widthPct: 100, heightPct: 100 },
    center: { widthPct: 100, heightPct: 100 },
    bottom: { widthPct: 100, heightPct: 100 },
  };
}

export function getDesktopPanelStyle(
  desktopPanelSizes: Record<DesktopPanelKey, DesktopPanelSize>,
  panel: DesktopPanelKey
) {
  const size = desktopPanelSizes[panel];
  return `--desk-panel-width: ${size.widthPct}%; --desk-panel-height: ${size.heightPct}%`;
}

export function applyDesktopPanelWheelResize(
  desktopPanelSizes: Record<DesktopPanelKey, DesktopPanelSize>,
  panel: DesktopPanelKey,
  axis: 'x' | 'y',
  e: WheelEvent
) {
  const rawDelta = axis === 'x' ? (Math.abs(e.deltaX) > 0 ? e.deltaX : e.deltaY) : e.deltaY;
  if (!Number.isFinite(rawDelta) || rawDelta === 0) return null;

  const step = e.shiftKey ? DESKTOP_PANEL_STEP * 2 : DESKTOP_PANEL_STEP;
  const signed = rawDelta > 0 ? step : -step;
  const current = desktopPanelSizes[panel];

  if (axis === 'x') {
    const nextWidth = clampPercent(current.widthPct + signed, DESKTOP_PANEL_MIN_W, DESKTOP_PANEL_MAX_W);
    if (nextWidth === current.widthPct) return null;
    return {
      ...desktopPanelSizes,
      [panel]: { ...current, widthPct: nextWidth },
    };
  }

  const nextHeight = clampPercent(current.heightPct + signed, DESKTOP_PANEL_MIN_H, DESKTOP_PANEL_MAX_H);
  if (nextHeight === current.heightPct) return null;
  return {
    ...desktopPanelSizes,
    [panel]: { ...current, heightPct: nextHeight },
  };
}

export function resetDesktopPanelSize(
  desktopPanelSizes: Record<DesktopPanelKey, DesktopPanelSize>,
  panel: DesktopPanelKey
) {
  return {
    ...desktopPanelSizes,
    [panel]: { widthPct: 100, heightPct: 100 },
  };
}

export function getTabletPanelStyle(
  tabletPanelSizes: Record<TabletPanelKey, TabletPanelSize>,
  panel: TabletPanelKey
) {
  const size = tabletPanelSizes[panel];
  return `--tab-panel-width: ${size.widthPct}%; --tab-panel-height: ${size.heightPct}%`;
}

export function getDefaultTabletLeftWidth(viewportWidth?: number) {
  if (!viewportWidth) return 232;
  return Math.round(Math.min(232, Math.max(196, viewportWidth * 0.23)));
}

export function getDefaultTabletBottomHeight(viewportHeight?: number) {
  if (!viewportHeight) return 260;
  return Math.round(Math.min(280, Math.max(200, viewportHeight * 0.28)));
}

export function clampTabletLeftWidth(next: number, viewportWidth?: number) {
  if (!viewportWidth) return Math.round(Math.min(TABLET_LEFT_MAX, Math.max(TABLET_LEFT_MIN, next)));
  const dynamicMax = Math.min(TABLET_LEFT_MAX, Math.max(220, Math.round(viewportWidth * 0.36)));
  return Math.round(Math.min(dynamicMax, Math.max(TABLET_LEFT_MIN, next)));
}

export function clampTabletBottomHeight(next: number, viewportHeight?: number) {
  if (!viewportHeight) return Math.round(Math.min(TABLET_BOTTOM_MAX, Math.max(TABLET_BOTTOM_MIN, next)));
  const dynamicMax = Math.min(TABLET_BOTTOM_MAX, Math.max(196, Math.round(viewportHeight * 0.42)));
  return Math.round(Math.min(dynamicMax, Math.max(TABLET_BOTTOM_MIN, next)));
}

export function applyTabletSplitDelta(
  tabletLeftWidth: number,
  tabletBottomHeight: number,
  axis: TabletSplitResizeAxis,
  signedDelta: number,
  viewportWidth?: number,
  viewportHeight?: number
) {
  if (axis === 'x') {
    return {
      tabletLeftWidth: clampTabletLeftWidth(tabletLeftWidth + signedDelta, viewportWidth),
      tabletBottomHeight,
    };
  }

  return {
    tabletLeftWidth,
    tabletBottomHeight: clampTabletBottomHeight(tabletBottomHeight + signedDelta, viewportHeight),
  };
}

export function applyTabletPanelWheelResize(
  tabletLeftWidth: number,
  tabletBottomHeight: number,
  panel: TabletPanelKey,
  axis: 'x' | 'y',
  e: WheelEvent,
  viewportWidth?: number,
  viewportHeight?: number
) {
  const rawDelta = axis === 'x' ? (Math.abs(e.deltaX) > 0 ? e.deltaX : e.deltaY) : e.deltaY;
  if (!Number.isFinite(rawDelta) || rawDelta === 0) return null;

  const step = e.shiftKey ? TABLET_SPLIT_STEP + 8 : TABLET_SPLIT_STEP;
  const signed = rawDelta > 0 ? step : -step;

  if (axis === 'x') {
    if (panel === 'bottom') return null;
    return applyTabletSplitDelta(
      tabletLeftWidth,
      tabletBottomHeight,
      'x',
      signed,
      viewportWidth,
      viewportHeight
    );
  }

  return applyTabletSplitDelta(
    tabletLeftWidth,
    tabletBottomHeight,
    'y',
    signed,
    viewportWidth,
    viewportHeight
  );
}

export function resetTabletPanelSize(panel: TabletPanelKey, viewportWidth?: number, viewportHeight?: number) {
  if (panel === 'bottom') {
    return {
      tabletLeftWidth: getDefaultTabletLeftWidth(viewportWidth),
      tabletBottomHeight: getDefaultTabletBottomHeight(viewportHeight),
    };
  }

  return {
    tabletLeftWidth: getDefaultTabletLeftWidth(viewportWidth),
    tabletBottomHeight: getDefaultTabletBottomHeight(viewportHeight),
  };
}

export function getMobilePanelStyle(
  mobilePanelSizes: Record<MobileTab, MobilePanelSize>,
  tab: MobileTab
) {
  const panel = mobilePanelSizes[tab];
  return `--mob-panel-width: ${panel.widthPct}%; --mob-panel-height: ${panel.heightPct}%`;
}

export function applyMobilePanelWheelResize(
  mobilePanelSizes: Record<MobileTab, MobilePanelSize>,
  tab: MobileTab,
  axis: 'x' | 'y',
  e: WheelEvent
) {
  const rawDelta = axis === 'x' ? (Math.abs(e.deltaX) > 0 ? e.deltaX : e.deltaY) : e.deltaY;
  if (!Number.isFinite(rawDelta) || rawDelta === 0) return null;

  const step = e.shiftKey ? MOBILE_PANEL_STEP * 2 : MOBILE_PANEL_STEP;
  const signed = rawDelta > 0 ? step : -step;
  const current = mobilePanelSizes[tab];

  if (axis === 'x') {
    const nextWidth = clampPercent(current.widthPct + signed, MOBILE_PANEL_MIN_W, MOBILE_PANEL_MAX_W);
    if (nextWidth === current.widthPct) return null;
    return {
      ...mobilePanelSizes,
      [tab]: { ...current, widthPct: nextWidth },
    };
  }

  const nextHeight = clampPercent(current.heightPct + signed, MOBILE_PANEL_MIN_H, MOBILE_PANEL_MAX_H);
  if (nextHeight === current.heightPct) return null;
  return {
    ...mobilePanelSizes,
    [tab]: { ...current, heightPct: nextHeight },
  };
}

export function resetMobilePanelSize(
  mobilePanelSizes: Record<MobileTab, MobilePanelSize>,
  tab: MobileTab
) {
  return {
    ...mobilePanelSizes,
    [tab]: { widthPct: 100, heightPct: 100 },
  };
}

export function applyMobilePanelDrag(
  mobilePanelSizes: Record<MobileTab, MobilePanelSize>,
  tab: MobileTab,
  axis: MobileResizeAxis,
  startPct: number,
  deltaPct: number
) {
  const current = mobilePanelSizes[tab];

  if (axis === 'x') {
    const nextWidth = clampPercent(startPct + deltaPct, MOBILE_PANEL_MIN_W, MOBILE_PANEL_MAX_W);
    if (nextWidth === current.widthPct) return null;
    return {
      ...mobilePanelSizes,
      [tab]: { ...current, widthPct: nextWidth },
    };
  }

  const nextHeight = clampPercent(startPct + deltaPct, MOBILE_PANEL_MIN_H, MOBILE_PANEL_MAX_H);
  if (nextHeight === current.heightPct) return null;
  return {
    ...mobilePanelSizes,
    [tab]: { ...current, heightPct: nextHeight },
  };
}

export function clampLeftWidth(next: number) {
  return Math.min(MAX_LEFT, Math.max(MIN_LEFT, next));
}

export function clampRightWidth(next: number) {
  return Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, next));
}
