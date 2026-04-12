<!-- ═══════════════════════════════════════════════════════════════
     STOCKCLAW — EmptyState Component
     Displays character illustration + message + CTA for empty data
═══════════════════════════════════════════════════════════════ -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let image: string = '/characters/trading-states.jpg';
  export let title: string = 'Nothing here yet';
  export let subtitle: string = '';
  export let ctaText: string = '';
  export let ctaHref: string = '';
  export let icon: string = '';
  export let compact: boolean = false;
  export let variant: 'default' | 'purple' | 'cyan' | 'pink' | 'green' | 'orange' = 'default';

  function handleCTA() {
    dispatch('action');
    if (ctaHref) {
      window.location.href = ctaHref;
    }
  }

  const variantColors: Record<string, { accent: string; glow: string }> = {
    default: { accent: '#E8967D', glow: 'rgba(232,150,125,.15)' },
    purple: { accent: '#8b5cf6', glow: 'rgba(139,92,246,.15)' },
    cyan: { accent: '#00d4ff', glow: 'rgba(0,212,255,.15)' },
    pink: { accent: '#ff2d9b', glow: 'rgba(255,45,155,.15)' },
    green: { accent: '#00ff88', glow: 'rgba(0,255,136,.15)' },
    orange: { accent: '#ff8c3b', glow: 'rgba(255,140,59,.15)' },
  };
  $: colors = variantColors[variant] || variantColors.default;
</script>

<div class="empty" class:compact style="--es-accent:{colors.accent}; --es-glow:{colors.glow}">
  <div class="empty-art">
    {#if icon}
      <div class="empty-icon">{icon}</div>
    {/if}
    <img src={image} alt="" class="empty-img" loading="lazy" />
    <div class="empty-img-glow"></div>
  </div>

  <div class="empty-text">
    <h4 class="empty-title">{title}</h4>
    {#if subtitle}
      <p class="empty-sub">{subtitle}</p>
    {/if}
  </div>

  {#if ctaText}
    <button class="empty-cta" on:click={handleCTA}>{ctaText}</button>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 20px;
    text-align: center;
    min-height: 200px;
  }
  .empty.compact {
    padding: 16px 12px;
    min-height: 120px;
    gap: 8px;
  }

  /* Art container */
  .empty-art {
    position: relative;
    width: 140px;
    height: 140px;
    flex-shrink: 0;
  }
  .compact .empty-art {
    width: 80px;
    height: 80px;
  }
  .empty-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
    border: 3px solid #000;
    box-shadow: 4px 4px 0 #000, 0 0 20px var(--es-glow);
    opacity: .85;
    transition: opacity .3s;
  }
  .empty:hover .empty-img {
    opacity: 1;
  }
  .compact .empty-img {
    border-radius: 12px;
    border-width: 2px;
    box-shadow: 3px 3px 0 #000;
  }
  .empty-img-glow {
    position: absolute;
    inset: -8px;
    border-radius: 20px;
    background: radial-gradient(circle, var(--es-glow) 0%, transparent 70%);
    z-index: -1;
    animation: emptyGlow 3s ease infinite;
  }
  @keyframes emptyGlow {
    0%, 100% { opacity: .4; transform: scale(1); }
    50% { opacity: .8; transform: scale(1.05); }
  }

  .empty-icon {
    position: absolute;
    top: -8px;
    right: -8px;
    font-size: 24px;
    z-index: 2;
    filter: drop-shadow(2px 2px 0 #000);
    animation: iconBounce 2s ease infinite;
  }
  .compact .empty-icon {
    font-size: 18px;
    top: -6px;
    right: -6px;
  }
  @keyframes iconBounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }

  /* Text */
  .empty-text { max-width: 280px; }
  .empty-title {
    font-family: var(--fd);
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 2px;
    color: var(--es-accent);
    text-shadow: 2px 2px 0 #000;
    margin: 0;
  }
  .compact .empty-title {
    font-size: 11px;
    letter-spacing: 1px;
  }
  .empty-sub {
    font-family: var(--fb);
    font-size: 10px;
    color: rgba(255,255,255,.4);
    margin-top: 4px;
    line-height: 1.5;
  }
  .compact .empty-sub {
    font-size: 8px;
  }

  /* CTA */
  .empty-cta {
    font-family: var(--fd);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #000;
    background: var(--es-accent);
    border: 2px solid #000;
    box-shadow: 3px 3px 0 #000;
    padding: 8px 20px;
    border-radius: 8px;
    cursor: pointer;
    transition: all .15s;
    margin-top: 4px;
  }
  .compact .empty-cta {
    font-size: 7px;
    padding: 5px 14px;
    box-shadow: 2px 2px 0 #000;
  }
  .empty-cta:hover {
    transform: translate(-2px, -2px);
    box-shadow: 5px 5px 0 #000;
  }
  .empty-cta:active {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 #000;
  }
</style>
