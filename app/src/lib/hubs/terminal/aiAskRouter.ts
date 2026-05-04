/**
 * aiAskRouter.ts — Pure helper for cogochi:ai-ask intent → drawerTab mapping.
 * Extracted so it can be unit-tested without mounting TradeMode.
 */

export interface AiAskEvent {
  intent: 'scan' | 'why' | 'judge' | 'recall' | 'inbox' | 'unknown';
  query: string;
  ts: number;
}

/**
 * Maps a cogochi:ai-ask intent to the corresponding TradeMode peek drawer tab.
 * Returns null for intents handled elsewhere (recall, inbox) or unknown.
 */
export function mapAskToDrawerTab(
  intent: string,
): 'verdict' | 'research' | 'judge' | null {
  switch (intent) {
    case 'scan':
      return 'research';
    case 'why':
      return 'verdict';
    case 'judge':
      return 'judge';
    case 'recall':
    case 'inbox':
    case 'unknown':
    default:
      return null;
  }
}
