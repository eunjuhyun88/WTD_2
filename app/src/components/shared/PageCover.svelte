<script lang="ts">
  interface Props {
    title: string;
    description?: string;
  }
  const { title, description = 'PC 환경에서 준비 중입니다.' }: Props = $props();
</script>

<div class="page-cover">
  <div class="cover-inner">
    <span class="cover-lock">◈</span>
    <span class="cover-label">{title}</span>
    <p class="cover-desc">{description}</p>
  </div>
</div>

<style>
  .page-cover {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 5, 7, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .cover-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
    padding: 0 32px;
  }

  .cover-lock {
    font-size: 28px;
    color: rgba(249, 216, 194, 0.28);
    line-height: 1;
  }

  .cover-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(250, 247, 235, 0.45);
  }

  .cover-desc {
    margin: 0;
    font-family: var(--sc-font-body, sans-serif);
    font-size: 13px;
    color: rgba(250, 247, 235, 0.25);
    line-height: 1.5;
  }
</style>
