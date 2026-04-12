<script lang="ts">
	import type { ChartPresentation, ChartViewSpec } from '$lib/chart-engine';
	import DualPaneFlowRenderer from './renderers/DualPaneFlowRenderer.svelte';
	import HeatmapFlowRenderer from './renderers/HeatmapFlowRenderer.svelte';
	import PriceChartRenderer from './renderers/PriceChartRenderer.svelte';

	type ChartChromeMode = 'bare' | 'workbench';

	let {
		spec,
		presentation = 'inline',
		chrome = 'bare',
	}: {
		spec: ChartViewSpec;
		presentation?: ChartPresentation;
		chrome?: ChartChromeMode;
	} = $props();

	const metricChips = $derived(spec.ui?.metricChips ?? []);
	const signalBadges = $derived(spec.ui?.signalBadges ?? []);
	const actions = $derived(spec.ui?.actions ?? []);
	const notes = $derived(spec.ui?.notes ?? []);
	const usesWorkbenchChrome = $derived(
		chrome === 'workbench' &&
			(Boolean(spec.ui?.eyebrow) ||
				Boolean(spec.title) ||
				Boolean(spec.summary) ||
				metricChips.length > 0 ||
				signalBadges.length > 0 ||
				actions.length > 0 ||
				notes.length > 0)
	);
</script>

<div
	class:focus={presentation === 'focus'}
	class:fill={presentation === 'fill'}
	class:workbench={usesWorkbenchChrome}
	class="chart-stage"
>
	{#if usesWorkbenchChrome}
		<div class="cw-topline">
			<div class="cw-overline">
				{#if spec.ui?.eyebrow}
					<span class="cw-eyebrow">{spec.ui.eyebrow}</span>
				{/if}
				{#if spec.symbol}
					<span class="cw-meta">{spec.symbol.replace('USDT', '')}</span>
				{/if}
				{#if spec.timeframe}
					<span class="cw-meta">{spec.timeframe.toUpperCase()}</span>
				{/if}
				{#if spec.ui?.stageLabel}
					<span class="cw-stage-label">{spec.ui.stageLabel}</span>
				{/if}
			</div>

			{#if actions.length > 0}
				<div class="cw-actions">
					{#each actions as action}
						<span class:active={action.active} class="cw-action-chip">{action.label}</span>
					{/each}
				</div>
			{/if}
		</div>

		{#if spec.title || spec.summary}
			<div class="cw-headline">
				{#if spec.title}
					<h3>{spec.title}</h3>
				{/if}
				{#if spec.summary}
					<p>{spec.summary}</p>
				{/if}
			</div>
		{/if}

		{#if metricChips.length > 0}
			<div class="cw-chip-row">
				{#each metricChips as chip}
					<span class={`cw-metric-chip tone-${chip.tone ?? 'neutral'}`}>
						<em>{chip.label}</em>
						{#if chip.value}
							<strong>{chip.value}</strong>
						{/if}
					</span>
				{/each}
			</div>
		{/if}

		{#if signalBadges.length > 0}
			<div class="cw-signal-row">
				{#each signalBadges as chip}
					<span class={`cw-signal-badge tone-${chip.tone ?? 'neutral'}`}>
						{chip.label}
						{#if chip.value}
							<small>{chip.value}</small>
						{/if}
					</span>
				{/each}
			</div>
		{/if}
	{/if}

	<div class="cw-stage">
		{#if spec.kind === 'price'}
			<PriceChartRenderer {spec} {presentation} />
		{:else if spec.kind === 'dual-pane-flow'}
			<DualPaneFlowRenderer {spec} {presentation} />
		{:else}
			<HeatmapFlowRenderer {spec} {presentation} />
		{/if}
	</div>

	{#if usesWorkbenchChrome && notes.length > 0}
		<div class="cw-notes">
			{#each notes as note}
				<article class={`cw-note tone-${note.tone ?? 'neutral'}`}>
					<span>{note.label}</span>
					<p>{note.body}</p>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chart-stage {
		width: 100%;
		height: 100%;
	}

	.chart-stage.workbench {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		border-radius: 18px;
		background:
			radial-gradient(circle at top left, rgba(68, 128, 255, 0.14), transparent 34%),
			linear-gradient(180deg, rgba(11, 18, 32, 0.98), rgba(5, 9, 20, 0.98));
		border: 1px solid rgba(247, 242, 234, 0.08);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.chart-stage.workbench.focus,
	.chart-stage.workbench.fill {
		padding: 16px;
		gap: 14px;
	}

	.cw-topline,
	.cw-overline,
	.cw-actions,
	.cw-chip-row,
	.cw-signal-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.cw-topline {
		justify-content: space-between;
		gap: 12px;
	}

	.cw-eyebrow,
	.cw-meta,
	.cw-stage-label,
	.cw-action-chip,
	.cw-metric-chip em,
	.cw-signal-badge,
	.cw-note span {
		font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.cw-eyebrow {
		color: rgba(128, 192, 255, 0.78);
	}

	.cw-meta {
		color: rgba(247, 242, 234, 0.48);
	}

	.cw-stage-label,
	.cw-action-chip {
		padding: 4px 8px;
		border-radius: 999px;
		border: 1px solid rgba(247, 242, 234, 0.12);
		color: rgba(247, 242, 234, 0.68);
		background: rgba(247, 242, 234, 0.04);
	}

	.cw-action-chip.active {
		border-color: rgba(128, 192, 255, 0.28);
		color: rgba(128, 192, 255, 0.9);
	}

	.cw-headline h3 {
		margin: 0;
		font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
		font-size: 28px;
		letter-spacing: 0.04em;
		color: var(--sc-text-0, #f7f2ea);
	}

	.cw-headline p,
	.cw-note p {
		margin: 0;
		font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
		line-height: 1.55;
		color: rgba(247, 242, 234, 0.64);
	}

	.cw-headline p {
		margin-top: 4px;
		font-size: 13px;
	}

	.cw-metric-chip,
	.cw-signal-badge,
	.cw-note {
		border-radius: 14px;
		border: 1px solid rgba(247, 242, 234, 0.09);
		background: rgba(247, 242, 234, 0.03);
	}

	.cw-metric-chip {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		padding: 8px 10px;
	}

	.cw-metric-chip strong {
		font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		color: rgba(247, 242, 234, 0.9);
	}

	.cw-signal-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		color: rgba(247, 242, 234, 0.76);
	}

	.cw-signal-badge small {
		font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: rgba(247, 242, 234, 0.56);
	}

	.cw-stage {
		flex: 1 1 auto;
		min-height: 0;
	}

	.cw-notes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 8px;
	}

	.cw-note {
		padding: 10px 12px;
	}

	.cw-note span {
		display: block;
		margin-bottom: 6px;
		color: rgba(247, 242, 234, 0.5);
	}

	.tone-bull {
		border-color: rgba(173, 202, 124, 0.22);
		color: rgba(173, 202, 124, 0.92);
	}

	.tone-bear {
		border-color: rgba(207, 127, 143, 0.22);
		color: rgba(207, 127, 143, 0.92);
	}

	.tone-warn {
		border-color: rgba(242, 209, 147, 0.22);
		color: rgba(242, 209, 147, 0.94);
	}

	.tone-accent {
		border-color: rgba(128, 192, 255, 0.22);
		color: rgba(128, 192, 255, 0.92);
	}
</style>
