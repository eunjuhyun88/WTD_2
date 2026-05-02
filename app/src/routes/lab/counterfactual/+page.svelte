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

	interface FormulaEvidenceRow {
		scope_kind: string;
		scope_value: string;
		sample_n: number;
		blocked_winner_rate: number;
		good_block_rate: number;
		drag_score: number;
		avg_missed_pnl: number;
		computed_at: string;
	}

	let pattern = $state<string>('ALL');
	let horizon = $state<HorizonHour>(24);
	let sinceDays = $state<SinceDays>(30);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<CounterfactualReview | null>(null);
	let activeCycle = $state<CycleMarker | null>(null);
	let cycleHistory = $state<CycleMarker[]>([]);
	let formulaEvidence = $state<FormulaEvidenceRow[]>([]);
	let formulaLoading = $state(false);

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

	async function loadFormulaEvidence(): Promise<void> {
		formulaLoading = true;
		try {
			const res = await fetch('/api/research/formula-evidence?limit=20');
			const body = await res.json();
			if (res.ok && body.ok && Array.isArray(body.data)) {
				formulaEvidence = body.data as FormulaEvidenceRow[];
			}
		} catch {
			// non-blocking — formula evidence is best-effort
		} finally {
			formulaLoading = false;
		}
	}

	onMount(() => {
		void load();
		void loadFormulaEvidence();
	});

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

		<section class="scatter" data-testid="cfx-scatter">
			<h2>SCATTER — p_win vs Δ return by reason</h2>
			{#if data.by_reason.length > 0}
				<svg viewBox="0 0 320 160" class="scatter-svg" role="img" aria-label="p_win vs delta return scatter">
					<!-- axes -->
					<line x1="40" y1="10" x2="40" y2="140" stroke="var(--g4)" stroke-width="0.5"/>
					<line x1="40" y1="140" x2="310" y2="140" stroke="var(--g4)" stroke-width="0.5"/>
					<!-- zero line (delta=0) -->
					<line x1="40" y1="75" x2="310" y2="75" stroke="var(--g3)" stroke-width="0.5" stroke-dasharray="3,3"/>
					<!-- axis labels -->
					<text x="175" y="158" text-anchor="middle" font-size="7" fill="var(--g7)">p_win →</text>
					<text x="8" y="78" text-anchor="middle" font-size="7" fill="var(--g7)" transform="rotate(-90,8,78)">Δ ret</text>
					{#each data.by_reason as r}
						{@const cx = 40 + (r.p_win - 0.3) / 0.5 * 270}
						{@const cy = 140 - (r.delta + 3) / 6 * 130}
						{@const fill = r.delta > 0 ? 'var(--neg)' : r.delta < -0.5 ? 'var(--pos)' : 'var(--g6)'}
						<circle cx={Math.max(42, Math.min(308, cx))} cy={Math.max(12, Math.min(138, cy))} r="5" fill={fill} opacity="0.8"/>
						<text x={Math.max(42, Math.min(308, cx))} y={Math.max(10, Math.min(136, cy - 7))} text-anchor="middle" font-size="6" fill="var(--g8)">{r.reason.replace('_', ' ')}</text>
					{/each}
				</svg>
				<p class="scatter-legend">
					<span class="dot neg"></span> blocked signal outperformed (high drag)
					<span class="dot pos"></span> correctly blocked (low delta)
				</p>
			{:else}
				<p class="muted">No by_reason data available.</p>
			{/if}
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

	<section class="formula-evidence" data-testid="cfx-formula-evidence">
		<h2>FORMULA EVIDENCE — drag_score by filter reason (last 30d)</h2>
		{#if formulaLoading}
			<p class="muted">Loading…</p>
		{:else if formulaEvidence.length === 0}
			<p class="muted">No formula evidence computed yet. Run materializer to populate.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>reason</th>
						<th>n</th>
						<th>blocked_winner_rate</th>
						<th>good_block_rate</th>
						<th>avg_missed (bps)</th>
						<th>drag_score</th>
					</tr>
				</thead>
				<tbody>
					{#each formulaEvidence as row}
						<tr>
							<td class="mono">{row.scope_value}</td>
							<td>{row.sample_n}</td>
							<td class={row.blocked_winner_rate > 0.3 ? 'neg' : 'muted'}>{(row.blocked_winner_rate * 100).toFixed(1)}%</td>
							<td class={row.good_block_rate > 0.5 ? 'pos' : 'muted'}>{(row.good_block_rate * 100).toFixed(1)}%</td>
							<td class={row.avg_missed_pnl > 30 ? 'neg' : 'muted'}>{row.avg_missed_pnl.toFixed(1)}</td>
							<td class="drag {row.drag_score > 10 ? 'high' : row.drag_score > 3 ? 'med' : 'low'}">{row.drag_score.toFixed(1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="formula-hint">drag_score = blocked_winner_rate × avg_missed_pnl. High drag → consider relaxing filter.</p>
		{/if}
	</section>
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
	.controls label { display: flex; flex-direction: column; font-size: var(--ui-text-xs); text-transform: uppercase; gap: 4px; color: var(--g7); }
	.controls select { font-family: var(--font-mono, ui-monospace); font-size: 11px; background: var(--g1); color: var(--g10); border: 1px solid var(--g3); padding: 4px 8px; }

	.active-cycle-banner { background: var(--amb); color: var(--g0); padding: 8px 12px; font-size: 11px; margin-bottom: 12px; font-family: var(--font-mono, ui-monospace); }
	.active-cycle-banner code { background: var(--g0); color: var(--amb); padding: 2px 4px; border-radius: 2px; }

	.distros { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
	.dist { background: var(--g1); border: 1px solid var(--g3); padding: 12px; }
	.dist h2 { font-size: var(--ui-text-xs); letter-spacing: 0.06em; margin: 0 0 8px; }
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
	.welch .badge { background: var(--g3); color: var(--g10); padding: 2px 6px; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: 0.05em; }

	.reasons, .signals { background: var(--g1); border: 1px solid var(--g3); padding: 12px; margin-bottom: 16px; }
	.reasons h2, .signals h2 { font-size: var(--ui-text-xs); letter-spacing: 0.06em; margin: 0 0 8px; }
	table { width: 100%; border-collapse: collapse; font-size: 11px; font-family: var(--font-mono, ui-monospace); }
	th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--g2); }
	th { background: var(--g2); color: var(--g7); font-weight: 500; text-transform: uppercase; font-size: var(--ui-text-xs); letter-spacing: 0.04em; }
	td.pos, .pos { color: var(--pos); }
	td.neg, .neg { color: var(--neg); }
	td.muted, .muted { color: var(--g6); }
	.mono { font-family: var(--font-mono, ui-monospace); }
	.status.traded { color: var(--pos); }
	.status.blocked { color: var(--g7); }
	.verdict { padding: 1px 6px; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: 0.04em; }
	.verdict.keep { background: var(--g3); color: var(--g10); }
	.verdict.relax { background: var(--amb); color: var(--g0); }
	.verdict.inconclusive { background: var(--g2); color: var(--g7); }

	.banner { background: var(--amb); color: var(--g0); padding: 8px 12px; font-size: 11px; margin-bottom: 12px; }
	.error { color: var(--neg); padding: 12px; background: var(--neg-d); }

	/* Scatter */
	.scatter { background: var(--g1); border: 1px solid var(--g3); padding: 12px; margin-bottom: 16px; }
	.scatter h2 { font-size: var(--ui-text-xs); letter-spacing: 0.06em; margin: 0 0 8px; text-transform: uppercase; color: var(--g7); }
	.scatter-svg { width: 100%; max-width: 400px; display: block; }
	.scatter-legend { font-size: var(--ui-text-xs); color: var(--g7); margin: 4px 0 0; display: flex; gap: 12px; align-items: center; }
	.scatter-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
	.scatter-legend .dot.neg { background: var(--neg); }
	.scatter-legend .dot.pos { background: var(--pos); }

	/* Formula evidence */
	.formula-evidence { background: var(--g1); border: 1px solid var(--g3); padding: 12px; margin-top: 16px; }
	.formula-evidence h2 { font-size: var(--ui-text-xs); letter-spacing: 0.06em; margin: 0 0 8px; text-transform: uppercase; color: var(--g7); }
	.formula-hint { font-size: var(--ui-text-xs); color: var(--g6); margin: 6px 0 0; font-family: var(--font-mono, ui-monospace); }
	.drag.high { color: var(--neg); font-weight: 700; }
	.drag.med { color: var(--amb); }
	.drag.low { color: var(--g7); }
</style>
