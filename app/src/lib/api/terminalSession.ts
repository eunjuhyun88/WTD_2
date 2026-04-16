import {
  parseTerminalSessionResponse,
  type MacroCalendarItem,
  type TerminalAlertRule,
  type TerminalExportJob,
  type TerminalPin,
  type TerminalWatchlistItem,
} from '$lib/contracts/terminalPersistence';

type TerminalSessionPayload = {
  watchlist: TerminalWatchlistItem[];
  activeSymbol?: string;
  pins: TerminalPin[];
  alerts: TerminalAlertRule[];
  macro: MacroCalendarItem[];
  latestExportJob?: TerminalExportJob | null;
};

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

export async function fetchTerminalSession(): Promise<TerminalSessionPayload> {
  const res = await fetch('/api/terminal/session');
  if (!res.ok) {
    return {
      watchlist: [],
      pins: [],
      alerts: [],
      macro: [],
      latestExportJob: null,
    };
  }
  const payload = parseTerminalSessionResponse(await readJson(res));
  return {
    watchlist: payload.watchlist,
    activeSymbol: payload.activeSymbol,
    pins: payload.pins,
    alerts: payload.alerts,
    macro: payload.macro,
    latestExportJob: payload.latestExportJob ?? null,
  };
}
