<script lang="ts">
  import type { ExamplePrompt, ProofPillar, ProofRow } from '$lib/home/homeLanding';

  let {
    mounted = false,
    promptText = '',
    examplePrompts = [],
    proofPillars = [],
    proofRows = [],
    mx = 0,
    my = 0,
    onPromptInput,
    onPromptSubmit,
    onPickPrompt,
    onOpen
  }: {
    mounted?: boolean;
    promptText?: string;
    examplePrompts?: ExamplePrompt[];
    proofPillars?: ProofPillar[];
    proofRows?: ProofRow[];
    mx?: number;
    my?: number;
    onPromptInput: (value: string) => void;
    onPromptSubmit: () => void;
    onPickPrompt: (prompt: string) => void;
    onOpen: (path: string, cta: string) => void;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onPromptSubmit();
    }
  }
</script>

<section class="hero">
  <div class="hero-shell">
    <div class="hero-watermark" aria-hidden="true">
      <span class="watermark-line">COGO</span>
      <span class="watermark-line">CHI</span>
    </div>

    <div class="hero-copy">
      <div class="hero-intro">
        <div class="eyebrow">PERSONAL MARKET MEMORY</div>
        <h1 class:visible={mounted}>Teach the market how you judge a setup.</h1>
        <p class:visible={mounted} class="hero-lead">
          Save one setup, let Terminal keep watch, then use Lab to ship only the stronger adapter instead of trusting a generic market bot.
        </p>
      </div>

      <form class="start-bar" onsubmit={(event) => { event.preventDefault(); onPromptSubmit(); }}>
        <label class="start-shell" aria-label="Start with a market setup">
          <span class="start-kicker">Start here</span>
          <input
            type="text"
            value={promptText}
            oninput={(event) => onPromptInput((event.currentTarget as HTMLInputElement).value)}
            onkeydown={handleKeydown}
            placeholder="What setup do you want to track?"
          />
        </label>
        <button type="submit" class="start-submit">OPEN TERMINAL</button>
      </form>

      <p class="start-note">Type a setup or start blank. Both routes drop you into Terminal immediately.</p>

      <div class="hero-primary-actions">
        <button type="button" class="primary-cta" onclick={() => onOpen('/terminal', 'hero_terminal_primary')}>
          OPEN TERMINAL
        </button>
        <button type="button" class="secondary-cta" onclick={() => onOpen('/lab', 'hero_lab_primary')}>
          OPEN LAB
        </button>
      </div>

      <div class="prompt-chips">
        {#each examplePrompts as item}
          <button type="button" class="prompt-chip" onclick={() => onPickPrompt(item.prompt)}>
            {item.label}
          </button>
        {/each}
      </div>

      <div class="hero-actions">
        <button type="button" class="text-link" onclick={() => onOpen('/dashboard', 'hero_dashboard_return')}>
          RETURN TO DASHBOARD
        </button>
      </div>

      <div class="proof-rail">
        {#each proofPillars as item}
          <article class="proof-pill">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        {/each}
      </div>
    </div>

    <div class="hero-visual">
      <div
        class="panel-aura"
        aria-hidden="true"
        style:transform={`translate(-50%, -50%) translate3d(${mx * 12}px, ${my * 8}px, 0)`}
      ></div>

      <article
        class="proof-panel"
        style:transform={`perspective(1100px) rotateY(${mx * -1.08}deg) rotateX(${my * 0.82}deg) translate3d(${mx * 8}px, ${my * 4.5}px, 0)`}
      >
        <div class="window-bar">
          <div class="window-controls" aria-hidden="true">
            <span class="window-dot red"></span>
            <span class="window-dot amber"></span>
            <span class="window-dot green"></span>
          </div>
          <div class="window-title">cogochi.learning.adapter</div>
        </div>

        <div class="panel-topline">
          <span class="panel-chip">Proof Before Trust</span>
          <span class="panel-chip subtle">Per-user adapter</span>
        </div>

        <div class="panel-layout">
          <div class="panel-head">
            <p class="panel-kicker">One trader. One record.</p>
            <h2>Saved setups become proof, not prompts.</h2>
            <p>
              Cogochi ties saved setups, verdicts, and deployment gates back to one trader and one evolving record, so the system can improve without losing your criteria.
            </p>
          </div>

          <div class="timeline">
            {#each proofRows as row}
              <div class="timeline-row">
                <span class="timeline-stage">{row.stage}</span>
                <div class="timeline-body">
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="panel-foot">
          <div class="foot-stat">
            <span>Gate</span>
            <strong>Only ships if validation improves</strong>
          </div>
          <div class="foot-stat">
            <span>Fallback</span>
            <strong>Automatic rollback if worse</strong>
          </div>
        </div>
      </article>
    </div>
  </div>
</section>

<style>
  .hero {
    position: relative;
    min-height: clamp(500px, calc(100dvh - 250px), 612px);
    padding: clamp(18px, 2.8vw, 30px) clamp(22px, 4vw, 48px) clamp(34px, 4vw, 52px);
    font-family: var(--sc-font-body);
  }

  .hero-shell {
    position: relative;
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.02fr) minmax(320px, 0.86fr);
    gap: clamp(22px, 3vw, 40px);
    align-items: start;
  }

  .hero-watermark {
    position: absolute;
    right: clamp(-16px, 1vw, 0px);
    top: clamp(8px, 3vw, 34px);
    z-index: 0;
    display: grid;
    gap: clamp(4px, 0.8vw, 8px);
    pointer-events: none;
    justify-items: end;
  }

  .hero-watermark::before {
    content: '';
    position: absolute;
    inset: -8% -10% -12% 16%;
    border-radius: 50%;
    background:
      radial-gradient(circle at 30% 38%, rgba(255, 79, 163, 0.24), transparent 42%),
      radial-gradient(circle at 72% 34%, rgba(121, 228, 255, 0.2), transparent 44%),
      radial-gradient(circle at 56% 74%, rgba(215, 255, 106, 0.14), transparent 38%);
    filter: blur(26px);
    opacity: 0.78;
  }

  .watermark-line {
    position: relative;
    display: block;
    font-family: var(--sc-font-body);
    font-size: clamp(4.8rem, 9vw, 8.5rem);
    font-weight: 700;
    line-height: 0.82;
    letter-spacing: -0.08em;
    color: rgba(255, 247, 244, 0.035);
    -webkit-text-stroke: 1px rgba(255, 247, 244, 0.08);
    text-shadow:
      0 0 42px rgba(255, 79, 163, 0.08),
      0 0 74px rgba(121, 228, 255, 0.06);
  }

  .hero-copy {
    position: relative;
    z-index: 2;
    display: grid;
    gap: 16px;
    align-content: start;
    padding-top: clamp(4px, 1vw, 12px);
  }

  .hero-intro {
    display: grid;
    gap: 16px;
  }

  .eyebrow,
  .panel-kicker,
  .timeline-stage,
  .proof-pill span,
  .foot-stat span,
  .start-kicker,
  .start-note,
  .panel-chip,
  .start-submit,
  .primary-cta,
  .secondary-cta,
  .prompt-chip,
  .text-link {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
  }

  .eyebrow {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 79, 163, 0.15);
    background: rgba(255, 79, 163, 0.06);
    color: rgba(255, 247, 244, 0.82);
  }

  h1,
  .panel-head h2 {
    margin: 0;
    font-family: var(--sc-font-body);
    letter-spacing: -0.05em;
    line-height: 0.94;
    font-weight: 600;
  }

  h1 {
    max-width: 9.6ch;
    font-size: clamp(3.05rem, 5vw, 5.35rem);
    color: rgba(255, 247, 244, 0.985);
    opacity: 0;
    transform: translateY(24px);
    transition:
      opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
  }

  h1.visible,
  .hero-lead.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .hero-lead {
    max-width: 34rem;
    margin: 0;
    color: rgba(255, 247, 244, 0.8);
    font-size: clamp(1.12rem, 1.7vw, 1.28rem);
    line-height: 1.56;
    opacity: 0;
    transform: translateY(18px);
    transition:
      opacity 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.14s,
      transform 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.14s;
  }

  .start-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: stretch;
    padding: 8px;
    border-radius: 18px;
    border: 1px solid rgba(255, 79, 163, 0.16);
    background:
      linear-gradient(180deg, rgba(28, 28, 30, 0.9), rgba(14, 14, 18, 0.84)),
      radial-gradient(circle at left center, rgba(255, 79, 163, 0.08), transparent 28%),
      radial-gradient(circle at right center, rgba(121, 228, 255, 0.06), transparent 24%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 16px 42px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(18px) saturate(1.08);
    -webkit-backdrop-filter: blur(18px) saturate(1.08);
  }

  .start-shell {
    display: grid;
    gap: 7px;
    min-width: 0;
    padding: 4px 6px 4px 8px;
  }

  .start-kicker {
    color: rgba(255, 247, 244, 0.48);
  }

  .start-shell input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: rgba(255, 247, 244, 0.96);
    font: inherit;
    font-size: clamp(1.02rem, 1.55vw, 1.14rem);
    line-height: 1.4;
  }

  .start-shell input::placeholder {
    color: rgba(255, 247, 244, 0.4);
  }

  .start-submit,
  .primary-cta,
  .secondary-cta,
  .prompt-chip,
  .text-link {
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast),
      color var(--sc-duration-fast),
      box-shadow var(--sc-duration-fast);
  }

  .start-submit {
    min-height: 58px;
    padding: 0 20px;
    border-radius: 14px;
    border: 1px solid rgba(255, 79, 163, 0.2);
    background: linear-gradient(135deg, #ff4fa3, #ff8a63);
    color: #070707;
    font-weight: 700;
    letter-spacing: 0.12em;
    box-shadow: 0 18px 34px rgba(255, 79, 163, 0.24);
  }

  .start-submit:hover,
  .primary-cta:hover,
  .secondary-cta:hover,
  .prompt-chip:hover {
    transform: translateY(-1px);
  }

  .start-submit:hover {
    background: linear-gradient(135deg, #ff66ad, #ff986f);
  }

  .start-note {
    margin: -2px 0 0;
    font-size: 0.82rem;
    text-transform: none;
    color: rgba(255, 247, 244, 0.62);
    line-height: 1.45;
  }

  .hero-primary-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }

  .primary-cta,
  .secondary-cta {
    min-height: 52px;
    padding: 0 20px;
    border-radius: 14px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .primary-cta {
    border: 1px solid rgba(255, 79, 163, 0.2);
    background: linear-gradient(135deg, #ff4fa3, #ff8a63);
    color: #070707;
    box-shadow: 0 16px 34px rgba(255, 79, 163, 0.22);
  }

  .secondary-cta {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03)),
      rgba(255, 255, 255, 0.03);
    color: rgba(255, 247, 244, 0.94);
  }

  .prompt-chips,
  .hero-actions,
  .proof-rail {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .prompt-chip {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.035);
    color: rgba(255, 247, 244, 0.8);
    letter-spacing: 0.08em;
  }

  .prompt-chip:hover {
    border-color: rgba(227, 180, 185, 0.22);
    color: rgba(247, 242, 234, 0.95);
  }

  .text-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 247, 244, 0.66);
    font-size: 0.84rem;
    letter-spacing: 0.12em;
  }

  .text-link:hover {
    color: rgba(227, 180, 185, 0.92);
  }

  .proof-pill {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(12, 14, 20, 0.66);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 22px 60px rgba(0, 0, 0, 0.26);
    backdrop-filter: blur(28px) saturate(1.1);
    -webkit-backdrop-filter: blur(28px) saturate(1.1);
  }

  .proof-rail {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .proof-pill {
    display: grid;
    gap: 5px;
    min-height: 82px;
    padding: 14px 15px;
    border-radius: 16px;
  }

  .proof-pill span,
  .panel-kicker,
  .timeline-stage {
    color: rgba(227, 180, 185, 0.84);
  }

  .proof-pill strong,
  .foot-stat strong {
    font-size: 1rem;
    line-height: 1.34;
    color: rgba(247, 242, 234, 0.92);
  }

  .hero-visual {
    position: relative;
    z-index: 2;
    min-height: 456px;
    display: grid;
    place-items: center;
  }

  .panel-aura {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(46rem, 88%);
    aspect-ratio: 1;
    border-radius: 50%;
    opacity: 0.16;
    background:
      radial-gradient(circle, rgba(255, 79, 163, 0.28), rgba(255, 138, 99, 0.16) 28%, rgba(121, 228, 255, 0.1) 48%, transparent 72%);
    filter: blur(72px);
    pointer-events: none;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
    transform: translate(-50%, -50%);
  }

  .proof-panel {
    position: relative;
    z-index: 2;
    width: min(500px, 100%);
    padding: 0;
    border-radius: 23px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background:
      linear-gradient(180deg, rgba(37, 37, 39, 0.92), rgba(15, 15, 18, 0.9));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 28px 90px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 79, 163, 0.06);
    overflow: hidden;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .window-bar,
  .panel-topline,
  .panel-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .window-bar {
    min-height: 44px;
    padding: 0 16px;
    background:
      linear-gradient(180deg, rgba(76, 76, 78, 0.96), rgba(48, 48, 50, 0.96));
    border-bottom: 1px solid rgba(0, 0, 0, 0.35);
  }

  .window-controls {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .window-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #777;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .window-dot.red {
    background: #ff5f57;
  }

  .window-dot.amber {
    background: #febc2e;
  }

  .window-dot.green {
    background: #28c840;
  }

  .window-title {
    margin-left: auto;
    color: rgba(255, 255, 255, 0.62);
    font-family: var(--sc-font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: lowercase;
  }

  .panel-chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 79, 163, 0.22);
    background: rgba(255, 79, 163, 0.09);
    color: rgba(255, 247, 244, 0.9);
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .panel-chip.subtle {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .panel-topline {
    padding: 14px 18px 0;
  }

  .panel-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 12px 18px 18px;
  }

  .panel-head {
    display: grid;
    gap: 9px;
    align-content: start;
    padding: 4px 0 0;
  }

  .panel-head h2 {
    font-size: clamp(1.36rem, 2vw, 1.82rem);
    color: rgba(255, 247, 244, 0.97);
  }

  .panel-head p,
  .timeline-body p {
    margin: 0;
    color: rgba(255, 247, 244, 0.74);
    font-size: 1rem;
    line-height: 1.54;
  }

  .timeline {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .timeline-row {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }

  .timeline-body {
    display: grid;
    gap: 4px;
  }

  .timeline-body strong {
    margin: 0;
    font-size: 1.08rem;
    line-height: 1.24;
    color: rgba(255, 247, 244, 0.94);
  }

  .panel-foot {
    padding: 16px 18px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.02);
  }

  .foot-stat {
    display: grid;
    gap: 4px;
  }

  .foot-stat span {
    color: rgba(255, 247, 244, 0.42);
  }

  @media (max-width: 1180px) {
    .hero-shell {
      grid-template-columns: 1fr;
      gap: 30px;
    }

    .hero-watermark {
      right: 4px;
      top: auto;
      bottom: 14%;
      opacity: 0.72;
    }

    .hero-copy {
      padding-top: 0;
    }

    h1,
    .hero-lead {
      max-width: none;
    }

    .hero-visual {
      min-height: 420px;
    }
  }

  @media (max-width: 720px) {
    .hero {
      min-height: auto;
      padding-top: 18px;
      padding-bottom: 28px;
    }

    .start-bar {
      grid-template-columns: 1fr;
    }

    .hero-actions {
      flex-direction: column;
      width: 100%;
    }

    .hero-primary-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .hero-watermark {
      top: -6px;
      right: -10px;
      bottom: auto;
      opacity: 0.56;
    }

    .watermark-line {
      font-size: clamp(3.5rem, 16vw, 5.4rem);
    }

    .proof-rail {
      grid-template-columns: 1fr;
    }

    .start-submit,
    .primary-cta,
    .secondary-cta {
      width: 100%;
    }

    .timeline-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .hero-visual {
      min-height: 340px;
    }

    .proof-panel {
      width: 100%;
      border-radius: 22px;
    }

    .panel-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 540px) {
    h1 {
      font-size: clamp(2.8rem, 12vw, 4.3rem);
    }

    .hero-lead {
      font-size: 1.04rem;
      line-height: 1.56;
    }

    .hero {
      padding-left: 18px;
      padding-right: 18px;
    }

    .proof-pill {
      padding: 14px;
    }

    .panel-topline,
    .panel-foot {
      align-items: flex-start;
    }

    .hero-watermark {
      right: -2px;
      top: 18px;
      opacity: 0.42;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    h1,
    .hero-lead {
      opacity: 1;
      transform: none;
      transition: none;
    }

    .panel-aura,
    .proof-panel {
      transition: none;
      transform: none !important;
    }
  }
</style>
