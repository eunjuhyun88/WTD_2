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
    <div class="hero-copy">
      <div class="eyebrow">COGOCHI</div>
      <h1 class:visible={mounted}>Teach the market AI how you actually judge.</h1>
      <p class:visible={mounted} class="hero-lead">
        Save the setup you care about, let the system keep watch, then use your verdicts to ship a model that gets closer to your edge.
      </p>

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

      <div class="prompt-chips">
        {#each examplePrompts as item}
          <button type="button" class="prompt-chip" onclick={() => onPickPrompt(item.prompt)}>
            {item.label}
          </button>
        {/each}
      </div>

      <div class="hero-actions">
        <button type="button" class="secondary" onclick={() => onOpen('/lab', 'hero_lab_secondary')}>
          SEE HOW LAB SCORES IT
        </button>
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
        <div class="panel-topline">
          <span class="panel-chip">Proof Before Trust</span>
          <span class="panel-chip subtle">Per-user adapter</span>
        </div>

        <div class="panel-head">
          <p class="panel-kicker">One trader. One record.</p>
          <h2>Your edge becomes system behavior.</h2>
          <p>
            Cogochi does not ask you to trust a generic market bot. It ties saved setups, verdicts, and deployment gates back to one trader and one evolving record.
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
    min-height: clamp(720px, calc(100dvh - 96px), 920px);
    padding: clamp(28px, 4vw, 48px) clamp(22px, 4vw, 48px) clamp(36px, 5vw, 60px);
  }

  .hero-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 0.95fr);
    gap: clamp(24px, 3vw, 46px);
    align-items: center;
  }

  .hero-copy {
    display: grid;
    gap: 18px;
    align-content: start;
  }

  .eyebrow,
  .panel-kicker,
  .timeline-stage,
  .proof-pill span,
  .foot-stat span,
  .start-kicker {
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
    border: 1px solid rgba(247, 242, 234, 0.12);
    background: rgba(10, 10, 12, 0.56);
    color: rgba(247, 242, 234, 0.78);
  }

  h1,
  .panel-head h2 {
    margin: 0;
    letter-spacing: -0.05em;
    line-height: 0.96;
    font-weight: 650;
  }

  h1 {
    max-width: 9ch;
    font-size: clamp(3.5rem, 8vw, 7.3rem);
    color: rgba(247, 242, 234, 0.97);
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
    max-width: 37rem;
    margin: 0;
    color: rgba(247, 242, 234, 0.68);
    font-size: clamp(1.02rem, 1.48vw, 1.16rem);
    line-height: 1.62;
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
    padding: 10px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background:
      linear-gradient(180deg, rgba(14, 16, 22, 0.82), rgba(9, 10, 14, 0.72)),
      radial-gradient(circle at left center, rgba(227, 180, 185, 0.06), transparent 26%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 22px 54px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(28px) saturate(1.08);
    -webkit-backdrop-filter: blur(28px) saturate(1.08);
  }

  .start-shell {
    display: grid;
    gap: 7px;
    min-width: 0;
    padding: 4px 6px 4px 8px;
  }

  .start-kicker {
    color: rgba(227, 180, 185, 0.82);
  }

  .start-shell input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: rgba(247, 242, 234, 0.95);
    font: inherit;
    font-size: clamp(1rem, 1.6vw, 1.1rem);
    line-height: 1.4;
  }

  .start-shell input::placeholder {
    color: rgba(247, 242, 234, 0.38);
  }

  .start-submit,
  .secondary,
  .prompt-chip,
  .text-link {
    font: inherit;
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
    padding: 0 18px;
    border-radius: 16px;
    border: 1px solid rgba(227, 180, 185, 0.42);
    background: linear-gradient(180deg, #ead0d3, #d59ea4);
    color: #060606;
    font-weight: 700;
    letter-spacing: 0.05em;
    box-shadow: 0 16px 38px rgba(213, 158, 164, 0.18);
  }

  .start-submit:hover,
  .secondary:hover,
  .prompt-chip:hover {
    transform: translateY(-1px);
  }

  .start-submit:hover {
    background: linear-gradient(180deg, #f0dadc, #daadb2);
  }

  .prompt-chips,
  .hero-actions,
  .proof-rail {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .prompt-chip {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(247, 242, 234, 0.82);
    letter-spacing: 0.03em;
  }

  .prompt-chip:hover {
    border-color: rgba(227, 180, 185, 0.22);
    color: rgba(247, 242, 234, 0.95);
  }

  .secondary {
    min-height: 46px;
    padding: 0 16px;
    border-radius: 14px;
    border: 1px solid rgba(247, 242, 234, 0.12);
    background: rgba(255, 255, 255, 0.02);
    color: rgba(247, 242, 234, 0.92);
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .text-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(247, 242, 234, 0.54);
    font-size: 0.84rem;
    letter-spacing: 0.05em;
  }

  .text-link:hover {
    color: rgba(227, 180, 185, 0.92);
  }

  .proof-pill,
  .proof-panel {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 14, 20, 0.66);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 22px 60px rgba(0, 0, 0, 0.26);
    backdrop-filter: blur(28px) saturate(1.1);
    -webkit-backdrop-filter: blur(28px) saturate(1.1);
  }

  .proof-pill {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 18px;
    flex: 1 1 180px;
  }

  .proof-pill span,
  .panel-kicker,
  .timeline-stage {
    color: rgba(227, 180, 185, 0.84);
  }

  .proof-pill strong,
  .foot-stat strong {
    font-size: 0.95rem;
    line-height: 1.3;
    color: rgba(247, 242, 234, 0.92);
  }

  .hero-visual {
    position: relative;
    min-height: 640px;
    display: grid;
    place-items: center;
  }

  .panel-aura {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(44rem, 88%);
    aspect-ratio: 1;
    border-radius: 50%;
    opacity: 0.14;
    background:
      radial-gradient(circle, rgba(227, 180, 185, 0.18), rgba(227, 180, 185, 0.05) 36%, transparent 72%);
    filter: blur(48px);
    pointer-events: none;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
    transform: translate(-50%, -50%);
  }

  .proof-panel {
    position: relative;
    z-index: 2;
    width: min(520px, 100%);
    padding: 22px;
    border-radius: 28px;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .panel-topline,
  .panel-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .panel-chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(227, 180, 185, 0.16);
    background: rgba(227, 180, 185, 0.08);
    color: rgba(247, 242, 234, 0.88);
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .panel-chip.subtle {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .panel-head {
    display: grid;
    gap: 10px;
    padding: 18px 0 20px;
  }

  .panel-head h2 {
    font-size: clamp(1.9rem, 4vw, 3rem);
    color: rgba(247, 242, 234, 0.97);
  }

  .panel-head p,
  .timeline-body p {
    margin: 0;
    color: rgba(247, 242, 234, 0.62);
    line-height: 1.58;
  }

  .timeline {
    display: grid;
    gap: 12px;
  }

  .timeline-row {
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 14px;
    padding: 14px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .timeline-body {
    display: grid;
    gap: 4px;
  }

  .timeline-body strong {
    margin: 0;
    font-size: 1.12rem;
    line-height: 1.24;
    color: rgba(247, 242, 234, 0.94);
  }

  .panel-foot {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .foot-stat {
    display: grid;
    gap: 4px;
  }

  .foot-stat span {
    color: rgba(247, 242, 234, 0.4);
  }

  @media (max-width: 1180px) {
    .hero-shell {
      grid-template-columns: 1fr;
      gap: 30px;
    }

    .hero-copy {
      justify-items: center;
      text-align: center;
    }

    h1,
    .hero-lead {
      max-width: none;
    }

    .hero-visual {
      min-height: 560px;
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

    .secondary,
    .start-submit {
      width: 100%;
    }

    .timeline-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .hero-visual {
      min-height: 420px;
    }

    .proof-panel {
      padding: 18px;
      border-radius: 22px;
    }
  }

  @media (max-width: 540px) {
    h1 {
      font-size: clamp(2.7rem, 13vw, 4.5rem);
    }

    .hero-lead {
      font-size: 0.98rem;
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
