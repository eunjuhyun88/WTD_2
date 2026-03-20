// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Web Audio API Sound System
// ═══════════════════════════════════════════════════════════════

let ctx: AudioContext | null = null;

function ga(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tn(freq: number, dur: number, type: OscillatorType = 'sine', vol: number = 0.06) {
  try {
    const c = ga();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur / 1000);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur / 1000);
  } catch {}
}

export const sfx = {
  step: () => tn(160 + Math.random() * 60, 20, 'triangle'),
  scan: () => {
    tn(800, 120, 'sine', 0.04);
    setTimeout(() => tn(1100, 100, 'sine', 0.04), 50);
    setTimeout(() => tn(1400, 80, 'sine', 0.04), 100);
  },
  dataIn: () => {
    tn(1400, 60, 'sine', 0.04);
    setTimeout(() => tn(1800, 40, 'sine', 0.04), 30);
  },
  vote: () => {
    tn(600, 80, 'sine', 0.04);
    setTimeout(() => tn(800, 60, 'sine', 0.04), 50);
  },
  verdict: () => {
    [400, 650, 900, 1150].forEach((f, i) => setTimeout(() => tn(f, 150, 'sine', 0.05), i * 50));
  },
  win: () => {
    [600, 780, 960, 1140, 1320].forEach((f, i) => setTimeout(() => tn(f, 150, 'sine', 0.05), i * 50));
  },
  lose: () => {
    tn(300, 200, 'sawtooth', 0.04);
    setTimeout(() => tn(180, 250, 'sawtooth', 0.04), 150);
  },
  enter: () => {
    tn(500, 60, 'square', 0.03);
    setTimeout(() => tn(700, 60, 'square', 0.03), 40);
    setTimeout(() => tn(1000, 100, 'square', 0.03), 80);
  },
  impact: () => {
    tn(200, 80, 'triangle', 0.05);
    tn(800, 40, 'sine', 0.03);
  },
  charge: () => tn(400 + Math.random() * 200, 40, 'sine', 0.03)
};
