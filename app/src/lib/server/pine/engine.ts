// ═══════════════════════════════════════════════════════════════
// Pine Script Generation Engine
// ═══════════════════════════════════════════════════════════════
//
// Template-First strategy:
//  1. Load .pine template by id (from registry)
//  2. Inject WTD analysis values into {{slots}}
//  3. Validate slot coverage + basic Pine v6 syntax shape
//  4. Return ready-to-paste script
//
// 90% of requests resolve here at $0 LLM cost. Only "custom"
// requests (no template match) escalate to LLM via classifier.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTemplate, type PineTemplateSpec, type PineSlotSpec } from './registry';

// In-memory cache: filename -> raw template body (lazy-loaded)
const templateCache = new Map<string, string>();

const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');

async function loadTemplateBody(filename: string): Promise<string> {
  const cached = templateCache.get(filename);
  if (cached) return cached;
  const body = await readFile(path.join(TEMPLATES_DIR, filename), 'utf-8');
  templateCache.set(filename, body);
  return body;
}

export interface RenderInput {
  templateId: string;
  values: Record<string, string | number | undefined | null>;
}

export interface RenderResult {
  ok: true;
  templateId: string;
  title: string;
  category: string;
  source: string;
  filledSlots: string[];
  warnings: string[];
}

export interface RenderError {
  ok: false;
  templateId: string;
  error: string;
  missingSlots?: string[];
}

const SLOT_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function coerceValue(spec: PineSlotSpec, raw: unknown): { value: string; warning?: string } {
  if (raw === undefined || raw === null || raw === '') {
    if (spec.default !== undefined) return { value: String(spec.default) };
    return { value: '', warning: `slot "${spec.name}" empty, no default` };
  }
  if (spec.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { value: '0', warning: `slot "${spec.name}" not numeric (got ${JSON.stringify(raw)}), coerced to 0` };
    }
    return { value: String(n) };
  }
  if (spec.type === 'csv') {
    // CSV slots: trust the caller produced valid "a|b|c,a|b|c" format
    const s = String(raw).trim();
    if (!s) return { value: '', warning: `csv slot "${spec.name}" empty` };
    return { value: s };
  }
  // string: escape any backslashes / double-quotes for Pine string literal
  const s = String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return { value: s };
}

/**
 * Render a Pine template by id with slot values.
 *
 * Fast path: O(template size). No network, no LLM.
 */
export async function render(input: RenderInput): Promise<RenderResult | RenderError> {
  const spec = getTemplate(input.templateId);
  if (!spec) {
    return { ok: false, templateId: input.templateId, error: `unknown template "${input.templateId}"` };
  }

  // Required-slot check
  const missing: string[] = [];
  for (const slot of spec.slots) {
    if (slot.required && (input.values[slot.name] === undefined || input.values[slot.name] === null || input.values[slot.name] === '')) {
      if (slot.default === undefined) missing.push(slot.name);
    }
  }
  if (missing.length > 0) {
    return { ok: false, templateId: spec.id, error: 'missing required slots', missingSlots: missing };
  }

  const body = await loadTemplateBody(spec.filename);
  const slotByName = new Map(spec.slots.map((s) => [s.name, s]));
  const warnings: string[] = [];
  const filledSlots = new Set<string>();

  // Auto-inject generatedAt if registered + not provided
  const valuesWithDefaults: Record<string, unknown> = { generatedAt: new Date().toISOString(), ...input.values };

  const rendered = body.replace(SLOT_RE, (match, name: string) => {
    const slot = slotByName.get(name);
    if (!slot) {
      warnings.push(`unknown slot "{{${name}}}" in template body — left as-is`);
      return match;
    }
    const { value, warning } = coerceValue(slot, valuesWithDefaults[name]);
    if (warning) warnings.push(warning);
    filledSlots.add(name);
    return value;
  });

  // Basic Pine v6 sanity checks
  const sanity = validatePineV6Shape(rendered);
  if (sanity) warnings.push(sanity);

  return {
    ok: true,
    templateId: spec.id,
    title: spec.title,
    category: spec.category,
    source: rendered,
    filledSlots: [...filledSlots],
    warnings,
  };
}

/**
 * Cheap structural check — not a full Pine parser, just catches the
 * most common templating mistakes that would cause TradingView to reject.
 * Returns a warning string if suspicious, undefined otherwise.
 */
function validatePineV6Shape(src: string): string | undefined {
  if (!src.includes('//@version=6')) return 'missing //@version=6 header';
  if (!/^\s*(indicator|strategy|library)\s*\(/m.test(src)) return 'missing indicator() / strategy() declaration';
  // Detect un-substituted slots that survived rendering
  const leftovers = src.match(/\{\{[^}]+\}\}/g);
  if (leftovers) return `un-rendered slots: ${leftovers.slice(0, 3).join(', ')}`;
  return undefined;
}

/**
 * Discover all slots in a template body (used by /api/pine/templates for UI hinting).
 */
export async function listTemplateSlots(templateId: string): Promise<PineSlotSpec[] | null> {
  const spec = getTemplate(templateId);
  if (!spec) return null;
  return spec.slots;
}
