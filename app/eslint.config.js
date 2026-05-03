import sveltePlugin from 'eslint-plugin-svelte';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Svelte recommended rules with TypeScript parser for script blocks
  ...sveltePlugin.configs['flat/recommended'].map((config) => {
    if (config.files && config.files.some((f) => f.includes('.svelte'))) {
      return {
        ...config,
        languageOptions: {
          ...config.languageOptions,
          parserOptions: {
            ...(config.languageOptions?.parserOptions ?? {}),
            parser: tsParser,
          },
        },
      };
    }
    return config;
  }),

  // TypeScript files: load @typescript-eslint plugin + parser
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      // Loaded so eslint-disable comments referencing this rule don't error.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Svelte files: load @typescript-eslint plugin (no parser override — svelte-eslint-parser handles it)
  {
    files: ['src/**/*.svelte'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Hub boundary rule — hub 외부에서 hub 내부 경로 직접 import 금지
  {
    files: ['src/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/hubs/*/**', '$lib/hubs/*/**'],
            message: 'hub 내부 경로 직접 import 금지. barrel ($lib/hubs/<hub>) 사용.',
            allowTypeImports: true,
          },
        ],
      }],
    },
  },

  // hub 내부 파일: 자기 hub import 허용 (rule off)
  {
    files: ['src/lib/hubs/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // terminal route: terminal hub 내부 접근 허용 (peek 페이지 등)
  {
    files: ['src/routes/terminal/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['$lib/hubs/{dashboard,lab,patterns,settings}/**'],
            message: 'cross-hub 내부 접근 금지.',
          },
        ],
      }],
    },
  },

  // Turn off pre-existing svelte rule noise to establish a clean 0-error
  // baseline for hub boundary enforcement (W-0388 scope = hub boundaries only).
  {
    files: ['src/**/*.{ts,svelte}'],
    rules: {
      'svelte/valid-compile': 'off',
      'svelte/no-unused-svelte-ignore': 'off',
      'svelte/no-at-html-tags': 'off',
    },
  },

  // 무시
  {
    ignores: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**'],
  },
];
