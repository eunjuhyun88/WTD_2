import type { ChartPresentation, PriceChartViewSpec } from '../contracts/chartViewSpec';

type PriceChartRuntime = {
	update: (spec: PriceChartViewSpec, presentation: ChartPresentation) => void;
	destroy: () => void;
};

function chartHeightFor(presentation: ChartPresentation) {
	return presentation === 'inline' ? 210 : 320;
}

export async function createPriceChartRuntime(
	container: HTMLDivElement
): Promise<PriceChartRuntime> {
	const lwc = await import('lightweight-charts');
	const chart = lwc.createChart(container, {
		width: container.clientWidth,
		height: Math.max(chartHeightFor('inline'), container.clientHeight || 0),
		layout: {
			background: { color: 'transparent' },
			textColor: 'rgba(247, 242, 234, 0.52)',
			fontFamily: "'JetBrains Mono', monospace",
			fontSize: 10,
		},
		grid: {
			vertLines: { color: 'rgba(219, 154, 159, 0.05)' },
			horzLines: { color: 'rgba(219, 154, 159, 0.05)' },
		},
		crosshair: {
			mode: 0,
			vertLine: { color: 'rgba(219, 154, 159, 0.2)', width: 1, style: 2 },
			horzLine: { color: 'rgba(219, 154, 159, 0.2)', width: 1, style: 2 },
		},
		timeScale: {
			borderColor: 'rgba(219, 154, 159, 0.12)',
			timeVisible: true,
			secondsVisible: false,
		},
		rightPriceScale: {
			borderColor: 'rgba(219, 154, 159, 0.12)',
			scaleMargins: { top: 0.08, bottom: 0.2 },
		},
	});

	const candleSeries = chart.addSeries(lwc.CandlestickSeries, {
		upColor: '#adca7c',
		downColor: '#cf7f8f',
		borderUpColor: '#adca7c',
		borderDownColor: '#cf7f8f',
		wickUpColor: 'rgba(173, 202, 124, 0.6)',
		wickDownColor: 'rgba(207, 127, 143, 0.6)',
	});

	const volumeSeries = chart.addSeries(lwc.HistogramSeries, {
		priceFormat: { type: 'volume' },
		priceScaleId: 'volume',
	});
	const markerAwareCandleSeries = candleSeries as typeof candleSeries & {
		setMarkers?: (markers: Array<Record<string, unknown>>) => void;
	};

	chart.priceScale('volume').applyOptions({
		scaleMargins: { top: 0.82, bottom: 0 },
	});

	let activeOverlaySeries: any[] = [];
	let activePriceLines: any[] = [];
	let currentPresentation: ChartPresentation = 'inline';
	const resizeObserver = new ResizeObserver(() => {
		chart.applyOptions({
			width: container.clientWidth,
			height: Math.max(chartHeightFor(currentPresentation), container.clientHeight || 0),
		});
	});
	resizeObserver.observe(container);

	function clearPriceLines() {
		for (const line of activePriceLines) {
			try {
				candleSeries.removePriceLine(line);
			} catch {
				// ignore stale price-line refs
			}
		}
		activePriceLines = [];
	}

	function clearOverlaySeries() {
		for (const series of activeOverlaySeries) {
			try {
				chart.removeSeries(series);
			} catch {
				// ignore stale overlay refs
			}
		}
		activeOverlaySeries = [];
	}

	function update(spec: PriceChartViewSpec, presentation: ChartPresentation) {
		currentPresentation = presentation;
		chart.applyOptions({
			width: container.clientWidth,
			height: Math.max(chartHeightFor(presentation), container.clientHeight || 0),
			layout: {
				background: { color: 'transparent' },
				textColor: 'rgba(247, 242, 234, 0.52)',
				fontFamily: "'JetBrains Mono', monospace",
				fontSize: presentation === 'focus' ? 11 : 10,
			},
		});

		candleSeries.setData(
			spec.series.map((point) => ({
				time: point.t as any,
				open: point.o,
				high: point.h,
				low: point.l,
				close: point.c,
			}))
		);

		volumeSeries.setData(
			spec.series.map((point) => ({
				time: point.t as any,
				value: point.v ?? 0,
				color:
					point.c >= point.o
						? 'rgba(173, 202, 124, 0.25)'
						: 'rgba(207, 127, 143, 0.25)',
			}))
		);

		clearOverlaySeries();
		clearPriceLines();
		for (const level of spec.srLevels) {
			activePriceLines.push(
				candleSeries.createPriceLine({
					price: level.price,
					color:
						level.label === 'S'
							? 'rgba(173, 202, 124, 0.38)'
							: 'rgba(207, 127, 143, 0.38)',
					lineWidth: level.strength && level.strength >= 4 ? 2 : 1,
					lineStyle: 2,
					axisLabelVisible: true,
					title: level.label,
				})
			);
		}

		for (const line of spec.referenceLines ?? []) {
			activePriceLines.push(
				candleSeries.createPriceLine({
					price: line.price,
					color: line.color,
					lineWidth: (line.lineWidth ?? 1) as any,
					lineStyle: line.lineStyle as any,
					axisLabelVisible: true,
					title: line.title,
				})
			);
		}

		for (const overlay of spec.overlays?.bands ?? []) {
			const upperSeries = chart.addSeries(lwc.LineSeries, {
				color: 'rgba(54, 215, 255, 0.20)',
				lineWidth: 1,
				priceScaleId: 'right',
				crosshairMarkerVisible: false,
				lastValueVisible: false,
				priceLineVisible: false,
			});
			upperSeries.setData(overlay.upper.map((point) => ({ time: point.t as any, value: point.v ?? 0 })));
			activeOverlaySeries.push(upperSeries);

			if (overlay.middle?.length) {
				const middleSeries = chart.addSeries(lwc.LineSeries, {
					color: 'rgba(255, 191, 95, 0.36)',
					lineWidth: 1,
					lineStyle: 2,
					priceScaleId: 'right',
					crosshairMarkerVisible: false,
					lastValueVisible: false,
					priceLineVisible: false,
				});
				middleSeries.setData(
					overlay.middle.map((point) => ({ time: point.t as any, value: point.v ?? 0 }))
				);
				activeOverlaySeries.push(middleSeries);
			}

			const lowerSeries = chart.addSeries(lwc.LineSeries, {
				color: 'rgba(54, 215, 255, 0.20)',
				lineWidth: 1,
				priceScaleId: 'right',
				crosshairMarkerVisible: false,
				lastValueVisible: false,
				priceLineVisible: false,
			});
			lowerSeries.setData(overlay.lower.map((point) => ({ time: point.t as any, value: point.v ?? 0 })));
			activeOverlaySeries.push(lowerSeries);
		}

		for (const overlay of spec.overlays?.lines ?? []) {
			if (!overlay.points.length) continue;
			const lineSeries = chart.addSeries(lwc.LineSeries, {
				color: overlay.color,
				lineWidth: (overlay.lineWidth ?? 1) as any,
				lineStyle: overlay.lineStyle as any,
				priceScaleId: 'right',
				crosshairMarkerVisible: false,
				lastValueVisible: false,
				priceLineVisible: false,
			});
			lineSeries.setData(
				overlay.points.map((point) => ({ time: point.t as any, value: point.v ?? 0 }))
			);
			activeOverlaySeries.push(lineSeries);
		}

		if (typeof markerAwareCandleSeries.setMarkers === 'function') {
			markerAwareCandleSeries.setMarkers(
				spec.markers.map((marker) => ({
					time: marker.ts as any,
					position:
						marker.position ??
						(marker.direction === 'bull'
							? 'belowBar'
							: marker.direction === 'bear'
								? 'aboveBar'
								: 'inBar'),
					color:
						marker.color ??
						(marker.direction === 'bull'
							? '#adca7c'
							: marker.direction === 'bear'
								? '#cf7f8f'
								: '#f2d193'),
					shape:
						marker.shape ??
						(marker.direction === 'bull'
							? 'arrowUp'
							: marker.direction === 'bear'
								? 'arrowDown'
								: 'circle'),
					text: marker.label,
				}))
			);
		}

		chart.timeScale().fitContent();
	}

	function destroy() {
		resizeObserver.disconnect();
		clearOverlaySeries();
		clearPriceLines();
		chart.remove();
	}

	return {
		update,
		destroy,
	};
}
