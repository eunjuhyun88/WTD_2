#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'context-kit.json');
const outputPath = path.join(rootDir, 'docs/generated/context-efficiency-report.md');
const outputJsonPath = path.join(rootDir, 'docs/generated/context-efficiency-report.json');
const checkMode = process.argv.includes('--check');
const excludedAllDocs = new Set([
  path.resolve(outputPath),
  path.resolve(path.join(rootDir, 'docs/generated/context-value-demo.md')),
  path.resolve(path.join(rootDir, 'docs/generated/context-validation-report.md')),
  path.resolve(path.join(rootDir, 'docs/generated/task-contract-report.md')),
]);
const excludedAllDocsPrefixes = [
  path.resolve(path.join(rootDir, 'docs/task-contracts/active')) + path.sep,
  path.resolve(path.join(rootDir, 'docs/task-contracts/completed')) + path.sep,
];
const defaultTargets = {
  smallMapReductionVsCanonicalPct: 40,
  smallMapReductionVsAllDocsPct: 55,
  surfaceReductionVsAllDocsPct: 50,
  smallMapMaxApproxTokens: 7000,
  smallMapMaxFiles: 6,
  canonicalMaxApproxTokens: 14500,
};

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

function unique(items) {
  return [...new Set(items)];
}

function relative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function fileStats(filePath) {
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const lines = content === '' ? 0 : content.split('\n').length;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const chars = content.length;
  const approxTokens = Math.ceil(chars / 4);
  return { lines, words, chars, approxTokens };
}

function bundleStats(paths) {
  const resolved = unique(paths).filter((filePath) => fs.existsSync(filePath));
  let lines = 0;
  let words = 0;
  let chars = 0;
  let approxTokens = 0;
  for (const filePath of resolved) {
    const stats = fileStats(filePath);
    lines += stats.lines;
    words += stats.words;
    chars += stats.chars;
    approxTokens += stats.approxTokens;
  }
  return {
    files: resolved.length,
    lines,
    words,
    chars,
    approxTokens,
    paths: resolved.map(relative),
  };
}

function reductionPct(smaller, larger) {
  if (larger <= 0) return null;
  return ((larger - smaller) / larger) * 100;
}

function formatPct(value) {
  return value === null ? 'n/a' : `${value.toFixed(1)}%`;
}

function savedTokens(smaller, larger) {
  if (larger <= 0) return null;
  return larger - smaller;
}

function formatTokens(value) {
  return value === null ? 'n/a' : `${value}`;
}

function renderTable(rows) {
  return [
    '| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

const config = readJson(configPath);
const targets = {
  ...defaultTargets,
  ...(config.evaluation?.targets ?? {}),
};
const designDocFiles = listMarkdownFiles(path.join(rootDir, 'docs/design-docs'));
const productSpecFiles = listMarkdownFiles(path.join(rootDir, 'docs/product-specs'));

const smallMapFiles = [
  path.join(rootDir, 'README.md'),
  path.join(rootDir, 'AGENTS.md'),
  path.join(rootDir, 'docs/README.md'),
  path.join(rootDir, 'ARCHITECTURE.md'),
  path.join(rootDir, 'docs/SYSTEM_INTENT.md'),
  path.join(rootDir, 'docs/CONTEXT_ENGINEERING.md'),
];

const canonicalFiles = [
  ...smallMapFiles,
  path.join(rootDir, 'docs/DESIGN.md'),
  path.join(rootDir, 'docs/ENGINEERING.md'),
  path.join(rootDir, 'docs/PLANS.md'),
  path.join(rootDir, 'docs/PRODUCT_SENSE.md'),
  path.join(rootDir, 'docs/QUALITY_SCORE.md'),
  path.join(rootDir, 'docs/RELIABILITY.md'),
  path.join(rootDir, 'docs/SECURITY.md'),
  path.join(rootDir, 'docs/TASK_CONTRACTS.md'),
  path.join(rootDir, 'docs/AUTOPILOT.md'),
  path.join(rootDir, 'docs/CONTEXT_VALIDATION.md'),
  ...designDocFiles,
  ...productSpecFiles,
];

const allDocsFiles = unique([
  path.join(rootDir, 'README.md'),
  path.join(rootDir, 'AGENTS.md'),
  path.join(rootDir, 'CLAUDE.md'),
  path.join(rootDir, 'ARCHITECTURE.md'),
  ...listMarkdownFiles(path.join(rootDir, '.claude')),
  ...listMarkdownFiles(path.join(rootDir, 'docs')),
]).filter((filePath) => {
  const resolved = path.resolve(filePath);
  if (excludedAllDocs.has(resolved)) return false;
  return !excludedAllDocsPrefixes.some((prefix) => resolved.startsWith(prefix));
});

const smallMapStats = bundleStats(smallMapFiles);
const canonicalStats = bundleStats(canonicalFiles);
const allDocsStats = bundleStats(allDocsFiles);
const smallVsCanonicalPct = reductionPct(smallMapStats.approxTokens, canonicalStats.approxTokens);
const smallVsAllDocsPct = reductionPct(smallMapStats.approxTokens, allDocsStats.approxTokens);

const coreRows = [
  ['small map', smallMapStats],
  ['canonical', canonicalStats],
  ['all docs', allDocsStats],
].map(([label, stats]) => `| ${label} | ${stats.files} | ${stats.lines} | ${stats.approxTokens} | ${formatPct(reductionPct(stats.approxTokens, canonicalStats.approxTokens))} | ${formatPct(reductionPct(stats.approxTokens, allDocsStats.approxTokens))} |`);

const surfaceRows = [];
const surfaceMetrics = [];
for (const surface of config.surfaces ?? []) {
  const files = [
    ...smallMapFiles,
    path.join(rootDir, 'docs/generated/route-map.md'),
    path.join(rootDir, 'docs/generated/store-authority-map.md'),
    path.join(rootDir, 'docs/generated/api-group-map.md'),
  ];
  if (surface.spec) files.push(path.join(rootDir, surface.spec));
  const stats = bundleStats(files);
  const reductionVsCanonicalPct = reductionPct(stats.approxTokens, canonicalStats.approxTokens);
  const reductionVsAllDocsPct = reductionPct(stats.approxTokens, allDocsStats.approxTokens);
  surfaceMetrics.push({
    id: surface.id,
    stats,
    reductionVsCanonicalPct,
    reductionVsAllDocsPct,
  });
  surfaceRows.push(`| ${surface.id} | ${stats.files} | ${stats.lines} | ${stats.approxTokens} | ${formatPct(reductionVsCanonicalPct)} | ${formatPct(reductionVsAllDocsPct)} |`);
}

const worstSurfaceReductionVsAllDocsPct = surfaceMetrics.length
  ? Math.min(...surfaceMetrics.map((item) => item.reductionVsAllDocsPct ?? Infinity))
  : null;
const structuralScorecard = [
  {
    label: 'Small-map reduction vs canonical',
    actual: formatPct(smallVsCanonicalPct),
    target: `>= ${targets.smallMapReductionVsCanonicalPct}%`,
    passed: smallVsCanonicalPct !== null && smallVsCanonicalPct >= targets.smallMapReductionVsCanonicalPct,
  },
  {
    label: 'Small-map reduction vs all docs',
    actual: formatPct(smallVsAllDocsPct),
    target: `>= ${targets.smallMapReductionVsAllDocsPct}%`,
    passed: smallVsAllDocsPct !== null && smallVsAllDocsPct >= targets.smallMapReductionVsAllDocsPct,
  },
  {
    label: 'Worst surface reduction vs all docs',
    actual: formatPct(worstSurfaceReductionVsAllDocsPct),
    target: `>= ${targets.surfaceReductionVsAllDocsPct}%`,
    passed: worstSurfaceReductionVsAllDocsPct !== null && worstSurfaceReductionVsAllDocsPct >= targets.surfaceReductionVsAllDocsPct,
  },
  {
    label: 'Small-map approx tokens',
    actual: `${smallMapStats.approxTokens}`,
    target: `<= ${targets.smallMapMaxApproxTokens}`,
    passed: smallMapStats.approxTokens <= targets.smallMapMaxApproxTokens,
  },
  {
    label: 'Small-map file count',
    actual: `${smallMapStats.files}`,
    target: `<= ${targets.smallMapMaxFiles}`,
    passed: smallMapStats.files <= targets.smallMapMaxFiles,
  },
  {
    label: 'Canonical approx tokens',
    actual: `${canonicalStats.approxTokens}`,
    target: `<= ${targets.canonicalMaxApproxTokens}`,
    passed: canonicalStats.approxTokens <= targets.canonicalMaxApproxTokens,
  },
];
const structuralReady = structuralScorecard.every((item) => item.passed);
const budgetChecks = [
  [`Small map approx tokens <= ${targets.smallMapMaxApproxTokens}`, smallMapStats.approxTokens <= targets.smallMapMaxApproxTokens],
  [`Small map files <= ${targets.smallMapMaxFiles}`, smallMapStats.files <= targets.smallMapMaxFiles],
  [`Canonical approx tokens <= ${targets.canonicalMaxApproxTokens}`, canonicalStats.approxTokens <= targets.canonicalMaxApproxTokens],
];

const content = [
  '# Context Efficiency Report',
  '',
  'This report estimates how much context the routing system saves before the agent reaches implementation files.',
  '',
  '## Core Bundles',
  '',
  renderTable(coreRows),
  '',
  '## Estimated Savings',
  '',
  `- Small map saves approximately \`${formatTokens(savedTokens(smallMapStats.approxTokens, canonicalStats.approxTokens))}\` tokens vs the canonical bundle.`,
  `- Small map saves approximately \`${formatTokens(savedTokens(smallMapStats.approxTokens, allDocsStats.approxTokens))}\` tokens vs the all-doc bundle.`,
  ...surfaceMetrics.map((item) => `- Surface \`${item.id}\` saves approximately \`${formatTokens(savedTokens(item.stats.approxTokens, allDocsStats.approxTokens))}\` tokens vs the all-doc bundle.`),
  '',
  '## Surface Bundles',
  '',
  surfaceRows.length ? renderTable(surfaceRows) : '| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |\n| --- | --- | --- | --- | --- | --- |\n| none | 0 | 0 | 0 | n/a | n/a |',
  '',
  '## Structural Scorecard',
  '',
  '| Check | Actual | Target | Result |',
  '| --- | --- | --- | --- |',
  ...structuralScorecard.map((item) => `| ${item.label} | ${item.actual} | ${item.target} | ${item.passed ? 'PASS' : 'FAIL'} |`),
  '',
  '## Structural Readiness',
  '',
  `- ${structuralReady ? 'PASS' : 'FAIL'}: structural routing gate`,
  '',
  '## Budget Checks',
  '',
  ...budgetChecks.map(([label, pass]) => `- ${pass ? 'PASS' : 'FAIL'}: ${label}`),
  '',
  '## Small Map Files',
  '',
  ...smallMapStats.paths.map((item) => `- \`${item}\``),
  '',
  '## Notes',
  '',
  '- Small-map results tell you whether the canonical entry path is compact enough to be practical.',
  '- Surface bundles tell you whether route/store/API discovery can be done without broad document scans.',
  '- Run `npm run eval:validate` to pair structural evidence with real task evidence.',
  '- Run `npm run harness:benchmark -- --base-url http://localhost:4173` for repeated runtime/noise validation.',
  '',
].join('\n');

const summary = {
  version: 1,
  targets,
  smallMap: smallMapStats,
  canonical: canonicalStats,
  allDocs: allDocsStats,
  reductions: {
    smallVsCanonicalPct,
    smallVsAllDocsPct,
    worstSurfaceReductionVsAllDocsPct,
  },
  surfaceBundles: surfaceMetrics,
  structuralScorecard,
  structuralReady,
};

const nextMarkdown = `${content}\n`;
const nextJson = `${JSON.stringify(summary, null, 2)}\n`;

if (checkMode) {
  const currentMarkdown = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  const currentJson = fs.existsSync(outputJsonPath) ? fs.readFileSync(outputJsonPath, 'utf8') : '';
  if (currentMarkdown !== nextMarkdown || currentJson !== nextJson) {
    process.stderr.write('[context-metrics] stale generated report; run npm run docs:refresh\n');
    process.exit(1);
  }
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, nextMarkdown);
fs.writeFileSync(outputJsonPath, nextJson);
console.log(`[context-metrics] wrote ${path.relative(rootDir, outputPath)}`);
console.log(`[context-metrics] structural gate=${structuralReady ? 'PASS' : 'FAIL'}`);
