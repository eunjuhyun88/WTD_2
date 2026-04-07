<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { buildOnboardLink, buildMarketLink } from '$lib/utils/deepLinks';

  let mounted = $state(false);
  let scrollY = $state(0);

  // ═══ Demo candle animation state ═══
  let activeCandle = $state(-1);
  let demoPhase = $state<'idle' | 'scanning' | 'decision' | 'result'>('idle');
  let demoResult = $state<{ dir: string; pnl: string } | null>(null);
  let demoLoop = $state(0);

  // ═══ Scroll reveal tracking ═══
  let sectionEls: Record<string, HTMLElement | null> = {};
  let visibleSections = $state<Set<string>>(new Set());

  // Parallax
  const heroOpacity = $derived(Math.max(0, 1 - scrollY / 500));
  const heroShift = $derived(scrollY * 0.25);

  // Demo candle data (realistic BTC 4H pattern — accumulation → breakout)
  const candles = [
    { o: 42100, h: 42380, l: 41950, c: 42300 },
    { o: 42300, h: 42650, l: 42200, c: 42580 },
    { o: 42580, h: 42720, l: 42100, c: 42150 },
    { o: 42150, h: 42400, l: 41800, c: 41900 },
    { o: 41900, h: 42050, l: 41650, c: 41750 },
    { o: 41750, h: 42100, l: 41600, c: 42050 },
    { o: 42050, h: 42300, l: 41900, c: 42250 },
    { o: 42250, h: 42800, l: 42100, c: 42700 },
    { o: 42700, h: 43100, l: 42500, c: 43050 },
    { o: 43050, h: 43200, l: 42600, c: 42680 },
    { o: 42680, h: 42900, l: 42400, c: 42850 },
    { o: 42850, h: 43400, l: 42700, c: 43350 },
    { o: 43350, h: 43500, l: 43000, c: 43100 },
    { o: 43100, h: 43600, l: 43050, c: 43550 },
    { o: 43550, h: 43800, l: 43200, c: 43250 },
    { o: 43250, h: 43700, l: 43100, c: 43650 },
  ];

  // Price range for SVG coordinate mapping
  const priceMin = Math.min(...candles.map(c => c.l));
  const priceMax = Math.max(...candles.map(c => c.h));
  const priceRange = priceMax - priceMin;

  function candleY(price: number): number {
    return 180 - ((price - priceMin) / priceRange) * 160;
  }

  // Volume bars (synthetic)
  const volumes = candles.map((c, i) => {
    const base = Math.abs(c.c - c.o) / priceRange;
    return 8 + base * 40 + (i > 10 ? 12 : 0);
  });

  function runDemoAnimation() {
    demoPhase = 'scanning';
    activeCandle = -1;
    demoResult = null;
    let idx = 0;
    const scanInterval = setInterval(() => {
      activeCandle = idx;
      idx++;
      if (idx >= candles.length) {
        clearInterval(scanInterval);
        demoPhase = 'decision';
        setTimeout(() => {
          demoResult = { dir: 'LONG', pnl: '+4.2%' };
          demoPhase = 'result';
          // Loop after pause
          setTimeout(() => {
            demoLoop++;
            runDemoAnimation();
          }, 4000);
        }, 1200);
      }
    }, 180);
  }

  onMount(() => {
    requestAnimationFrame(() => { mounted = true; });

    // Auto-play demo battle after mount
    const demoTimer = setTimeout(runDemoAnimation, 1000);

    // IntersectionObserver for scroll reveal
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-reveal');
          if (!id) continue;
          if (entry.isIntersecting) {
            visibleSections = new Set([...visibleSections, id]);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    // Observe all sections
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    });

    return () => {
      clearTimeout(demoTimer);
      observer.disconnect();
    };
  });

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    scrollY = target.scrollTop;
  }

  // Core loop data
  const coreSteps = [
    { id: 'terminal', icon: 'T', label: 'Terminal', desc: '차트 분석', color: 'var(--lis-highlight)' },
    { id: 'agent', icon: 'A', label: 'Agent', desc: 'Doctrine 편집', color: 'var(--lis-ivory)' },
    { id: 'lab', icon: 'L', label: 'Lab', desc: '백테스트', color: '#60a0f0', star: true },
    { id: 'battle', icon: 'B', label: 'Battle', desc: '실전 증명', color: 'var(--lis-negative)' },
    { id: 'market', icon: 'M', label: 'Market', desc: '수익화', color: 'var(--lis-positive)' },
  ];
</script>

<div class="landing" class:mounted onscroll={handleScroll}>
  <!-- ═══ HERO ═══ -->
  <section
    class="hero"
    style="opacity:{heroOpacity};transform:translateY({heroShift}px)"
  >
    <div class="hero-eyebrow">
      <span class="eyebrow-dot"></span>
      <span class="eyebrow-text">COGOCHI</span>
    </div>

    <h1 class="hero-title">
      <span class="title-line">내가 만든 AI 에이전트가</span>
      <span class="title-line title-accent">역사적 시장에서 <em>싸운다</em></span>
    </h1>

    <p class="hero-desc">
      전략을 가르치고, 역사 데이터로 훈련하고, 증명해서 수익을 만든다.
    </p>

    <div class="hero-actions">
      <button class="btn-terminal" onclick={() => goto('/terminal')}>
        TERMINAL
        <svg class="btn-arrow" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="btn-primary" onclick={() => goto(buildOnboardLink('builder'))}>
        AI 만들기
        <svg class="btn-arrow" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="btn-ghost" onclick={() => goto(buildMarketLink())}>
        마켓 둘러보기
      </button>
    </div>
  </section>

  <!-- ═══ DEMO BATTLE ═══ -->
  <section class="demo" data-reveal="demo" class:revealed={visibleSections.has('demo')}>
    <div class="demo-chrome">
      <div class="chrome-bar">
        <div class="chrome-left">
          <span class="chrome-pair">BTC / USDT</span>
          <span class="chrome-tf">4H</span>
        </div>
        <div class="chrome-right">
          <span class="chrome-era" class:revealed={demoPhase === 'result'}>
            {demoPhase === 'result' ? '2024 Bull Run' : 'ERA: ???'}
          </span>
          <span
            class="chrome-status"
            class:scanning={demoPhase === 'scanning'}
            class:deciding={demoPhase === 'decision'}
            class:complete={demoPhase === 'result'}
          >
            {demoPhase === 'idle' ? 'READY' : demoPhase === 'scanning' ? 'SCANNING...' : demoPhase === 'decision' ? 'DECIDING...' : 'COMPLETE'}
          </span>
        </div>
      </div>

      <!-- Candle Chart SVG -->
      <div class="chart-area">
        <svg class="chart-svg" viewBox="0 0 640 240" preserveAspectRatio="none">
          <!-- Grid lines -->
          {#each [0.25, 0.5, 0.75] as frac}
            <line
              x1="0" y1={20 + frac * 160}
              x2="640" y2={20 + frac * 160}
              stroke="rgba(247,242,234,0.03)"
              stroke-dasharray="4 8"
            />
          {/each}

          <!-- Volume bars -->
          {#each candles as _c, i}
            {@const x = 12 + i * 38}
            {@const isGreen = candles[i].c >= candles[i].o}
            <rect
              x={x + 2} y={200 - volumes[i]}
              width="12" height={volumes[i]}
              rx="1"
              fill={isGreen ? 'rgba(173,202,124,0.08)' : 'rgba(207,127,143,0.08)'}
              opacity={i <= activeCandle ? 0.6 : 0.15}
            />
          {/each}

          <!-- Candles -->
          {#each candles as c, i}
            {@const x = 12 + i * 38}
            {@const isGreen = c.c >= c.o}
            {@const bodyTop = candleY(Math.max(c.o, c.c))}
            {@const bodyBot = candleY(Math.min(c.o, c.c))}
            {@const bodyH = Math.max(bodyBot - bodyTop, 2)}
            {@const wickTop = candleY(c.h)}
            {@const wickBot = candleY(c.l)}
            <g
              class="candle-g"
              class:active={i <= activeCandle}
              class:current={i === activeCandle}
            >
              <!-- Wick -->
              <line
                x1={x + 8} y1={wickTop}
                x2={x + 8} y2={wickBot}
                stroke={isGreen ? 'rgba(173,202,124,0.4)' : 'rgba(207,127,143,0.4)'}
                stroke-width="1"
              />
              <!-- Body -->
              <rect
                x={x} y={bodyTop}
                width="16" height={bodyH || 2}
                rx="1.5"
                fill={isGreen ? 'var(--lis-positive)' : 'var(--lis-negative)'}
                opacity={i <= activeCandle ? 1 : 0.1}
              />
              <!-- Scan highlight -->
              {#if i === activeCandle && demoPhase === 'scanning'}
                <rect
                  x={x - 3} y={bodyTop - 3}
                  width="22" height={bodyH + 6 || 8}
                  rx="4"
                  fill="none"
                  stroke="var(--lis-accent)"
                  stroke-width="1.5"
                  class="scan-glow"
                />
              {/if}
            </g>
          {/each}

          <!-- Moving average line (mock) -->
          <polyline
            points={candles.map((c, i) => `${20 + i * 38},${candleY((c.o + c.c) / 2)}`).join(' ')}
            fill="none"
            stroke="rgba(219,154,159,0.2)"
            stroke-width="1.5"
            stroke-linecap="round"
            class:active-line={activeCandle >= 0}
          />
        </svg>

        <!-- Decision overlay -->
        {#if demoPhase === 'decision' || demoPhase === 'result'}
          <div class="decision-overlay" class:show={true}>
            {#if demoResult}
              <div class="decision-badge long">
                <span class="decision-dir">{demoResult.dir}</span>
                <span class="decision-pnl">{demoResult.pnl}</span>
              </div>
            {:else}
              <div class="decision-thinking">
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- HUD -->
      <div class="demo-hud">
        <div class="hud-metric">
          <span class="hud-label">HP</span>
          <div class="hud-bar"><div class="hud-fill hp" style="width:78%"></div></div>
        </div>
        <div class="hud-metric">
          <span class="hud-label">CONFIDENCE</span>
          <div class="hud-bar"><div class="hud-fill conf" style="width:85%"></div></div>
        </div>
        <div class="hud-metric">
          <span class="hud-label">MEMORY</span>
          <span class="hud-value">12 cards</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ TWO-PATH CTA ═══ -->
  <section class="paths" data-reveal="paths" class:revealed={visibleSections.has('paths')}>
    <div class="section-header">
      <span class="section-label">START</span>
      <h2 class="section-title">두 가지 경로</h2>
    </div>

    <div class="path-grid">
      <button class="path-card builder" onclick={() => goto(buildOnboardLink('builder'))}>
        <div class="path-icon-wrap builder-glow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="path-icon">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="path-content">
          <span class="path-tag">BUILDER</span>
          <h3 class="path-title">내 전략으로 AI 만들기</h3>
          <p class="path-desc">매매 패턴을 학습시키고 온체인 증명 후 임대 수익</p>
        </div>
        <div class="path-footer">
          <span class="path-method">거래소 API / Doctrine 직접 작성</span>
          <span class="path-arrow">&rarr;</span>
        </div>
      </button>

      <button class="path-card copier" onclick={() => goto(buildMarketLink())}>
        <div class="path-icon-wrap copier-glow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="path-icon">
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="8" y="2" width="8" height="4" rx="1"/>
            <path d="M9 14l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="path-content">
          <span class="path-tag">COPIER</span>
          <h3 class="path-title">검증된 AI 구독하기</h3>
          <p class="path-desc">온체인 증명된 에이전트를 찾아서 카피트레이딩</p>
        </div>
        <div class="path-footer">
          <span class="path-method">승률 / 낙폭 / 가격 필터</span>
          <span class="path-arrow">&rarr;</span>
        </div>
      </button>
    </div>
  </section>

  <!-- ═══ CORE LOOP ═══ -->
  <section class="loop-section" data-reveal="loop" class:revealed={visibleSections.has('loop')}>
    <div class="section-header">
      <span class="section-label">CORE LOOP</span>
      <h2 class="section-title">매일 반복하면 에이전트가 성장한다</h2>
    </div>

    <div class="loop-flow">
      {#each coreSteps as step, i}
        {#if i > 0}
          <div class="flow-connector">
            <svg viewBox="0 0 24 12" class="connector-arrow">
              <path d="M0 6h20M16 2l4 4-4 4" stroke="rgba(247,242,234,0.12)" stroke-width="1" fill="none" stroke-linecap="round"/>
            </svg>
          </div>
        {/if}
        <div class="flow-node" class:core={step.star} style="--node-color:{step.color}">
          <div class="node-icon-ring">
            <span class="node-icon-letter">{step.icon}</span>
          </div>
          <span class="node-label">{step.label}</span>
          <span class="node-desc">{step.desc}</span>
          {#if step.star}
            <span class="node-star-badge">MAIN</span>
          {/if}
        </div>
      {/each}
    </div>

    <div class="loop-return">
      <div class="return-line"></div>
      <span class="return-badge">Run Again</span>
      <div class="return-line"></div>
    </div>
  </section>

  <!-- ═══ FOOTER ═══ -->
  <footer class="landing-footer">
    <span class="footer-text">COGOCHI &times; CHATBATTLE</span>
  </footer>
</div>

<style>
  /* ═══ FOUNDATION ═══ */
  .landing {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 96px;
    padding: 0 24px 80px;
    position: relative;
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(219,154,159,0.04), transparent),
      radial-gradient(ellipse 50% 40% at 80% 100%, rgba(96,160,240,0.03), transparent),
      var(--lis-bg-0);
  }

  /* Entrance animations */
  .hero, .demo, .paths, .loop-section {
    opacity: 0;
    transform: translateY(32px);
    transition:
      opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .mounted .hero { opacity: 1; transform: none; transition-delay: 0.1s; }
  .mounted .demo { opacity: 1; transform: none; transition-delay: 0.35s; }

  /* Scroll reveal for below-fold */
  .paths, .loop-section {
    opacity: 0;
    transform: translateY(40px);
  }
  .paths.revealed, .loop-section.revealed {
    opacity: 1;
    transform: none;
  }
  /* Also reveal on mount if visible */
  .mounted .paths.revealed { transition-delay: 0.5s; }
  .mounted .loop-section.revealed { transition-delay: 0.65s; }

  /* ═══ HERO ═══ */
  .hero {
    text-align: center;
    max-width: 620px;
    padding-top: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    will-change: transform, opacity;
  }

  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px;
    border-radius: 999px;
    background: rgba(219,154,159,0.04);
    border: 1px solid rgba(219,154,159,0.08);
  }
  .eyebrow-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--lis-positive);
    box-shadow: 0 0 10px rgba(173,202,124,0.5);
    animation: pulse 2.5s ease-in-out infinite;
  }
  .eyebrow-text {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 4px;
    color: var(--sc-text-3);
  }

  .hero-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title-line {
    font-family: var(--sc-font-display);
    font-weight: 400;
    letter-spacing: 2px;
    line-height: 1.1;
    font-size: clamp(30px, 5.5vw, 52px);
    color: rgba(247,242,234,0.85);
  }
  .title-accent {
    font-size: clamp(36px, 7vw, 62px);
    color: var(--lis-ivory);
  }
  .title-accent em {
    font-style: normal;
    color: var(--lis-accent);
    text-shadow: 0 0 40px rgba(219,154,159,0.3);
  }

  .hero-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-lg);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
    max-width: 400px;
  }

  .hero-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  /* ═══ BUTTONS ═══ */
  .btn-terminal {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 36px;
    border-radius: 12px;
    border: 1px solid var(--sc-good, #adca7c);
    background: rgba(173,202,124,0.1);
    color: var(--sc-good, #adca7c);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: var(--sc-fs-md);
    font-weight: 800;
    letter-spacing: 0.15em;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 0 20px rgba(173,202,124,0.15);
  }
  .btn-terminal:hover {
    transform: translateY(-3px);
    background: rgba(173,202,124,0.2);
    box-shadow: 0 0 32px rgba(173,202,124,0.3);
  }
  .btn-terminal:active { transform: translateY(0) scale(0.97); }
  .btn-terminal:hover .btn-arrow { transform: translateX(4px); }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 32px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, var(--lis-accent), rgba(219,154,159,0.8));
    color: var(--lis-bg-0);
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 20px rgba(219,154,159,0.25);
  }
  .btn-primary:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 32px rgba(219,154,159,0.35);
  }
  .btn-primary:active { transform: translateY(0) scale(0.97); }
  .btn-arrow { width: 16px; height: 16px; transition: transform 0.25s; }
  .btn-primary:hover .btn-arrow { transform: translateX(4px); }

  .btn-ghost {
    padding: 14px 28px;
    border-radius: 12px;
    border: 1px solid rgba(247,242,234,0.08);
    background: rgba(247,242,234,0.02);
    color: var(--sc-text-2);
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.25s;
  }
  .btn-ghost:hover {
    border-color: rgba(247,242,234,0.16);
    color: var(--lis-ivory);
    background: rgba(247,242,234,0.04);
    transform: translateY(-2px);
  }
  .btn-ghost:active { transform: translateY(0) scale(0.98); }

  /* ═══ DEMO BATTLE ═══ */
  .demo { width: 100%; max-width: 740px; }
  .demo-chrome {
    border-radius: 16px;
    border: 1px solid rgba(219,154,159,0.1);
    background:
      linear-gradient(180deg, rgba(11,18,32,0.96), rgba(5,9,20,0.99));
    overflow: hidden;
    box-shadow:
      0 12px 48px rgba(0,0,0,0.5),
      0 0 0 1px rgba(219,154,159,0.06),
      inset 0 1px 0 rgba(247,242,234,0.02);
  }

  .chrome-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(247,242,234,0.04);
  }
  .chrome-left { display: flex; align-items: center; gap: 10px; }
  .chrome-pair {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--lis-ivory);
    letter-spacing: 0.5px;
  }
  .chrome-tf {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(247,242,234,0.05);
    color: var(--sc-text-3);
  }
  .chrome-right { display: flex; align-items: center; gap: 12px; }
  .chrome-era {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    color: var(--sc-text-3);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .chrome-era.revealed {
    color: var(--lis-accent);
    text-shadow: 0 0 16px rgba(219,154,159,0.35);
    transform: scale(1.05);
  }
  .chrome-status {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    padding: 3px 10px;
    border-radius: 6px;
    background: rgba(247,242,234,0.04);
    color: var(--sc-text-3);
    transition: all 0.35s;
  }
  .chrome-status.scanning {
    background: rgba(173,202,124,0.1);
    color: var(--lis-positive);
    animation: statusPulse 1s ease-in-out infinite;
  }
  .chrome-status.deciding {
    background: rgba(219,154,159,0.1);
    color: var(--lis-accent);
    animation: statusPulse 0.8s ease-in-out infinite;
  }
  .chrome-status.complete {
    background: rgba(173,202,124,0.12);
    color: var(--lis-positive);
  }

  .chart-area {
    position: relative;
    height: 220px;
    padding: 8px 16px;
  }
  .chart-svg { width: 100%; height: 100%; }
  .candle-g rect { transition: opacity 0.3s ease; }
  .candle-g:not(.active) rect { opacity: 0.06; }

  .scan-glow {
    animation: scanPulse 0.7s ease-in-out infinite;
  }

  .active-line {
    stroke-dasharray: 600;
    stroke-dashoffset: 0;
    animation: drawLine 3s ease forwards;
  }

  /* Decision overlay */
  .decision-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5,9,20,0.6);
    backdrop-filter: blur(3px);
    opacity: 0;
    transition: opacity 0.5s;
  }
  .decision-overlay.show { opacity: 1; }
  .decision-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px 40px;
    border-radius: 14px;
    animation: badgePop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .decision-badge.long {
    background: rgba(173,202,124,0.08);
    border: 1px solid rgba(173,202,124,0.25);
    box-shadow: 0 8px 32px rgba(173,202,124,0.1);
  }
  .decision-dir {
    font-family: var(--sc-font-display);
    font-size: 32px;
    letter-spacing: 6px;
    color: var(--lis-positive);
  }
  .decision-pnl {
    font-family: var(--sc-font-mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--lis-positive);
    text-shadow: 0 0 20px rgba(173,202,124,0.4);
  }

  .decision-thinking {
    display: flex;
    gap: 6px;
  }
  .thinking-dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--lis-accent);
    animation: thinkBounce 0.6s ease-in-out infinite alternate;
  }
  .thinking-dot:nth-child(2) { animation-delay: 0.15s; }
  .thinking-dot:nth-child(3) { animation-delay: 0.3s; }

  /* HUD */
  .demo-hud {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 12px 18px 16px;
    border-top: 1px solid rgba(247,242,234,0.03);
  }
  .hud-metric { display: flex; align-items: center; gap: 10px; }
  .hud-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--sc-text-3);
    min-width: 68px;
  }
  .hud-bar {
    width: 64px; height: 3px;
    border-radius: 2px;
    background: rgba(247,242,234,0.05);
    overflow: hidden;
  }
  .hud-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .hud-fill.hp { background: linear-gradient(90deg, var(--lis-positive), rgba(173,202,124,0.7)); }
  .hud-fill.conf { background: linear-gradient(90deg, var(--lis-accent), rgba(219,154,159,0.7)); }
  .hud-value {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
  }

  /* ═══ SECTION SHARED ═══ */
  .section-header { margin-bottom: 28px; }
  .section-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 3px;
    color: var(--sc-text-3);
    display: block;
    margin-bottom: 10px;
  }
  .section-title {
    font-family: var(--sc-font-display);
    font-size: clamp(22px, 3.5vw, 32px);
    letter-spacing: 1.5px;
    color: var(--lis-ivory);
  }

  /* ═══ PATHS ═══ */
  .paths { width: 100%; max-width: 740px; }

  .path-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .path-card {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 28px 24px;
    border-radius: 16px;
    border: 1px solid rgba(247,242,234,0.05);
    background: rgba(11,18,32,0.5);
    cursor: pointer;
    text-align: left;
    color: inherit;
    font-family: inherit;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    overflow: hidden;
  }
  .path-card::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.35s;
    pointer-events: none;
  }
  .path-card.builder::before {
    background: radial-gradient(ellipse at 20% 90%, rgba(96,160,240,0.08), transparent 60%);
  }
  .path-card.copier::before {
    background: radial-gradient(ellipse at 80% 90%, rgba(173,202,124,0.08), transparent 60%);
  }
  .path-card:hover {
    border-color: rgba(247,242,234,0.1);
    transform: translateY(-4px);
    box-shadow: 0 16px 48px rgba(0,0,0,0.35);
  }
  .path-card:hover::before { opacity: 1; }
  .path-card:active { transform: translateY(-1px) scale(0.99); }

  .path-icon-wrap {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .builder-glow {
    background: rgba(96,160,240,0.08);
    border: 1px solid rgba(96,160,240,0.15);
  }
  .copier-glow {
    background: rgba(173,202,124,0.08);
    border: 1px solid rgba(173,202,124,0.15);
  }
  .path-icon { width: 22px; height: 22px; }
  .builder .path-icon { color: #60a0f0; }
  .copier .path-icon { color: var(--lis-positive); }

  .path-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .path-tag {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--sc-text-3);
  }
  .path-title {
    font-family: var(--sc-font-body);
    font-size: 17px;
    font-weight: 700;
    color: var(--lis-ivory);
    line-height: 1.3;
  }
  .path-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-base);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
  }

  .path-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 14px;
    border-top: 1px solid rgba(247,242,234,0.04);
  }
  .path-method {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: rgba(247,242,234,0.2);
  }
  .path-arrow {
    font-size: 18px;
    color: rgba(247,242,234,0.12);
    transition: all 0.25s;
  }
  .path-card:hover .path-arrow {
    color: var(--lis-accent);
    transform: translateX(5px);
  }

  /* ═══ CORE LOOP ═══ */
  .loop-section { width: 100%; max-width: 740px; }

  .loop-flow {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .flow-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 18px 16px;
    border-radius: 14px;
    border: 1px solid rgba(247,242,234,0.04);
    background: rgba(11,18,32,0.3);
    min-width: 88px;
    position: relative;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .flow-node:hover {
    border-color: rgba(247,242,234,0.08);
    background: rgba(11,18,32,0.5);
    transform: translateY(-3px);
  }
  .flow-node.core {
    border-color: rgba(96,160,240,0.2);
    background: rgba(96,160,240,0.04);
    box-shadow: 0 0 20px rgba(96,160,240,0.06);
  }

  .node-icon-ring {
    width: 36px; height: 36px;
    border-radius: 10px;
    border: 1px solid rgba(247,242,234,0.08);
    background: rgba(247,242,234,0.03);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .node-icon-letter {
    font-family: var(--sc-font-display);
    font-size: 16px;
    letter-spacing: 1px;
    color: var(--node-color);
  }
  .node-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--sc-text-2);
  }
  .node-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
  }
  .node-star-badge {
    position: absolute;
    top: 4px; right: 6px;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #60a0f0;
    background: rgba(96,160,240,0.1);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .flow-connector {
    width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .connector-arrow { width: 24px; height: 12px; }

  .loop-return {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 20px;
  }
  .return-line {
    height: 1px;
    flex: 1;
    max-width: 100px;
    background: linear-gradient(90deg, transparent, rgba(219,154,159,0.15), transparent);
  }
  .return-badge {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--lis-accent);
    text-shadow: 0 0 16px rgba(219,154,159,0.25);
    padding: 4px 14px;
    border: 1px solid rgba(219,154,159,0.1);
    border-radius: 999px;
    background: rgba(219,154,159,0.04);
  }

  /* ═══ FOOTER ═══ */
  .landing-footer { padding: 40px 0 20px; }
  .footer-text {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 3px;
    color: rgba(247,242,234,0.1);
  }

  /* ═══ ANIMATIONS ═══ */
  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(173,202,124,0.5); }
    50% { opacity: 0.4; box-shadow: 0 0 4px rgba(173,202,124,0.15); }
  }
  @keyframes statusPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes badgePop {
    0% { opacity: 0; transform: scale(0.7) translateY(8px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes thinkBounce {
    from { transform: translateY(0); opacity: 0.3; }
    to { transform: translateY(-5px); opacity: 1; }
  }
  @keyframes scanPulse {
    0%, 100% { opacity: 0.7; stroke-width: 1.5; }
    50% { opacity: 0.2; stroke-width: 1; }
  }
  @keyframes drawLine {
    from { stroke-dashoffset: 600; }
    to { stroke-dashoffset: 0; }
  }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 768px) {
    .landing { gap: 64px; padding: 0 16px 56px; }
    .hero { padding-top: 56px; gap: 22px; }
    .path-grid { grid-template-columns: 1fr; }
    .loop-flow { flex-wrap: wrap; gap: 8px; justify-content: center; }
    .flow-connector { display: none; }
    .flow-node { min-width: 76px; padding: 14px 12px; }
    .hero-actions { flex-direction: column; width: 100%; max-width: 300px; }
    .btn-primary, .btn-ghost { width: 100%; justify-content: center; }
    .demo-hud { flex-wrap: wrap; gap: 14px; }
    .chart-area { height: 180px; }
  }

  @media (max-width: 480px) {
    .landing { gap: 48px; }
    .hero { padding-top: 40px; }
    .hero-desc { font-size: var(--sc-fs-md); }
    .chart-area { height: 150px; }
    .path-card { padding: 20px 18px; gap: 14px; }
    .section-header { margin-bottom: 20px; }
  }

  /* ═══ REDUCED MOTION ═══ */
  @media (prefers-reduced-motion: reduce) {
    .hero, .demo, .paths, .loop-section {
      opacity: 1;
      transform: none;
      transition: none;
    }
    .scan-glow, .active-line {
      animation: none;
    }
  }
</style>
