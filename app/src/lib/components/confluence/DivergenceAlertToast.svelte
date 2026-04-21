<script lang="ts">
  /**
   * DivergenceAlertToast — side-effect component.
   *
   * Has no template; just watches the passed ConfluenceResult and pushes
   * a toast into the shared notificationStore when the divergenceStreak
   * crosses ≥3 (rising edge only — avoids duplicate fires while the
   * divergence persists).
   *
   * Divergence moments (≥2 material pillars opposing each other) are
   * rare high-alpha windows. A 3-in-a-row streak confirms the setup is
   * persistent rather than a transient blip.
   *
   * Mount this once inside TradeMode. Reuses the existing ToastStack
   * renderer (no visual addition needed).
   */
  import type { ConfluenceResult } from '$lib/confluence/types';
  import { toasts } from '$lib/stores/notificationStore';

  interface Props {
    value: ConfluenceResult | null;
  }
  let { value }: Props = $props();

  const STREAK_TRIGGER = 3;

  // Rising-edge tracker — only fire once per streak entry.
  let lastStreak = 0;

  $effect(() => {
    const current = value?.divergenceStreak ?? 0;
    const wasUnder = lastStreak < STREAK_TRIGGER;
    const nowAtOrAbove = current >= STREAK_TRIGGER;

    if (wasUnder && nowAtOrAbove && value) {
      const top = value.top ?? [];
      const bullish = top.find(c => c.score > 0);
      const bearish = top.find(c => c.score < 0);
      const conflictLine = bullish && bearish
        ? `${bullish.label} ${bullish.score >= 0 ? '+' : ''}${bullish.score.toFixed(2)} vs ${bearish.label} ${bearish.score.toFixed(2)}`
        : 'Multiple pillars opposing each other';

      toasts.addToast({
        level: 'high',
        title: `⚠ DIVERGENCE ${current} reads — ${conflictLine}`,
        score: value.score,
      });
    }

    lastStreak = current;
  });
</script>
