// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — 8 Chart Pattern Generators
// ═══════════════════════════════════════════════════════════════

export interface Candle {
  time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface ChartPattern {
  name: string;
  emoji: string;
  generate: (base: number) => Candle[];
}

export const CHART_PATTERNS: ChartPattern[] = [
  {
    name: 'UPTREND', emoji: '📈',
    generate(base) {
      let p = base * 0.94; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        const bias = 0.0008 + Math.random() * 0.0005;
        const pullback = (i % 8 === 5) ? -0.002 * Math.random() : 0;
        p *= (1 + bias + pullback + (Math.random() - 0.48) * 0.002);
        const o = p, c = p * (1 + (Math.random() - 0.35) * 0.005);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.003), l: Math.min(o, c) * (1 - Math.random() * 0.002), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'DOWNTREND', emoji: '📉',
    generate(base) {
      let p = base * 1.06; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        const bias = -0.0008 - Math.random() * 0.0005;
        const bounce = (i % 9 === 7) ? 0.002 * Math.random() : 0;
        p *= (1 + bias + bounce + (Math.random() - 0.52) * 0.002);
        const o = p, c = p * (1 + (Math.random() - 0.65) * 0.005);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.002), l: Math.min(o, c) * (1 - Math.random() * 0.003), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'V_BOTTOM', emoji: '⚡',
    generate(base) {
      let p = base * 1.02; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        let m: number;
        if (i < 18) m = -0.0006 - Math.random() * 0.0004;
        else if (i < 26) m = -0.003 - Math.random() * 0.002;
        else if (i < 34) m = 0.003 + Math.random() * 0.002;
        else m = 0.0004 + Math.random() * 0.0003;
        p *= (1 + m + (Math.random() - 0.5) * 0.001);
        const o = p, c = p * (1 + (Math.random() - 0.5) * 0.004);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.002), l: Math.min(o, c) * (1 - Math.random() * 0.002), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'DOUBLE_TOP', emoji: '🏔',
    generate(base) {
      let p = base * 0.96; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        let m: number;
        if (i < 14) m = 0.0012 + Math.random() * 0.0005;
        else if (i < 22) m = -0.001 - Math.random() * 0.0005;
        else if (i < 33) m = 0.001 + Math.random() * 0.0004;
        else m = -0.0012 - Math.random() * 0.0008;
        p *= (1 + m + (Math.random() - 0.5) * 0.001);
        const o = p, c = p * (1 + (Math.random() - 0.5) * 0.004);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.002), l: Math.min(o, c) * (1 - Math.random() * 0.002), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'SQUEEZE', emoji: '🔥',
    generate(base) {
      let p = base * 0.99; const cd: Candle[] = []; const mid = base * 0.99;
      for (let i = 0; i < 50; i++) {
        let m: number;
        if (i < 12) m = (Math.random() - 0.5) * 0.004;
        else if (i < 38) { const t = Math.max(0.0003, (38 - i) * 0.00008); m = (Math.random() - 0.5) * t; p = mid + (p - mid) * 0.95; }
        else m = 0.003 + Math.random() * 0.002;
        p *= (1 + m); const sp = i >= 12 && i < 38 ? 0.002 : 0.005;
        const o = p, c = p * (1 + (Math.random() - 0.5) * sp);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.001), l: Math.min(o, c) * (1 - Math.random() * 0.001), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'DUMP_PUMP', emoji: '💥',
    generate(base) {
      let p = base; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        let m: number;
        if (i < 18) m = (Math.random() - 0.5) * 0.002;
        else if (i < 24) m = -0.005 - Math.random() * 0.003;
        else if (i < 30) m = 0.005 + Math.random() * 0.003;
        else m = (Math.random() - 0.48) * 0.002;
        p *= (1 + m); const o = p, c = p * (1 + (Math.random() - 0.5) * 0.005);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.003), l: Math.min(o, c) * (1 - Math.random() * 0.003), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'ACCUMULATION', emoji: '🐋',
    generate(base) {
      let p = base * 0.97; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        let m: number;
        if (i < 10) m = -0.001 - Math.random() * 0.0005;
        else if (i < 40) m = (Math.random() - 0.5) * 0.001;
        else m = 0.001 + Math.random() * 0.0005;
        p *= (1 + m); const sp = i >= 10 && i < 40 ? 0.002 : 0.004;
        const o = p, c = p * (1 + (Math.random() - 0.5) * sp);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.001), l: Math.min(o, c) * (1 - Math.random() * 0.001), c });
      }
      cd[49].c = base; return cd;
    }
  },
  {
    name: 'BREAKDOWN', emoji: '💀',
    generate(base) {
      let p = base * 1.03; const cd: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        let m: number;
        if (i < 28) m = (Math.random() - 0.5) * 0.001;
        else if (i < 35) m = -0.001 - Math.random() * 0.0005;
        else m = -0.004 - Math.random() * 0.003;
        p *= (1 + m); const sp = i < 28 ? 0.002 : 0.005;
        const o = p, c = p * (1 + (Math.random() - (i < 28 ? 0.5 : 0.6)) * sp);
        cd.push({ time: 0, o, h: Math.max(o, c) * (1 + Math.random() * 0.002), l: Math.min(o, c) * (1 - Math.random() * 0.002), c });
      }
      cd[49].c = base; return cd;
    }
  }
];

export function generatePattern(base: number): { pattern: ChartPattern; candles: Candle[] } {
  const pat = CHART_PATTERNS[Math.floor(Math.random() * CHART_PATTERNS.length)];
  const candles = pat.generate(base);
  // Assign timestamps
  const baseTime = Math.floor(Date.now() / 1000);
  candles.forEach((c, i) => { c.time = baseTime - (candles.length - 1 - i) * 3600; });
  return { pattern: pat, candles };
}
