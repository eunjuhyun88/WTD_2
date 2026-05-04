<script lang="ts">
  import { densityStore, type Density } from '$lib/stores/density.store';

  const density = $derived($densityStore);
</script>

<div class="display-panel">

  <!-- Density -->
  <section class="settings-section">
    <div class="ss-head">
      <span class="surface-kicker">Layout Density</span>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Density</div>
        <div class="sr-desc">Compact mode reduces spacing and font size across panels</div>
      </div>
      <div class="density-btns">
        {#each (['comfortable', 'compact'] as Density[]) as d}
          <button
            class="density-btn"
            class:active={density === d}
            onclick={() => densityStore.set(d)}
            aria-pressed={density === d}
          >{d === 'comfortable' ? 'Comfortable' : 'Compact'}</button>
        {/each}
      </div>
    </div>
  </section>

  <!-- Chart Theme -->
  <section class="settings-section">
    <div class="ss-head">
      <span class="surface-kicker">Chart</span>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Chart Theme</div>
        <div class="sr-desc">Color scheme for chart rendering</div>
      </div>
      <select class="sr-select" disabled title="Theme settings managed in General">
        <option value="dark">Dark</option>
      </select>
    </div>

    <div class="setting-row">
      <div class="sr-info">
        <div class="sr-label">Language</div>
        <div class="sr-desc">Interface language — also configurable in Account</div>
      </div>
      <select class="sr-select" disabled title="Language settings managed in General">
        <option value="kr">Korean</option>
        <option value="en">English</option>
      </select>
    </div>
  </section>

</div>

<style>
  .display-panel {
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-section {
    background: rgba(255, 255, 255, 0.026);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    overflow: hidden;
  }

  .ss-head {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .setting-row:last-child { border-bottom: none; }

  .sr-info { flex: 1; min-width: 0; }
  .sr-label {
    font-family: var(--sc-font-body);
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--sc-text-0);
  }
  .sr-desc {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    color: var(--sc-text-2);
    margin-top: 2px;
  }

  .density-btns {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .density-btn {
    font-family: var(--sc-font-body, sans-serif);
    font-size: var(--type-md, 0.78rem);
    font-weight: 600;
    padding: var(--sp-2, 4px) var(--sp-3, 12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.52);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .density-btn:hover { background: rgba(255, 255, 255, 0.08); }
  .density-btn.active {
    background: rgba(219, 154, 159, 0.14);
    color: var(--sc-accent, #db9a9f);
    border-color: rgba(219, 154, 159, 0.28);
  }

  .sr-select {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.88);
    cursor: pointer;
    opacity: 0.5;
  }
</style>
