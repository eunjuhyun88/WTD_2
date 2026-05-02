<script lang="ts">
  interface Props { why: string; against?: string[] }
  let { why, against = [] }: Props = $props();
</script>

<div class="why-panel">
  <div class="section">
    <span class="label">Why</span>
    <p class="text">{why}</p>
  </div>
  {#if against.length > 0}
    <div class="section against">
      <span class="label">Against</span>
      <ul class="against-list">
        {#each against as item}
          <li>{item}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .why-panel { display: flex; flex-direction: column; gap: 8px; }
  .section { display: flex; flex-direction: column; gap: 4px; }
  .label {
    font-family: var(--sc-font-mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--sc-text-2);
  }
  .against .label { color: #fbbf24; }
  .text { font-size: 12px; color: var(--sc-text-1); line-height: 1.5; margin: 0; }
  .against-list {
    margin: 0; padding: 0; list-style: none;
    display: flex; flex-wrap: wrap; gap: 4px;
  }
  .against-list li {
    font-family: var(--sc-font-mono); font-size: 10px; color: #fbbf24;
    padding: 2px 8px; border: 1px solid rgba(251,191,36,0.3);
    border-radius: 3px;
  }
</style>
