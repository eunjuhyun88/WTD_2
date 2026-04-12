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
</footer>

<style>
  .home-footer {
    position: relative;
    z-index: 3;
    padding: 0 clamp(22px, 4vw, 48px) calc(40px + env(safe-area-inset-bottom, 0px));
    font-family: var(--sc-font-body);
  }

  .footer-shell {
    width: min(1160px, 100%);
    margin: 0 auto;
    padding-top: 18px;
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
    gap: 12px;
    flex-wrap: wrap;
  }

  .footer-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(250, 247, 235, 0.58);
    cursor: pointer;
    font-family: var(--sc-font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.7rem;
  }

  .footer-link-strong {
    color: rgba(var(--home-accent-rgb), 0.9);
  }

  @media (max-width: 540px) {
    .home-footer {
      padding-left: 18px;
      padding-right: 18px;
    }
  }
</style>
