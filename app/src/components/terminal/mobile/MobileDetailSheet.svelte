<!--
  @deprecated W-0088: Archived per W-0078 L82 / W-0086 Delete list.
  Default shell no longer mounts this component.
  Keep file to preserve import resolution until callers are cleaned up.
  Do not add new references.
-->
<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  interface Props {
    open?: boolean;
    asset?: TerminalAsset | null;
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    bars?: any[];
    layerBarsMap?: Record<string, any[]>;
    newsItems?: Array<{ title: string; source: string; time: string; url?: string }>;
    captureId?: string | null;
    onClose?: () => void;
  }

  // Props preserved for import resolution — no side effects.
  let {
    open: _open = false,
    asset: _asset = null,
    verdict: _verdict = null,
    evidence: _evidence = [],
    bars: _bars = [],
    layerBarsMap: _layerBarsMap = {},
    newsItems: _newsItems = [],
    captureId: _captureId = null,
    onClose: _onClose,
  }: Props = $props();
</script>

<!-- archived: no render -->
