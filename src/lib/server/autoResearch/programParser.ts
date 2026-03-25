// ═══════════════════════════════════════════════════════════════
// COGOCHI — AutoResearch Program Parser
// Parses program.md files into ResearchProgram objects.
// Format: YAML front-matter + markdown body for documentation.
// ═══════════════════════════════════════════════════════════════

import type { ResearchProgram, ParameterSpec } from './programTypes.js';
import { TUNABLE_PARAMS } from './programTypes.js';

/**
 * Parse a program.md file content into a ResearchProgram.
 *
 * Format:
 * ```
 * ---
 * id: base-params-v1
 * name: Base Parameter Optimization
 * archetype: CRUSHER
 * ---
 * # Objective
 * primary: winRate
 * direction: maximize
 *
 * # Parameters
 * - ABSTAIN_CONFIDENCE_THRESHOLD [0.3, 0.7] step=0.05
 * - AUTO_SL_PERCENT [0.02, 0.10] step=0.01
 * - cvdDivergence [0.1, 1.0] step=0.1
 *
 * # Scenarios
 * ids: ftx-crash-2022-4h, luna-crash-2022-4h
 *
 * # Search
 * strategy: hill_climbing
 * rounds: 30
 * patience: 8
 *
 * # Acceptance
 * maxDegradation: 0.15
 * splitRatio: 0.7
 * minImprovement: 0.02
 * ```
 */
export function parseProgram(content: string): ResearchProgram {
  const { frontMatter, body } = splitFrontMatter(content);
  const sections = parseSections(body);

  // Meta from front matter
  const meta = {
    id: frontMatter.id ?? `program-${Date.now()}`,
    name: frontMatter.name ?? 'Unnamed Program',
    description: frontMatter.description ?? '',
    version: parseInt(frontMatter.version ?? '1', 10),
    author: (frontMatter.author ?? 'system') as 'system' | 'user',
    createdAt: Date.now(),
    archetype: (frontMatter.archetype ?? 'CRUSHER') as any,
    regimeFilter: frontMatter.regimeFilter?.split(',').map((s: string) => s.trim()) as any,
  };

  // Parameters
  const paramSection = sections['Parameters'] ?? sections['parameters'] ?? '';
  const parameters = parseParameters(paramSection);

  // Objective
  const objSection = sections['Objective'] ?? sections['objective'] ?? '';
  const objective = parseObjective(objSection);

  // Scenarios
  const scenSection = sections['Scenarios'] ?? sections['scenarios'] ?? '';
  const scenarios = parseScenarios(scenSection);

  // Search
  const searchSection = sections['Search'] ?? sections['search'] ?? '';
  const search = parseSearch(searchSection);

  // Acceptance
  const accSection = sections['Acceptance'] ?? sections['acceptance'] ?? '';
  const acceptance = parseAcceptance(accSection);

  return { meta, parameters, scenarios, objective, acceptance, search };
}

// ─── Front matter parser ───────────────────────────────────────

function splitFrontMatter(content: string): { frontMatter: Record<string, string>; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { frontMatter: {}, body: content };

  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      fm[key.trim()] = rest.join(':').trim();
    }
  }
  return { frontMatter: fm, body: fmMatch[2] };
}

// ─── Section parser ────────────────────────────────────────────

function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current = '';
  const lines = body.split('\n');

  for (const line of lines) {
    const headerMatch = line.match(/^#+\s+(.+)$/);
    if (headerMatch) {
      current = headerMatch[1].trim();
      sections[current] = '';
    } else if (current) {
      sections[current] += line + '\n';
    }
  }

  return sections;
}

// ─── Parameter parser ──────────────────────────────────────────

function parseParameters(section: string): ParameterSpec[] {
  const params: ParameterSpec[] = [];
  const lines = section.split('\n').filter(l => l.trim().startsWith('-'));

  for (const line of lines) {
    // Format: - KEY [min, max] step=N
    // or:     - KEY [min, max]
    // or:     - KEY (disabled)
    const match = line.match(/^-\s+(\S+)\s*\[([^,]+),\s*([^\]]+)\](?:\s+step=(\S+))?/);
    if (!match) continue;

    const key = match[1];
    const min = parseFloat(match[2]);
    const max = parseFloat(match[3]);
    const step = match[4] ? parseFloat(match[4]) : (max - min) / 10;

    // Find in catalog for defaults
    const catalog = TUNABLE_PARAMS.find(p => p.key === key);

    params.push({
      key,
      source: catalog?.source ?? 'V4_CONFIG',
      label: catalog?.label ?? key,
      type: catalog?.type ?? 'float',
      current: catalog?.current ?? (min + max) / 2,
      range: [min, max],
      step,
      active: true,
    });
  }

  // If no params specified, use all active catalog params
  if (params.length === 0) {
    return TUNABLE_PARAMS.filter(p => p.active);
  }

  return params;
}

// ─── Objective parser ──────────────────────────────────────────

function parseObjective(section: string): ResearchProgram['objective'] {
  const kv = parseKeyValues(section);
  return {
    primary: (kv.primary ?? 'winRate') as any,
    direction: (kv.direction ?? 'maximize') as any,
    constraints: kv.constraints ? JSON.parse(kv.constraints) : undefined,
    compositeWeights: kv.compositeWeights ? JSON.parse(kv.compositeWeights) : undefined,
  };
}

// ─── Scenario parser ───────────────────────────────────────────

function parseScenarios(section: string): ResearchProgram['scenarios'] {
  const kv = parseKeyValues(section);
  return {
    scenarioIds: kv.ids?.split(',').map(s => s.trim()),
    scenariosPerRound: parseInt(kv.perRound ?? '3', 10),
    filter: kv.symbols ? {
      symbols: kv.symbols?.split(',').map(s => s.trim()),
      intervals: kv.intervals?.split(',').map(s => s.trim()),
    } : undefined,
  };
}

// ─── Search parser ─────────────────────────────────────────────

function parseSearch(section: string): ResearchProgram['search'] {
  const kv = parseKeyValues(section);
  return {
    strategy: (kv.strategy ?? 'hill_climbing') as any,
    maxRounds: parseInt(kv.rounds ?? '30', 10),
    maxTimeSeconds: parseInt(kv.maxTime ?? '300', 10),
    earlyStopPatience: parseInt(kv.patience ?? '8', 10),
    candidatesPerRound: kv.candidates ? parseInt(kv.candidates, 10) : undefined,
  };
}

// ─── Acceptance parser ─────────────────────────────────────────

function parseAcceptance(section: string): ResearchProgram['acceptance'] {
  const kv = parseKeyValues(section);
  return {
    maxDegradation: parseFloat(kv.maxDegradation ?? '0.15'),
    splitRatio: parseFloat(kv.splitRatio ?? '0.7'),
    minImprovement: parseFloat(kv.minImprovement ?? '0.02'),
    minOOSMetric: kv.minOOSMetric ? JSON.parse(kv.minOOSMetric) : undefined,
  };
}

// ─── Key-value helper ──────────────────────────────────────────

function parseKeyValues(section: string): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const line of section.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      kv[match[1]] = match[2].trim();
    }
  }
  return kv;
}

/**
 * Serialize a ResearchProgram back to program.md format.
 */
export function serializeProgram(program: ResearchProgram): string {
  const lines: string[] = [];

  // Front matter
  lines.push('---');
  lines.push(`id: ${program.meta.id}`);
  lines.push(`name: ${program.meta.name}`);
  lines.push(`description: ${program.meta.description}`);
  lines.push(`version: ${program.meta.version}`);
  lines.push(`author: ${program.meta.author}`);
  lines.push(`archetype: ${program.meta.archetype}`);
  if (program.meta.regimeFilter) {
    lines.push(`regimeFilter: ${program.meta.regimeFilter.join(', ')}`);
  }
  lines.push('---');
  lines.push('');

  // Objective
  lines.push('# Objective');
  lines.push(`primary: ${program.objective.primary}`);
  lines.push(`direction: ${program.objective.direction}`);
  lines.push('');

  // Parameters
  lines.push('# Parameters');
  for (const p of program.parameters) {
    lines.push(`- ${p.key} [${p.range[0]}, ${p.range[1]}] step=${p.step}`);
  }
  lines.push('');

  // Scenarios
  lines.push('# Scenarios');
  if (program.scenarios.scenarioIds) {
    lines.push(`ids: ${program.scenarios.scenarioIds.join(', ')}`);
  }
  lines.push(`perRound: ${program.scenarios.scenariosPerRound}`);
  lines.push('');

  // Search
  lines.push('# Search');
  lines.push(`strategy: ${program.search.strategy}`);
  lines.push(`rounds: ${program.search.maxRounds}`);
  lines.push(`maxTime: ${program.search.maxTimeSeconds}`);
  lines.push(`patience: ${program.search.earlyStopPatience}`);
  lines.push('');

  // Acceptance
  lines.push('# Acceptance');
  lines.push(`maxDegradation: ${program.acceptance.maxDegradation}`);
  lines.push(`splitRatio: ${program.acceptance.splitRatio}`);
  lines.push(`minImprovement: ${program.acceptance.minImprovement}`);

  return lines.join('\n');
}
