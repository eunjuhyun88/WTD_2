<script lang="ts">
  interface Props {
    highlightPhase?: number;
    showEntry?: boolean;
    showRange?: boolean;
    showIndicators?: boolean;
  }

  let {
    highlightPhase = 4,
    showEntry = true,
    showRange = false,
    showIndicators = true,
  }: Props = $props();

  const W = 1000;
  const H = 480;
  const mainH = $derived(showIndicators ? 0.62 : 1.0);
  const bandH = $derived(showIndicators ? 0.12 : 0);
  const MAIN_H = $derived(H * mainH);
  const BAND_H = $derived(H * bandH);

  const rawCandles = [
    [30, 180, 240, 175, 250, 'dn'],
    [60, 240, 280, 235, 290, 'dn'],
    [90, 280, 260, 270, 295, 'up'],
    [120,260, 285, 255, 300, 'dn'],
    [150,285, 275, 270, 295, 'up'],
    [180,275, 278, 265, 290, 'dn'],
    [210,278, 272, 268, 285, 'up'],
    [240,272, 280, 265, 290, 'dn'],
    [270,280, 340, 275, 348, 'dn'],
    [300,340, 370, 330, 380, 'dn'],
    [330,370, 360, 355, 382, 'up'],
    [360,360, 340, 335, 370, 'up'],
    [390,340, 330, 325, 350, 'up'],
    [420,330, 338, 325, 348, 'dn'],
    [450,338, 315, 310, 345, 'up'],
    [480,315, 305, 298, 325, 'up'],
    [510,305, 312, 302, 322, 'dn'],
    [540,312, 290, 285, 318, 'up'],
    [570,290, 278, 272, 298, 'up'],
    [600,278, 285, 270, 295, 'dn'],
    [630,285, 265, 258, 292, 'up'],
    [660,265, 258, 250, 272, 'up'],
    [690,258, 230, 225, 265, 'up'],
    [720,230, 210, 205, 235, 'up'],
    [750,210, 195, 190, 218, 'up'],
    [780,195, 185, 180, 205, 'up'],
    [810,185, 178, 172, 192, 'up'],
    [840,178, 170, 165, 185, 'up'],
    [870,170, 172, 163, 178, 'dn'],
    [900,172, 168, 162, 178, 'up'],
    [930,168, 164, 160, 172, 'up'],
  ] as const;

  const scale = $derived(MAIN_H / 400);
  const candles = $derived(rawCandles.map(c => ({
    x: c[0] as number,
    o: (c[1] as number) * scale + 10,
    c: (c[2] as number) * scale + 10,
    h: (c[3] as number) * scale + 10,
    l: (c[4] as number) * scale + 10,
    dir: c[5] as string,
  })));

  const phaseBands = [
    { x: 10,  w: 130, phase: 1, label: '1 FAKE' },
    { x: 140, w: 120, phase: 2, label: '2 ARCH' },
    { x: 260, w: 80,  phase: 3, label: '3 REAL DUMP' },
    { x: 340, w: 340, phase: 4, label: '4 ACCUM ★' },
    { x: 680, w: 310, phase: 5, label: '5 BREAKOUT' },
  ];

  const oiBars = [
    0.1, 0.12, 0.1, 0.1, 0.12, 0.1, 0.11, 0.12,
    0.85, 0.95, 0.7,
    0.35, 0.3, 0.25, 0.28, 0.3, 0.26, 0.24, 0.22, 0.2, 0.22, 0.2, 0.22,
    0.45, 0.55, 0.6, 0.62, 0.58, 0.55, 0.5, 0.5, 0.45,
  ];

  const fundingPts: [number, number][] = [
    [0,0.35],[60,0.38],[120,0.42],[180,0.45],[240,0.55],
    [270,0.68],[300,0.8],[330,0.62],
    [360,0.52],[390,0.45],[420,0.42],[450,0.48],[480,0.52],[510,0.5],
    [540,0.52],[570,0.54],[600,0.52],[630,0.5],[660,0.48],
    [690,0.46],[720,0.45],[750,0.46],[780,0.48],[810,0.5],
    [840,0.52],[870,0.5],[900,0.5],[930,0.5],[960,0.52],[1000,0.52],
  ];

  function buildCvd(): [number, number][] {
    let cum = 0.5;
    const out: [number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const x = i * 30 + 10;
      if (i < 8) cum += 0.003;
      else if (i < 11) cum -= 0.02;
      else cum += 0.008 + (i > 22 ? 0.01 : 0);
      cum = Math.max(0.1, Math.min(0.9, cum));
      out.push([x, cum]);
    }
    return out;
  }
  const cvdPts = buildCvd();

  function bandTop(idx: number) { return MAIN_H + 20 + idx * (BAND_H + 6); }

  function ptsStr(pts: [number, number][], yFn: (v: number) => number) {
    return pts.map(([x, v]) => `${x},${yFn(v)}`).join(' ');
  }

  function oiColor(v: number) {
    return v > 0.7 ? '#e85555' : v > 0.4 ? '#d4a442' : '#34c470';
  }

  const vwapPts = $derived(`0,${260*scale+10} 100,${252*scale+10} 200,${250*scale+10} 300,${270*scale+10} 400,${320*scale+10} 500,${310*scale+10} 600,${295*scale+10} 700,${275*scale+10} 800,${250*scale+10} 900,${220*scale+10} 1000,${195*scale+10}`);
  const emaPts  = $derived(`0,${270*scale+10} 100,${265*scale+10} 200,${272*scale+10} 300,${285*scale+10} 400,${330*scale+10} 500,${325*scale+10} 600,${312*scale+10} 700,${295*scale+10} 800,${270*scale+10} 900,${240*scale+10} 1000,${212*scale+10}`);
</script>

<div class="chart-wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="chart-svg">
    <!-- phase bands -->
    {#each phaseBands as b}
      <rect x={b.x} y={10} width={b.w} height={MAIN_H}
        fill={b.phase === highlightPhase ? '#34c470' : '#6a7280'}
        opacity={b.phase === highlightPhase ? 0.08 : 0.02}/>
      <line x1={b.x + b.w} y1={10} x2={b.x + b.w} y2={MAIN_H + 10}
        stroke="#242932" stroke-width="0.5" stroke-dasharray="2 3"/>
      <text x={b.x + 6} y={24}
        fill={b.phase === highlightPhase ? '#34c470' : '#3a4150'}
        font-family="JetBrains Mono" font-size="9" letter-spacing="0.1em"
        opacity={b.phase === highlightPhase ? 0.95 : 0.6}>
        {b.label}
      </text>
    {/each}

    <!-- price grid -->
    {#each [0.25, 0.5, 0.75] as f}
      <line x1="0" y1={10 + MAIN_H * f} x2={W} y2={10 + MAIN_H * f}
        stroke="#181c24" stroke-width="0.5"/>
    {/each}

    <!-- VWAP -->
    <polyline points={vwapPts} fill="none" stroke="#3a4150" stroke-width="1" stroke-dasharray="4 4"/>
    <!-- EMA20 -->
    <polyline points={emaPts} fill="none" stroke="#6a7280" stroke-width="1"/>

    <!-- candles -->
    {#each candles as c}
      {@const color = c.dir === 'up' ? '#34c470' : '#e85555'}
      {@const top = Math.min(c.o, c.c)}
      {@const bot = Math.max(c.o, c.c)}
      <line x1={c.x + 7} y1={c.h} x2={c.x + 7} y2={c.l} stroke={color} stroke-width="1"/>
      <rect x={c.x} y={top} width={14} height={Math.max(bot - top, 1)} fill={color}/>
    {/each}

    <!-- entry / stop / target lines -->
    {#if showEntry}
      <line x1="0" y1={290*scale+10} x2={W} y2={290*scale+10} stroke="#34c470" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.6"/>
      <text x="10" y={286*scale+6} fill="#34c470" font-family="JetBrains Mono" font-size="9">entry 83,700</text>
      <line x1="0" y1={380*scale+10} x2={W} y2={380*scale+10} stroke="#e85555" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.5"/>
      <text x="10" y={376*scale+6} fill="#e85555" font-family="JetBrains Mono" font-size="9">stop 82,800</text>
      <line x1="0" y1={170*scale+10} x2={W} y2={170*scale+10} stroke="#34c470" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.7"/>
      <text x="10" y={166*scale+6} fill="#34c470" font-family="JetBrains Mono" font-size="9">target 87,500</text>
    {/if}

    <!-- range selection box -->
    {#if showRange}
      <rect x="345" y="10" width="325" height={MAIN_H} fill="none"
        stroke="#d4a442" stroke-width="1" stroke-dasharray="4 3" opacity="0.9"/>
      <text x="352" y="32" fill="#d4a442" font-family="JetBrains Mono" font-size="10" letter-spacing="0.08em">
        SELECTED · 12 bars
      </text>
    {/if}

    <!-- indicator bands -->
    {#if showIndicators}
      <line x1="0" y1={MAIN_H + 14} x2={W} y2={MAIN_H + 14} stroke="#181c24" stroke-width="0.5"/>

      <!-- OI band -->
      <rect x="0" y={bandTop(0) - 2} width={W} height={BAND_H + 4} fill="#0a0c10" opacity="0.5"/>
      <text x="8"  y={bandTop(0) + 11} fill="#6a7280" font-family="JetBrains Mono" font-size="8" letter-spacing="0.14em">OI Δ</text>
      <text x="80" y={bandTop(0) + 11} fill="#34c470" font-family="JetBrains Mono" font-size="9" font-weight="600">+18.2%</text>
      {#each oiBars as v, i}
        {@const bh = v * BAND_H * 0.85}
        <rect
          x={10 + i * 32} y={bandTop(0) + BAND_H - bh - 4}
          width={14} height={bh}
          fill={oiColor(v)} opacity="0.75"/>
      {/each}

      <!-- Funding band -->
      <rect x="0" y={bandTop(1) - 2} width={W} height={BAND_H + 4} fill="#0a0c10" opacity="0.5"/>
      <text x="8"  y={bandTop(1) + 11} fill="#6a7280" font-family="JetBrains Mono" font-size="8" letter-spacing="0.14em">FUNDING</text>
      <text x="80" y={bandTop(1) + 11} fill="#d4a442" font-family="JetBrains Mono" font-size="9" font-weight="600">+0.018 → −0.004</text>
      <line x1="0" y1={bandTop(1) + BAND_H / 2} x2={W} y2={bandTop(1) + BAND_H / 2}
        stroke="#242932" stroke-width="0.5" stroke-dasharray="2 3"/>
      <polyline
        points={ptsStr(fundingPts, v => bandTop(1) + BAND_H - v * BAND_H)}
        fill="none" stroke="#d4a442" stroke-width="1.2"/>
      <circle cx="300" cy={bandTop(1) + BAND_H - 0.8 * BAND_H} r="2.5" fill="#d4a442"/>
      <text x="308" y={bandTop(1) + BAND_H - 0.8 * BAND_H + 4} fill="#d4a442" font-family="JetBrains Mono" font-size="8">flip</text>

      <!-- CVD band -->
      <rect x="0" y={bandTop(2) - 2} width={W} height={BAND_H + 4} fill="#0a0c10" opacity="0.5"/>
      <text x="8"  y={bandTop(2) + 11} fill="#6a7280" font-family="JetBrains Mono" font-size="8" letter-spacing="0.14em">CVD 15m</text>
      <text x="80" y={bandTop(2) + 11} fill="#34c470" font-family="JetBrains Mono" font-size="9" font-weight="600">양전환</text>
      <polyline
        points={ptsStr(cvdPts, v => bandTop(2) + BAND_H - v * BAND_H)}
        fill="none" stroke="#34c470" stroke-width="1.4"/>
      <polyline
        points={`0,${bandTop(2) + BAND_H} ${ptsStr(cvdPts, v => bandTop(2) + BAND_H - v * BAND_H)} ${W},${bandTop(2) + BAND_H}`}
        fill="#34c470" opacity="0.12"/>
    {/if}
  </svg>
</div>

<style>
  .chart-wrap {
    position: relative;
    background: var(--g0);
    border-radius: 4px;
    overflow: hidden;
    width: 100%;
    height: 100%;
  }
  .chart-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
