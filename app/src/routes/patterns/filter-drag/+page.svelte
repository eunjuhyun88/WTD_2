<script lang="ts">
	/**
	 * /patterns/filter-drag — counterfactual slider lab.
	 * W-0383. Read-only simulation. Production thresholds are NOT mutated.
	 */
	import { onMount } from 'svelte';
	import type { FilterDragState, FilterRow } from '$lib/contracts';

	const DEFAULT_VALUES = {
		p_win_min: 0.55,
		volume_floor: 5,
		cooldown_min: 60,
		regime_block: true,
	};

	let slug = $state('wyckoff-spring');
	let sinceDays = $state<7 | 30 | 90>(90);
	let pWinMin = $state(DEFAULT_VALUES.p_win_min);
	let volumeFloor = $state(DEFAULT_VALUES.volume_floor);
	let cooldownMin = $state(DEFAULT_VALUES.cooldown_min);
	let regimeBlock = $state(DEFAULT_VALUES.regime_block);

	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<FilterDragState | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
		const params = new URLSearchParams({
			since: String(sinceDays),
			p_win_min: pWinMin.toFixed(3),
			volume_floor: String(volumeFloor),
			cooldown_min: String(cooldownMin),
			regime_block: regimeBlock ? '1' : '0',
		});
		try {
			const res = await fetch(`/api/patterns/${encodeURIComponent(slug)}/filter-drag?${params}`);
			const body = await res.json();
			if (!res.ok || body.ok === false || !body.data) {
				error = body.error ?? `request failed (${res.status})`;
				data = null;
				return;
			}
			data = body.data as FilterDragState;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function debouncedLoad(): void {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(load, 200);
	}

	function fmtPct(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
	}

	function pnlClass(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return 'muted';
		if (v > 0) return 'pos';
		if (v < 0) return 'neg';
		return 'muted';
	}

	function getRow(key: string): FilterRow | undefined {
		return data?.filters.find((f) => f.key === key);
	}

	function makePath(equity: number[], width: number, height: number): string {
		if (equity.length === 0) return '';
		const min = Math.min(...equity, 0);
		const max = Math.max(...equity, 0);
		const range = max - min || 1;
		return equity
			.map((v, i) => {
				const x = (i / Math.max(1, equity.length - 1)) * width;
				const y = height - ((v - min) / range) * height;
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}
</script>

<svelte:head>
	<title>Patterns · Filter Drag — WTD</title>
</svelte:head>

<section class="fdr-root" data-testid="filter-drag-root">
	<header class="fdr-header">
		<h1>Patterns &gt; <span class="slug">{slug}</span> &gt; Filter Drag</h1>
		<div class="controls">
			<label>
				Period
				<select bind:value={sinceDays} onchange={load} data-testid="since-select">
					<option value={7}>7d</option>
					<option value={30}>30d</option>
					<option value={90}>90d</option>
				</select>
			</label>
		</div>
	</header>

	<p class="paper-note">Simulation only — production thresholds are unchanged.</p>

	{#if loading && !data}
		<p class="muted" data-testid="fdr-loading">Loading…</p>
	{:else if error}
		<p class="error" data-testid="fdr-error">Error: {error}</p>
	{:else if data}
		{#if !data.outcomes_available}
			<p class="banner" data-testid="fdr-no-outcomes">
				Outcome tables unavailable — showing default-only baseline.
			</p>
		{/if}

		<section class="sliders" data-testid="fdr-sliders">
			<div class="row">
				<label class="key" for="p_win_min">p_win min</label>
				<output class="cur">{pWinMin.toFixed(2)}</output>
				<input
					id="p_win_min"
					type="range"
					min="0.4"
					max="0.7"
					step="0.01"
					bind:value={pWinMin}
					oninput={debouncedLoad}
					data-testid="slider-p_win_min"
				/>
				<span class="impact {pnlClass(getRow('p_win_min')?.pnl_delta_pct)}">
					{fmtPct(getRow('p_win_min')?.pnl_delta_pct)} / {getRow('p_win_min')?.trade_count_delta ?? 0}
				</span>
			</div>
			<div class="row">
				<label class="key" for="volume_floor">volume floor</label>
				<output class="cur">${volumeFloor}M</output>
				<input
					id="volume_floor"
					type="range"
					min="1"
					max="20"
					step="0.5"
					bind:value={volumeFloor}
					oninput={debouncedLoad}
					data-testid="slider-volume_floor"
				/>
				<span class="impact {pnlClass(getRow('volume_floor')?.pnl_delta_pct)}">
					{fmtPct(getRow('volume_floor')?.pnl_delta_pct)} / {getRow('volume_floor')?.trade_count_delta ?? 0}
				</span>
			</div>
			<div class="row">
				<label class="key" for="cooldown_min">cooldown (min)</label>
				<output class="cur">{cooldownMin}</output>
				<input
					id="cooldown_min"
					type="range"
					min="15"
					max="240"
					step="5"
					bind:value={cooldownMin}
					oninput={debouncedLoad}
					data-testid="slider-cooldown_min"
				/>
				<span class="impact {pnlClass(getRow('cooldown_min')?.pnl_delta_pct)}">
					{fmtPct(getRow('cooldown_min')?.pnl_delta_pct)} / {getRow('cooldown_min')?.trade_count_delta ?? 0}
				</span>
			</div>
			<div class="row">
				<label class="key" for="regime_block">regime block</label>
				<output class="cur">{regimeBlock ? 'ON' : 'OFF'}</output>
				<label class="toggle">
					<input
						id="regime_block"
						type="checkbox"
						bind:checked={regimeBlock}
						onchange={debouncedLoad}
						data-testid="slider-regime_block"
					/>
					<span></span>
				</label>
				<span class="impact {pnlClass(getRow('regime_block')?.pnl_delta_pct)}">
					{fmtPct(getRow('regime_block')?.pnl_delta_pct)} / {getRow('regime_block')?.trade_count_delta ?? 0}
				</span>
			</div>
		</section>

		<section class="preview" data-testid="fdr-preview">
			<h2>Equity curve preview</h2>
			<svg viewBox="0 0 480 120" preserveAspectRatio="none" class="curve">
				<path d={makePath(data.preview.current.equity, 480, 120)} class="cur-line" />
				<path d={makePath(data.preview.simulated.equity, 480, 120)} class="sim-line" />
			</svg>
			<dl class="legend">
				<dt><span class="swatch cur"></span> current</dt>
				<dd>sharpe {data.preview.current.sharpe.toFixed(2)}</dd>
				<dt><span class="swatch sim"></span> simulated</dt>
				<dd>sharpe {data.preview.simulated.sharpe.toFixed(2)}</dd>
				<dt>Δ</dt>
				<dd class={pnlClass(data.preview.delta_pct)}>{fmtPct(data.preview.delta_pct)}</dd>
			</dl>
			<div class="actions">
				<a
					class="btn primary"
					href="/lab?draft={encodeURIComponent(JSON.stringify({ slug, p_win_min: pWinMin, cooldown_min: cooldownMin, volume_floor: volumeFloor, regime_block: regimeBlock }))}"
					data-testid="apply-draft"
				>
					Apply to draft strategy
				</a>
				<a class="btn" href="/lab" data-testid="open-lab">Open in /lab/strategy-builder</a>
			</div>
		</section>
	{/if}
</section>

<style>
	.fdr-root { padding: 16px; font-family: var(--font-body, system-ui); color: var(--g10); background: var(--g0); min-height: 100vh; }
	.fdr-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
	.fdr-header h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
	.fdr-header .slug { color: var(--amb); }
	.controls label { display: flex; flex-direction: column; font-size: 9px; text-transform: uppercase; gap: 4px; color: var(--g7); }
	.controls select { font-family: var(--font-mono, ui-monospace); font-size: 11px; background: var(--g1); color: var(--g10); border: 1px solid var(--g3); padding: 4px 8px; }
	.paper-note { background: var(--g2); color: var(--g7); font-size: 10px; padding: 4px 12px; border-left: 2px solid var(--amb); }

	.sliders { background: var(--g1); border: 1px solid var(--g3); padding: 16px; margin-bottom: 16px; }
	.row { display: grid; grid-template-columns: 140px 80px 1fr 160px; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--g2); font-family: var(--font-mono, ui-monospace); font-size: 11px; }
	.row:last-child { border-bottom: 0; }
	.row .key { color: var(--g7); text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
	.row .cur { color: var(--g10); text-align: left; }
	.row input[type='range'] { width: 100%; accent-color: var(--amb); }
	.toggle { position: relative; display: inline-block; width: 36px; height: 18px; }
	.toggle input { opacity: 0; width: 0; height: 0; }
	.toggle span { position: absolute; cursor: pointer; inset: 0; background: var(--g4); transition: 0.15s; }
	.toggle span::before { position: absolute; content: ''; height: 14px; width: 14px; left: 2px; top: 2px; background: var(--g10); transition: 0.15s; }
	.toggle input:checked + span { background: var(--amb); }
	.toggle input:checked + span::before { transform: translateX(18px); }
	.impact { font-size: 11px; text-align: right; }

	.preview { background: var(--g1); border: 1px solid var(--g3); padding: 16px; }
	.preview h2 { font-size: 10px; letter-spacing: 0.06em; margin: 0 0 8px; color: var(--g7); text-transform: uppercase; }
	.curve { width: 100%; height: 120px; background: var(--g0); }
	.cur-line { fill: none; stroke: var(--g7); stroke-width: 1.5; stroke-dasharray: 3 3; }
	.sim-line { fill: none; stroke: var(--amb); stroke-width: 2; }
	.legend { display: grid; grid-template-columns: auto 1fr auto 1fr auto 1fr; gap: 4px 12px; font-size: 11px; font-family: var(--font-mono, ui-monospace); margin: 8px 0; }
	.legend dt { color: var(--g7); display: flex; align-items: center; gap: 6px; }
	.legend dd { margin: 0; }
	.swatch { display: inline-block; width: 16px; height: 2px; }
	.swatch.cur { background: var(--g7); }
	.swatch.sim { background: var(--amb); }

	.actions { display: flex; gap: 8px; margin-top: 12px; }
	.btn { padding: 6px 12px; background: var(--g3); color: var(--g10); font-size: 11px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.04em; }
	.btn.primary { background: var(--amb); color: var(--g0); }

	.pos { color: var(--pos); }
	.neg { color: var(--neg); }
	.muted { color: var(--g6); }
	.banner { background: var(--amb); color: var(--g0); padding: 8px 12px; font-size: 11px; margin-bottom: 12px; }
	.error { color: var(--neg); padding: 12px; background: var(--neg-d); }
</style>
