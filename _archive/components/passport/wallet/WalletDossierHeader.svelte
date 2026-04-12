<script lang="ts">
  import type { WalletIdentity } from '$lib/wallet-intel/walletIntelTypes';

  let {
    identity,
    openInTerminalHref,
  }: {
    identity: WalletIdentity;
    openInTerminalHref: string;
  } = $props();
</script>

<section class="dossier-card header-card">
  <div class="header-top">
    <div>
      <div class="eyebrow">Wallet Dossier</div>
      <h1>{identity.displayAddress}</h1>
      <p>{identity.label} · {identity.entityType}</p>
    </div>
    <a class="terminal-link" href={openInTerminalHref}>Open In Terminal</a>
  </div>

  <div class="meta-grid">
    <div class="meta-cell">
      <span>Chain</span>
      <strong>{identity.chain}</strong>
    </div>
    <div class="meta-cell">
      <span>Confidence</span>
      <strong>{identity.confidence}%</strong>
    </div>
    <div class="meta-cell">
      <span>First Seen</span>
      <strong>{identity.firstSeen}</strong>
    </div>
    <div class="meta-cell">
      <span>Last Active</span>
      <strong>{identity.lastActive}</strong>
    </div>
  </div>

  <div class="tag-row">
    {#each identity.tags as tag}
      <span class="tag">{tag}</span>
    {/each}
  </div>
</section>

<style>
  .dossier-card {
    border: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(180deg, rgba(12,18,31,0.98), rgba(8,12,21,0.96));
    border-radius: 18px;
    padding: 20px;
  }
  .header-top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(128, 192, 255, 0.72);
    margin-bottom: 8px;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.1;
  }
  p {
    margin: 7px 0 0;
    color: rgba(255,255,255,0.64);
  }
  .terminal-link {
    padding: 10px 14px;
    border-radius: 999px;
    text-decoration: none;
    color: inherit;
    border: 1px solid rgba(54,215,255,0.24);
    background: rgba(54,215,255,0.08);
    white-space: nowrap;
  }
  .meta-grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 10px;
  }
  .meta-cell {
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.03);
  }
  .meta-cell span {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255,255,255,0.42);
    margin-bottom: 6px;
  }
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .tag {
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.05);
  }
  @media (max-width: 900px) {
    .meta-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .header-top { flex-direction: column; }
  }
</style>
