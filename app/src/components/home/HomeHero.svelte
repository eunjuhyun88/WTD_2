<script lang="ts">
  import type { ExamplePrompt, ProofRow } from '$lib/home/homeLanding';

  let {
    mounted = false,
    promptText = '',
    examplePrompts = [],
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
    <div class="story-panel">
      <div class="hero-meta">
        <span class="eyebrow">PERSONAL MARKET MEMORY</span>
        <p>A product that lets you pull the same judgment back into the next similar moment.</p>
      </div>

      <div class="headline-block">
        <span class="brand-name">COGOCHI</span>
        <h1 class:visible={mounted}>Markets move on. Your judgment should stay.</h1>
      </div>

      <p class:visible={mounted} class="hero-lead">
        Cogochi stores the way a trader judged a setup, then brings it back first when a similar
        moment returns. It is a personal market memory for real trading decisions.
      </p>
    </div>

    <form class="start-card" onsubmit={(event) => { event.preventDefault(); onPromptSubmit(); }}>
      <div class="start-copy">
        <span class="start-label">START WITH ONE LINE</span>
        <h2>Write down the setup you are seeing now.</h2>
        <p>Start here once. Watching and validation continue behind the scenes.</p>
      </div>

      <label class="composer" aria-label="Open Terminal with query">
        <div class="composer-shell">
          <div class="composer-row">
            <span class="composer-prefix">&gt;</span>
            <input
              type="text"
              value={promptText}
              oninput={(event) => onPromptInput((event.currentTarget as HTMLInputElement).value)}
              onkeydown={handleKeydown}
              placeholder="btc 4h reclaim after selloff"
            />
          </div>
          <button type="submit" class="composer-submit">Start in Terminal</button>
        </div>
      </label>

      <div class="prompt-row">
        {#each examplePrompts as item}
          <button type="button" class="prompt-chip" onclick={() => onPickPrompt(item.prompt)}>
            {item.label}
          </button>
        {/each}
      </div>

      <div class="start-footer">
        <p class="start-note">Enter it once. Similar scenes come back to you later.</p>
        <div class="inline-links">
          <button type="button" class="quiet-link" onclick={() => onOpen('/lab', 'hero_lab_secondary')}>
            Open Lab
          </button>
          <button type="button" class="quiet-link" onclick={() => onOpen('/dashboard', 'hero_dashboard_return')}>
            Open Dashboard
          </button>
        </div>
      </div>
    </form>

    <div class="proof-strip" style:transform={`translate3d(${mx * 1.2}px, ${my * 0.8}px, 0)`}>
      <span class="card-kicker">PROOF</span>
      <div class="proof-list">
        {#each proofRows as row}
          <div class="proof-row">
            <span class="proof-stage">{row.stage}</span>
            <div class="proof-body">
              <strong>{row.title}</strong>
              <p>{row.detail}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .hero {
    position: relative;
    padding: clamp(96px, 12vh, 144px) clamp(22px, 4vw, 48px) 56px;
    font-family: var(--sc-font-body);
  }

  .hero-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(28px, 3.4vw, 40px);
    align-items: start;
  }

  .story-panel {
    position: relative;
    display: grid;
    align-content: start;
    gap: 18px;
    min-height: auto;
    padding: 10px 0 0;
    overflow: visible;
    max-width: 980px;
    justify-self: center;
    justify-items: center;
    text-align: center;
  }

  .story-panel::before {
    content: '';
    position: absolute;
    inset: -96px -160px -64px;
    background:
      radial-gradient(circle at 50% 36%, rgba(7, 7, 7, 0.58), rgba(7, 7, 7, 0.24) 42%, transparent 76%);
    filter: blur(24px);
    pointer-events: none;
    z-index: 0;
  }

  .story-panel::after {
    content: 'COGOCHI';
    position: absolute;
    left: 55%;
    top: clamp(116px, 13vw, 166px);
    transform: translateX(-50%);
    font-family: var(--sc-font-body);
    font-size: clamp(4.8rem, 11vw, 8.8rem);
    font-weight: 700;
    letter-spacing: -0.08em;
    line-height: 0.82;
    color: rgba(var(--home-accent-rgb), 0.05);
    pointer-events: none;
    user-select: none;
    z-index: 0;
  }

  .hero-meta,
  .headline-block,
  .start-copy {
    display: grid;
    gap: 8px;
    position: relative;
    z-index: 1;
  }

  .eyebrow,
  .brand-name,
  .start-label,
  .card-kicker,
  .proof-stage,
  .prompt-chip,
  .quiet-link {
    font-family: var(--sc-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 0.7rem;
  }

  .eyebrow,
  .proof-stage {
    color: rgba(var(--home-accent-rgb), 0.74);
  }

  .brand-name {
    color: rgba(var(--home-accent-rgb), 0.56);
  }

  .hero-meta p,
  .start-copy p,
  .start-note {
    margin: 0;
    font-size: 0.98rem;
    line-height: 1.62;
  }

  .hero-meta p {
    max-width: 28rem;
    color: rgba(250, 247, 235, 0.68);
    font-size: 0.98rem;
  }

  h1 {
    margin: 0;
    max-width: 11.8ch;
    font-size: clamp(3.85rem, 6.15vw, 5.9rem);
    line-height: 0.92;
    letter-spacing: -0.066em;
    text-wrap: balance;
    color: rgba(250, 247, 235, 0.995);
    opacity: 0;
    transform: translateY(18px);
    transition:
      opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    z-index: 2;
  }

  h1.visible,
  .hero-lead.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .hero-lead {
    max-width: 38rem;
    margin: 0;
    color: rgba(250, 247, 235, 0.94);
    font-size: clamp(1.14rem, 1.58vw, 1.34rem);
    line-height: 1.74;
    opacity: 0;
    transform: translateY(12px);
    transition:
      opacity 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.12s,
      transform 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.12s;
    position: relative;
    z-index: 2;
  }

  .start-card {
    display: grid;
    gap: 20px;
    width: min(100%, 760px);
    padding: 28px 28px 24px;
    border-radius: 34px;
    border: 1px solid rgba(249, 216, 194, 0.48);
    background:
      linear-gradient(180deg, rgba(250, 247, 235, 0.84), rgba(249, 246, 241, 0.76)),
      linear-gradient(180deg, rgba(255, 127, 133, 0.04), rgba(255, 127, 133, 0));
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(10px);
    align-self: start;
    justify-self: center;
    margin-top: -4px;
  }

  .start-label {
    color: rgba(96, 67, 67, 0.62);
  }

  .start-copy {
    justify-items: center;
    text-align: center;
  }

  .start-copy h2 {
    margin: 0;
    color: #171214;
    letter-spacing: -0.05em;
    font-size: clamp(1.56rem, 2.05vw, 1.96rem);
    line-height: 1.08;
  }

  .start-copy p,
  .start-note {
    color: rgba(24, 19, 20, 0.68);
  }

  .start-copy p {
    font-size: 1rem;
    line-height: 1.62;
  }

  .composer {
    display: block;
  }

  .composer-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    gap: 10px;
    padding: 10px;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(21, 19, 20, 0.98), rgba(12, 11, 12, 0.98));
    border: 1px solid rgba(17, 13, 14, 0.12);
    box-shadow: inset 0 1px 0 rgba(250, 247, 235, 0.03);
  }

  .composer-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-height: 66px;
    padding: 0 20px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.02);
  }

  .composer-prefix {
    color: rgba(var(--home-accent-rgb), 0.96);
    font-family: var(--sc-font-mono);
    font-size: 1rem;
  }

  .composer input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 247, 244, 0.96);
    font-family: var(--sc-font-body);
    font-size: 1.04rem;
    outline: none;
  }

  .composer input::placeholder {
    color: rgba(255, 247, 244, 0.42);
  }

  .composer-submit {
    width: 208px;
    min-width: 0;
    min-height: 66px;
    padding: 0 20px;
    border-radius: 18px;
    border: 1px solid rgba(236, 147, 147, 0.36);
    background: linear-gradient(180deg, rgba(249, 216, 194, 0.98), rgba(219, 154, 159, 0.96));
    color: #171214;
    font-family: var(--sc-font-body);
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(219, 154, 159, 0.18);
    transition:
      transform var(--sc-duration-fast),
      box-shadow var(--sc-duration-fast);
  }

  .composer-submit:hover,
  .prompt-chip:hover {
    transform: translateY(-1px);
  }

  .composer-submit:hover {
    box-shadow: 0 14px 28px rgba(219, 154, 159, 0.22);
  }

  .prompt-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
  }

  .prompt-chip {
    min-height: 36px;
    padding: 0 13px;
    border-radius: 999px;
    border: 1px solid rgba(219, 154, 159, 0.18);
    background: rgba(255, 255, 255, 0.28);
    color: rgba(46, 31, 31, 0.72);
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      color var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .prompt-chip:hover {
    border-color: rgba(219, 154, 159, 0.32);
    background: rgba(255, 255, 255, 0.42);
  }

  .start-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px 16px;
    flex-wrap: wrap;
  }

  .start-note {
    text-align: center;
  }

  .inline-links {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .quiet-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(72, 50, 50, 0.58);
    cursor: pointer;
    transition: color var(--sc-duration-fast);
  }

  .quiet-link:hover {
    color: rgba(23, 18, 20, 0.86);
  }

  .card-kicker {
    color: rgba(var(--home-accent-rgb), 0.52);
  }

  .proof-strip {
    display: grid;
    gap: 14px;
    width: min(100%, 1100px);
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    justify-self: center;
    margin-top: -2px;
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .card-kicker {
    justify-self: center;
  }

  .proof-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
  }

  .proof-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid rgba(250, 247, 235, 0.08);
  }

  .proof-body {
    display: grid;
    gap: 4px;
  }

  .proof-body strong {
    color: rgba(250, 247, 235, 0.8);
    font-size: 0.84rem;
    line-height: 1.34;
  }

  .proof-body p {
    margin: 0;
    color: rgba(250, 247, 235, 0.5);
    font-size: 0.76rem;
    line-height: 1.5;
  }

  @media (max-width: 980px) {
    .story-panel {
      min-height: auto;
    }

    .proof-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
  }

  @media (max-width: 760px) {
    .hero {
      padding-top: 98px;
      padding-bottom: 40px;
    }

    .story-panel {
      justify-items: start;
      text-align: left;
      gap: 16px;
    }

    .story-panel::after {
      left: auto;
      right: -2px;
      top: 112px;
      transform: none;
    }

    .hero-meta p,
    .hero-lead {
      max-width: 100%;
    }

    h1 {
      max-width: 10.4ch;
      font-size: clamp(3.08rem, 11vw, 4.5rem);
      line-height: 0.95;
    }

    .hero-lead {
      font-size: 1.06rem;
      line-height: 1.68;
    }

    .start-copy {
      justify-items: start;
      text-align: left;
    }

    .prompt-row,
    .start-footer,
    .inline-links {
      justify-content: flex-start;
    }

    .composer-shell {
      grid-template-columns: 1fr;
    }

    .composer-submit {
      width: 100%;
      max-width: none;
    }

    .start-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .proof-list {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 540px) {
    .hero {
      padding-top: 88px;
      padding-left: 18px;
      padding-right: 18px;
      padding-bottom: 30px;
    }

    .start-card {
      padding: 22px 20px 20px;
      border-radius: 26px;
    }

    h1 {
      max-width: 10ch;
      font-size: clamp(2.96rem, 12vw, 4rem);
      letter-spacing: -0.058em;
    }

    .hero-meta p {
      font-size: 0.94rem;
      line-height: 1.74;
    }

    .hero-lead {
      font-size: 1rem;
      line-height: 1.7;
    }

    .proof-row {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .composer-row {
      min-height: 58px;
      padding: 0 16px;
    }

    .composer-submit {
      min-height: 54px;
      font-size: 0.9rem;
    }
  }
</style>
