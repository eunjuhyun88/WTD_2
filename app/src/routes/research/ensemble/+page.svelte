<script lang="ts">
	/**
	 * /research/ensemble — 10-strategy ensemble comparison with Welch t-test matrix.
	 * W-0379 Phase 6. Analyzes performance across A/B/C ensemble types.
	 */
	import { onMount } from 'svelte';

	interface Strategy {
		name: string;
		group: string;
		passRate: number;
		dsrDelta: number;
		costUsd: number;
		latencySec: number;
		samples: number;
		confidence: number;
	}

	interface SortState {
		column: string | null;
		ascending: boolean;
	}

	const STRATEGIES = [
		{ name: 'single', group: 'A_parallel' },
		{ name: 'parallel-vote', group: 'A_parallel' },
		{ name: 'rank-fusion', group: 'A_parallel' },
		{ name: 'moe-regime', group: 'B_hierarchical' },
		{ name: 'judge-arbitrate', group: 'B_hierarchical' },
		{ name: 'role-pipeline', group: 'B_hierarchical' },
		{ name: 'tournament', group: 'C_iterative' },
		{ name: 'self-refine', group: 'C_iterative' },
		{ name: 'debate', group: 'C_iterative' },
		{ name: 'moa', group: 'C_iterative' }
	];

	const GROUP_COLORS: Record<string, string> = {
		A_parallel: '#3b82f6',
		B_hierarchical: '#a855f7',
		C_iterative: '#ec4899'
	};

	let strategies = $state<Strategy[]>([]);
	let welchMatrix = $state<number[][]>([]);
	let selectedStrategy = $state<string | null>(null);
	let sortState = $state<SortState>({ column: null, ascending: true });
	let totalCycleBudget = $state(0);
	let usedBudget = $state(0);

	onMount(() => {
		// Generate mock strategy data
		strategies = STRATEGIES.map((s) => ({
			name: s.name,
			group: s.group,
			passRate: Math.random() * 0.3 + 0.65,
			dsrDelta: (Math.random() - 0.5) * 3.5,
			costUsd: Math.random() * 180 + 40,
			latencySec: Math.random() * 50 + 15,
			samples: Math.floor(Math.random() * 100) + 20,
			confidence: Math.random() * 0.3 + 0.7
		}));

		// Initialize Welch t-test matrix (p-values)
		welchMatrix = Array(10)
			.fill(0)
			.map(() =>
				Array(10)
					.fill(0)
					.map(() => Math.random() > 0.7 ? Math.random() * 0.1 : Math.random() * 0.9)
			);

		// Cycle budget
		totalCycleBudget = 500;
		usedBudget = strategies.reduce((sum, s) => sum + s.costUsd, 0);
	});

	function handleSort(column: string): void {
		if (sortState.column === column) {
			sortState.ascending = !sortState.ascending;
		} else {
			sortState.column = column;
			sortState.ascending = false;
		}

		const sorted = [...strategies];
		sorted.sort((a, b) => {
			let aVal = (a as any)[column];
			let bVal = (b as any)[column];
			return sortState.ascending ? aVal - bVal : bVal - aVal;
		});
		strategies = sorted;
	}

	function fmtPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	function welchColor(pVal: number): string {
		if (pVal < 0.05) return 'wt-significant';
		return 'wt-ns';
	}

	function trajectoryPoints(idx: number): string {
		// Mock trajectory line
		const points = [];
		for (let i = 0; i <= 20; i++) {
			const x = i * 35;
			const y = 350 - (strategies[idx]?.dsrDelta ?? 0) * 50 - Math.random() * 30;
			points.push(`${x},${y}`);
		}
		return points.join(' ');
	}
</script>

<svelte:head>
	<title>Ensemble · Strategy Comparison — WTD</title>
</svelte:head>

<section class="ensemble-root" data-testid="ensemble-root">
	<header class="ensemble-header">
		<h1>Research &gt; Ensemble Strategy Comparison (10-Way)</h1>
	</header>

	<!-- Cycle Budget Status -->
	<section class="status-section" data-testid="cycle-budget">
		<div class="budget-display">
			<div class="budget-item">
				<span class="label">Total Budget</span>
				<span class="value">${totalCycleBudget}</span>
			</div>
			<div class="budget-item">
				<span class="label">Used</span>
				<span class="value">${usedBudget.toFixed(2)}</span>
			</div>
			<div class="budget-item">
				<span class="label">Remaining</span>
				<span class="value">${(totalCycleBudget - usedBudget).toFixed(2)}</span>
			</div>
			<div class="progress-bar">
				<div class="progress-fill" style="width: {(usedBudget / totalCycleBudget) * 100}%"></div>
			</div>
		</div>

		<!-- Group Legend -->
		<div class="legend">
			<div class="legend-item">
				<div class="legend-dot" style="background: {GROUP_COLORS.A_parallel}"></div>
				<span>A: Parallel Vote</span>
			</div>
			<div class="legend-item">
				<div class="legend-dot" style="background: {GROUP_COLORS.B_hierarchical}"></div>
				<span>B: Hierarchical Judge</span>
			</div>
			<div class="legend-item">
				<div class="legend-dot" style="background: {GROUP_COLORS.C_iterative}"></div>
				<span>C: Iterative Refine</span>
			</div>
		</div>
	</section>

	<!-- Trajectory Chart -->
	<section class="viz-section" data-testid="trajectory">
		<h2>Performance Trajectory (10 Strategies)</h2>
		<svg viewBox="0 0 750 400" class="trajectory-svg" aria-label="strategy trajectories">
			<defs>
				<pattern id="traj-grid" width="50" height="40" patternUnits="userSpaceOnUse">
					<path d="M 50 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" stroke-width="0.5" />
				</pattern>
			</defs>
			<rect width="750" height="400" fill="url(#traj-grid)" />

			<!-- Lines for each strategy -->
			{#each strategies as s, idx}
				<polyline
					points={trajectoryPoints(idx)}
					fill="none"
					stroke={GROUP_COLORS[s.group as keyof typeof GROUP_COLORS]}
					stroke-width="2"
					opacity="0.7"
				/>
			{/each}

			<!-- Axes -->
			<line x1="50" y1="350" x2="700" y2="350" stroke="#374151" stroke-width="1" />
			<line x1="50" y1="50" x2="50" y2="350" stroke="#374151" stroke-width="1" />
		</svg>
	</section>

	<!-- Cost vs DSR Scatter with Pareto -->
	<section class="viz-section" data-testid="cost-dsr-pareto">
		<h2>Cost vs DSR Δ (Pareto Frontier)</h2>
		<svg viewBox="0 0 600 400" class="scatter-svg" aria-label="cost vs dsr with pareto">
			<defs>
				<pattern id="pareto-grid" width="50" height="40" patternUnits="userSpaceOnUse">
					<path d="M 50 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" stroke-width="0.5" />
				</pattern>
			</defs>
			<rect width="600" height="400" fill="url(#pareto-grid)" />

			<!-- Axes -->
			<line x1="50" y1="350" x2="550" y2="350" stroke="#374151" stroke-width="1" />
			<line x1="50" y1="50" x2="50" y2="350" stroke="#374151" stroke-width="1" />

			<!-- Data points -->
			{#each strategies as s}
				{@const x = 50 + (s.costUsd / 250) * 500}
				{@const y = 350 - ((s.dsrDelta + 2) / 4) * 300}
				<circle {x} {y} r="6" fill={GROUP_COLORS[s.group as keyof typeof GROUP_COLORS]} opacity="0.7" />
				<text {x} y={y - 14} text-anchor="middle" font-size="9" fill="#374151">{s.name}</text>
			{/each}
		</svg>
	</section>

	<!-- Strategy × Metric Heatmap -->
	<section class="viz-section" data-testid="strategy-heatmap">
		<h2>Strategy × Metric Heatmap (5 Metrics)</h2>
		<table class="heatmap-table">
			<thead>
				<tr>
					<th>Strategy</th>
					<th>Pass Rate</th>
					<th>DSR Δ</th>
					<th>Cost</th>
					<th>Latency</th>
					<th>Confidence</th>
				</tr>
			</thead>
			<tbody>
				{#each strategies as s}
					<tr>
						<td class="strategy-name" style="border-left: 4px solid {GROUP_COLORS[s.group as keyof typeof GROUP_COLORS]}"
							>{s.name}</td
						>
						<td class="metric-cell" style="background: rgba(52, 211, 153, {s.passRate})">{fmtPct(s.passRate)}</td>
						<td class="metric-cell" style="background: rgba(59, 130, 246, {Math.abs(s.dsrDelta) / 3.5})"
							>{s.dsrDelta.toFixed(2)}%</td
						>
						<td class="metric-cell" style="background: rgba(107, 114, 128, {s.costUsd / 250})"
							>${s.costUsd.toFixed(0)}</td
						>
						<td class="metric-cell" style="background: rgba(168, 85, 247, {s.latencySec / 70})"
							>{s.latencySec.toFixed(1)}s</td
						>
						<td class="metric-cell" style="background: rgba(249, 115, 22, {s.confidence})"
							>{fmtPct(s.confidence)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<!-- Metrics Table -->
	<section class="viz-section" data-testid="metrics-table">
		<h2>Strategy Metrics</h2>
		<table class="metrics-table">
			<thead>
				<tr>
					<th onclick={() => handleSort('name')}>Strategy</th>
					<th onclick={() => handleSort('group')}>Group</th>
					<th onclick={() => handleSort('passRate')}>Pass Rate</th>
					<th onclick={() => handleSort('dsrDelta')}>DSR Δ</th>
					<th onclick={() => handleSort('costUsd')}>Cost</th>
					<th onclick={() => handleSort('latencySec')}>Latency</th>
					<th onclick={() => handleSort('samples')}>Samples</th>
					<th onclick={() => handleSort('confidence')}>Confidence</th>
				</tr>
			</thead>
			<tbody>
				{#each strategies as s}
					<tr>
						<td><strong>{s.name}</strong></td>
						<td class="code">{s.group}</td>
						<td class="number">{fmtPct(s.passRate)}</td>
						<td class="number">{s.dsrDelta.toFixed(2)}%</td>
						<td class="number">${s.costUsd.toFixed(0)}</td>
						<td class="number">{s.latencySec.toFixed(1)}s</td>
						<td class="number">{s.samples}</td>
						<td class="number">{fmtPct(s.confidence)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<!-- Welch t-test Matrix -->
	<section class="viz-section" data-testid="welch-matrix">
		<h2>Welch t-test: Strategy Comparison Matrix (p-values)</h2>
		<table class="welch-table">
			<thead>
				<tr>
					<th></th>
					{#each STRATEGIES as s}
						<th class="col-header" title={s.name}>{s.name.substring(0, 4)}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each STRATEGIES as s1, i}
					<tr>
						<th class="row-header">{s1.name.substring(0, 4)}</th>
						{#each welchMatrix[i] as pVal, j}
							<td class="welch-cell {welchColor(pVal)}" title="p={pVal.toFixed(3)}">
								{pVal < 0.001 ? '***' : pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns'}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</section>

<style>
	.ensemble-root {
		padding: 16px;
		font-family: var(--font-body, system-ui);
		color: var(--g10);
		background: var(--g0);
		min-height: 100vh;
	}

	.ensemble-header {
		margin-bottom: 24px;
	}

	.ensemble-header h1 {
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0;
	}

	.status-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
		margin-bottom: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
	}

	.budget-display {
		flex: 1;
	}

	.budget-item {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		margin-bottom: 8px;
	}

	.budget-item .label {
		color: var(--g7);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.budget-item .value {
		font-family: var(--font-mono, ui-monospace);
		font-weight: 500;
	}

	.progress-bar {
		height: 8px;
		background: var(--g3);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--pos);
	}

	.legend {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
	}

	.legend-dot {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	.viz-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
		margin-bottom: 16px;
	}

	.viz-section h2 {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
		color: var(--g7);
	}

	.trajectory-svg,
	.scatter-svg {
		width: 100%;
		height: auto;
	}

	.heatmap-table,
	.metrics-table,
	.welch-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
		font-family: var(--font-mono, ui-monospace);
	}

	th,
	td {
		padding: 6px 8px;
		text-align: left;
		border-bottom: 1px solid var(--g2);
	}

	th {
		background: var(--g2);
		color: var(--g7);
		font-weight: 500;
		text-transform: uppercase;
		font-size: var(--ui-text-xs);
		letter-spacing: 0.04em;
		cursor: pointer;
	}

	th:hover {
		background: var(--g3);
	}

	.col-header,
	.row-header {
		max-width: 60px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	td.number {
		text-align: right;
	}

	td.code {
		font-family: var(--font-mono, ui-monospace);
		font-size: var(--ui-text-xs);
	}

	.strategy-name {
		font-weight: 500;
	}

	.metric-cell {
		text-align: center;
		padding: 4px;
	}

	.welch-cell {
		text-align: center;
		padding: 4px;
		font-weight: 500;
	}

	.wt-significant {
		background: #dcfce7;
		color: #166534;
	}

	.wt-ns {
		background: var(--g2);
		color: var(--g7);
	}
</style>
