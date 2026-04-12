<script lang="ts">
  const { title, era, description, kind = 'match', timestamp, quality = 'normal', onclick }: {
    title: string;
    era?: string;
    description: string;
    kind?: 'match' | 'pattern' | 'regime' | 'lesson';
    timestamp?: number;
    quality?: 'normal' | 'rare' | 'epic';
    onclick?: () => void;
  } = $props();

  let flipped = $state(false);

  const kindIcons: Record<string, string> = {
    match: 'M',
    pattern: 'P',
    regime: 'R',
    lesson: 'L',
  };

  const qualityColors: Record<string, { border: string; glow: string }> = {
    normal: { border: 'rgba(247,242,234,0.08)', glow: 'none' },
    rare: { border: 'rgba(96,160,240,0.25)', glow: '0 0 16px rgba(96,160,240,0.1)' },
    epic: { border: 'rgba(219,154,159,0.3)', glow: '0 0 20px rgba(219,154,159,0.12)' },
  };

  const qualityStyle = $derived(qualityColors[quality] ?? qualityColors.normal);

  function formatDate(ts?: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function handleClick() {
    if (onclick) {
      onclick();
    } else {
      flipped = !flipped;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="memory-card"
  class:flipped
  class:rare={quality === 'rare'}
  class:epic={quality === 'epic'}
  style="--card-border:{qualityStyle.border};--card-glow:{qualityStyle.glow}"
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <div class="card-inner">
    <!-- Front -->
    <div class="card-face card-front">
      <div class="card-header">
        <span class="kind-badge">{kindIcons[kind]}</span>
        {#if era}
          <span class="era-tag">{era}</span>
        {/if}
        {#if timestamp}
          <span class="date-tag">{formatDate(timestamp)}</span>
        {/if}
      </div>

      <h3 class="card-title">{title}</h3>

      <p class="card-desc">{description}</p>

      {#if quality !== 'normal'}
        <span class="quality-badge">{quality.toUpperCase()}</span>
      {/if}
    </div>

    <!-- Back -->
    <div class="card-face card-back">
      <div class="back-content">
        <span class="back-kind">{kind.toUpperCase()}</span>
        <p class="back-detail">{description}</p>
        {#if era}
          <span class="back-era">ERA: {era}</span>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .memory-card {
    perspective: 600px;
    cursor: pointer;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .memory-card:hover {
    transform: translateY(-4px);
  }

  .card-inner {
    position: relative;
    width: 100%;
    min-height: 160px;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    transform-style: preserve-3d;
  }

  .flipped .card-inner {
    transform: rotateY(180deg);
  }

  .card-face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    border-radius: 14px;
    border: 1px solid var(--card-border);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .card-front {
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.8), rgba(5, 9, 20, 0.9));
    box-shadow: var(--card-glow);
  }

  .card-back {
    background: linear-gradient(180deg, rgba(15, 24, 40, 0.95), rgba(8, 13, 24, 0.98));
    transform: rotateY(180deg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Glow effect on hover for rare/epic */
  .rare .card-front { background: linear-gradient(180deg, rgba(14, 22, 38, 0.85), rgba(8, 15, 28, 0.95)); }
  .epic .card-front { background: linear-gradient(180deg, rgba(18, 14, 24, 0.85), rgba(12, 8, 16, 0.95)); }

  .rare:hover .card-front { box-shadow: 0 0 24px rgba(96, 160, 240, 0.15); }
  .epic:hover .card-front { box-shadow: 0 0 28px rgba(219, 154, 159, 0.18); }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .kind-badge {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-display);
    font-size: 11px;
    letter-spacing: 0.5px;
    background: rgba(247, 242, 234, 0.04);
    border: 1px solid rgba(247, 242, 234, 0.06);
    color: var(--sc-text-3);
  }

  .era-tag {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.8px;
    color: var(--lis-accent);
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(219, 154, 159, 0.06);
    border: 1px solid rgba(219, 154, 159, 0.1);
  }

  .date-tag {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    margin-left: auto;
  }

  .card-title {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-md);
    font-weight: 700;
    color: var(--lis-ivory);
    line-height: var(--sc-lh-tight);
    margin: 0;
  }

  .card-desc {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-3);
    line-height: var(--sc-lh-relaxed);
    margin: 0;
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .quality-badge {
    align-self: flex-start;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1.5px;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .rare .quality-badge {
    background: rgba(96, 160, 240, 0.1);
    color: #60a0f0;
    border: 1px solid rgba(96, 160, 240, 0.15);
  }
  .epic .quality-badge {
    background: rgba(219, 154, 159, 0.1);
    color: var(--lis-accent);
    border: 1px solid rgba(219, 154, 159, 0.15);
  }

  .back-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    padding: 8px;
  }

  .back-kind {
    font-family: var(--sc-font-display);
    font-size: var(--sc-fs-xl);
    letter-spacing: 4px;
    color: var(--sc-text-3);
  }

  .back-detail {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    color: var(--sc-text-2);
    line-height: var(--sc-lh-relaxed);
    margin: 0;
  }

  .back-era {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--lis-accent);
    letter-spacing: 1px;
  }

  @media (max-width: 480px) {
    .card-inner { min-height: 140px; }
    .card-face { padding: 12px; }
  }
</style>
