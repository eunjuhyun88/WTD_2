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
      <h2>Start with a pattern. End with proof.</h2>
      <p>
        Home should tell you what this product does and make the first move obvious. The work itself still happens in Terminal, Lab, and Dashboard.
      </p>
    </div>

    <div class="footer-actions">
      <button type="button" class="footer-cta footer-cta-primary" onclick={() => onOpen('/terminal', 'footer_open_terminal')}>
        OPEN TERMINAL
      </button>
      <button type="button" class="footer-cta footer-cta-secondary" onclick={() => onOpen('/lab', 'footer_open_lab')}>
        OPEN LAB
      </button>
      <button type="button" class="footer-link" onclick={() => onOpen('/dashboard', 'footer_open_dashboard')}>
        RETURN TO DASHBOARD
      </button>
    </div>
  </div>
</footer>

<style>
  .home-footer {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) calc(42px + env(safe-area-inset-bottom, 0px));
  }

  .footer-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 26px 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    align-items: end;
  }

  .footer-copy {
    display: grid;
    gap: 10px;
  }

  .footer-label {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
    color: rgba(227, 180, 185, 0.84);
  }

  .footer-copy h2 {
    margin: 0;
    color: rgba(247, 242, 234, 0.94);
    font-size: clamp(1.8rem, 2.8vw, 2.8rem);
    letter-spacing: -0.045em;
  }

  .footer-copy p {
    margin: 0;
    max-width: 40rem;
    color: rgba(247, 242, 234, 0.6);
    line-height: 1.6;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .footer-cta,
  .footer-link {
    font: inherit;
    cursor: pointer;
    transition:
      transform var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast),
      color var(--sc-duration-fast);
  }

  .footer-cta {
    min-height: 46px;
    padding: 0 16px;
    border-radius: 14px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .footer-cta-primary {
    border: 1px solid rgba(227, 180, 185, 0.42);
    background: linear-gradient(180deg, #e3b4b9, #c78f95);
    color: #050505;
  }

  .footer-cta-secondary {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(247, 242, 234, 0.9);
  }

  .footer-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(247, 242, 234, 0.54);
    font-size: 0.94rem;
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
  }

  @media (max-width: 720px) {
    .footer-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .footer-cta {
      width: 100%;
    }
  }

  @media (max-width: 540px) {
    .home-footer {
      padding-left: 18px;
      padding-right: 18px;
    }
  }
</style>
