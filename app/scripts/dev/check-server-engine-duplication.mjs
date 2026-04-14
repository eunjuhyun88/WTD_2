#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targetDir = path.resolve(root, 'src/lib/server');

async function walkTsFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkTsFiles(full)));
      continue;
    }
    if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = await walkTsFiles(targetDir);

const hits = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (text.includes("from '$lib/engine/") || text.includes('from "$lib/engine/')) {
    hits.push(path.relative(root, file));
  }
}

console.log(
  JSON.stringify(
    {
      check: 'server-engine-duplication',
      count: hits.length,
      files: hits,
      note:
        'Informational audit. Goal is to gradually remove $lib/engine imports from server runtime paths.',
    },
    null,
    2,
  ),
);

