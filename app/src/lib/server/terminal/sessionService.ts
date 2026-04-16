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
  const [watchlist, pins, alerts, macro, latestExportJob] = await Promise.all([
    enrichTerminalWatchlist(await listTerminalWatchlist(userId)),
    listTerminalPins(userId),
    listTerminalAlerts(userId),
    loadMacroCalendar().then((payload) => payload.items),
    getLatestTerminalExportJobForUser(userId),
  ]);

  return {
    ok: true,
    schemaVersion: TerminalPersistenceSchemaVersion,
    watchlist,
    activeSymbol: watchlist.find((item) => item.active)?.symbol,
    pins,
    alerts,
    macro,
    latestExportJob,
    updatedAt: new Date().toISOString(),
  };
}
