<script lang="ts">
	import type { DualPaneFlowChartBlock } from '$lib/contracts';
	import ChartStage from '../../chart/ChartStage.svelte';
	import { fromDualPaneFlowBlock } from '$lib/chart-engine/app';

	let {
		block,
		presentation = 'inline',
	}: {
		block: DualPaneFlowChartBlock;
		presentation?: 'inline' | 'focus';
	} = $props();

	const spec = $derived(fromDualPaneFlowBlock(block));
</script>

<ChartStage {spec} {presentation} />
