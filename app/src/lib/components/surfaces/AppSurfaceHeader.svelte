<script lang="ts">
  import { priceStore } from '$lib/stores/priceStore';
  import NavInboxBadge from '$lib/components/header/NavInboxBadge.svelte';

  interface Props {
    active: 'terminal' | 'patterns' | 'lab' | 'dashboard';
  }

  let { active }: Props = $props();

  const prices = $derived($priceStore);
  const btcEntry = $derived(prices?.BTC);
  const btcPrice = $derived(typeof btcEntry === 'object' && btcEntry ? btcEntry.price : 0);

  function fmtPrice(v: number): string {
    if (!v) return '—';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
</script>

<header class="app-surface-header">
  <div class="app-surface-shell">
    <a class="app-brand" href="/">Cogochi</a>

    <div class="app-market-pill">
      <span>BTC</span>
      <strong>{fmtPrice(btcPrice)}</strong>
    </div>

    <nav class="app-surface-nav" aria-label="Primary">
      <a class:active={active === 'terminal'} class="app-surface-link" href="/terminal">Terminal</a>
      <a class:active={active === 'patterns'} class="app-surface-link" href="/patterns">Patterns</a>
      <a class:active={active === 'lab'} class="app-surface-link lab" href="/lab">Lab ★</a>
      <a class:active={active === 'dashboard'} class="app-surface-link" href="/dashboard">Dashboard</a>
    </nav>

    <NavInboxBadge />

    <a class="app-settings" href="/settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.9A3.1 3.1 0 1 0 12 15.1A3.1 3.1 0 1 0 12 8.9Z" />
        <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4.8c-.8-.7-1.7-1.2-2.8-1.5L13.8 2h-3.6l-.4 2.8c-1 .3-2 .8-2.8 1.5l-2.4-.8-2 3.5 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.5 2.4-.8c.8.7 1.7 1.2 2.8 1.5l.4 2.8h3.6l.4-2.8c1-.3 2-.8 2.8-1.5l2.4.8 2-3.5-2-1.5Z" />
      </svg>
    </a>

    <a class="app-connect" href="/settings">Connect</a>
  </div>
</header>

<style>
  .app-surface-header {
    position: sticky;
    top: 0;
    z-index: 60;
  }

  .app-surface-shell {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 68px;
    padding: 10px 18px;
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(8, 10, 14, 0.98), rgba(8, 10, 14, 0.94));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.03),
      0 14px 28px rgba(0,0,0,0.22);
  }

  .app-brand,
  .app-surface-link,
  .app-connect {
    text-decoration: none;
    text-transform: uppercase;
    font-family: var(--sc-font-mono);
    letter-spacing: 0.12em;
  }

  .app-brand {
    color: rgba(250,247,235,0.98);
    font-size: 1.02rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .app-market-pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(250,247,235,0.48);
    font-family: var(--sc-font-mono);
    font-size: 0.92rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .app-market-pill strong {
    color: rgba(250,247,235,0.9);
    font-size: 1.08rem;
    letter-spacing: 0;
  }

  .app-surface-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .app-surface-link {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
    color: rgba(250,247,235,0.38);
    font-size: 0.96rem;
    font-weight: 700;
    transition:
      color var(--sc-duration-fast),
      border-color var(--sc-duration-fast),
      background var(--sc-duration-fast);
  }

  .app-surface-link:hover,
  .app-surface-link.active {
    color: rgba(250,247,235,0.84);
    border-color: rgba(236, 168, 185, 0.24);
    background: rgba(255,255,255,0.03);
  }

  .app-surface-link.lab {
    color: rgba(236, 168, 185, 0.88);
  }

  .app-settings {
    margin-left: auto;
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(250,247,235,0.56);
  }

  .app-settings svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }

  .app-connect {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 54px;
    padding: 0 28px;
    border-radius: 999px;
    border: 1px solid rgba(219, 154, 159, 0.2);
    background: linear-gradient(180deg, rgba(250,247,235,0.98), rgba(244,236,229,0.94));
    color: #1c2026;
    font-size: 1rem;
    font-weight: 800;
  }

  @media (max-width: 960px) {
    .app-surface-shell {
      gap: 10px;
      padding: 10px 12px;
      border-radius: 16px;
    }

    .app-surface-nav {
      gap: 8px;
      overflow-x: auto;
      flex: 1;
    }

    .app-surface-link {
      font-size: 0.82rem;
      white-space: nowrap;
      padding: 0 14px;
    }

    .app-market-pill {
      padding: 0 12px;
      min-height: 42px;
      font-size: 0.78rem;
    }

    .app-market-pill strong {
      font-size: 0.94rem;
    }

    .app-connect {
      min-height: 42px;
      padding: 0 16px;
      font-size: 0.84rem;
    }
  }

  @media (max-width: 640px) {
    .app-brand {
      font-size: 0.86rem;
    }

    .app-market-pill,
    .app-settings,
    .app-connect {
      display: none;
    }
  }
</style>
