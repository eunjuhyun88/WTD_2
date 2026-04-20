<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    symCount?: number;
    live?: boolean;
  }

  const { symCount = 300, live = true }: Props = $props();

  function getTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  let currentTime = $state(getTime());
  $effect(() => {
    const interval = setInterval(() => { currentTime = getTime(); }, 1000);
    return () => clearInterval(interval);
  });

  const navItems = [
    { href: '/',          label: 'HOME' },
    { href: '/lab',       label: 'LAB'  },
    { href: '/dashboard', label: 'DASH' },
  ] as const;
</script>

<nav class="mobile-footer">
  <div class="mf-nav">
    {#each navItems as item}
      <a href={item.href} class="mf-link" class:active={$page.url.pathname === item.href}>
        {item.label}
      </a>
    {/each}
  </div>
  <div class="mf-status">
    <span class="dot" class:live />
    <span class="sym">{symCount}sym</span>
    <span class="sep">·</span>
    <span class="time">{currentTime}</span>
  </div>
</nav>

<style>
  .mobile-footer {
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--g1);
    border-top: 1px solid var(--g4);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.06em;
  }

  .mf-nav {
    display: flex;
    gap: 16px;
  }

  .mf-link {
    color: var(--g5);
    text-decoration: none;
    font-size: 9px;
    font-family: inherit;
    letter-spacing: 0.08em;
    transition: color 0.12s;
  }

  .mf-link:hover,
  .mf-link.active {
    color: var(--brand);
  }

  .mf-status {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--g5);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--g4);
    flex-shrink: 0;
  }

  .dot.live { background: var(--pos); }

  .sym, .time { color: var(--g6); }
  .sep { color: var(--g3); }
</style>
