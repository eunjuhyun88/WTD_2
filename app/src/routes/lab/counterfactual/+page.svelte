<script lang="ts">
	/**
	 * /lab/counterfactual — distribution comparison + filter attribution.
	 * W-0383. Read-only analytics; no production thresholds change here.
	 * Extended: active rule cycle banner + cycle commits timeline overlay.
	 */
	import { onMount } from 'svelte';
	import type { CounterfactualReview, HorizonHour, SinceDays } from '$lib/contracts';

	interface CycleMarker {
		cycleId: number;
		commitSha: string;
		timestamp: Date;
		status: string;
	}

	let pattern = $state<string>('ALL');
	let horizon = $state<HorizonHour>(24);
	let sinceDays = $state<SinceDays>(30);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<CounterfactualReview | null>(null);
	let activeCycle = $state<CycleMarker | null>(null);
	let cycleHistory = $state<CycleMarker[]>([]);

	const PATTERN_OPTIONS = ['ALL', 'wyckoff-spring', 'bull-flag', 'breakout', 'reversal'];
	const HORIZON_OPTIONS: HorizonHour[] = [1, 4, 24, 72];
	const SINCE_OPTIONS: SinceDays[] = [7, 30, 90];

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams({
				pattern,
				horizon: String(horizon),
				since: String(sinceDays),
			});
			const res = await fetch(`/api/lab/counterfactual?${params}`);
			const body = await res.json();
			if (!res.ok || body.ok === false || !body.data) {
				error = body.error ?? `request failed (${res.status})`;
				data = null;
				return;
			}
			data = body.data as CounterfactualReview;

			// Load cycle history
			const cycleRes = await fetch(`/api/research/ledger?limit=20&offset=0`);
			const cycleBody = await cycleRes.json();
			if (cycleBody.ok && cycleBody.entries) {
				cycleHistory = cycleBody.entries
					.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
					.map((entry: any) => ({
						cycleId: entry.cycleId,
						commitSha: entry.commitSha,
						timestamp: new Date(entry.createdAt),
						status: entry.status
					}));
				activeCycle = cycleHistory[0] || null;
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function fmtPct(n: number | null): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
	}

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') : '—';
	}

	function pnlClass(v: number | null): string {
		if (v == null) return 'muted';
		if (v > 0) return 'pos';
		if (v < 0) return 'neg';
		return 'muted';
	}

	function welchVerdict(): string {
		if (!data || data.welch.insufficient_data) return 'insufficient data';
		if (data.welch.p < 0.001) return 'highly significant';
		if (data.welch.p < 0.05) return 'significant';
		return 'not significant';
	}

	function maxBin(): number {
		if (!data) return 1;
		const a = Math.max(...data.traded.histogram, 0);
		const b = Math.max(...data.blocked.histogram, 0);
		return Math.max(a, b, 1);
	}
</script>

<svelte:head>
	<title>Lab · Counterfactual — WTD</title>
</svelte:head>

<section class="cfx-root" data-testid="counterfactual-root">
	<header class="cfx-header">
		<h1>Lab &gt; Counterfactual</h1>
		<div class="controls">
			<label>
				Pattern
				<select bind:value={pattern} onchange={load} data-testid="pattern-select">
					{#each PATTERN_OPTIONS as p}<option value={p}>{p}</option>{/each}
				</select>
			</label>
			<label>
				Horizon
				<select bind:value={horizon} onchange={load} data-testid="horizon-select">
					{#each HORIZON_OPTIONS as h}<option value={h}>{h}h</option>{/each}
				</select>
			</label>
			<label>
				Since
				<select bind:value={sinceDays} onchange={load} data-testid="since-select">
					{#each SINCE_OPTIONS as s}<option value={s}>{s}d</option>{/each}
				</select>
			</label>
		</div>
	</header>

	{#if activeCycle}
		<div class="active-cycle-banner" data-testid="active-cycle-banner">
			<strong>Active Rule Cycle:</strong>
			Cycle #{activeCycle.cycleId} ({activeCycle.status})
			· Commit: <code>{activeCycle.commitSha.substring(0, 8)}</code>
			· Updated: {activeCycle.timestamp.toLocaleString()}
		</div>
	{/if}

	{#if loading}
		<p class="muted" data-testid="cfx-loading">Loading…</p>
	{:else if error}
		<p class="error" data-testid="cfx-error">Error: {error}</p>
	{:else if data}
		{#if !data.outcomes_available}
			<p class="banner" data-testid="cfx-no-outcomes">
				Outcome tables unavailable in this environment — counterfactual leg is empty.
			</p>
		{/if}

		<section class="distros" data-testid="cfx-distros">
			<article class="dist traded">
				<h2>TRADED <span class="n">(n={data.traded.n})</span></h2>
				<dl>
					<dt>median</dt><dd class={pnlClass(data.traded.median)}>{fmtPct(data.traded.median)}</dd>
					<dt>IQR</dt><dd>±{((data.traded.iqr[1] - data.traded.iqr[0]) / 2).toFixed(2)}%</dd>
					<dt>p_win</dt><dd>{(data.traded.p_win * 100).toFixed(1)}%</dd>
				</dl>
				<div class="hist-container">
					<div class="hist" aria-label="traded histogram">
						{#each data.traded.histogram as count}
							<span class="bin" style="height: {(count / maxBin()) * 100}%"></span>
						{/each}
					</div>
					{#if cycleHistory.length > 0}
						<svg class="cycle-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
							{#each cycleHistory as cycle, idx}
								{@const xPos = ((cycleHistory.length - idx) / cycleHistory.length) * 100}
								<line
									x1={xPos}
									y1="0"
									x2={xPos}
									y2="100"
									stroke={cycle.status === 'committed' ? '#10b981' : '#ef4444'}
									stroke-width="0.5"
									opacity="0.5"
								/>
							{/each}
						</svg>
					{/if}
				</div>
			</article>
			<article class="dist blocked">
				<h2>BLOCKED <span class="n">(n={data.blocked.n})</span></h2>
				<dl>
					<dt>median</dt><dd class={pnlClass(data.blocked.median)}>{fmtPct(data.blocked.median)}</dd>
					<dt>IQR</dt><dd>±{((data.blocked.iqr[1] - data.blocked.iqr[0]) / 2).toFixed(2)}%</dd>
					<dt>p_win</dt><dd>{(data.blocked.p_win * 100).toFixed(1)}%</dd>
				</dl>
				<div class="hist-container">
					<div class="hist" aria-label="blocked histogram">
						{#each data.blocked.histogram as count}
							<span class="bin neg" style="height: {(count / maxBin()) * 100}%"></span>
						{/each}
					</div>
					{#if cycleHistory.length > 0}
						<svg class="cycle-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
							{#each cycleHistory as cycle, idx}
								{@const xPos = ((cycleHistory.length - idx) / cycleHistory.length) * 100}
								<line
									x1={xPos}
									y1="0"
									x2={xPos}
									y2="100"
									stroke={cycle.status === 'committed' ? '#10b981' : '#ef4444'}
									stroke-width="0.5"
									opacity="0.5"
								/>
							{/each}
						</svg>
					{/if}
				</div>
			</article>
		</section>

		<section class="welch" data-testid="cfx-welch">
			Δ median = <strong class={pnlClass(data.delta_median)}>{fmtPct(data.delta_median)}</strong>
			· 95% CI [{fmtPct(data.ci_95[0])}, {fmtPct(data.ci_95[1])}]
			· Welch t={data.welch.t.toFixed(2)} · p={data.welch.p.toFixed(4)}
			· <span class="badge">{welchVerdict()}</span>
		</section>

		<section class="reasons" data-testid="cfx-reasons">
			<h2>By blocked_reason (top 5)</h2>
			<table>
				<thead>
					<tr><th>reason</th><th>n</th><th>median</th><th>p_win</th><th>Δ vs traded</th><th>verdict</th></tr>
				</thead>
				<tbody>
					{#each data.by_reason as r}
						<tr>
							<td>{r.reason}</td>
							<td>{r.n}</td>
							<td class={pnlClass(r.median)}>{fmtPct(r.median)}</td>
							<td>{(r.p_win * 100).toFixed(1)}%</td>
							<td class={pnlClass(r.delta)}>{fmtPct(r.delta)}</td>
							<td><span class="verdict {r.verdict}">{r.verdict}</span></td>
						</tr>
					{:else}
						<tr><td colspan="6" class="muted">no blocked outcomes in window</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="signals" data-testid="cfx-signals">
			<h2>Signal table (latest {data.table.length})</h2>
			<table>
				<thead>
					<tr>
						<th>time</th><th>sym</th><th>pattern</th><th>dir</th>
						<th>status</th><th>reason</th>
						<th>1h</th><th>4h</th><th>24h</th>
					</tr>
				</thead>
				<tbody>
					{#each data.table as row}
						<tr class={row.status}>
							<td class="mono">{fmtTime(row.time)}</td>
							<td class="mono">{row.symbol}</td>
							<td>{row.pattern ?? '—'}</td>
							<td>{row.direction}</td>
							<td><span class="status {row.status}">{row.status}</span></td>
							<td class="mono">{row.reason ?? '—'}</td>
							<td class={pnlClass(row.r1h)}>{fmtPct(row.r1h)}</td>
							<td class={pnlClass(row.r4h)}>{fmtPct(row.r4h)}</td>
							<td class={pnlClass(row.r24h)}>{fmtPct(row.r24h)}</td>
						</tr>
					{:else}
						<tr><td colspan="9" class="muted">no signals in window</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</section>

<style>
	.cfx-root {
		padding: 16px;
		font-family: var(--font-body, system-ui);
		color: var(--g10);
		background: var(--g0);
		min-height: 100vh;
	}
	.cfx-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 16px;
	}
	.cfx-header h1 { font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
	.controls { display: flex; gap: 12px; }
	.controls label { display: flex; flex-direction: column; font-size: 9px; text-transform: uppercase; gap: 4px; color: var(--g7); }
	.controls select { font-family: var(--font-mono, ui-monospace); font-size: 11px; background: var(--g1); color: var(--g10); border: 1px solid var(--g3); padding: 4px 8px; }

	.active-cycle-banner { background: var(--amb); color: var(--g0); padding: 8px 12px; font-size: 11px; margin-bottom: 12px; font-family: var(--font-mono, ui-monospace); }
	.active-cycle-banner code { background: var(--g0); color: var(--amb); padding: 2px 4px; border-radius: 2px; }

	.distros { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
	.dist { background: var(--g1); border: 1px solid var(--g3); padding: 12px; }
	.dist h2 { font-size: 10px; letter-spacing: 0.06em; margin: 0 0 8px; }
	.dist .n { color: var(--g7); font-weight: 400; }
	.dist dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 8px; font-size: 11px; font-family: var(--font-mono, ui-monospace); }
	.dist dt { color: var(--g7); }
	.dist dd { margin: 0; text-align: right; }
	.hist-container { position: relative; }
	.hist { display: flex; align-items: flex-end; gap: 2px; height: 60px; background: var(--g0); padding: 4px; }
	.cycle-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; pointer-events: none; }
	.bin { flex: 1; background: var(--pos); min-height: 1px; opacity: 0.85; }
	.bin.neg { background: var(--g6); }

	.welch {
		font-family: var(--font-mono, ui-monospace);
		font-size: 11px;
		background: var(--g1);
		border-left: 2px solid var(--amb);
		padding: 8px 12px;
		margin-bottom: 16px;
	}
	.welch .badge { background: var(--g3); color: var(--g10); padding: 2px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }

	.reasons, .signals { background: var(--g1); border: 1px solid var(--g3); padding: 12px; margin-bottom: 16px; }
	.reasons h2, .signals h2 { font-size: 10px; letter-spacing: 0.06em; margin: 0 0 8px; }
	table { width: 100%; border-collapse: collapse; font-size: 11px; font-family: var(--font-mono, ui-monospace); }
	th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--g2); }
	th { background: var(--g2); color: var(--g7); font-weight: 500; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; }
	td.pos, .pos { color: var(--pos); }
	td.neg, .neg { color: var(--neg); }
	td.muted, .muted { color: var(--g6); }
	.mono { font-family: var(--font-mono, ui-monospace); }
	.status.traded { color: var(--pos); }
	.status.blocked { color: var(--g7); }
	.verdict { padding: 1px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
	.verdict.keep { background: var(--g3); color: var(--g10); }
	.verdict.relax { background: var(--amb); color: var(--g0); }
	.verdict.inconclusive { background: var(--g2); color: var(--g7); }

	.banner { background: var(--amb); color: var(--g0); padding: 8px 12px; font-size: 11px; margin-bottom: 12px; }
	.error { color: var(--neg); padding: 12px; background: var(--neg-d); }
</style>
