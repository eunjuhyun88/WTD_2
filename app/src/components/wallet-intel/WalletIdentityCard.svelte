<script lang="ts">
  import type { WalletIdentity } from '$lib/wallet-intel/walletIntelTypes';

  let {
    identity,
    onExit = () => {},
    dossierHref = '',
  }: {
    identity: WalletIdentity;
    onExit?: () => void;
    dossierHref?: string;
  } = $props();
</script>

<section class="wallet-card identity-card">
  <div class="identity-top">
    <div>
      <div class="eyebrow">Wallet Intel</div>
      <h2>{identity.displayAddress}</h2>
      <p>{identity.label} · {identity.entityType}</p>
    </div>
    <div class="actions">
      {#if dossierHref}
        <a class="ghost-link" href={dossierHref}>Dossier</a>
      {/if}
      <button type="button" class="ghost-btn" onclick={onExit}>Exit</button>
    </div>
  </div>

  <div class="identity-meta">
    <div class="meta-chip">
      <span>Chain</span>
      <strong>{identity.chain}</strong>
    </div>
    <div class="meta-chip">
      <span>Confidence</span>
      <strong>{identity.confidence}%</strong>
    </div>
    <div class="meta-chip">
      <span>First Seen</span>
      <strong>{identity.firstSeen}</strong>
    </div>
    <div class="meta-chip">
      <span>Last Active</span>
      <strong>{identity.lastActive}</strong>
    </div>
  </div>

  <p class="identity-note">{identity.narrative}</p>

  <div class="tag-row">
    {#each identity.tags as tag}
      <span class="tag">{tag}</span>
    {/each}
    {#each identity.aliases as alias}
      <span class="tag alt">{alias}</span>
    {/each}
  </div>
</section>

<style>
  .wallet-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(13, 19, 32, 0.96), rgba(8, 12, 22, 0.94));
    border-radius: 18px;
    padding: 18px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .identity-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .eyebrow {
    color: rgba(128, 192, 255, 0.72);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.1;
  }

  p {
    margin: 6px 0 0;
    color: rgba(240, 240, 240, 0.68);
    font-size: 13px;
  }

  .ghost-btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    border-radius: 999px;
    padding: 8px 12px;
    cursor: pointer;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ghost-link {
    border: 1px solid rgba(54, 215, 255, 0.18);
    background: rgba(54, 215, 255, 0.08);
    color: inherit;
    text-decoration: none;
    border-radius: 999px;
    padding: 8px 12px;
  }

  .identity-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 16px;
  }

  .meta-chip {
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    border-radius: 14px;
    padding: 10px 12px;
  }

  .meta-chip span {
    display: block;
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.45);
    margin-bottom: 6px;
  }

  .meta-chip strong {
    font-size: 13px;
  }

  .identity-note {
    margin-top: 14px;
    line-height: 1.5;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .tag {
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(0, 233, 184, 0.08);
    border: 1px solid rgba(0, 233, 184, 0.22);
    color: rgba(219, 255, 247, 0.92);
    font-size: 11px;
  }

  .tag.alt {
    background: rgba(255, 191, 95, 0.08);
    border-color: rgba(255, 191, 95, 0.22);
    color: rgba(255, 228, 176, 0.92);
  }
</style>
