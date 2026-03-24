<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { buildOnboardLink, buildMarketLink } from '$lib/utils/deepLinks';

  let mounted = $state(false);
  let candleData = $state<{ h: number; open: number; close: number }[]>([]);

  onMount(() => {
    // Generate mock candle data for the demo chart
    let price = 42000;
    const candles: typeof candleData = [];
    for (let i = 0; i < 24; i++) {
      const change = (Math.random() - 0.48) * 800;
      const open = price;
      price += change;
      const close = price;
      const wick = Math.abs(change) * (0.3 + Math.random() * 0.7);
      candles.push({
        h: Math.abs(close - open) + wick,
        open: Math.min(open, close),
        close: Math.max(open, close),
      });
    }
    candleData = candles;
    // Stagger entrance
    requestAnimationFrame(() => { mounted = true; });
  });

  function goBuilder() { goto(buildOnboardLink('builder')); }
  function goCopier() { goto(buildMarketLink()); }
</script>

<div class="landing" class:mounted>
  <!-- Atmospheric background layers -->
  <div class="bg-grid"></div>
  <div class="bg-glow"></div>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-tag">
      <span class="tag-dot"></span>
      <span>COGOCHI</span>
      <span class="tag-sep">×</span>
      <span>CHATBATTLE</span>
    </div>

    <h1 class="hero-h1">
      <span class="h1-line line-1">내가 만든 AI 에이전트가</span>
      <span class="h1-line line-2">역사적 시장에서 <em>싸운다</em></span>
    </h1>

    <p class="hero-p">
      전략을 AI에 학습시키고, 역사 데이터로 훈련하고,<br class="br-desktop" />
      온체인 증명 후 임대 수익을 만든다.
    </p>
  </section>

  <!-- Live chart demo -->
  <section class="demo-section">
    <div class="demo-frame">
      <div class="demo-header">
        <span class="demo-pair">BTC/USDT</span>
        <span class="demo-era">ERA: ???</span>
        <span class="demo-badge live">BATTLE</span>
      </div>
      <div class="demo-chart">
        {#each candleData as c, i}
          {@const isGreen = c.close > c.open}
          <div
            class="candle"
            class:green={isGreen}
            class:red={!isGreen}
            style="
              height: {8 + (c.h / 800) * 72}%;
              animation-delay: {i * 80}ms;
            "
          >
            <div class="candle-wick"></div>
            <div class="candle-body"></div>
          </div>
        {/each}
      </div>
      <div class="demo-hud">
        <span class="hud-item"><span class="hud-label">HP</span><span class="hud-bar"><span class="hud-fill hp" style="width:72%"></span></span></span>
        <span class="hud-item"><span class="hud-label">WHALE</span><span class="hud-bar"><span class="hud-fill whale" style="width:45%"></span></span></span>
        <span class="hud-result">LONG +4.2%</span>
      </div>
      <div class="scanline"></div>
    </div>
  </section>

  <!-- Split CTA -->
  <section class="cta-section">
    <div class="cta-label">시작하기</div>
    <div class="cta-grid">
      <button class="cta builder" onclick={goBuilder}>
        <div class="cta-top">
          <span class="cta-num">01</span>
          <span class="cta-badge builder-badge">BUILDER</span>
        </div>
        <h2 class="cta-h2">내 전략으로 AI 만들기</h2>
        <p class="cta-p">매매 패턴을 AI에 학습시키고 온체인 증명 후 임대 수익</p>
        <div class="cta-bottom">
          <span class="cta-path">거래소 API 연결 · Doctrine 직접 작성</span>
          <span class="cta-go">→</span>
        </div>
      </button>

      <button class="cta copier" onclick={goCopier}>
        <div class="cta-top">
          <span class="cta-num">02</span>
          <span class="cta-badge copier-badge">COPIER</span>
        </div>
        <h2 class="cta-h2">검증된 AI 구독하기</h2>
        <p class="cta-p">온체인으로 검증된 에이전트를 찾아서 카피트레이딩</p>
        <div class="cta-bottom">
          <span class="cta-path">승률 · 낙폭 · 가격 필터로 탐색</span>
          <span class="cta-go">→</span>
        </div>
      </button>
    </div>
  </section>

  <!-- Core Loop -->
  <section class="loop">
    <div class="loop-head">
      <span class="loop-tag">CORE LOOP</span>
      <span class="loop-desc">매일 반복하면 에이전트가 성장한다</span>
    </div>
    <div class="loop-track">
      <div class="loop-node terminal"><span class="ln-icon">~</span><span class="ln-name">Terminal</span></div>
      <div class="loop-wire"></div>
      <div class="loop-node agent"><span class="ln-icon">@</span><span class="ln-name">Agent</span></div>
      <div class="loop-wire"></div>
      <div class="loop-node lab core"><span class="ln-icon">⚗</span><span class="ln-name">Lab</span><span class="ln-star">★★★</span></div>
      <div class="loop-wire"></div>
      <div class="loop-node battle"><span class="ln-icon">⚔</span><span class="ln-name">Battle</span></div>
      <div class="loop-wire"></div>
      <div class="loop-node market"><span class="ln-icon">#</span><span class="ln-name">Market</span></div>
    </div>
    <div class="loop-return">
      <span class="return-arrow">↩</span>
      <span class="return-text">Run Again</span>
    </div>
  </section>
</div>

<style>
  /* ═══ Layout ═══ */
  .landing {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    background: var(--lis-bg-0, #050914);
    color: var(--lis-ivory, #f7f2ea);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 24px 96px;
    gap: 56px;
    position: relative;
  }

  /* ═══ Atmospheric BG ═══ */
  .bg-grid {
    position: fixed;
    inset: 0;
    background:
      repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(173, 202, 124, 0.015) 3px, rgba(173, 202, 124, 0.015) 4px);
    pointer-events: none;
    z-index: 0;
  }
  .bg-glow {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 600px 400px at 30% 20%, rgba(219, 154, 159, 0.06), transparent),
      radial-gradient(ellipse 500px 500px at 80% 70%, rgba(173, 202, 124, 0.04), transparent);
    pointer-events: none;
    z-index: 0;
  }

  .landing > * { position: relative; z-index: 1; }

  /* ═══ Entrance Animations ═══ */
  .hero, .demo-section, .cta-section, .loop {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s var(--sc-ease, ease), transform 0.6s var(--sc-ease, ease);
  }
  .mounted .hero { opacity: 1; transform: translateY(0); transition-delay: 0.1s; }
  .mounted .demo-section { opacity: 1; transform: translateY(0); transition-delay: 0.25s; }
  .mounted .cta-section { opacity: 1; transform: translateY(0); transition-delay: 0.4s; }
  .mounted .loop { opacity: 1; transform: translateY(0); transition-delay: 0.55s; }

  /* ═══ Hero ═══ */
  .hero {
    text-align: center;
    max-width: 620px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .hero-tag {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 2.5px;
    color: rgba(247, 242, 234, 0.4);
    text-transform: uppercase;
  }
  .tag-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--lis-positive, #adca7c);
    box-shadow: 0 0 8px rgba(173, 202, 124, 0.5);
    animation: sc-pulse 2s ease-in-out infinite;
  }
  .tag-sep { color: rgba(247, 242, 234, 0.2); }

  .hero-h1 {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .h1-line {
    display: block;
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-weight: 400;
    letter-spacing: 1.5px;
    line-height: 1.15;
  }
  .line-1 {
    font-size: clamp(28px, 5vw, 42px);
    color: rgba(247, 242, 234, 0.85);
  }
  .line-2 {
    font-size: clamp(32px, 6vw, 52px);
    color: var(--lis-ivory, #f7f2ea);
  }
  .line-2 em {
    font-style: normal;
    color: var(--lis-accent, #db9a9f);
    text-shadow: 0 0 32px rgba(219, 154, 159, 0.3);
  }

  .hero-p {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 14px;
    color: rgba(247, 242, 234, 0.45);
    line-height: 1.8;
    max-width: 420px;
  }
  .br-desktop { display: block; }

  /* ═══ Demo Chart ═══ */
  .demo-section { width: 100%; max-width: 680px; }
  .demo-frame {
    width: 100%;
    aspect-ratio: 16 / 8;
    border-radius: 10px;
    border: 1px solid rgba(219, 154, 159, 0.12);
    background:
      linear-gradient(180deg, rgba(11, 18, 32, 0.95), rgba(5, 9, 20, 0.98));
    overflow: hidden;
    position: relative;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(247, 242, 234, 0.03);
  }
  .demo-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
  }
  .demo-pair { color: var(--lis-ivory, #f7f2ea); font-weight: 600; letter-spacing: 0.5px; }
  .demo-era { color: rgba(247, 242, 234, 0.3); }
  .demo-badge {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .demo-badge.live {
    background: rgba(219, 154, 159, 0.15);
    color: var(--lis-accent, #db9a9f);
    border: 1px solid rgba(219, 154, 159, 0.25);
  }

  .demo-chart {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 3px;
    height: calc(100% - 60px);
    padding: 8px 16px 0;
  }

  .candle {
    flex: 1;
    max-width: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0;
    animation: candleEnter 0.4s var(--sc-ease, ease) forwards;
  }
  .candle-wick {
    width: 1px;
    height: 30%;
    min-height: 4px;
  }
  .candle-body {
    width: 100%;
    flex: 1;
    min-height: 3px;
    border-radius: 1px;
  }
  .candle.green .candle-wick { background: rgba(173, 202, 124, 0.5); }
  .candle.green .candle-body { background: var(--lis-positive, #adca7c); box-shadow: 0 0 6px rgba(173, 202, 124, 0.2); }
  .candle.red .candle-wick { background: rgba(207, 127, 143, 0.5); }
  .candle.red .candle-body { background: var(--lis-negative, #cf7f8f); box-shadow: 0 0 6px rgba(207, 127, 143, 0.2); }

  @keyframes candleEnter {
    from { opacity: 0; transform: scaleY(0.3); }
    to { opacity: 1; transform: scaleY(1); }
  }

  .demo-hud {
    position: absolute;
    bottom: 8px;
    left: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 16px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
  }
  .hud-item { display: flex; align-items: center; gap: 6px; }
  .hud-label { color: rgba(247, 242, 234, 0.35); font-weight: 600; letter-spacing: 0.5px; }
  .hud-bar { width: 48px; height: 3px; border-radius: 2px; background: rgba(247, 242, 234, 0.08); overflow: hidden; }
  .hud-fill { height: 100%; border-radius: 2px; }
  .hud-fill.hp { background: var(--lis-positive, #adca7c); }
  .hud-fill.whale { background: var(--lis-negative, #cf7f8f); }
  .hud-result {
    margin-left: auto;
    color: var(--lis-positive, #adca7c);
    font-weight: 700;
    font-size: 10px;
  }

  .scanline {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(173, 202, 124, 0.008) 2px,
      rgba(173, 202, 124, 0.008) 4px
    );
    pointer-events: none;
  }

  /* ═══ CTA Section ═══ */
  .cta-section { width: 100%; max-width: 680px; }
  .cta-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(247, 242, 234, 0.25);
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  .cta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .cta {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px 20px 20px;
    border-radius: 10px;
    border: 1px solid rgba(247, 242, 234, 0.06);
    background: rgba(11, 18, 32, 0.6);
    cursor: pointer;
    text-align: left;
    color: inherit;
    font-family: inherit;
    position: relative;
    overflow: hidden;
    transition: all 0.25s var(--sc-ease, ease);
  }
  .cta::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.25s;
  }
  .cta.builder::before {
    background: radial-gradient(ellipse at 30% 80%, rgba(96, 160, 240, 0.06), transparent 70%);
  }
  .cta.copier::before {
    background: radial-gradient(ellipse at 70% 80%, rgba(173, 202, 124, 0.06), transparent 70%);
  }
  .cta:hover { border-color: rgba(247, 242, 234, 0.12); transform: translateY(-2px); }
  .cta:hover::before { opacity: 1; }
  .cta:active { transform: translateY(0) scale(0.99); }

  .cta-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cta-num {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 28px;
    color: rgba(247, 242, 234, 0.1);
    line-height: 1;
  }
  .cta-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    padding: 3px 8px;
    border-radius: 3px;
  }
  .builder-badge { background: rgba(96, 160, 240, 0.12); color: #60a0f0; border: 1px solid rgba(96, 160, 240, 0.2); }
  .copier-badge { background: rgba(173, 202, 124, 0.12); color: #adca7c; border: 1px solid rgba(173, 202, 124, 0.2); }

  .cta-h2 {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--lis-ivory, #f7f2ea);
    line-height: 1.3;
  }
  .cta-p {
    font-size: 12px;
    color: rgba(247, 242, 234, 0.4);
    line-height: 1.6;
  }
  .cta-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid rgba(247, 242, 234, 0.04);
  }
  .cta-path {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247, 242, 234, 0.3);
    letter-spacing: 0.3px;
  }
  .cta-go {
    font-size: 18px;
    color: rgba(247, 242, 234, 0.2);
    transition: all 0.2s;
  }
  .cta:hover .cta-go {
    color: var(--lis-accent, #db9a9f);
    transform: translateX(3px);
  }

  /* ═══ Core Loop ═══ */
  .loop { width: 100%; max-width: 680px; }
  .loop-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .loop-tag {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(247, 242, 234, 0.25);
  }
  .loop-desc {
    font-size: 11px;
    color: rgba(247, 242, 234, 0.3);
  }

  .loop-track {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .loop-node {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    border-radius: 8px;
    border: 1px solid rgba(247, 242, 234, 0.06);
    background: rgba(11, 18, 32, 0.4);
    transition: all 0.2s;
    position: relative;
  }
  .loop-node:hover { border-color: rgba(247, 242, 234, 0.12); background: rgba(11, 18, 32, 0.7); }
  .loop-node.core {
    border-color: rgba(96, 160, 240, 0.25);
    background: rgba(96, 160, 240, 0.04);
  }
  .ln-icon {
    font-size: 16px;
    font-family: var(--sc-font-mono, monospace);
  }
  .ln-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1px;
  }
  .ln-star {
    font-size: 8px;
    color: #60a0f0;
    position: absolute;
    top: 4px;
    right: 6px;
  }

  .loop-node.terminal .ln-icon { color: #f0c060; }
  .loop-node.agent .ln-icon { color: rgba(247, 242, 234, 0.5); }
  .loop-node.lab .ln-icon { color: #60a0f0; }
  .loop-node.lab .ln-name { color: #60a0f0; }
  .loop-node.battle .ln-icon { color: var(--lis-negative, #cf7f8f); }
  .loop-node.market .ln-icon { color: var(--lis-positive, #adca7c); }

  .loop-wire {
    width: 16px;
    height: 1px;
    background: linear-gradient(90deg, rgba(247, 242, 234, 0.08), rgba(247, 242, 234, 0.04));
    flex-shrink: 0;
  }

  .loop-return {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
    font-family: var(--sc-font-mono, monospace);
  }
  .return-arrow {
    font-size: 14px;
    color: rgba(247, 242, 234, 0.2);
  }
  .return-text {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--lis-accent, #db9a9f);
    text-shadow: 0 0 12px rgba(219, 154, 159, 0.3);
  }

  /* ═══ Responsive ═══ */
  @media (max-width: 680px) {
    .landing { padding: 32px 16px 72px; gap: 40px; }
    .cta-grid { grid-template-columns: 1fr; }
    .br-desktop { display: none; }
    .loop-track { flex-wrap: wrap; gap: 6px; justify-content: center; }
    .loop-wire { display: none; }
    .loop-node { min-width: 70px; }
    .cta-num { font-size: 22px; }
  }

  @media (max-width: 480px) {
    .line-1 { font-size: 24px; }
    .line-2 { font-size: 30px; }
    .hero-p { font-size: 12px; }
    .demo-frame { aspect-ratio: 16 / 10; }
  }
</style>
