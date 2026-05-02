<script lang="ts">
	/**
	 * /research/cycle/[cycle_id] — autoresearch cycle detail view.
	 * Shows cycle results, ensemble round performance, and rules snapshot.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	interface CycleDetail {
		cycleId: number;
		status: string;
		strategy: string;
		dsrDelta: number;
		costUsd: number;
		latencySec: number;
		commitSha: string;
		createdAt: string;
		rulesSnapshot?: {
			version: string;
			filters: string[];
			risk_limits: {
				max_position: number;
				max_drawdown: number;
			};
		};
	}

	interface EnsembleRound {
		cycleId: number;
		strategyName: string;
		passRate: number;
		dsrDelta: number;
		costUsd: number;
		latencySec: number;
	}

	let { data } = $props<{ data: PageData }>();

	let cycleDetail = $state<CycleDetail | null>(null);
	let ensembleRounds = $state<EnsembleRound[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadCycleDetail(): Promise<void> {
		try {
			const cycleId = $page.params.cycle_id;
			const res = await fetch(`/api/research/cycle/${cycleId}`);
			const body = await res.json();
			if (!res.ok || !body.ok) {
				error = body.error ?? 'Failed to load cycle detail';
				return;
			}
			cycleDetail = body.cycle || null;
			ensembleRounds = body.ensembleRounds || [];
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	onMount(loadCycleDetail);

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') : '—';
	}

	function fmtPct(n: number | null): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
	}

	function statusClass(status: string): string {
		if (status === 'committed') return 'status-committed';
		if (status === 'rejected') return 'status-rejected';
		return 'status-pending';
	}
</script>

<svelte:head>
	<title>Research · Cycle Detail — WTD</title>
</svelte:head>

<section class="detail-root" data-testid="cycle-detail-root">
	<header class="detail-header">
		<h1>Research &gt; Cycle Detail</h1>
		{#if cycleDetail}
			<span class="cycle-id">Cycle #{cycleDetail.cycleId}</span>
		{/if}
	</header>

	{#if loading}
		<p class="muted" data-testid="detail-loading">Loading…</p>
	{:else if error}
		<p class="error" data-testid="detail-error">Error: {error}</p>
	{:else if cycleDetail}
		<!-- Cycle Summary -->
		<section class="summary-section" data-testid="cycle-summary">
			<h2>Cycle Summary</h2>
			<div class="summary-grid">
				<div class="metric">
					<span class="label">Status</span>
					<span class={`value status-badge ${cycleDetail.status}`}>{cycleDetail.status}</span>
				</div>
				<div class="metric">
					<span class="label">Strategy</span>
					<span class="value">{cycleDetail.strategy}</span>
				</div>
				<div class="metric">
					<span class="label">DSR Δ</span>
					<span class="value">{fmtPct(cycleDetail.dsrDelta)}</span>
				</div>
				<div class="metric">
					<span class="label">Cost</span>
					<span class="value">${cycleDetail.costUsd.toFixed(2)}</span>
				</div>
				<div class="metric">
					<span class="label">Latency</span>
					<span class="value">{cycleDetail.latencySec.toFixed(1)}s</span>
				</div>
				<div class="metric">
					<span class="label">Timestamp</span>
					<span class="value">{fmtTime(cycleDetail.createdAt)}</span>
				</div>
				<div class="metric full-width">
					<span class="label">Commit</span>
					<code class="mono">{cycleDetail.commitSha}</code>
				</div>
			</div>
		</section>

		<!-- Ensemble Rounds Performance -->
		{#if ensembleRounds.length > 0}
			<section class="ensemble-section" data-testid="ensemble-performance">
				<h2>Ensemble Rounds Performance</h2>
				<table>
					<thead>
						<tr>
							<th>Strategy</th>
							<th>Pass Rate</th>
							<th>DSR Δ</th>
							<th>Cost</th>
							<th>Latency</th>
						</tr>
					</thead>
					<tbody>
						{#each ensembleRounds as round}
							<tr>
								<td>{round.strategyName}</td>
								<td class="number">{(round.passRate * 100).toFixed(1)}%</td>
								<td class="number">{fmtPct(round.dsrDelta)}</td>
								<td class="number">${round.costUsd.toFixed(2)}</td>
								<td class="number">{round.latencySec.toFixed(1)}s</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		<!-- Rules Snapshot -->
		{#if cycleDetail.rulesSnapshot}
			<section class="rules-section" data-testid="rules-snapshot">
				<h2>Rules Snapshot</h2>
				<div class="rules-grid">
					<div class="rule-block">
						<span class="label">Version</span>
						<code>{cycleDetail.rulesSnapshot.version}</code>
					</div>
					<div class="rule-block">
						<span class="label">Filters</span>
						<div class="filter-list">
							{#each cycleDetail.rulesSnapshot.filters as filter}
								<span class="filter-tag">{filter}</span>
							{/each}
						</div>
					</div>
					<div class="rule-block full-width">
						<span class="label">Risk Limits</span>
						<div class="risk-table">
							<div class="risk-row">
								<span>Max Position</span>
								<code>{cycleDetail.rulesSnapshot.risk_limits.max_position}</code>
							</div>
							<div class="risk-row">
								<span>Max Drawdown</span>
								<code>{(cycleDetail.rulesSnapshot.risk_limits.max_drawdown * 100).toFixed(1)}%</code>
							</div>
						</div>
					</div>
				</div>
			</section>
		{/if}
	{:else}
		<p class="banner" data-testid="detail-not-found">Cycle not found.</p>
	{/if}
</section>

<style>
	.detail-root {
		padding: 16px;
		font-family: var(--font-body, system-ui);
		color: var(--g10);
		background: var(--g0);
		min-height: 100vh;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 24px;
	}

	.detail-header h1 {
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0;
	}

	.cycle-id {
		font-size: 12px;
		color: var(--g6);
		font-family: var(--font-mono, ui-monospace);
	}

	.summary-section,
	.ensemble-section,
	.rules-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
		margin-bottom: 24px;
	}

	.summary-section h2,
	.ensemble-section h2,
	.rules-section h2 {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
		color: var(--g7);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.metric.full-width {
		grid-column: 1 / -1;
	}

	.metric .label {
		font-size: var(--ui-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--g6);
	}

	.metric .value {
		font-size: 13px;
		font-weight: 500;
		font-family: var(--font-mono, ui-monospace);
	}

	.status-badge {
		padding: 2px 6px;
		font-size: var(--ui-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border-radius: 2px;
		width: fit-content;
	}

	.status-badge.committed {
		background: var(--pos-d);
		color: var(--pos);
	}

	.status-badge.rejected {
		background: var(--neg-d);
		color: var(--neg);
	}

	.status-badge.pending {
		background: var(--g3);
		color: var(--g7);
	}

	code {
		background: var(--g0);
		padding: 2px 4px;
		border-radius: 2px;
		font-family: var(--font-mono, ui-monospace);
		font-size: var(--ui-text-xs);
	}

	.mono {
		font-family: var(--font-mono, ui-monospace);
	}

	table {
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
	}

	td.number {
		text-align: right;
	}

	.rules-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}

	.rule-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.rule-block.full-width {
		grid-column: 1 / -1;
	}

	.rule-block .label {
		font-size: var(--ui-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--g6);
	}

	.filter-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.filter-tag {
		background: var(--g2);
		color: var(--g7);
		padding: 2px 6px;
		border-radius: 2px;
		font-size: var(--ui-text-xs);
		font-family: var(--font-mono, ui-monospace);
	}

	.risk-table {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.risk-row {
		display: flex;
		justify-content: space-between;
		padding: 4px 0;
		border-bottom: 1px solid var(--g2);
		font-size: var(--ui-text-xs);
	}

	.muted {
		color: var(--g6);
		padding: 12px;
	}

	.error {
		color: var(--neg);
		background: var(--neg-d);
		padding: 12px;
		border-radius: 3px;
	}

	.banner {
		background: var(--amb);
		color: var(--g0);
		padding: 12px;
		border-radius: 3px;
		font-size: 11px;
	}
</style>
