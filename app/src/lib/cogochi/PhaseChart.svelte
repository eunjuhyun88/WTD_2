<!-- PhaseChart.svelte — chart.jsx SVG 완전 이식
     5-phase band + candles + OI/Funding/CVD indicator strips
     Prototype: /tmp/handoff2/cogochi/project/src/chart.jsx -->
<script lang="ts">
  interface Props {
    height?: string;
    highlightPhase?: number;
    showEntry?: boolean;
    showRange?: boolean;
    showIndicators?: boolean;
    showOI?: boolean;
    showFunding?: boolean;
    showCVD?: boolean;
  }

  let {
    height = '100%',
    highlightPhase = 4,
    showEntry = true,
    showRange = false,
    showIndicators = true,
    showOI = true,
    showFunding = true,
    showCVD = true,
  }: Props = $props();

  const W = 1000;
  const H = 480;
  const mainFrac = $derived(showIndicators ? 0.62 : 1.0);
  const bandFrac = $derived(showIndicators ? 0.12 : 0);
  const MAIN_H = $derived(H * mainFrac);
  const BAND_H = $derived(H * bandFrac);

  // 31 candles [x, open_y, close_y, high_y, low_y, dir]
  const RAW = [
    [30,180,240,175,250,'dn'],[60,240,280,235,290,'dn'],[90,280,260,270,295,'up'],
    [120,260,285,255,300,'dn'],[150,285,275,270,295,'up'],[180,275,278,265,290,'dn'],
    [210,278,272,268,285,'up'],[240,272,280,265,290,'dn'],[270,280,340,275,348,'dn'],
    [300,340,370,330,380,'dn'],[330,370,360,355,382,'up'],[360,360,340,335,370,'up'],
    [390,340,330,325,350,'up'],[420,330,338,325,348,'dn'],[450,338,315,310,345,'up'],
    [480,315,305,298,325,'up'],[510,305,312,302,322,'dn'],[540,312,290,285,318,'up'],
    [570,290,278,272,298,'up'],[600,278,285,270,295,'dn'],[630,285,265,258,292,'up'],
    [660,265,258,250,272,'up'],[690,258,230,225,265,'up'],[720,230,210,205,235,'up'],
    [750,210,195,190,218,'up'],[780,195,185,180,205,'up'],[810,185,178,172,192,'up'],
    [840,178,170,165,185,'up'],[870,170,172,163,178,'dn'],[900,172,168,162,178,'up'],
    [930,168,164,160,172,'up'],
  ] as const;

  const candles = $derived(RAW.map(c => {
    const s = MAIN_H / 400;
    return { x: c[0], o: c[1]*s+10, cl: c[2]*s+10, h: c[3]*s+10, l: c[4]*s+10, dir: c[5] };
  }));

  const phaseBands = [
    { x:10,  w:130, phase:1, label:'1 FAKE' },
    { x:140, w:120, phase:2, label:'2 ARCH' },
    { x:260, w:80,  phase:3, label:'3 REAL DUMP' },
    { x:340, w:340, phase:4, label:'4 ACCUM ★' },
    { x:680, w:310, phase:5, label:'5 BREAKOUT' },
  ];

  // OI bar heights (0..1)
  const oiBars = [
    0.10,0.12,0.10,0.10,0.12,0.10,0.11,0.12,
    0.85,0.95,0.70,
    0.35,0.30,0.25,0.28,0.30,0.26,0.24,0.22,0.20,0.22,0.20,0.22,
    0.45,0.55,0.60,0.62,0.58,0.55,0.50,0.50,0.45,
  ];

  // Funding line points [x, 0..1]
  const fundingPts: [number,number][] = [
    [0,0.35],[60,0.38],[120,0.42],[180,0.45],[240,0.55],
    [270,0.68],[300,0.80],[330,0.62],
    [360,0.52],[390,0.45],[420,0.42],[450,0.48],[480,0.52],[510,0.50],
    [540,0.52],[570,0.54],[600,0.52],[630,0.50],[660,0.48],
    [690,0.46],[720,0.45],[750,0.46],[780,0.48],[810,0.50],
    [840,0.52],[870,0.50],[900,0.50],[930,0.50],[960,0.52],[1000,0.52],
  ];

  // CVD cumulative series
  function buildCvd(): [number,number][] {
    let c = 0.5;
    return Array.from({ length: 34 }, (_, i) => {
      const x = i * 30 + 10;
      if (i < 8) c += 0.003;
      else if (i < 11) c -= 0.02;
      else c += 0.008 + (i > 22 ? 0.01 : 0);
      c = Math.max(0.1, Math.min(0.9, c));
      return [x, c] as [number, number];
    });
  }
  const cvdPts = buildCvd();

  function bt(idx: number): number {
    return MAIN_H + 20 + idx * (BAND_H + 6);
  }

  function oiColor(v: number): string {
    return v > 0.7 ? '#e85555' : v > 0.4 ? '#d4a442' : '#34c470';
  }

  // VWAP + EMA20 polyline strings
  const vwapPts = $derived([
    [0,260],[100,252],[200,250],[300,270],[400,320],[500,310],
    [600,295],[700,275],[800,250],[900,220],[1000,195],
  ].map(([x,y]) => `${x},${y*MAIN_H/400+10}`).join(' '));

  const emaPts = $derived([
    [0,270],[100,265],[200,272],[300,285],[400,330],[500,325],
    [600,312],[700,295],[800,270],[900,240],[1000,212],
  ].map(([x,y]) => `${x},${y*MAIN_H/400+10}`).join(' '));

  function fundingLine(bandIdx: number): string {
    const base = bt(bandIdx);
    return fundingPts.map(([x,v]) => `${x},${base + BAND_H - v*BAND_H}`).join(' ');
  }
  function cvdLine(bandIdx: number): string {
    const base = bt(bandIdx);
    return cvdPts.map(([x,v]) => `${x},${base + BAND_H - v*BAND_H}`).join(' ');
  }
  function cvdArea(bandIdx: number): string {
    const base = bt(bandIdx);
    return `0,${base+BAND_H} ${cvdPts.map(([x,v]) => `${x},${base + BAND_H - v*BAND_H}`).join(' ')} ${W},${base+BAND_H}`;
  }
</script>

<div class="phase-chart" style:height>
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" width="100%" height="100%">

    <!-- Phase bands -->
    {#each phaseBands as b}
      <rect
        x={b.x} y={10} width={b.w} height={MAIN_H}
        fill={b.phase === highlightPhase ? '#34c470' : '#6a7280'}
        opacity={b.phase === highlightPhase ? 0.08 : 0.02}
      />
      <line x1={b.x+b.w} y1={10} x2={b.x+b.w} y2={MAIN_H+10}
        stroke="#242932" stroke-width="0.5" stroke-dasharray="2 3"/>
      <text x={b.x+6} y={24}
        fill={b.phase === highlightPhase ? '#34c470' : '#3a4150'}
        font-family="JetBrains Mono" font-size="9" letter-spacing="0.1em"
        opacity={b.phase === highlightPhase ? 0.95 : 0.6}
      >{b.label}</text>
    {/each}

    <!-- Price grid -->
    {#each [0.25, 0.5, 0.75] as f}
      <line x1="0" y1={10 + MAIN_H*f} x2={W} y2={10 + MAIN_H*f}
        stroke="#181c24" stroke-width="0.5"/>
    {/each}

    <!-- VWAP -->
    <polyline points={vwapPts} fill="none" stroke="#3a4150" stroke-width="1" stroke-dasharray="4 4"/>
    <!-- EMA20 -->
    <polyline points={emaPts} fill="none" stroke="#6a7280" stroke-width="1"/>

    <!-- Candles -->
    {#each candles as c}
      {@const color = c.dir === 'up' ? '#34c470' : '#e85555'}
      {@const top = Math.min(c.o, c.cl)}
      {@const bot = Math.max(c.o, c.cl)}
      <line x1={c.x+7} y1={c.h} x2={c.x+7} y2={c.l} stroke={color} stroke-width="1"/>
      <rect x={c.x} y={top} width={14} height={Math.max(bot-top, 1)} fill={color}/>
    {/each}

    <!-- Entry / Stop / Target -->
    {#if showEntry}
      <line x1="0" y1={290*MAIN_H/400+10} x2={W} y2={290*MAIN_H/400+10}
        stroke="#34c470" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.6"/>
      <text x="10" y={286*MAIN_H/400+10}
        fill="#34c470" font-family="JetBrains Mono" font-size="9">entry 83,700</text>
      <line x1="0" y1={380*MAIN_H/400+10} x2={W} y2={380*MAIN_H/400+10}
        stroke="#e85555" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.5"/>
      <text x="10" y={376*MAIN_H/400+10}
        fill="#e85555" font-family="JetBrains Mono" font-size="9">stop 82,800</text>
      <line x1="0" y1={170*MAIN_H/400+10} x2={W} y2={170*MAIN_H/400+10}
        stroke="#34c470" stroke-width="0.5" stroke-dasharray="3 6" opacity="0.7"/>
      <text x="10" y={166*MAIN_H/400+10}
        fill="#34c470" font-family="JetBrains Mono" font-size="9">target 87,500</text>
    {/if}

    <!-- Range selection box -->
    {#if showRange}
      <rect x="345" y="10" width="325" height={MAIN_H}
        fill="none" stroke="#d4a442" stroke-width="1" stroke-dasharray="4 3" opacity="0.9"/>
      <text x="352" y="32"
        fill="#d4a442" font-family="JetBrains Mono" font-size="10" letter-spacing="0.08em"
        >SELECTED · 12 bars</text>
    {/if}

    <!-- Indicator bands -->
    {#if showIndicators}
      <line x1="0" y1={MAIN_H+14} x2={W} y2={MAIN_H+14} stroke="#181c24" stroke-width="0.5"/>

      <!-- OI band -->
      {#if showOI}
        {@const base = bt(0)}
        <rect x="0" y={base-2} width={W} height={BAND_H+4} fill="#0a0c10" opacity="0.5"/>
        <text x="8" y={base+11} fill="#6a7280" font-family="JetBrains Mono" font-size="8" letter-spacing="0.14em">OI Δ</text>
        <text x="48" y={base+11} fill="#34c470" font-family="JetBrains Mono" font-size="9" font-weight="600">+18.2%</text>
        {#each oiBars as v, i}
          {@const bh = v * BAND_H * 0.85}
          <rect x={10 + i*32} y={base + BAND_H - bh - 4} width={14} height={bh}
            fill={oiColor(v)} opacity="0.75"/>
        {/each}
      {/if}

      <!-- Funding band -->
      {#if showFunding}
        {@const idx = showOI ? 1 : 0}
        {@const base = bt(idx)}
        <rect x="0" y={base-2} width={W} height={BAND_H+4} fill="#0a0c10" opacity="0.5"/>
        <text x="8" y={base+11} fill="#6a7280" font-family="JetBrains Mono" font-size="8" letter-spacing="0.14em">FUNDING</text>
        <text x="74" y={base+11} fill="#d4a442" font-family="JetBrains Mono" font-size="9" font-weight="600">+0.018 → −0.004</text>
        <line x1="0" y1={base + BAND_H/2} x2={W} y2={base + BAND_H/2}
          stroke="#242932" stroke-width="0.5" stroke-dasharray="2 3"/>
        <polyline points={fundingLine(idx)} fill="none" stroke="#d4a442" stroke-width="1.2"/>
        <circle cx="300" cy={base + BAND_H - 0.8*BAND_H} r="2.5" fill="#d4a442"/>
        <text x="308" y={base + BAND_H - 0.8*BAND_H + 4}
          fill="#d4a442" font-family="JetBrains Mono" font-size="8">flip</text>
      {/if}

      <!-- CVD band -->
      {#if showCVD}
        {@const idx = (showOI ? 1 : 0) + (showFunding ? 1 : 0)}
        {@const base = bt(idx)}
        <rect x="0" y={base-2} width={W} height={BAND_H+4} fill="#0a0c10" opacity="0.5"/>
        <text x="8" y={base+11} fill="#6a7280" font-family="JetBrains Mono" font-size="8" letter-spacing="0.14em">CVD 15m</text>
        <text x="74" y={base+11} fill="#34c470" font-family="JetBrains Mono" font-size="9" font-weight="600">Positive flip</text>
        <polyline points={cvdLine(idx)} fill="none" stroke="#34c470" stroke-width="1.4"/>
        <polyline points={cvdArea(idx)} fill="#34c470" opacity="0.12"/>
      {/if}
    {/if}

  </svg>
</div>

<style>
  .phase-chart {
    position: relative;
    background: var(--g0);
    border: 1px solid var(--g4);
    border-radius: 4px;
    overflow: hidden;
    width: 100%;
  }
  .phase-chart svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
