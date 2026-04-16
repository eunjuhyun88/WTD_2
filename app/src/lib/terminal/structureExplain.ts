/**
 * Turns deep.layers.{wyckoff,mtf,oi} meta into a small view-model for UI decode
 * (the long concatenated verdict string is hard to parse visually).
 */

export type PhaseBand = 'A' | 'B' | 'C' | 'D';

export interface MtfWyckoffCell {
  tf: string;
  phase: string;
  score: number;
}

export interface StructureExplainModel {
  wyckoff: {
    score: number;
    phase: string;
    events: string[];
    activeBand: PhaseBand | null;
    isAccumulation: boolean;
  } | null;
  mtf: MtfWyckoffCell[];
  oi: {
    ratio: number | null;
    score: number;
    zone: 'normal' | 'warm' | 'hot' | 'extreme';
  } | null;
}

const ACC_EVENT_ORDER = ['SC', 'AR', 'ST', 'Spring', 'SOS'] as const;
const DIST_EVENT_ORDER = ['BC', 'AR', 'ST', 'UTAD', 'SOW'] as const;

export function inferPhaseBand(phase: string): PhaseBand | null {
  if (!phase) return null;
  const p = phase.trim();
  if (/Phase\s*D|C→D/i.test(p)) return 'D';
  if (/Phase\s*C/i.test(p)) return 'C';
  if (/Phase\s*B/i.test(p)) return 'B';
  if (/Phase\s*A/i.test(p)) return 'A';
  return null;
}

export function wyckoffIsAccumulation(score: number, phase: string): boolean {
  if (score > 3) return true;
  if (score < -3) return false;
  return !/BC|UTAD|SOW|분배/i.test(phase);
}

function oiZone(ratio: number): NonNullable<StructureExplainModel['oi']>['zone'] {
  if (ratio >= 4) return 'extreme';
  if (ratio >= 2) return 'hot';
  if (ratio >= 1) return 'warm';
  return 'normal';
}

export function buildStructureExplain(deep: Record<string, unknown> | null | undefined): StructureExplainModel | null {
  const layers = deep?.layers as Record<string, { score?: number; meta?: Record<string, unknown> }> | undefined;
  if (!layers) return null;

  const w = layers.wyckoff;
  const mtf = layers.mtf;
  const oi = layers.oi;

  const hasWyckoff =
    w && (w.score !== 0 || Boolean(w.meta?.phase) || ((w.meta?.events as unknown[])?.length ?? 0) > 0);
  const hasOi = oi && (oi.score !== 0 || oi.meta?.oi_ratio != null);
  const hasMtfRows =
    Boolean(mtf?.meta && typeof mtf.meta === 'object' && mtf.meta.tf_results);

  if (!hasWyckoff && !hasOi && !hasMtfRows) return null;

  let wyckoff: StructureExplainModel['wyckoff'] = null;
  if (w) {
    const phase = String(w.meta?.phase ?? '');
    const events = Array.isArray(w.meta?.events) ? (w.meta!.events as string[]).slice() : [];
    const score = Number(w.score ?? 0);
    wyckoff = {
      score,
      phase: phase || '—',
      events,
      activeBand: inferPhaseBand(phase),
      isAccumulation: wyckoffIsAccumulation(score, phase),
    };
  }

  let mtfRows: MtfWyckoffCell[] = [];
  if (mtf?.meta?.tf_results && typeof mtf.meta.tf_results === 'object') {
    const tr = mtf.meta.tf_results as Record<string, { score?: number; phase?: string }>;
    mtfRows = ['1H', '4H', '1D']
      .map((tf) => {
        const cell = tr[tf];
        if (!cell) return null;
        return {
          tf,
          phase: String(cell.phase ?? '—'),
          score: Number(cell.score ?? 0),
        };
      })
      .filter((x): x is MtfWyckoffCell => x != null);
  }

  let oiBlock: StructureExplainModel['oi'] = null;
  if (oi?.meta && oi.meta.oi_ratio != null && Number.isFinite(Number(oi.meta.oi_ratio))) {
    const ratio = Number(oi.meta.oi_ratio);
    oiBlock = {
      ratio,
      score: Number(oi.score ?? 0),
      zone: oiZone(ratio),
    };
  } else if (oi && oi.score !== 0) {
    oiBlock = { ratio: null, score: Number(oi.score ?? 0), zone: 'normal' };
  }

  if (!wyckoff && mtfRows.length === 0 && !oiBlock) return null;

  return { wyckoff, mtf: mtfRows, oi: oiBlock };
}

export function orderedEventPresence(
  events: string[],
  isAccumulation: boolean,
): { key: string; hit: boolean }[] {
  const order = isAccumulation ? ACC_EVENT_ORDER : DIST_EVENT_ORDER;
  const set = new Set(events);
  return order.map((key) => ({ key, hit: set.has(key) }));
}
