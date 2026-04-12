// ═══════════════════════════════════════════════════════════════
//  STOCKCLAW — Chart Theme Definitions & Resolver
//  Extracted from ChartPanel.svelte for maintainability
// ═══════════════════════════════════════════════════════════════

export type ChartTheme = {
  bg: string;
  text: string;
  grid: string;
  border: string;
  candleUp: string;
  candleDown: string;
  volumeUp: string;
  volumeDown: string;
  draw: string;
  drawGhost: string;
  tp: string;
  entry: string;
  sl: string;
  ma7: string;
  ma20: string;
  ma25: string;
  ma60: string;
  ma99: string;
  ma120: string;
  rsi: string;
  rsiTop: string;
  rsiBottom: string;
  rsiMid: string;
};

export const FALLBACK_THEME: ChartTheme = {
  bg: '#0a0a1a',
  text: '#a6b0bf',
  grid: 'rgba(232,150,125,.06)',
  border: 'rgba(232,150,125,.3)',
  candleUp: '#00ff88',
  candleDown: '#ff2d55',
  volumeUp: 'rgba(0,255,136,.25)',
  volumeDown: 'rgba(255,45,85,.25)',
  draw: '#E8967D',
  drawGhost: 'rgba(232,150,125,.6)',
  tp: '#4ade80',
  entry: '#ffba30',
  sl: '#ff4060',
  ma7: '#f7931a',
  ma20: '#ff9f43',
  ma25: '#e040fb',
  ma60: '#ff5d5d',
  ma99: '#26c6da',
  ma120: '#5fa8ff',
  rsi: '#a855f7',
  rsiTop: 'rgba(255,45,85,.35)',
  rsiBottom: 'rgba(0,255,136,.35)',
  rsiMid: 'rgba(255,255,255,.06)',
};

// ─── Color Utility Helpers ────────────────────────────────────

export function readCssVar(el: HTMLElement, name: string, fallback: string): string {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  return raw || fallback;
}

export function toRgbTuple(color: string): [number, number, number] | null {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].split(',').map((p) => Number(p.trim()));
  if (parts.length < 3 || !parts.slice(0, 3).every((n) => Number.isFinite(n))) return null;
  return [
    Math.max(0, Math.min(255, Math.round(parts[0]))),
    Math.max(0, Math.min(255, Math.round(parts[1]))),
    Math.max(0, Math.min(255, Math.round(parts[2]))),
  ];
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = toRgbTuple(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

export function toTvHex(color: string, fallback = '0a0a1a'): string {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].toLowerCase();
    if (h.length === 3) return `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    return h;
  }
  const rgb = toRgbTuple(color);
  if (!rgb) return fallback;
  return rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ─── Theme Resolver ───────────────────────────────────────────

export function resolveChartTheme(el: HTMLElement | null): ChartTheme {
  if (typeof window === 'undefined') return FALLBACK_THEME;
  const target = el ?? document.documentElement;

  const bg = readCssVar(target, '--blk', FALLBACK_THEME.bg);
  const up = readCssVar(target, '--grn', FALLBACK_THEME.candleUp);
  const down = readCssVar(target, '--red', FALLBACK_THEME.candleDown);
  const accent = readCssVar(target, '--yel', FALLBACK_THEME.draw);
  const pink = readCssVar(target, '--pk', FALLBACK_THEME.ma25);
  const cyan = readCssVar(target, '--cyan', FALLBACK_THEME.ma99);
  const orange = readCssVar(target, '--ora', FALLBACK_THEME.ma7);
  const fg = readCssVar(target, '--fg', '#ffffff');

  return {
    bg,
    text: withAlpha(fg, 0.82),
    grid: withAlpha(accent, 0.07),
    border: withAlpha(accent, 0.34),
    candleUp: up,
    candleDown: down,
    volumeUp: withAlpha(up, 0.25),
    volumeDown: withAlpha(down, 0.25),
    draw: accent,
    drawGhost: withAlpha(accent, 0.6),
    tp: up,
    entry: accent,
    sl: down,
    ma7: orange,
    ma20: withAlpha(accent, 0.92),
    ma25: pink,
    ma60: withAlpha(down, 0.88),
    ma99: cyan,
    ma120: withAlpha(cyan, 0.9),
    rsi: pink,
    rsiTop: withAlpha(down, 0.35),
    rsiBottom: withAlpha(up, 0.35),
    rsiMid: withAlpha(fg, 0.1),
  };
}
