<script lang="ts">
  import type { PassportCardPayload } from '$lib/agent/directives';
  interface Props { payload: PassportCardPayload; }
  let { payload }: Props = $props();
  const accPct = Math.round(payload.accuracy * 100);
</script>

<div class="passport-card">
  <div class="pc-username">@{payload.username}</div>
  <div class="pc-stats">
    <div class="pc-stat"><span class="pc-val">{accPct}%</span><span class="pc-label">accuracy</span></div>
    <div class="pc-stat"><span class="pc-val">{payload.streak}</span><span class="pc-label">streak</span></div>
    <div class="pc-stat"><span class="pc-val">{payload.total_verdicts}</span><span class="pc-label">verdicts</span></div>
  </div>
</div>

<style>
.passport-card {
  background: #111222; border: 1px solid #2a2a3a; border-radius: 8px; padding: 8px 12px; width: 100%;
}
.pc-username { font-size: 12px; color: #cce8ff; margin-bottom: 6px; font-family: monospace; }
.pc-stats { display: flex; gap: 16px; }
.pc-stat { display: flex; flex-direction: column; align-items: center; }
.pc-val { font-size: 14px; font-weight: 700; color: #c8ccd4; }
.pc-label { font-size: var(--ui-text-xs); color: #7a8a9a; }
</style>
