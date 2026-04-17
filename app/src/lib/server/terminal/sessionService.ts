import type { TerminalSessionResponse } from '$lib/contracts/terminalPersistence';
import { TerminalPersistenceSchemaVersion } from '$lib/contracts/terminalPersistence';
import { loadMacroCalendar } from '$lib/server/macroCalendar';
import { listTerminalAlerts } from '$lib/server/terminalPersistence';
import {
  getLatestTerminalExportJobForUser,
  listTerminalPins,
  listTerminalWatchlist,
} from '$lib/server/terminalPersistence';
import { enrichTerminalWatchlist } from './analysisAdapter';

export async function loadTerminalSession(userId: string): Promise<TerminalSessionResponse> {
  const rawWatchlistPromise = listTerminalWatchlist(userId);
  const watchlistPromise = rawWatchlistPromise.then((items) =>
    enrichTerminalWatchlist(items, {
      skipSymbols: items.filter((item) => item.active).map((item) => item.symbol),
    }),
  );
  const macroPromise = loadMacroCalendar().then((payload) => payload.items);
  const [rawWatchlist, watchlist, pins, alerts, macro, latestExportJob] = await Promise.all([
    rawWatchlistPromise,
    watchlistPromise,
    listTerminalPins(userId),
    listTerminalAlerts(userId),
    macroPromise,
    getLatestTerminalExportJobForUser(userId),
  ]);

  return {
    ok: true,
    schemaVersion: TerminalPersistenceSchemaVersion,
    watchlist,
    activeSymbol: rawWatchlist.find((item) => item.active)?.symbol,
    pins,
    alerts,
    macro,
    latestExportJob,
    updatedAt: new Date().toISOString(),
  };
}
