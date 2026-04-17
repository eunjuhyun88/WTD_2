<!--
  @deprecated W-0088: Archived per W-0078 L82 / W-0086 Delete list.
  Default shell no longer mounts this component.
  Keep file to preserve import resolution until callers are cleaned up.
  Do not add new references.
-->
<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';

  interface Props {
    evidence: TerminalEvidence[];
    onExpand?: () => void;
  }

  // Props preserved for import resolution — no side effects.
  let { evidence: _evidence = [], onExpand: _onExpand }: Props = $props();
</script>

<!-- archived: no render -->
