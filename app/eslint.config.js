// W-A108 + W-0388: ESLint flat config (v9)
// Phase 1: hub boundary warnings on .ts files only.
// Does NOT extend js.configs.recommended to avoid false positives in existing code.
// Upgrade to errors after W-0389 completes hub cleanup.
import tsParser from '@typescript-eslint/parser';

const HUBS = ['terminal', 'dashboard', 'lab', 'patterns', 'settings'];

function hubBoundaryConfig(hub) {
  const otherHubs = HUBS.filter((h) => h !== hub);
  return {
    files: [`src/lib/hubs/${hub}/**/*.ts`],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: false },
    },
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: otherHubs.flatMap((other) => [
            `**/hubs/${other}/**`,
            `$lib/hubs/${other}/**`,
          ]),
        },
      ],
    },
  };
}

export default [
  // Hub boundary enforcement (warn only — Phase 1)
  ...HUBS.map(hubBoundaryConfig),

  {
    ignores: [
      'node_modules/**',
      'build/**',
      '.svelte-kit/**',
      'scripts/**',
    ],
  },
];
