<script lang="ts">
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';

  interface Props { children: Snippet }
  let { children }: Props = $props();

  const path = $derived($page.url.pathname);

  const tabs = [
    { href: '/lab',              label: 'Backtest' },
    { href: '/lab/analyze',      label: 'AI Analysis' },
    { href: '/lab/ledger',       label: 'Ledger' },
  ];

  function active(href: string): boolean {
    if (href === '/lab') return path === '/lab';
    return path === href || path.startsWith(href + '/');
  }
</script>

<nav class="hub-tabs" aria-label="Lab navigation">
  {#each tabs as tab}
    <a
      href={tab.href}
      class="hub-tab"
      class:active={active(tab.href)}
      aria-current={active(tab.href) ? 'page' : undefined}
    >{tab.label}</a>
  {/each}
</nav>

{@render children()}

<style>
  .hub-tabs {
    display: flex;
    gap: 2px;
    padding: 0 20px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.07);
    background: rgba(6, 6, 7, 0.6);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .hub-tab {
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(250, 247, 235, 0.38);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .hub-tab:hover { color: rgba(250, 247, 235, 0.65); }

  .hub-tab.active {
    color: rgba(250, 247, 235, 0.92);
    border-bottom-color: rgba(219, 154, 159, 0.8);
  }

  @media (max-width: 768px) {
    .hub-tabs {
      padding: 0 12px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .hub-tabs::-webkit-scrollbar { display: none; }
    .hub-tab { padding: 10px 10px; font-size: 11px; }
  }
</style>
