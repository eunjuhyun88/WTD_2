<!--
  @deprecated W-0088: Archived per W-0078 L82 / W-0086 Delete list.
  Default shell no longer mounts this component.
  Keep file to preserve import resolution until callers are cleaned up.
  Do not add new references.
-->
<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  interface Props {
    asset?: TerminalAsset | null;
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    bars?: any[];
    layerBarsMap?: Record<string, any[]>;
    loading?: boolean;
    onReviewChart?: () => void;
    onViewDetail?: () => void;
    onOpenMetrics?: () => void;
  }

  // Props preserved for import resolution — no side effects.
  let {
    asset: _asset = null,
    verdict: _verdict = null,
    evidence: _evidence = [],
    bars: _bars = [],
    layerBarsMap: _layerBarsMap = {},
    loading: _loading = false,
    onReviewChart: _onReviewChart,
    onViewDetail: _onViewDetail,
    onOpenMetrics: _onOpenMetrics,
  }: Props = $props();
</script>

<!-- archived: no render -->
