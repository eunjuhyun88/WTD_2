<script lang="ts">
  let {
    onOpen
  }: {
    onOpen: (path: string, cta: string) => void;
  } = $props();
</script>

<footer class="home-footer">
  <div class="footer-shell">
    <div class="footer-copy">
      <span class="footer-label">COGOCHI</span>
      <h2>Start in Terminal. Judge in Lab. Return through Dashboard.</h2>
      <p>
        Home should stay quiet at the end. The job is simple: make the first move obvious and make the three-surface loop easy to remember.
      </p>
    </div>

    <div class="footer-actions">
      <div class="footer-cta-row">
        <button type="button" class="footer-cta footer-cta-primary" onclick={() => onOpen('/terminal', 'footer_open_terminal')}>
          OPEN TERMINAL
        </button>
        <button type="button" class="footer-cta footer-cta-secondary" onclick={() => onOpen('/lab', 'footer_open_lab')}>
          OPEN LAB
        </button>
      </div>

      <div class="footer-link-row">
        <button type="button" class="footer-link" onclick={() => onOpen('/dashboard', 'footer_open_dashboard')}>
          DASHBOARD
        </button>
        <button type="button" class="footer-link" onclick={() => onOpen('/terminal', 'footer_open_terminal_secondary')}>
          TERMINAL
        </button>
        <button type="button" class="footer-link" onclick={() => onOpen('/lab', 'footer_open_lab_secondary')}>
          LAB
        </button>
      </div>
    </div>
  </div>
</footer>

<style>
  .home-footer {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) calc(42px + env(safe-area-inset-bottom, 0px));
    font-family: var(--sc-font-body);
  }

  .footer-shell {
    position: relative;
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 26px 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    align-items: end;
  }

  .footer-shell::before {
    content: '';
    position: absolute;
    right: 0;
    top: -34px;
    width: min(320px, 42vw);
    height: 160px;
    border-radius: 999px;
    background:
      radial-gradient(circle at 22% 45%, rgba(255, 79, 163, 0.18), transparent 42%),
      radial-gradient(circle at 78% 40%, rgba(121, 228, 255, 0.12), transparent 38%);
    filter: blur(24px);
    opacity: 0.8;
    pointer-events: none;
  }

  .footer-copy {
    display: grid;
    gap: 10px;
  }

  .footer-label {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
    color: rgba(255, 79, 163, 0.9);
  }

  .footer-copy h2 {
    margin: 0;
    color: rgba(255, 247, 244, 0.95);
    font-family: var(--sc-font-body);
    font-size: clamp(1.82rem, 2.8vw, 2.7rem);
    letter-spacing: -0.045em;
  }

  .footer-copy p {
    margin: 0;
    max-width: 34rem;
    color: rgba(255, 247, 244, 0.62);
    font-size: 1.04rem;
    line-height: 1.65;
  }

  .footer-actions {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 12px;
    justify-items: end;
  }

  .footer-cta-row,
  .footer-link-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .footer-cta,
  .footer-link {
    font-family: var(--sc-font-mono);
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast),
      color var(--sc-duration-fast);
  }

  .footer-cta {
    min-height: 48px;
    padding: 0 18px;
    border-radius: 14px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .footer-cta-primary {
    border: 1px solid rgba(255, 79, 163, 0.22);
    background: linear-gradient(135deg, #ff4fa3, #ff8a63);
    color: #070707;
    box-shadow: 0 16px 34px rgba(255, 79, 163, 0.2);
  }

  .footer-cta-secondary {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 247, 244, 0.92);
  }

  .footer-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 247, 244, 0.64);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    line-height: 1.4;
  }

  .footer-cta:hover,
  .footer-link:hover {
    transform: translateY(-1px);
  }

  .footer-link:hover {
    color: rgba(227, 180, 185, 0.92);
  }

  @media (max-width: 860px) {
    .footer-shell {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .footer-actions {
      justify-items: stretch;
    }
  }

  @media (max-width: 720px) {
    .footer-cta-row,
    .footer-link-row {
      flex-direction: column;
      align-items: stretch;
    }

    .footer-cta {
      width: 100%;
    }

    .footer-link-row {
      gap: 8px;
    }
  }

  @media (max-width: 540px) {
    .home-footer {
      padding-left: 18px;
      padding-right: 18px;
    }
  }
</style>
