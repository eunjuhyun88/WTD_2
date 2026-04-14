#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import openapiTS from 'openapi-typescript';

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/lib/contracts/generated/engine-openapi.d.ts');
const ENGINE_ROOT = path.resolve(process.cwd(), '..', 'engine');
const CHECK_MODE = process.argv.includes('--check');

function loadEngineOpenApiSchema() {
  const openApiUrl = process.env.ENGINE_OPENAPI_URL;
  if (openApiUrl) {
    return { sourceLabel: openApiUrl, source: openApiUrl };
  }

  const exportScript = path.resolve(ENGINE_ROOT, 'scripts/export_openapi.py');
  const raw = execFileSync('uv', ['run', 'python', exportScript], {
    cwd: ENGINE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const schema = JSON.parse(raw);
  return { sourceLabel: 'engine/scripts/export_openapi.py', source: schema };
}

async function main() {
  const { sourceLabel, source } = loadEngineOpenApiSchema();
  console.log(`[contract:sync] loading engine OpenAPI from ${sourceLabel}`);

  const typesAst = await openapiTS(source);
  const header = `// AUTO-GENERATED FILE. DO NOT EDIT.\n// Source: ${sourceLabel}\n\n`;
  const body = header + typesAst;

  if (CHECK_MODE) {
    let existing = '';
    try {
      existing = await readFile(OUTPUT_PATH, 'utf8');
    } catch {
      existing = '';
    }

    if (existing !== body) {
      console.error(`[contract:sync] generated output differs from ${OUTPUT_PATH}`);
      console.error('[contract:sync] run `npm run contract:sync:engine-types` in app/ and commit the result.');
      process.exit(1);
    }

    console.log(`[contract:sync] up to date: ${OUTPUT_PATH}`);
    return;
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, body, 'utf8');
  console.log(`[contract:sync] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('[contract:sync] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
