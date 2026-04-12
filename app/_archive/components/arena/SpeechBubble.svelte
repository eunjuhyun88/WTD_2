<script lang="ts">
  interface Props {
    text?: string;
    agentColor?: string;
    agentIcon?: string;
    agentName?: string;
    dir?: 'LONG' | 'SHORT' | 'NEUTRAL' | '';
    conf?: number;
    side?: 'left' | 'right';
    visible?: boolean;
  }
  let {
    text = '',
    agentColor = '#ffe600',
    agentIcon = '',
    agentName = '',
    dir = '',
    conf = 0,
    side = 'left',
    visible = true,
  }: Props = $props();
</script>

{#if visible && text}
  <div class="sb" class:sb-left={side === 'left'} class:sb-right={side === 'right'}
    style="--sb-color:{agentColor}">
    <div class="sb-pointer"></div>
    <div class="sb-content">
      {#if agentIcon || agentName}
        <div class="sb-header">
          {#if agentIcon}<span class="sb-icon">{agentIcon}</span>{/if}
          {#if agentName}<span class="sb-name" style="color:{agentColor}">{agentName}</span>{/if}
          {#if dir}
            <span class="sb-dir" class:long={dir === 'LONG'} class:short={dir === 'SHORT'}>
              {dir === 'LONG' ? '▲' : dir === 'SHORT' ? '▼' : '—'} {dir}
            </span>
          {/if}
          {#if conf > 0}
            <span class="sb-conf">{conf}%</span>
          {/if}
        </div>
      {/if}
      <div class="sb-text">{text}</div>
    </div>
  </div>
{/if}

<style>
  .sb {
    position: relative;
    animation: sbPopIn .3s ease;
    z-index: 10;
    max-width: 240px;
  }
  @keyframes sbPopIn {
    0% { opacity: 0; transform: scale(.8) translateY(6px); }
    60% { transform: scale(1.05) translateY(-2px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  .sb-content {
    background: #fff;
    border: 3px solid var(--sb-color, #000);
    border-radius: 14px;
    padding: 6px 10px;
    box-shadow: 3px 3px 0 rgba(0,0,0,.2);
    position: relative;
  }

  /* Pointer / tail */
  .sb-pointer {
    position: absolute;
    width: 0; height: 0;
  }
  .sb-left .sb-pointer {
    bottom: -10px; left: 16px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 10px solid var(--sb-color, #000);
  }
  .sb-right .sb-pointer {
    bottom: -10px; right: 16px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 10px solid var(--sb-color, #000);
  }

  .sb-header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 3px;
    flex-wrap: wrap;
  }
  .sb-icon { font-size: 12px; }
  .sb-name {
    font-family: var(--fd);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1.5px;
  }
  .sb-dir {
    font-family: var(--fd);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 1px 5px;
    border-radius: 4px;
    margin-left: auto;
  }
  .sb-dir.long { background: #e0ffe8; color: #00aa44; }
  .sb-dir.short { background: #ffe0e5; color: #cc0033; }

  .sb-conf {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 700;
    color: #888;
  }

  .sb-text {
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 600;
    color: #333;
    line-height: 1.4;
  }
</style>
