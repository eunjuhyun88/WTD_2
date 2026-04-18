<script lang="ts">
  let {
    onOpen
  }: {
    onOpen: (path: string, cta: string) => void;
  } = $props();
</script>

<section class="home-cta">
  <div class="footer-shell">
    <div class="footer-copy">
      <span class="footer-label">NEXT MOVE</span>
      <p>One first move is enough.</p>
    </div>

    <div class="footer-actions">
      <button type="button" class="footer-link footer-link-strong" onclick={() => onOpen('/terminal', 'footer_open_terminal')}>
        Start in Terminal
      </button>
      <button type="button" class="footer-link" onclick={() => onOpen('/lab', 'footer_open_lab_secondary')}>
        Lab
      </button>
      <button type="button" class="footer-link" onclick={() => onOpen('/dashboard', 'footer_open_dashboard')}>
        Dashboard
      </button>
    </div>
  </div>
</section>

<style>
  .home-cta {
    position: relative;
    z-index: 3;
    padding: 8px clamp(22px, 4vw, 48px) calc(52px + env(safe-area-inset-bottom, 0px));
    font-family: var(--sc-font-body);
  }

  .footer-shell {
    width: min(1160px, 100%);
    margin: 0 auto;
    padding-top: 24px;
    border-top: 1px solid rgba(250, 247, 235, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }

  .footer-copy {
    display: grid;
    gap: 8px;
  }

  .footer-label,
  .footer-link {
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.7rem;
  }

  .footer-label {
    color: rgba(var(--home-accent-rgb), 0.84);
  }

  .footer-copy p {
    margin: 0;
    color: rgba(250, 247, 235, 0.68);
    font-size: 0.96rem;
    line-height: 1.56;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .footer-link {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.72);
    cursor: pointer;
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.7rem;
  }

  .footer-link-strong {
    color: rgba(var(--home-accent-rgb), 0.9);
    background: rgba(255, 255, 255, 0.06);
  }

  .footer-link:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  @media (max-width: 540px) {
    .home-cta {
      padding-left: 18px;
      padding-right: 18px;
    }

    .footer-actions {
      width: 100%;
    }

    .footer-link {
      width: 100%;
      justify-content: center;
    }
  }
</style>
