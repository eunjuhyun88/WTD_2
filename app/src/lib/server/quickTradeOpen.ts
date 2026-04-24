import { query } from '$lib/server/db';
import { enqueuePassportEventBestEffort } from '$lib/server/passportOutbox';
import { saveQuickTradeOpenRAG } from '$lib/server/ragService';

interface QuickTradeRow {
	id: string;
	user_id: string;
	pair: string;
	dir: 'LONG' | 'SHORT';
	entry: number;
	tp: number | null;
	sl: number | null;
	current_price: number;
	pnl_percent: number;
	status: 'open' | 'closed' | 'stopped';
	source: string | null;
	note: string | null;
	opened_at: string;
	closed_at: string | null;
	close_pnl: number | null;
}

export interface OpenQuickTradeInput {
	userId: string;
	pair: string;
	dir: 'LONG' | 'SHORT';
	entry: number;
	tp: number | null;
	sl: number | null;
	currentPrice: number;
	source: string;
	note: string;
}

export interface QuickTradeView {
	id: string;
	userId: string;
	pair: string;
	dir: 'LONG' | 'SHORT';
	entry: number;
	tp: number | null;
	sl: number | null;
	currentPrice: number;
	pnlPercent: number;
	status: 'open' | 'closed' | 'stopped';
	source: string;
	note: string;
	openedAt: number;
	closedAt: number | null;
	closePnl: number | null;
}

function mapTrade(row: QuickTradeRow): QuickTradeView {
	return {
		id: row.id,
		userId: row.user_id,
		pair: row.pair,
		dir: row.dir,
		entry: Number(row.entry),
		tp: row.tp == null ? null : Number(row.tp),
		sl: row.sl == null ? null : Number(row.sl),
		currentPrice: Number(row.current_price),
		pnlPercent: Number(row.pnl_percent ?? 0),
		status: row.status,
		source: row.source || 'manual',
		note: row.note || '',
		openedAt: new Date(row.opened_at).getTime(),
		closedAt: row.closed_at ? new Date(row.closed_at).getTime() : null,
		closePnl: row.close_pnl == null ? null : Number(row.close_pnl),
	};
}

export async function openQuickTrade(input: OpenQuickTradeInput): Promise<QuickTradeView> {
	const result = await query<QuickTradeRow>(
		`
      INSERT INTO quick_trades (
        user_id, pair, dir, entry, tp, sl, current_price,
        pnl_percent, status, source, note, opened_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'open', $8, $9, now())
      RETURNING
        id, user_id, pair, dir, entry, tp, sl, current_price, pnl_percent,
        status, source, note, opened_at, closed_at, close_pnl
    `,
		[
			input.userId,
			input.pair,
			input.dir,
			input.entry,
			input.tp,
			input.sl,
			input.currentPrice,
			input.source,
			input.note,
		],
	);

	const trade = mapTrade(result.rows[0]);

	await enqueuePassportEventBestEffort({
		userId: input.userId,
		eventType: 'quick_trade_opened',
		sourceTable: 'quick_trades',
		sourceId: trade.id,
		traceId: `quick-trade:${trade.id}`,
		idempotencyKey: `quick_trade_opened:${trade.id}`,
		payload: {
			context: {
				pair: trade.pair,
				source: trade.source,
			},
			decision: {
				dir: trade.dir,
				entry: trade.entry,
				tp: trade.tp,
				sl: trade.sl,
			},
		},
	});

	const chainId = trade.source === 'terminal_scan' && trade.note ? `scan-${trade.note}` : `trade-${trade.id}`;
	saveQuickTradeOpenRAG(
		input.userId,
		{
			tradeId: trade.id,
			pair: trade.pair,
			dir: trade.dir,
			entry: trade.entry,
			currentPrice: trade.currentPrice,
			tp: trade.tp,
			sl: trade.sl,
			source: trade.source,
			note: trade.note,
		},
		chainId,
	).catch(() => undefined);

	return trade;
}
