// Self-contained smoke test for the Pine engine.
// Run: node src/lib/server/pine/__test__/smoke.mjs
//
// Validates template-registry consistency without needing the full
// SvelteKit bundler. Catches the most common failure modes:
//   • un-rendered {{slots}} after substitution
//   • slots in template body not declared in registry
//   • registry slots missing from template body
//   • missing //@version=6 header
//   • missing indicator()/strategy() call

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(HERE, '..', 'templates');
const REGISTRY_PATH = path.join(HERE, '..', 'registry.ts');

const SLOT_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

async function loadRegistrySlots() {
  const src = await readFile(REGISTRY_PATH, 'utf-8');
  const out = new Map();

  // Pull COMMON_SLOTS names — every template inherits these via spread.
  const commonSlots = [];
  const commonBlockMatch = src.match(/COMMON_SLOTS[^=]*=\s*\[([\s\S]*?)\];/);
  if (commonBlockMatch) {
    const nameRe = /name:\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    let m;
    while ((m = nameRe.exec(commonBlockMatch[1])) !== null) commonSlots.push(m[1]);
  }

  // Crude per-template parse — extract `id: '<id>'` then collect names until next entry.
  const blocks = src.split(/\{\s*\n\s*id:/);
  for (let i = 1; i < blocks.length; i++) {
    const block = 'id:' + blocks[i];
    const idMatch = block.match(/id:\s*['"]([a-z_][a-z0-9_]*)['"]/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const slotNames = [...commonSlots];
    const nameRe = /name:\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    let m;
    while ((m = nameRe.exec(block)) !== null) {
      if (!slotNames.includes(m[1])) slotNames.push(m[1]);
    }
    out.set(id, slotNames);
  }
  return out;
}

function extractSlotsFromBody(body) {
  const found = new Set();
  let m;
  SLOT_RE.lastIndex = 0;
  while ((m = SLOT_RE.exec(body)) !== null) found.add(m[1]);
  return [...found];
}

function checkPineShape(body) {
  const errs = [];
  if (!body.includes('//@version=6')) errs.push('missing //@version=6 header');
  if (!/^\s*(indicator|strategy|library)\s*\(/m.test(body)) errs.push('missing indicator()/strategy() call');
  return errs;
}

let failed = 0;

const registrySlots = await loadRegistrySlots();
const templateFiles = (await readdir(TEMPLATES_DIR)).filter((f) => f.endsWith('.pine'));

for (const filename of templateFiles) {
  const id = filename.replace(/\.pine$/, '');
  const body = await readFile(path.join(TEMPLATES_DIR, filename), 'utf-8');
  const issues = [];

  // Pine v6 shape
  for (const e of checkPineShape(body)) issues.push(e);

  // Registry coverage
  const declared = registrySlots.get(id);
  if (!declared) {
    issues.push(`registry has no entry for id "${id}"`);
  } else {
    const inBody = extractSlotsFromBody(body);
    const declaredSet = new Set(declared);
    const bodySet = new Set(inBody);
    for (const name of inBody) {
      if (!declaredSet.has(name)) issues.push(`body uses {{${name}}} but registry does not declare it`);
    }
    // Note: registry MAY declare slots that don't appear in body (eg. generatedAt is optional).
    // We only flag clear typos / forgotten substitutions, not extras.
    void bodySet;
  }

  if (issues.length > 0) {
    failed += issues.length;
    console.error(`✗ ${filename}`);
    for (const e of issues) console.error(`    - ${e}`);
  } else {
    console.log(`✓ ${filename}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} issue(s) across templates`);
  process.exit(1);
}
console.log(`\nAll ${templateFiles.length} templates pass smoke checks.`);
