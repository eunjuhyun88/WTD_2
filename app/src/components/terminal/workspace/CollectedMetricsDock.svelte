<!--
  @deprecated W-0088: Archived per W-0078 L82 / W-0086 Delete list.
  Default shell no longer mounts this component.
  Keep file to preserve import resolution until callers are cleaned up.
  Do not add new references.
-->
<script lang="ts">
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { TerminalBoardModel } from '$lib/terminal/terminalBoardModel';

  interface Props {
    chartPayload: ChartSeriesPayload | null;
    boardModel: TerminalBoardModel;
  }

  // Props preserved for import resolution — no side effects.
  let { chartPayload: _chartPayload, boardModel: _boardModel }: Props = $props();
</script>

<!-- archived: no render -->
