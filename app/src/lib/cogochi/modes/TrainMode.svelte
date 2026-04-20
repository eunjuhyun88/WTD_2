<script lang="ts">
  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
  }

  const { mode }: Props = $props();
</script>

<div class="train-mode">
  <div class="header">
    <span>TRAIN MODE · Verdict Inbox</span>
  </div>
  <div class="content">
    <div class="placeholder">
      <span class="icon">◈</span>
      <span>Training mode — collect verdicts and refine your model</span>
    </div>
  </div>
</div>

<style>
  .train-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--g0);
    overflow: hidden;
  }

  .header {
    padding: 12px;
    background: var(--g1);
    border-bottom: 0.5px solid var(--g3);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g6);
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--g5);
  }

  .icon {
    font-size: 32px;
    opacity: 0.5;
  }
</style>
