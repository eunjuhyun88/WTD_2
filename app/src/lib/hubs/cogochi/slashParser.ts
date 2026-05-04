/**
 * slashParser.ts — Cogochi AI input slash command parser
 *
 * Parses free-text or slash-prefixed input into a structured intent.
 * No backend call — pure client-side, sync, zero deps beyond types.
 */

export type ParsedQuery = {
  intent: 'scan' | 'why' | 'judge' | 'recall' | 'inbox' | 'nlu';
  tab: 'decision' | 'pattern' | 'verdict' | 'research' | 'judge';
  query: string;
};

/**
 * parseQuery — convert raw user input into a routable intent.
 *
 * Slash mapping (explicit, checked first):
 *   /scan ...    → research tab, intent=scan
 *   /why <sym>   → decision tab, intent=why
 *   /judge ...   → judge tab, intent=judge
 *   /recall ...  → pattern tab, intent=recall
 *   /inbox       → verdict tab, intent=inbox
 *
 * NLU heuristic (regex, for plain-text input):
 *   "비슷한 패턴" | "similar" → pattern tab
 *   "왜" | "why"              → decision tab
 *   "최근" | "recent"         → verdict tab
 *   default                   → research tab
 *
 * Empty / whitespace-only input → research tab, intent=nlu, query=''.
 */
export function parseQuery(input: string): ParsedQuery {
  const trimmed = input.trim();

  // ── Slash commands ─────────────────────────────────────────────────────────

  if (trimmed.startsWith('/')) {
    const space = trimmed.indexOf(' ');
    const cmd = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
    const rest = space === -1 ? '' : trimmed.slice(space + 1).trim();

    switch (cmd) {
      case '/scan':
        return { intent: 'scan', tab: 'research', query: rest };
      case '/why':
        return { intent: 'why', tab: 'decision', query: rest };
      case '/judge':
        return { intent: 'judge', tab: 'judge', query: rest };
      case '/recall':
        return { intent: 'recall', tab: 'pattern', query: rest };
      case '/inbox':
        return { intent: 'inbox', tab: 'verdict', query: rest };
      default:
        // Unknown slash command — treat as NLU against the full text
        break;
    }
  }

  // ── NLU heuristics ─────────────────────────────────────────────────────────

  const lower = trimmed.toLowerCase();

  if (/비슷한\s*패턴|similar/.test(lower)) {
    return { intent: 'nlu', tab: 'pattern', query: trimmed };
  }

  if (/왜|why/.test(lower)) {
    return { intent: 'nlu', tab: 'decision', query: trimmed };
  }

  if (/최근|recent/.test(lower)) {
    return { intent: 'nlu', tab: 'verdict', query: trimmed };
  }

  // Default fallback → research
  return { intent: 'nlu', tab: 'research', query: trimmed };
}
