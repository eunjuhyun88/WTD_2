<script lang="ts">
  import { goto } from '$app/navigation';

  const NAV_COLS = [
    {
      heading: 'Product',
      links: [
        { label: 'Terminal', href: '/terminal' },
        { label: 'Lab', href: '/lab' },
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Patterns', href: '/patterns' },
      ],
    },
    {
      heading: 'Account',
      links: [
        { label: 'Sign In', href: '/passport' },
        { label: 'Settings', href: '/settings' },
      ],
    },
  ];

  const YEAR = new Date().getFullYear();

  function nav(href: string) {
    void goto(href);
  }
</script>

<footer class="site-footer">
  <!-- Tier 1: Navigation -->
  <div class="footer-nav">
    <div class="footer-brand">
      <span class="brand-mark">COGOCHI</span>
      <p class="brand-tagline">Your personal market memory.</p>
    </div>

    <div class="footer-cols">
      {#each NAV_COLS as col}
        <div class="footer-col">
          <span class="col-heading">{col.heading}</span>
          <ul>
            {#each col.links as link}
              <li>
                <button class="footer-link" onclick={() => nav(link.href)}>
                  {link.label}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>

  <!-- Tier 2: Legal -->
  <div class="footer-legal">
    <span class="copy">© {YEAR} Cogochi. All rights reserved.</span>
  </div>
</footer>

<style>
  .site-footer {
    font-family: var(--sc-font-body);
    border-top: 1px solid rgba(249, 216, 194, 0.07);
    margin-top: 0;
  }

  /* ─── Tier 1 ─── */
  .footer-nav {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 40px;
    padding: 48px clamp(22px, 4vw, 64px) 36px;
    max-width: 1180px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .brand-mark {
    font-family: var(--sc-font-body);
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(250, 247, 235, 0.9);
  }

  .brand-tagline {
    margin: 0;
    font-size: 0.82rem;
    color: rgba(250, 247, 235, 0.38);
    line-height: 1.5;
  }

  .footer-cols {
    display: flex;
    gap: 48px;
  }

  .footer-col {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .col-heading {
    font-family: var(--sc-font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(var(--home-accent-rgb, 219, 154, 159), 0.52);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .footer-link {
    background: none;
    border: none;
    padding: 0;
    font-family: var(--sc-font-body);
    font-size: 0.84rem;
    font-weight: 500;
    color: rgba(250, 247, 235, 0.52);
    cursor: pointer;
    text-align: left;
    transition: color 120ms ease;
  }

  .footer-link:hover {
    color: rgba(250, 247, 235, 0.86);
  }

  /* ─── Tier 2 ─── */
  .footer-legal {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px clamp(22px, 4vw, 64px);
    max-width: 1180px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
    border-top: 1px solid rgba(249, 216, 194, 0.05);
  }

  .copy {
    font-family: var(--sc-font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    color: rgba(250, 247, 235, 0.28);
  }

  /* ─── Mobile ─── */
  @media (max-width: 768px) {
    .footer-nav {
      grid-template-columns: 1fr;
      gap: 28px;
      padding: 36px 18px 24px;
    }

    .footer-cols {
      gap: 32px;
    }

    .footer-legal {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
