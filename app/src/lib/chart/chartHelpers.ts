// ═══ Chart Helper Utilities ═══
// Functions NOT in chartCoordinates.ts or chartTypes.ts.
// For price/coordinate utilities, see chartCoordinates.ts.
// For types, see chartTypes.ts.

export function normalizeMarketPrice(price: number): number {
  if (!Number.isFinite(price)) return 0;
  const abs = Math.abs(price);
  if (abs >= 1000) return Number(price.toFixed(2));
  if (abs >= 1) return Number(price.toFixed(4));
  return Number(price.toFixed(6));
}

export function clampRatio(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function isCompactViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

export function generateCandles(count: number, basePrice: number) {
  const candles = [];
  let t = Math.floor(Date.now() / 1000) - count * 14400, price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 120;
    const open = price, close = price + change;
    candles.push({
      time: t,
      open,
      high: Math.max(open, close) + Math.random() * 60,
      low: Math.min(open, close) - Math.random() * 60,
      close,
    });
    price = close;
    t += 14400;
  }
  return candles;
}

interface GTMWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

export function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const w = window as GTMWindow;
  if (!Array.isArray(w.dataLayer)) return;
  w.dataLayer.push({
    event,
    page: 'terminal',
    component: 'chart-panel',
    ...payload,
  });
}

export function clampToCanvas(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}
