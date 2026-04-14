// ═══════════════════════════════════════════════════════════════
// Chart Position Interaction Helpers (Pure State)
// ═══════════════════════════════════════════════════════════════
// These helpers centralize TP/SL/ENTRY hover, drag-target, and wheel-step
// calculations so ChartPanel.svelte can stay focused on DOM wiring.

export type PositionInteractionTarget = 'tp' | 'sl' | 'entry';

export interface PositionLevels {
  entry: number;
  tp: number;
  sl: number;
}

export function resolvePositionInteractionTarget(
  price: number,
  levels: PositionLevels,
): PositionInteractionTarget | null {
  const distTP = Math.abs(price - levels.tp);
  const distSL = Math.abs(price - levels.sl);
  const distEntry = Math.abs(price - levels.entry);
  const minDist = Math.min(distTP, distSL, distEntry);
  const threshold = Math.abs(levels.tp - levels.sl) * 0.15;

  if (minDist > threshold) return null;
  if (minDist === distTP) return 'tp';
  if (minDist === distSL) return 'sl';
  return 'entry';
}

export function getPositionWheelStep(basePrice: number): number {
  if (basePrice > 10000) return 10;
  if (basePrice > 1000) return 1;
  if (basePrice > 100) return 0.5;
  return 0.1;
}

export function getNextPositionWheelPrice(options: {
  target: PositionInteractionTarget;
  levels: PositionLevels;
  basePrice: number;
  deltaY: number;
}): number {
  const current =
    options.target === 'tp'
      ? options.levels.tp
      : options.target === 'sl'
        ? options.levels.sl
        : options.levels.entry;
  const step = getPositionWheelStep(options.basePrice);
  const delta = options.deltaY > 0 ? -step : step;
  return Math.round(current + delta);
}
