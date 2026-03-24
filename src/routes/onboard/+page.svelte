<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { buildDashboardLink } from '$lib/utils/deepLinks';

  type OnboardStep = 'choose' | 'api-connect' | 'doctrine' | 'tutorial-battle' | 'era-reveal' | 'complete';

  let step = $state<OnboardStep>('choose');
  let selectedArchetype = $state<'ORACLE' | 'CRUSHER' | 'GUARDIAN' | null>(null);

  const queryPath = $derived($page.url.searchParams.get('path'));

  // Tutorial battle mock state
  let tutorialBar = $state(0);
  const TUTORIAL_BARS = 5;
  let tutorialResult = $state<'win' | null>(null);

  const archetypes = [
    {
      id: 'ORACLE' as const,
      icon: '🔮',
      name: 'Oracle',
      desc: '시장 전환점을 예측하는 전략가. 역추세 + 존 분석 특화.',
      style: 'CVD Divergence, MVRV Zone, Funding Flip',
    },
    {
      id: 'CRUSHER' as const,
      icon: '⚡',
      name: 'Crusher',
      desc: '모멘텀을 타고 빠르게 진입하는 공격형. 추세 추종 특화.',
      style: 'Volume Spike, BB Squeeze, OI Surge',
    },
    {
      id: 'GUARDIAN' as const,
      icon: '🛡️',
      name: 'Guardian',
      desc: '손실을 최소화하고 안정적으로 운용하는 수비형. 리스크 관리 특화.',
      style: 'ATR Stop, R:R Filter, Drawdown Guard',
    },
  ];

  function selectArchetype(id: 'ORACLE' | 'CRUSHER' | 'GUARDIAN') {
    selectedArchetype = id;
    step = 'doctrine';
  }

  function goApiConnect() {
    step = 'api-connect';
  }

  function goDoctrine() {
    step = 'choose';
  }

  function startTutorialBattle() {
    step = 'tutorial-battle';
    tutorialBar = 0;
    tutorialResult = null;
    runTutorial();
  }

  function runTutorial() {
    const interval = setInterval(() => {
      tutorialBar++;
      if (tutorialBar >= TUTORIAL_BARS) {
        clearInterval(interval);
        tutorialResult = 'win'; // WIN 보장
        setTimeout(() => { step = 'era-reveal'; }, 1500);
      }
    }, 800);
  }

  function completeOnboarding() {
    step = 'complete';
    setTimeout(() => {
      goto(buildDashboardLink());
    }, 2000);
  }
</script>

<div class="onboard">
  <!-- Step: Choose path (API or Doctrine) -->
  {#if step === 'choose'}
    <div class="ob-section">
      <h2 class="ob-title">에이전트를 만들 방법을 선택하세요</h2>
      <p class="ob-sub">거래소 데이터를 가져오거나, 직접 전략을 설정할 수 있습니다.</p>

      <div class="ob-split">
        <button class="ob-option" onclick={goApiConnect}>
          <span class="ob-opt-icon">🔗</span>
          <span class="ob-opt-label">거래소 API 연결</span>
          <span class="ob-opt-desc">Binance/OKX/Bybit — 1년 거래내역 자동 분석 → 아키타입 추천</span>
          <span class="ob-opt-tag terminal">terminal</span>
        </button>

        <span class="ob-or">or</span>

        <button class="ob-option active" onclick={() => step = 'doctrine'}>
          <span class="ob-opt-icon">📝</span>
          <span class="ob-opt-label">Doctrine 직접 작성</span>
          <span class="ob-opt-desc">아키타입 선택 → 가중치 슬라이더 — 이미 전략이 있는 유저</span>
          <span class="ob-opt-tag agent">agent</span>
        </button>
      </div>
    </div>

  <!-- Step: API Connect (placeholder) -->
  {:else if step === 'api-connect'}
    <div class="ob-section">
      <h2 class="ob-title">거래소 API 연결</h2>
      <p class="ob-sub">Binance, OKX, Bybit 중 하나를 연결하세요.</p>
      <div class="ob-placeholder">
        <span>🔗 API 연결 UI — 추후 구현</span>
        <button class="ob-btn" onclick={startTutorialBattle}>건너뛰고 튜토리얼 시작</button>
      </div>
    </div>

  <!-- Step: Doctrine / Archetype -->
  {:else if step === 'doctrine'}
    <div class="ob-section">
      <h2 class="ob-title">아키타입을 선택하세요</h2>
      <p class="ob-sub">선택한 아키타입에 따라 에이전트의 초기 Doctrine이 설정됩니다.</p>

      <div class="archetype-grid">
        {#each archetypes as arch}
          <button
            class="arch-card"
            class:selected={selectedArchetype === arch.id}
            onclick={() => selectArchetype(arch.id)}
          >
            <span class="arch-icon">{arch.icon}</span>
            <span class="arch-name">{arch.name}</span>
            <span class="arch-desc">{arch.desc}</span>
            <span class="arch-style">{arch.style}</span>
          </button>
        {/each}
      </div>

      {#if selectedArchetype}
        <button class="ob-btn primary" onclick={startTutorialBattle}>
          튜토리얼 배틀 시작 →
        </button>
      {/if}
    </div>

  <!-- Step: Tutorial Battle -->
  {:else if step === 'tutorial-battle'}
    <div class="ob-section battle-section">
      <h2 class="ob-title">튜토리얼 배틀</h2>
      <p class="ob-sub">5개 캔들로 첫 배틀을 체험합니다.</p>

      <div class="tutorial-arena">
        <div class="tutorial-bars">
          {#each Array(TUTORIAL_BARS) as _, i}
            <div class="t-bar" class:active={i < tutorialBar} class:current={i === tutorialBar}>
              <div class="t-bar-body" class:up={i % 2 === 0} class:down={i % 2 !== 0}></div>
              <span class="t-bar-num">{i + 1}</span>
            </div>
          {/each}
        </div>

        <div class="tutorial-status">
          {#if tutorialResult === 'win'}
            <div class="tutorial-win">
              <span class="win-icon">🎉</span>
              <span class="win-text">WIN! 첫 승리를 거뒀습니다!</span>
            </div>
          {:else}
            <span class="tutorial-progress">Bar {tutorialBar} / {TUTORIAL_BARS}</span>
          {/if}
        </div>
      </div>
    </div>

  <!-- Step: ERA Reveal -->
  {:else if step === 'era-reveal'}
    <div class="ob-section reveal-section">
      <div class="era-reveal">
        <div class="era-flash"></div>
        <span class="era-label">ERA REVEAL</span>
        <h2 class="era-title">2020 Black Thursday</h2>
        <p class="era-desc">
          2020년 3월 12일, BTC가 하루 만에 50% 폭락한 역사적 사건입니다.
          당신의 에이전트는 이 극한 상황에서 첫 승리를 거뒀습니다.
        </p>
        <div class="era-card">
          <span class="era-card-label">첫 메모리 카드</span>
          <span class="era-card-title">🃏 Black Thursday Survivor</span>
          <span class="era-card-desc">극단적 공포 속 침착한 판단 — 첫 Doctrine 각인</span>
        </div>
        <button class="ob-btn primary" onclick={completeOnboarding}>
          대시보드로 이동 →
        </button>
      </div>
    </div>

  <!-- Step: Complete -->
  {:else if step === 'complete'}
    <div class="ob-section">
      <div class="complete-msg">
        <span class="complete-icon">✨</span>
        <h2>온보딩 완료!</h2>
        <p>대시보드로 이동합니다...</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .onboard {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--arena-bg-0, #081a12);
    color: var(--arena-text-0, #e0f0e8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }

  .ob-section {
    max-width: 560px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }

  .ob-title { font-size: 22px; font-weight: 700; text-align: center; }
  .ob-sub { font-size: 13px; color: var(--arena-text-1, #8ba59e); text-align: center; line-height: 1.6; }

  /* Split choice */
  .ob-split { display: flex; align-items: center; gap: 12px; width: 100%; }
  .ob-or { color: var(--arena-text-2, #5a7d6e); font-size: 12px; font-weight: 600; }
  .ob-option {
    flex: 1; display: flex; flex-direction: column; gap: 6px;
    padding: 20px 16px; border-radius: 10px;
    border: 1px solid var(--arena-line, #1a3d2e);
    background: var(--arena-bg-1, #0d2118);
    cursor: pointer; text-align: left; color: inherit; font-family: inherit;
    transition: all 0.2s;
  }
  .ob-option:hover { border-color: var(--arena-accent, #e8967d); transform: translateY(-1px); }
  .ob-opt-icon { font-size: 20px; }
  .ob-opt-label { font-size: 14px; font-weight: 600; }
  .ob-opt-desc { font-size: 11px; color: var(--arena-text-1, #8ba59e); line-height: 1.5; }
  .ob-opt-tag { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 3px; width: fit-content; }
  .ob-opt-tag.terminal { background: rgba(240, 192, 96, 0.15); color: #f0c060; }
  .ob-opt-tag.agent { border: 1px solid var(--arena-line, #1a3d2e); color: var(--arena-text-1, #8ba59e); }

  /* Archetype grid */
  .archetype-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; }
  .arch-card {
    display: flex; flex-direction: column; gap: 6px;
    padding: 16px 12px; border-radius: 10px;
    border: 1.5px solid var(--arena-line, #1a3d2e);
    background: var(--arena-bg-1, #0d2118);
    cursor: pointer; text-align: left; color: inherit; font-family: inherit;
    transition: all 0.2s;
  }
  .arch-card:hover { border-color: var(--arena-accent, #e8967d); }
  .arch-card.selected { border-color: var(--arena-accent, #e8967d); background: rgba(232, 150, 125, 0.08); }
  .arch-icon { font-size: 24px; }
  .arch-name { font-size: 14px; font-weight: 600; }
  .arch-desc { font-size: 11px; color: var(--arena-text-1, #8ba59e); line-height: 1.5; }
  .arch-style { font-size: 9px; font-family: monospace; color: var(--arena-good, #00cc88); margin-top: 4px; }

  /* Button */
  .ob-btn {
    padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 600;
    border: 1px solid var(--arena-line, #1a3d2e);
    background: var(--arena-bg-1, #0d2118);
    color: var(--arena-text-0, #e0f0e8); cursor: pointer; transition: all 0.2s;
  }
  .ob-btn:hover { border-color: var(--arena-accent, #e8967d); }
  .ob-btn.primary {
    background: var(--arena-accent, #e8967d); color: #081a12; border-color: var(--arena-accent, #e8967d);
  }
  .ob-btn.primary:hover { opacity: 0.9; transform: translateY(-1px); }

  .ob-placeholder {
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    padding: 40px; border: 1px dashed var(--arena-line, #1a3d2e); border-radius: 10px;
    color: var(--arena-text-2, #5a7d6e); font-size: 13px; width: 100%;
  }

  /* Tutorial Battle */
  .battle-section { max-width: 480px; }
  .tutorial-arena {
    width: 100%; padding: 32px 24px; border-radius: 12px;
    border: 1px solid var(--arena-line, #1a3d2e); background: var(--arena-bg-1, #0d2118);
    display: flex; flex-direction: column; align-items: center; gap: 24px;
  }
  .tutorial-bars { display: flex; align-items: flex-end; gap: 16px; height: 120px; }
  .t-bar { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .t-bar-body {
    width: 20px; height: 60px; border-radius: 3px;
    background: var(--arena-line, #1a3d2e); transition: all 0.4s;
  }
  .t-bar.active .t-bar-body.up { background: var(--arena-good, #00cc88); height: 80px; }
  .t-bar.active .t-bar-body.down { background: var(--arena-bad, #ff5e7a); height: 50px; }
  .t-bar.current .t-bar-body { box-shadow: 0 0 12px rgba(232, 150, 125, 0.6); }
  .t-bar-num { font-size: 10px; color: var(--arena-text-2, #5a7d6e); }
  .tutorial-status { text-align: center; }
  .tutorial-progress { font-size: 12px; color: var(--arena-text-1, #8ba59e); }
  .tutorial-win { display: flex; align-items: center; gap: 8px; }
  .win-icon { font-size: 24px; }
  .win-text { font-size: 16px; font-weight: 700; color: var(--arena-good, #00cc88); }

  /* ERA Reveal */
  .reveal-section { max-width: 480px; }
  .era-reveal {
    width: 100%; display: flex; flex-direction: column; align-items: center; gap: 16px;
    padding: 40px 24px; text-align: center; position: relative;
  }
  .era-flash {
    position: absolute; inset: 0; border-radius: 16px;
    background: radial-gradient(circle, rgba(232, 150, 125, 0.15), transparent 70%);
    animation: flashPulse 2s ease-in-out infinite;
  }
  @keyframes flashPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
  .era-label { font-size: 10px; letter-spacing: 3px; color: var(--arena-accent, #e8967d); font-weight: 700; z-index: 1; }
  .era-title { font-size: 28px; font-weight: 700; z-index: 1; }
  .era-desc { font-size: 13px; color: var(--arena-text-1, #8ba59e); line-height: 1.7; z-index: 1; }
  .era-card {
    display: flex; flex-direction: column; gap: 4px;
    padding: 16px 20px; border-radius: 10px;
    border: 1.5px solid var(--arena-accent, #e8967d);
    background: rgba(232, 150, 125, 0.08);
    width: 100%; text-align: left; z-index: 1;
  }
  .era-card-label { font-size: 9px; letter-spacing: 1px; color: var(--arena-text-2, #5a7d6e); font-weight: 600; }
  .era-card-title { font-size: 15px; font-weight: 600; }
  .era-card-desc { font-size: 11px; color: var(--arena-text-1, #8ba59e); }

  /* Complete */
  .complete-msg { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .complete-icon { font-size: 48px; }

  @media (max-width: 640px) {
    .ob-split { flex-direction: column; }
    .archetype-grid { grid-template-columns: 1fr; }
    .ob-title { font-size: 18px; }
  }
</style>
