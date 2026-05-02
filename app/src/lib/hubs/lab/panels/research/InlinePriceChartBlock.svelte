<script lang="ts">
	import type { InlinePriceChartBlock } from '$lib/contracts';
	import ChartStage from '../../../../shared/chart/ChartStage.svelte';
	import { fromInlinePriceBlock } from '$lib/chart-engine/app';

	let {
		block,
		presentation = 'inline',
	}: {
		block: InlinePriceChartBlock;
		presentation?: 'inline' | 'focus';
	} = $props();

	const spec = $derived(fromInlinePriceBlock(block));
</script>

<ChartStage {spec} {presentation} />
