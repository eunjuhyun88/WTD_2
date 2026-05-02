export type AgentCmd = 'explain' | 'scan' | 'similar';

export interface AgentCommand {
  cmd: AgentCmd;
  args: string;
}

const VALID_CMDS = new Set<AgentCmd>(['explain', 'scan', 'similar']);

/**
 * Parse "/scan ETH" → {cmd: 'scan', args: 'ETH'}.
 * Returns null for non-slash input (falls back to routeQuery).
 */
export function parseAgentCommand(input: string): AgentCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const [rawCmd, ...rest] = trimmed.slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase() as AgentCmd;
  if (!VALID_CMDS.has(cmd)) return null;

  return { cmd, args: rest.join(' ') };
}
