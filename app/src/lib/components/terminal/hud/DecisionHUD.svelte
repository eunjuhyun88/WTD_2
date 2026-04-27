<script lang="ts">
  /**
   * DecisionHUD — F-4 Decision HUD (W-0237)
   *
   * 5-card pattern entry judgment surface.
   * Fetches /api/terminal/hud?capture_id=<uuid> and renders:
   *   - PatternStatusCard  — current Phase + State Machine state
   *   - EvidenceCard       — search similar captures top 3
   *   - RiskCard           — entry_p_win + threshold + btc_trend
   *   - TransitionCard     — next Phase conditions
   *   - ActionsCard        — Capture / Watch / Verdict 1-click buttons
   */

  import { onMount } from 'svelte';
  import type { HudPayload } from '$lib/components/terminal/hud/types';
  import PatternStatusCard from '$lib/components/terminal/hud/PatternStatusCard.svelte';
  import EvidenceCard from '$lib/components/terminal/hud/EvidenceCard.svelte';
  import RiskCard from '$lib/components/terminal/hud/RiskCard.svelte';
  import TransitionCard from '$lib/components/terminal/hud/TransitionCard.svelte';
  import ActionsCard from '$lib/components/terminal/hud/ActionsCard.svelte';

  export let capture_id: string;
  export let class_names: string = '';

  let data: HudPayload | null = null;
  let loading = true;
  let fetchError = '';

  onMount(() => {
    load();
  });

  async function load() {
    loading = true;
    fetchError = '';
    try {
      const res = await fetch(`/api/terminal/hud?capture_id=${encodeURIComponent(capture_id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      data = (json.data as HudPayload) ?? null;
    } catch (e) {
      fetchError = `Failed to load HUD: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loading = false;
    }
  }
</script>

<section class="decision-hud {class_names}">
  <div class="hud-header">
    <span class="hud-title">DECISION HUD</span>
    <button class="hud-refresh" onclick={load} disabled={loading}>
      {loading ? '…' : 'Refresh'}
    </button>
  </div>

  {#if loading}
    <div class="hud-loading">
      <span class="pulse"></span>
      Loading…
    </div>
  {:else if fetchError}
    <div class="hud-error">{fetchError}</div>
  {:else if data}
    <div class="hud-grid">
      <PatternStatusCard data={data.pattern_status} />
      <EvidenceCard data={data.evidence} />
      <RiskCard data={data.risk} />
      <TransitionCard data={data.transition} />
      <ActionsCard data={data.actions} />
    </div>
  {:else}
    <div class="hud-empty">No data available for capture {capture_id}</div>
  {/if}
</section>

<style>
  .decision-hud {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: var(--sc-font-mono, monospace);
  }

  .hud-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hud-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255,255,255,0.3);
    text-transform: uppercase;
  }

  .hud-refresh {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.35);
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .hud-refresh:hover:not(:disabled) {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.6);
  }
  .hud-refresh:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .hud-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 8px;
  }

  .hud-loading,
  .hud-empty {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
    padding: 32px 24px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.3);
  }

  .hud-error {
    padding: 16px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: #ef5350;
    background: rgba(239,83,80,0.07);
    border: 1px solid rgba(239,83,80,0.15);
    border-radius: 6px;
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
    animation: pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 1; }
  }
</style>
