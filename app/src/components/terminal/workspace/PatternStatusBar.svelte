<!--
  @deprecated W-0088: Archived per W-0078 L82 / W-0086 Delete list.
  Default shell no longer mounts this component.
  Keep file to preserve import resolution until callers are cleaned up.
  Do not add new references.
-->
<script lang="ts">
  import type { PatternCaptureContext as PatternSignalItem } from '$lib/stores/patternCaptureContext';

  interface Props {
    pollMs?: number;
    onSelect?: (item: PatternSignalItem) => void;
    onTransition?: (items: PatternSignalItem[]) => void;
  }

  // Props preserved for import resolution — no side effects.
  let { pollMs: _pollMs = 60_000, onSelect: _onSelect, onTransition: _onTransition }: Props = $props();
</script>

<!-- archived: no render -->
