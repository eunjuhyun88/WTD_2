<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { buildDashboardLink } from '$lib/utils/deepLinks';
  import { initFromOnboard } from '$lib/stores/agentData';
  import { AGDEFS } from '$lib/data/agents';

  // ═══ Types ═══
  type OnboardStep = 'choose' | 'api-connect' | 'archetype' | 'tutorial-battle' | 'era-reveal' | 'complete';
  type Archetype = 'ORACLE' | 'CRUSHER' | 'GUARDIAN';

  // ═══ State ═══
  let currentStep = $state<OnboardStep>('choose');
  let prevStep = $state<OnboardStep | null>(null);
  let selectedArchetype = $state<Archetype | null>(null);
  let mounted = $state(false);

  // Step transition direction
  let direction = $state<'forward' | 'backward'>('forward');

  // Tutorial battle state
  let tutorialBar = $state(0);
  const TUTORIAL_BARS = 5;
  let tutorialHP = $state(100);
  let tutorialResult = $state<'win' | null>(null);
  let tutorialAction = $state<string | null>(null);
  let tutorialTimer: ReturnType<typeof setInterval> | null = null;

  // ERA reveal state
  let eraRevealed = $state(false);
  let eraTextVisible = $state(false);
  let eraCardVisible = $state(false);

  // API connect form
  let selectedExchange = $state<string | null>(null);

  // Query param
  const queryPath = $derived($page.url.searchParams.get('path'));

  // Progress (0-based step index out of 5)
  const stepIndex = $derived(
    currentStep === 'choose' ? 0
    : currentStep === 'api-connect' ? 1
    : currentStep === 'archetype' ? 1
    : currentStep === 'tutorial-battle' ? 2
    : currentStep === 'era-reveal' ? 3
    : 4
  );

  // Archetypes data
  const archetypes: Array<{
    id: Archetype;
    icon: string;
    name: string;
    subtitle: string;
    desc: string;
    factors: string[];
    color: string;
  }> = [
    {
      id: 'ORACLE',
      icon: 'O',
      name: 'Oracle',
      subtitle: '역추세 전략가',
      desc: '시장 전환점을 예측하고 역추세에 진입하는 전략. CVD 다이버전스와 존 분석에 특화.',
      factors: ['CVD Divergence', 'MVRV Zone', 'Funding Flip'],
      color: '#a78bfa',
    },
    {
      id: 'CRUSHER',
      icon: 'C',
      name: 'Crusher',
      subtitle: '모멘텀 추종',
      desc: '강한 모멘텀을 포착해 빠르게 진입하는 공격형 전략. 거래량과 OI 급등에 특화.',
      factors: ['Volume Spike', 'BB Squeeze', 'OI Surge'],
      color: '#f59e0b',
    },
    {
      id: 'GUARDIAN',
      icon: 'G',
      name: 'Guardian',
      subtitle: '리스크 관리형',
      desc: '손실을 최소화하고 안정적으로 수익을 추구하는 수비형 전략. ATR 기반 스탑에 특화.',
      factors: ['ATR Stop', 'R:R Filter', 'Drawdown Guard'],
      color: '#34d399',
    },
  ];

  // Tutorial candle data (5 bars, accumulation pattern → guaranteed win)
  const tutorialCandles = [
    { o: 42000, h: 42400, l: 41800, c: 42350 },
    { o: 42350, h: 42600, l: 42100, c: 42200 },
    { o: 42200, h: 42500, l: 42050, c: 42450 },
    { o: 42450, h: 42900, l: 42300, c: 42850 },
    { o: 42850, h: 43400, l: 42700, c: 43300 },
  ];
  const tutPriceMin = Math.min(...tutorialCandles.map(c => c.l));
  const tutPriceMax = Math.max(...tutorialCandles.map(c => c.h));
  const tutPriceRange = tutPriceMax - tutPriceMin;

  function tutCandleY(price: number): number {
    return 120 - ((price - tutPriceMin) / tutPriceRange) * 100;
  }

  // ═══ Navigation ═══
  function goTo(step: OnboardStep) {
    const stepOrder: OnboardStep[] = ['choose', 'api-connect', 'archetype', 'tutorial-battle', 'era-reveal', 'complete'];
    const curIdx = stepOrder.indexOf(currentStep);
    const newIdx = stepOrder.indexOf(step);
    direction = newIdx > curIdx ? 'forward' : 'backward';
    prevStep = currentStep;
    currentStep = step;
  }

  function selectArchetype(id: Archetype) {
    selectedArchetype = id;
  }

  function startTutorialBattle() {
    goTo('tutorial-battle');
    tutorialBar = 0;
    tutorialHP = 100;
    tutorialResult = null;
    tutorialAction = null;

    // Auto-advance bars
    let barIdx = 0;
    tutorialTimer = setInterval(() => {
      barIdx++;
      tutorialBar = barIdx;
      if (barIdx >= TUTORIAL_BARS) {
        if (tutorialTimer) clearInterval(tutorialTimer);
        tutorialTimer = null;
        // Guaranteed win
        setTimeout(() => {
          tutorialResult = 'win';
          setTimeout(() => goTo('era-reveal'), 2000);
        }, 600);
      }
    }, 1000);
  }

  function handleTutorialAction(action: string) {
    tutorialAction = action;
  }

  function triggerEraReveal() {
    eraRevealed = false;
    eraTextVisible = false;
    eraCardVisible = false;

    // Staggered reveal
    setTimeout(() => { eraRevealed = true; }, 300);
    setTimeout(() => { eraTextVisible = true; }, 1000);
    setTimeout(() => { eraCardVisible = true; }, 1800);
  }

  // Watch for era-reveal step
  $effect(() => {
    if (currentStep === 'era-reveal') {
      triggerEraReveal();
    }
  });

  function completeOnboarding() {
    // A1: Bind selected archetype to an agent
    if (selectedArchetype) {
      const archetypeLower = selectedArchetype.toLowerCase();
      // Find the first agent whose role/specialty matches the archetype
      // ORACLE → STRUCTURE (chart pattern), CRUSHER → VPA (momentum), GUARDIAN → VALUATION (risk)
      const ARCHETYPE_AGENT_MAP: Record<string, string> = {
        'ORACLE': 'structure',
        'CRUSHER': 'vpa',
        'GUARDIAN': 'valuation',
      };
      const agentId = ARCHETYPE_AGENT_MAP[selectedArchetype] ?? AGDEFS[0]?.id ?? 'structure';
      initFromOnboard(selectedArchetype, agentId);
    }

    goTo('complete');
    setTimeout(() => {
      goto(buildDashboardLink());
    }, 2200);
  }

  onMount(() => {
    requestAnimationFrame(() => { mounted = true; });
    return () => {
      if (tutorialTimer) clearInterval(tutorialTimer);
    };
  });
</script>

<div class="onboard" class:mounted>
  <!-- ═══ Progress Bar ═══ -->
  <div class="progress-track">
    <div class="progress-fill" style="width:{(stepIndex / 4) * 100}%"></div>
    <div class="progress-steps">
      {#each ['경로', '설정', '배틀', '리빌', '완료'] as label, i}
        <div class="progress-dot-wrap" class:active={i <= stepIndex} class:current={i === stepIndex}>
          <div class="progress-dot">{i + 1}</div>
          <span class="progress-label">{label}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- ═══ Step Content ═══ -->
  <div class="step-container" class:forward={direction === 'forward'} class:backward={direction === 'backward'}>

    <!-- Step 1: Choose Path -->
    {#if currentStep === 'choose'}
      <div class="step step-choose" class:enter={mounted}>
        <div class="step-header">
          <span class="step-eyebrow">STEP 1</span>
          <h2 class="step-title">에이전트를 만들 방법을 선택하세요</h2>
          <p class="step-sub">거래소 데이터를 가져오거나, 직접 전략을 설정할 수 있습니다.</p>
        </div>

        <div class="choose-grid">
          <button class="choose-card" onclick={() => goTo('api-connect')}>
            <div class="choose-icon-wrap api-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="choose-icon">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <span class="choose-label">거래소 API 연결</span>
            <span class="choose-desc">Binance, OKX, Bybit 거래 내역을 분석해서 아키타입을 추천합니다</span>
            <span class="choose-arrow">&rarr;</span>
          </button>

          <div class="choose-divider">
            <span class="choose-or">or</span>
          </div>

          <button class="choose-card" onclick={() => goTo('archetype')}>
            <div class="choose-icon-wrap doc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="choose-icon">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14,2 14,8 20,8" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="choose-label">Doctrine 직접 작성</span>
            <span class="choose-desc">아키타입을 선택하고 가중치를 직접 설정합니다. 이미 전략이 있는 유저용.</span>
            <span class="choose-arrow">&rarr;</span>
          </button>
        </div>
      </div>

    <!-- Step 2a: API Connect -->
    {:else if currentStep === 'api-connect'}
      <div class="step step-api" class:enter={true}>
        <div class="step-header">
          <button class="step-back" onclick={() => goTo('choose')}>
            <svg viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            뒤로
          </button>
          <span class="step-eyebrow">STEP 2</span>
          <h2 class="step-title">거래소 선택</h2>
          <p class="step-sub">API 키로 거래 내역을 가져옵니다. 키는 읽기 전용으로만 사용됩니다.</p>
        </div>

        <div class="exchange-grid">
          {#each ['Binance', 'OKX', 'Bybit'] as ex}
            <button
              class="exchange-btn"
              class:selected={selectedExchange === ex}
              onclick={() => selectedExchange = ex}
            >
              <span class="exchange-name">{ex}</span>
            </button>
          {/each}
        </div>

        {#if selectedExchange}
          <div class="api-form">
            <label class="api-field">
              <span class="api-field-label">API Key</span>
              <input type="text" class="api-input" placeholder="Enter API key..." />
            </label>
            <label class="api-field">
              <span class="api-field-label">Secret</span>
              <input type="password" class="api-input" placeholder="Enter secret..." />
            </label>
          </div>
        {/if}

        <div class="step-actions">
          <button class="ob-btn primary" onclick={() => goTo('archetype')}>
            {selectedExchange ? '연결하기' : '건너뛰기'}
          </button>
        </div>
      </div>

    <!-- Step 2b: Archetype Select -->
    {:else if currentStep === 'archetype'}
      <div class="step step-archetype" class:enter={true}>
        <div class="step-header">
          <button class="step-back" onclick={() => goTo('choose')}>
            <svg viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            뒤로
          </button>
          <span class="step-eyebrow">STEP 2</span>
          <h2 class="step-title">아키타입을 선택하세요</h2>
          <p class="step-sub">에이전트의 초기 Doctrine이 이 아키타입 기반으로 설정됩니다.</p>
        </div>

        <div class="archetype-grid">
          {#each archetypes as arch}
            <button
              class="arch-card"
              class:selected={selectedArchetype === arch.id}
              style="--arch-color:{arch.color}"
              onclick={() => selectArchetype(arch.id)}
            >
              <div class="arch-icon-ring" style="border-color:{arch.color}30;background:{arch.color}08">
                <span class="arch-icon-letter" style="color:{arch.color}">{arch.icon}</span>
              </div>
              <div class="arch-info">
                <span class="arch-name">{arch.name}</span>
                <span class="arch-subtitle">{arch.subtitle}</span>
              </div>
              <p class="arch-desc">{arch.desc}</p>
              <div class="arch-factors">
                {#each arch.factors as factor}
                  <span class="arch-factor" style="border-color:{arch.color}25;color:{arch.color}">{factor}</span>
                {/each}
              </div>
              {#if selectedArchetype === arch.id}
                <div class="arch-check">
                  <svg viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
              {/if}
            </button>
          {/each}
        </div>

        {#if selectedArchetype}
          <div class="step-actions">
            <button class="ob-btn primary" onclick={startTutorialBattle}>
              튜토리얼 배틀 시작
              <svg class="ob-btn-arrow" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>

    <!-- Step 3: Tutorial Battle -->
    {:else if currentStep === 'tutorial-battle'}
      <div class="step step-tutorial" class:enter={true}>
        <div class="step-header">
          <span class="step-eyebrow">STEP 3</span>
          <h2 class="step-title">튜토리얼 배틀</h2>
          <p class="step-sub">5개 캔들로 첫 배틀을 체험합니다. 결과를 지켜보세요.</p>
        </div>

        <div class="tutorial-arena">
          <!-- Battle HUD -->
          <div class="tut-hud">
            <div class="tut-hud-item">
              <span class="tut-hud-label">ERA</span>
              <span class="tut-hud-value">???</span>
            </div>
            <div class="tut-hud-item">
              <span class="tut-hud-label">BAR</span>
              <span class="tut-hud-value">{tutorialBar} / {TUTORIAL_BARS}</span>
            </div>
            <div class="tut-hud-item">
              <span class="tut-hud-label">HP</span>
              <div class="tut-hp-bar">
                <div class="tut-hp-fill" style="width:{tutorialHP}%"></div>
              </div>
            </div>
          </div>

          <!-- Candle chart -->
          <div class="tut-chart">
            <svg viewBox="0 0 300 140" class="tut-chart-svg" preserveAspectRatio="none">
              {#each tutorialCandles as c, i}
                {@const x = 20 + i * 56}
                {@const isGreen = c.c >= c.o}
                {@const bodyTop = tutCandleY(Math.max(c.o, c.c))}
                {@const bodyBot = tutCandleY(Math.min(c.o, c.c))}
                {@const bodyH = Math.max(bodyBot - bodyTop, 3)}
                {@const wickTop = tutCandleY(c.h)}
                {@const wickBot = tutCandleY(c.l)}
                <g class="tut-candle" class:active={i < tutorialBar} class:current={i === tutorialBar - 1}>
                  <line
                    x1={x + 12} y1={wickTop}
                    x2={x + 12} y2={wickBot}
                    stroke={isGreen ? 'rgba(173,202,124,0.4)' : 'rgba(207,127,143,0.4)'}
                    stroke-width="1.5"
                  />
                  <rect
                    x={x} y={bodyTop}
                    width="24" height={bodyH}
                    rx="2"
                    fill={isGreen ? 'var(--lis-positive)' : 'var(--lis-negative)'}
                    opacity={i < tutorialBar ? 1 : 0.1}
                  />
                  {#if i === tutorialBar - 1 && !tutorialResult}
                    <rect
                      x={x - 3} y={bodyTop - 3}
                      width="30" height={bodyH + 6}
                      rx="4"
                      fill="none"
                      stroke="var(--lis-accent)"
                      stroke-width="1.5"
                      class="tut-scan-glow"
                    />
                  {/if}
                </g>
              {/each}
            </svg>
          </div>

          <!-- Action buttons -->
          <div class="tut-actions">
            {#if tutorialResult === 'win'}
              <div class="tut-win-banner">
                <span class="tut-win-text">WIN! +3.2%</span>
                <span class="tut-win-sub">첫 승리를 거뒀습니다</span>
              </div>
            {:else if tutorialBar >= 2 && !tutorialAction}
              <div class="tut-btn-row">
                <button class="tut-action-btn long" onclick={() => handleTutorialAction('LONG')}>LONG</button>
                <button class="tut-action-btn short" onclick={() => handleTutorialAction('SHORT')}>SHORT</button>
                <button class="tut-action-btn skip" onclick={() => handleTutorialAction('SKIP')}>SKIP</button>
              </div>
            {:else if tutorialAction}
              <div class="tut-decided">
                <span class="tut-decided-label">YOUR CALL</span>
                <span class="tut-decided-action" class:long={tutorialAction === 'LONG'} class:short={tutorialAction === 'SHORT'}>{tutorialAction}</span>
              </div>
            {:else}
              <span class="tut-waiting">분석 중...</span>
            {/if}
          </div>
        </div>
      </div>

    <!-- Step 4: ERA Reveal -->
    {:else if currentStep === 'era-reveal'}
      <div class="step step-reveal" class:enter={true}>
        <div class="era-container">
          <!-- Flash effect -->
          <div class="era-flash" class:active={eraRevealed}></div>

          <!-- ERA Label -->
          <div class="era-top" class:visible={eraRevealed}>
            <span class="era-sparkle">*</span>
            <span class="era-label-text">ERA REVEAL</span>
            <span class="era-sparkle">*</span>
          </div>

          <!-- ERA Name -->
          <h2 class="era-name" class:visible={eraRevealed}>
            2020 Black Thursday
          </h2>

          <!-- ERA Description -->
          <div class="era-desc-block" class:visible={eraTextVisible}>
            <p class="era-desc-text">
              BTC가 하루 만에 50% 폭락한 역사적 사건.
            </p>
            <p class="era-desc-text era-desc-feeling">
              당신의 에이전트는 극한 상황에서 첫 승리를 거뒀습니다.
            </p>
          </div>

          <!-- Memory Card -->
          <div class="era-memory-card" class:visible={eraCardVisible}>
            <div class="memory-card-inner">
              <div class="memory-card-header">
                <span class="memory-card-tag">FIRST MEMORY</span>
              </div>
              <div class="memory-card-body">
                <span class="memory-card-title">Black Thursday Survivor</span>
                <span class="memory-card-desc">극단적 공포 속 침착한 판단 -- 첫 Doctrine 각인</span>
              </div>
              <div class="memory-card-glow"></div>
            </div>
          </div>

          <!-- CTA -->
          <div class="era-cta" class:visible={eraCardVisible}>
            <button class="ob-btn primary large" onclick={completeOnboarding}>
              대시보드로 이동
              <svg class="ob-btn-arrow" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

    <!-- Step 5: Complete -->
    {:else if currentStep === 'complete'}
      <div class="step step-complete" class:enter={true}>
        <div class="complete-container">
          <div class="complete-ring"></div>
          <h2 class="complete-title">온보딩 완료</h2>
          <p class="complete-sub">대시보드로 이동합니다...</p>
          <div class="complete-loader">
            <div class="complete-loader-fill"></div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ═══ FOUNDATION ═══ */
  .onboard {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background:
      radial-gradient(ellipse 60% 40% at 50% 0%, rgba(219,154,159,0.03), transparent),
      var(--lis-bg-0);
    color: var(--lis-ivory);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 20px 48px;
  }

  /* ═══ PROGRESS ═══ */
  .progress-track {
    width: 100%;
    max-width: 480px;
    margin-bottom: 40px;
    position: relative;
    padding: 0 8px;
  }
  .progress-fill {
    position: absolute;
    top: 12px;
    left: 8px;
    height: 2px;
    background: linear-gradient(90deg, var(--lis-accent), rgba(219,154,159,0.5));
    border-radius: 2px;
    transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 0;
  }
  .progress-steps {
    display: flex;
    justify-content: space-between;
    position: relative;
    z-index: 1;
  }
  .progress-dot-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .progress-dot {
    width: 24px; height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(247,242,234,0.1);
    background: var(--lis-bg-0);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    font-weight: 700;
    color: var(--sc-text-3);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .progress-dot-wrap.active .progress-dot {
    border-color: var(--lis-accent);
    color: var(--lis-accent);
  }
  .progress-dot-wrap.current .progress-dot {
    background: var(--lis-accent);
    color: var(--lis-bg-0);
    border-color: var(--lis-accent);
    box-shadow: 0 0 16px rgba(219,154,159,0.3);
  }
  .progress-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    letter-spacing: 1px;
    color: var(--sc-text-3);
    transition: color 0.3s;
  }
  .progress-dot-wrap.current .progress-label { color: var(--lis-accent); }

  /* ═══ STEP CONTAINER ═══ */
  .step-container {
    width: 100%;
    max-width: 580px;
    position: relative;
  }

  .step {
    opacity: 0;
    transform: translateY(20px);
    animation: stepEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .step.enter {
    animation-delay: 0.05s;
  }

  @keyframes stepEnter {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ═══ STEP HEADER ═══ */
  .step-header {
    text-align: center;
    margin-bottom: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .step-eyebrow {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 3px;
    color: var(--lis-accent);
    font-weight: 700;
  }
  .step-title {
    font-family: var(--sc-font-display);
    font-size: clamp(22px, 4vw, 30px);
    letter-spacing: 1.5px;
    color: var(--lis-ivory);
  }
  .step-sub {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
    max-width: 400px;
  }
  .step-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--sc-text-3);
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.2s;
    align-self: flex-start;
  }
  .step-back svg { width: 14px; height: 14px; }
  .step-back:hover { color: var(--lis-ivory); background: rgba(247,242,234,0.04); }

  /* ═══ STEP 1: CHOOSE ═══ */
  .choose-grid {
    display: flex;
    align-items: stretch;
    gap: 16px;
    width: 100%;
  }
  .choose-divider {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .choose-or {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    font-weight: 600;
  }
  .choose-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 28px 20px;
    border-radius: 14px;
    border: 1px solid rgba(247,242,234,0.06);
    background: rgba(11,18,32,0.5);
    cursor: pointer;
    text-align: center;
    color: inherit;
    font-family: inherit;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
  }
  .choose-card:hover {
    border-color: rgba(219,154,159,0.2);
    transform: translateY(-3px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
  }
  .choose-card:active { transform: translateY(-1px) scale(0.99); }

  .choose-icon-wrap {
    width: 48px; height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .api-icon {
    background: rgba(96,160,240,0.08);
    border: 1px solid rgba(96,160,240,0.15);
  }
  .api-icon .choose-icon { color: #60a0f0; }
  .doc-icon {
    background: rgba(173,202,124,0.08);
    border: 1px solid rgba(173,202,124,0.15);
  }
  .doc-icon .choose-icon { color: var(--lis-positive); }
  .choose-icon { width: 24px; height: 24px; }

  .choose-label {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-lg);
    font-weight: 700;
    color: var(--lis-ivory);
  }
  .choose-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
  }
  .choose-arrow {
    font-size: 18px;
    color: rgba(247,242,234,0.1);
    transition: all 0.2s;
  }
  .choose-card:hover .choose-arrow { color: var(--lis-accent); transform: translateX(3px); }

  /* ═══ STEP 2a: API CONNECT ═══ */
  .exchange-grid {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 24px;
  }
  .exchange-btn {
    padding: 12px 28px;
    border-radius: 10px;
    border: 1px solid rgba(247,242,234,0.06);
    background: rgba(11,18,32,0.5);
    color: var(--sc-text-2);
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .exchange-btn:hover {
    border-color: rgba(219,154,159,0.2);
    color: var(--lis-ivory);
  }
  .exchange-btn.selected {
    border-color: var(--lis-accent);
    background: rgba(219,154,159,0.06);
    color: var(--lis-accent);
    box-shadow: 0 0 12px rgba(219,154,159,0.1);
  }

  .api-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    margin-bottom: 24px;
    animation: stepEnter 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .api-field { display: flex; flex-direction: column; gap: 6px; }
  .api-field-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 1px;
    color: var(--sc-text-3);
    font-weight: 600;
  }
  .api-input {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid rgba(247,242,234,0.06);
    background: rgba(11,18,32,0.6);
    color: var(--lis-ivory);
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    outline: none;
    transition: border-color 0.2s;
  }
  .api-input:focus { border-color: rgba(219,154,159,0.3); }
  .api-input::placeholder { color: var(--sc-text-3); }

  /* ═══ STEP 2b: ARCHETYPE ═══ */
  .archetype-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    width: 100%;
    margin-bottom: 24px;
  }
  .arch-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 16px;
    border-radius: 14px;
    border: 1.5px solid rgba(247,242,234,0.06);
    background: rgba(11,18,32,0.5);
    cursor: pointer;
    text-align: left;
    color: inherit;
    font-family: inherit;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    overflow: hidden;
  }
  .arch-card:hover {
    border-color: var(--arch-color, rgba(247,242,234,0.15));
    transform: translateY(-3px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
  }
  .arch-card.selected {
    border-color: var(--arch-color);
    background: rgba(11,18,32,0.7);
    box-shadow: 0 0 24px color-mix(in srgb, var(--arch-color) 15%, transparent);
  }
  .arch-card:active { transform: translateY(-1px) scale(0.99); }

  .arch-icon-ring {
    width: 40px; height: 40px;
    border-radius: 12px;
    border: 1px solid;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .arch-icon-letter {
    font-family: var(--sc-font-display);
    font-size: 18px;
    letter-spacing: 1px;
  }

  .arch-info { display: flex; flex-direction: column; gap: 2px; }
  .arch-name {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-lg);
    font-weight: 700;
    color: var(--lis-ivory);
  }
  .arch-subtitle {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    letter-spacing: 0.5px;
  }
  .arch-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
  }
  .arch-factors {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .arch-factor {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid;
    background: transparent;
  }
  .arch-check {
    position: absolute;
    top: 10px; right: 10px;
    width: 24px; height: 24px;
    border-radius: 50%;
    background: var(--arch-color);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: badgePop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .arch-check svg { width: 14px; height: 14px; color: var(--lis-bg-0); }

  /* ═══ STEP 3: TUTORIAL BATTLE ═══ */
  .tutorial-arena {
    width: 100%;
    border-radius: 16px;
    border: 1px solid rgba(247,242,234,0.06);
    background: rgba(11,18,32,0.6);
    overflow: hidden;
  }

  .tut-hud {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(247,242,234,0.04);
  }
  .tut-hud-item { display: flex; align-items: center; gap: 8px; }
  .tut-hud-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--sc-text-3);
  }
  .tut-hud-value {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    color: var(--lis-ivory);
    font-weight: 600;
  }
  .tut-hp-bar {
    width: 60px; height: 4px;
    border-radius: 2px;
    background: rgba(247,242,234,0.06);
    overflow: hidden;
  }
  .tut-hp-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--lis-positive), rgba(173,202,124,0.7));
    transition: width 0.5s ease;
    border-radius: 2px;
  }

  .tut-chart {
    padding: 12px 16px;
    height: 160px;
  }
  .tut-chart-svg { width: 100%; height: 100%; }
  .tut-candle rect { transition: opacity 0.4s; }
  .tut-candle:not(.active) rect { opacity: 0.08; }
  .tut-scan-glow {
    animation: scanPulse 0.7s ease-in-out infinite;
  }

  .tut-actions {
    padding: 16px 18px;
    border-top: 1px solid rgba(247,242,234,0.04);
    display: flex;
    justify-content: center;
    min-height: 60px;
    align-items: center;
  }
  .tut-btn-row {
    display: flex;
    gap: 10px;
    animation: stepEnter 0.3s ease forwards;
  }
  .tut-action-btn {
    padding: 10px 24px;
    border-radius: 10px;
    border: 1px solid rgba(247,242,234,0.08);
    background: rgba(11,18,32,0.5);
    color: var(--lis-ivory);
    font-family: var(--sc-font-display);
    font-size: 16px;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .tut-action-btn.long:hover {
    border-color: rgba(173,202,124,0.3);
    background: rgba(173,202,124,0.08);
    color: var(--lis-positive);
    box-shadow: 0 4px 16px rgba(173,202,124,0.15);
  }
  .tut-action-btn.short:hover {
    border-color: rgba(207,127,143,0.3);
    background: rgba(207,127,143,0.08);
    color: var(--lis-negative);
  }
  .tut-action-btn.skip:hover {
    border-color: rgba(247,242,234,0.15);
  }
  .tut-action-btn:active { transform: scale(0.96); }

  .tut-decided {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    animation: stepEnter 0.3s ease forwards;
  }
  .tut-decided-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    letter-spacing: 2px;
    color: var(--sc-text-3);
  }
  .tut-decided-action {
    font-family: var(--sc-font-display);
    font-size: 24px;
    letter-spacing: 4px;
    color: var(--lis-ivory);
  }
  .tut-decided-action.long { color: var(--lis-positive); }
  .tut-decided-action.short { color: var(--lis-negative); }

  .tut-waiting {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .tut-win-banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    animation: badgePop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .tut-win-text {
    font-family: var(--sc-font-display);
    font-size: 28px;
    letter-spacing: 4px;
    color: var(--lis-positive);
    text-shadow: 0 0 24px rgba(173,202,124,0.4);
  }
  .tut-win-sub {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
  }

  /* ═══ STEP 4: ERA REVEAL ═══ */
  .era-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 32px 0;
    text-align: center;
    position: relative;
    min-height: 400px;
  }

  .era-flash {
    position: absolute;
    inset: -40px;
    background: radial-gradient(circle at 50% 40%, rgba(219,154,159,0.25), transparent 60%);
    opacity: 0;
    transition: opacity 0.8s;
    pointer-events: none;
  }
  .era-flash.active {
    opacity: 1;
    animation: eraFlash 2s ease-in-out;
  }
  @keyframes eraFlash {
    0% { opacity: 0; transform: scale(0.5); }
    20% { opacity: 1; transform: scale(1.2); }
    40% { opacity: 0.6; transform: scale(1); }
    100% { opacity: 0.3; transform: scale(1); }
  }

  .era-top {
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0;
    transform: scale(0.8);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }
  .era-top.visible { opacity: 1; transform: scale(1); }
  .era-sparkle {
    font-family: var(--sc-font-body);
    font-size: 20px;
    color: var(--lis-accent);
    animation: sparkleRotate 3s ease-in-out infinite;
  }
  @keyframes sparkleRotate {
    0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.6; }
    50% { transform: rotate(180deg) scale(1.3); opacity: 1; }
  }
  .era-label-text {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-xs);
    letter-spacing: 4px;
    color: var(--lis-accent);
    font-weight: 700;
  }

  .era-name {
    font-family: var(--sc-font-display);
    font-size: clamp(28px, 6vw, 42px);
    letter-spacing: 3px;
    color: var(--lis-ivory);
    z-index: 1;
    opacity: 0;
    transform: scale(1.3);
    transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    text-shadow: 0 0 40px rgba(247,242,234,0.1);
  }
  .era-name.visible {
    opacity: 1;
    transform: scale(1);
  }

  .era-desc-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1;
    opacity: 0;
    transform: translateY(12px);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    max-width: 380px;
  }
  .era-desc-block.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .era-desc-text {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
  }
  .era-desc-feeling { color: var(--sc-text-2); font-weight: 500; }

  .era-memory-card {
    width: 100%;
    max-width: 360px;
    z-index: 1;
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .era-memory-card.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  .memory-card-inner {
    border-radius: 14px;
    border: 1.5px solid var(--lis-accent);
    background: rgba(219,154,159,0.05);
    overflow: hidden;
    position: relative;
    box-shadow: 0 8px 32px rgba(219,154,159,0.1);
  }
  .memory-card-header {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(219,154,159,0.1);
  }
  .memory-card-tag {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    letter-spacing: 2px;
    color: var(--lis-accent);
    font-weight: 700;
  }
  .memory-card-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
  }
  .memory-card-title {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-lg);
    font-weight: 700;
    color: var(--lis-ivory);
  }
  .memory-card-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
  }
  .memory-card-glow {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(0deg, rgba(219,154,159,0.06), transparent);
    pointer-events: none;
  }

  .era-cta {
    z-index: 1;
    opacity: 0;
    transform: translateY(12px);
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    transition-delay: 0.2s;
    margin-top: 8px;
  }
  .era-cta.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* ═══ STEP 5: COMPLETE ═══ */
  .complete-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 60px 0;
    text-align: center;
  }
  .complete-ring {
    width: 48px; height: 48px;
    border: 2px solid var(--lis-accent);
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .complete-title {
    font-family: var(--sc-font-display);
    font-size: var(--sc-fs-3xl);
    letter-spacing: 2px;
    color: var(--lis-ivory);
  }
  .complete-sub {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    color: var(--sc-text-3);
  }
  .complete-loader {
    width: 120px; height: 3px;
    border-radius: 2px;
    background: rgba(247,242,234,0.06);
    overflow: hidden;
    margin-top: 8px;
  }
  .complete-loader-fill {
    width: 0;
    height: 100%;
    background: var(--lis-accent);
    border-radius: 2px;
    animation: loaderFill 2s ease forwards;
  }
  @keyframes loaderFill {
    to { width: 100%; }
  }

  /* ═══ SHARED BUTTON ═══ */
  .ob-btn {
    padding: 12px 28px;
    border-radius: 10px;
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    border: 1px solid rgba(247,242,234,0.08);
    background: rgba(11,18,32,0.5);
    color: var(--lis-ivory);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .ob-btn:hover { transform: translateY(-2px); border-color: rgba(247,242,234,0.15); }
  .ob-btn:active { transform: translateY(0) scale(0.98); }

  .ob-btn.primary {
    background: linear-gradient(135deg, var(--lis-accent), rgba(219,154,159,0.8));
    color: var(--lis-bg-0);
    border: none;
    box-shadow: 0 4px 20px rgba(219,154,159,0.25);
  }
  .ob-btn.primary:hover {
    box-shadow: 0 8px 32px rgba(219,154,159,0.35);
    transform: translateY(-3px);
  }
  .ob-btn.primary.large {
    padding: 14px 36px;
    font-size: var(--sc-fs-lg);
    border-radius: 12px;
  }
  .ob-btn-arrow { width: 16px; height: 16px; transition: transform 0.2s; }
  .ob-btn:hover .ob-btn-arrow { transform: translateX(3px); }

  .step-actions {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }

  /* ═══ ANIMATIONS ═══ */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes badgePop {
    0% { opacity: 0; transform: scale(0.7); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes scanPulse {
    0%, 100% { opacity: 0.7; stroke-width: 1.5; }
    50% { opacity: 0.2; stroke-width: 1; }
  }

  /* ═══ RESPONSIVE ═══ */
  @media (max-width: 768px) {
    .onboard { padding: 20px 16px 40px; }
    .progress-track { margin-bottom: 28px; }
    .choose-grid { flex-direction: column; }
    .choose-divider {
      flex-direction: row;
      justify-content: center;
    }
    .archetype-grid { grid-template-columns: 1fr; gap: 12px; }
    .step-header { margin-bottom: 24px; }
    .tut-hud { flex-wrap: wrap; gap: 12px; padding: 12px 14px; }
    .tut-chart { height: 140px; }
    .tut-btn-row { gap: 8px; }
    .tut-action-btn { padding: 10px 18px; font-size: 14px; }
    .era-container { padding: 20px 0; min-height: 320px; }
  }

  @media (max-width: 480px) {
    .progress-label { display: none; }
    .progress-dot { width: 20px; height: 20px; font-size: 8px; }
    .step-title { font-size: 20px; }
    .choose-card { padding: 20px 16px; }
    .arch-card { padding: 16px 14px; }
    .tut-chart { height: 120px; }
    .exchange-grid { flex-direction: column; align-items: center; }
    .exchange-btn { width: 100%; }
  }

  /* ═══ REDUCED MOTION ═══ */
  @media (prefers-reduced-motion: reduce) {
    .step { animation: none; opacity: 1; transform: none; }
    .era-flash { animation: none; }
    .era-top, .era-name, .era-desc-block, .era-memory-card, .era-cta {
      transition: none; opacity: 1; transform: none;
    }
    .tut-scan-glow { animation: none; }
    .complete-ring { animation: none; }
  }
</style>
