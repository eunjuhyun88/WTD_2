<script lang="ts">
	/**
	 * /patterns/formula?slug=... — pattern dump (settings · variables · buckets · evidence · suspects).
	 * W-0383. Read-only.
	 */
	import { onMount } from 'svelte';
	import type { PatternFormula } from '$lib/contracts';

	let slug = $state('wyckoff-spring');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<PatternFormula | null>(null);

	const REGIMES = ['bull', 'neutral', 'bear'];
	const QUANTILES = ['0.55-0.60', '0.60-0.65', '0.65-0.70', '0.70+'];

	onMount(() => {
		if (typeof window !== 'undefined') {
			const fromUrl = new URLSearchParams(window.location.search).get('slug');
			if (fromUrl) slug = fromUrl;
		}
		void load();
	});

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/patterns/${encodeURIComponent(slug)}/formula`);
			const body = await res.json();
			if (!res.ok || body.ok === false || !body.data) {
				error = body.error ?? `request failed (${res.status})`;
				data = null;
				return;
			}
			data = body.data as PatternFormula;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function bucketCell(regime: string, quantile: string): { n: number; pnl: number } {
		const cell = data?.buckets.find((b) => b.regime === regime && b.quantile === quantile);
		return { n: cell?.n ?? 0, pnl: cell?.pnl ?? 0 };
	}

	function fmtPct(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
	}

	function fmtTime(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') : '—';
	}

	function pnlClass(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return 'muted';
		if (v > 0) return 'pos';
		if (v < 0) return 'neg';
		return 'muted';
	}

	function heatColor(pnl: number, n: number): string {
		if (n === 0) return 'var(--g2)';
		if (pnl > 0.5) return 'rgba(38, 166, 91, 0.5)';
		if (pnl > 0) return 'rgba(38, 166, 91, 0.2)';
		if (pnl < -0.5) return 'rgba(232, 69, 69, 0.5)';
		if (pnl < 0) return 'rgba(232, 69, 69, 0.2)';
		return 'var(--g2)';
	}
</script>

<svelte:head>
	<title>Patterns · {slug} · Formula — WTD</title>
</svelte:head>

<section class="formula-root" data-testid="formula-root">
	<header class="hd">
		<h1>Patterns &gt; <span class="slug">{slug}</span> &gt; Formula</h1>
		<button onclick={load} class="btn" data-testid="refresh">refresh</button>
	</header>

	{#if loading && !data}
		<p class="muted" data-testid="formula-loading">Loading…</p>
	{:else if error}
		<p class="error" data-testid="formula-error">Error: {error}</p>
	{:else if data}
		{#if !data.outcomes_available}
			<p class="banner" data-testid="formula-no-outcomes">
				Outcome tables unavailable — using defaults and empty queues.
			</p>
		{/if}

		<section class="card" data-testid="formula-settings">
			<h2>SETTINGS</h2>
			<dl>
				<dt>p_win min</dt><dd>{data.settings.p_win_min ?? '—'}</dd>
				<dt>tp / sl</dt>
				<dd>{data.settings.tp_pct?.toFixed(2) ?? '—'}% / {data.settings.sl_pct?.toFixed(2) ?? '—'}%</dd>
				<dt>cooldown</dt><dd>{data.settings.cooldown_min ?? '—'} min</dd>
				<dt>regime allow</dt><dd>[{data.settings.regime_allow.join(', ')}]</dd>
				<dt>last fired</dt><dd>{fmtTime(data.calibrated_at)}</dd>
			</dl>
		</section>

		<section class="card" data-testid="formula-variables">
			<h2>VARIABLES <span class="n">({data.variables.length} fields)</span></h2>
			{#if data.variables.length === 0}
				<p class="muted">no component_scores observed in window</p>
			{:else}
				<ul class="vars">
					{#each data.variables as v}<li>{v}</li>{/each}
				</ul>
			{/if}
		</section>

		<section class="card" data-testid="formula-buckets">
			<h2>BUCKETS <span class="n">(regime × p_win quantile)</span></h2>
			<table>
				<thead>
					<tr>
						<th>regime \ p_win</th>
						{#each QUANTILES as q}<th>{q}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each REGIMES as regime}
						<tr>
							<th class="rh">{regime}</th>
							{#each QUANTILES as q}
								{@const cell = bucketCell(regime, q)}
								<td style="background: {heatColor(cell.pnl, cell.n)}">
									<span class="bucket-n">n={cell.n}</span>
									<span class="bucket-pnl {pnlClass(cell.pnl)}">{cell.n > 0 ? fmtPct(cell.pnl) : '—'}</span>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card" data-testid="formula-evidence">
			<h2>EVIDENCE <span class="n">(recent traded — sample {data.evidence.length})</span></h2>
			<table>
				<thead>
					<tr><th>time</th><th>sym</th><th>dir</th><th>pnl_24h</th><th>hash</th></tr>
				</thead>
				<tbody>
					{#each data.evidence as e}
						<tr>
							<td class="mono">{fmtTime(e.fired_at)}</td>
							<td class="mono">{e.symbol}</td>
							<td>{e.direction}</td>
							<td class={pnlClass(e.pnl_24h)}>{fmtPct(e.pnl_24h)}</td>
							<td class="mono muted">{e.evidence_hash ?? '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="muted">no evidence in window</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card" data-testid="formula-suspects">
			<h2>SUSPECT LIST <span class="n">(review queue, top {data.suspects.length})</span></h2>
			<table>
				<thead>
					<tr><th>blocked_at</th><th>sym</th><th>reason</th><th>cf-24h</th><th>weight</th><th>actions</th></tr>
				</thead>
				<tbody>
					{#each data.suspects as s}
						<tr>
							<td class="mono">{fmtTime(s.blocked_at)}</td>
							<td class="mono">{s.symbol}</td>
							<td>{s.blocked_reason}</td>
							<td class={pnlClass(s.cf_24h)}>{fmtPct(s.cf_24h)}</td>
							<td><span class="weight {s.weight}">{s.weight}</span></td>
							<td>
								<a class="action" href="/lab?slug={encodeURIComponent(slug)}&candidate={encodeURIComponent(s.candidate_id)}">Open in lab</a>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="muted">no suspects in window</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</section>

<style>
	.formula-root { padding: 16px; font-family: var(--font-body, system-ui); color: var(--g10); background: var(--g0); min-height: 100vh; }
	.hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
	.hd h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
	.hd .slug { color: var(--amb); }
	.card { background: var(--g1); border: 1px solid var(--g3); padding: 12px 16px; margin-bottom: 12px; }
	.card h2 { font-size: 10px; letter-spacing: 0.06em; color: var(--g7); margin: 0 0 8px; text-transform: uppercase; }
	.card .n { color: var(--g6); font-weight: 400; }
	dl { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; margin: 0; font-family: var(--font-mono, ui-monospace); font-size: 11px; }
	dt { color: var(--g7); }
	dd { margin: 0; color: var(--g10); }
	.vars { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-family: var(--font-mono, ui-monospace); font-size: 11px; color: var(--g8); }
	table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, ui-monospace); font-size: 11px; }
	th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--g2); }
	th { background: var(--g2); color: var(--g7); font-weight: 500; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; }
	.rh { background: var(--g2); color: var(--g8); }
	.bucket-n { display: block; font-size: 9px; color: var(--g7); }
	.bucket-pnl { display: block; font-size: 11px; font-weight: 600; }
	.btn { background: var(--g3); color: var(--g10); border: 1px solid var(--g4); padding: 4px 10px; font-size: 10px; text-transform: uppercase; cursor: pointer; }
	.action { color: var(--amb); text-decoration: none; font-size: 10px; }
	.weight { padding: 1px 6px; font-size: 9px; text-transform: uppercase; }
	.weight.high { background: var(--neg); color: var(--g0); }
	.weight.med { background: var(--amb); color: var(--g0); }
	.weight.low { background: var(--g3); color: var(--g8); }
	.mono { font-family: var(--font-mono, ui-monospace); }
	.pos { color: var(--pos); }
	.neg { color: var(--neg); }
	.muted { color: var(--g6); }
	.banner { background: var(--amb); color: var(--g0); padding: 8px 12px; font-size: 11px; margin-bottom: 12px; }
	.error { color: var(--neg); padding: 12px; background: var(--neg-d); }
</style>
