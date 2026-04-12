<script lang="ts">
	import type { HeatmapFlowChartBlock } from '$lib/contracts';
	import ChartStage from '../../chart/ChartStage.svelte';
	import { fromHeatmapFlowBlock } from '$lib/chart-engine/app';

	let {
		block,
		presentation = 'inline',
	}: {
		block: HeatmapFlowChartBlock;
		presentation?: 'inline' | 'focus';
	} = $props();

	const spec = $derived(fromHeatmapFlowBlock(block));
</script>

<ChartStage {spec} {presentation} />
