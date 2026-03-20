<script lang="ts">
  interface Props {
    icon?: string;
    title?: string;
    detail?: string;
    severity?: 'LOW' | 'MID' | 'HIGH';
    tint?: string;
    freshness?: number;
  }
  let {
    icon = '⚡',
    title = 'LIVE EVENT',
    detail = '',
    severity = 'LOW',
    tint = '#66cce6',
    freshness = 1,
  }: Props = $props();

  let life = $derived(`${Math.max(0, Math.min(1, freshness)) * 100}%`);
</script>

<article class="event-card" class:mid={severity === 'MID'} class:high={severity === 'HIGH'} style="--event-tint:{tint}">
  <div class="ec-head">
    <span class="ec-icon">{icon}</span>
    <span class="ec-title">{title}</span>
    <span class="ec-sev">{severity}</span>
  </div>
  <div class="ec-detail">{detail}</div>
  <div class="ec-life">
    <span style="width:{life}"></span>
  </div>
</article>

<style>
  .event-card {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--event-tint), #ffffff 24%);
    background:
      linear-gradient(140deg, rgba(8, 16, 38, 0.88), rgba(5, 10, 24, 0.84)),
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--event-tint), transparent 80%), transparent 58%);
    padding: 8px 10px;
    box-shadow:
      inset 0 1px 0 rgba(157, 229, 255, 0.2),
      0 8px 22px rgba(0, 0, 0, 0.35);
    animation: eventPop 0.28s ease;
  }

  .ec-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
  }

  .ec-icon {
    font-size: 11px;
  }

  .ec-title {
    font: 900 9px/1 var(--fd);
    letter-spacing: 1.4px;
    color: #ebf8ff;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ec-sev {
    font: 700 7px/1 var(--fm);
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 999px;
    color: #98d5ff;
    border: 1px solid rgba(127, 212, 255, 0.45);
    background: rgba(64, 137, 255, 0.12);
  }

  .event-card.mid .ec-sev {
    color: #ffd79a;
    border-color: rgba(255, 195, 92, 0.55);
    background: rgba(255, 171, 64, 0.14);
  }

  .event-card.high .ec-sev {
    color: #ffacb8;
    border-color: rgba(255, 111, 133, 0.58);
    background: rgba(255, 90, 116, 0.14);
  }

  .ec-detail {
    margin-top: 5px;
    font: 600 8px/1.35 var(--fm);
    color: rgba(208, 227, 255, 0.87);
    letter-spacing: 0.1px;
  }

  .ec-life {
    margin-top: 7px;
    height: 2px;
    background: rgba(146, 191, 255, 0.2);
    overflow: hidden;
    border-radius: 999px;
  }

  .ec-life > span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--event-tint), color-mix(in srgb, var(--event-tint), #ffffff 28%));
    box-shadow: 0 0 8px color-mix(in srgb, var(--event-tint), #ffffff 8%);
    transition: width 0.25s linear;
  }

  @keyframes eventPop {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
