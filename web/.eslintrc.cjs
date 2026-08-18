/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // ── AUTH LAYER ENFORCEMENT ────────────────────────────────────────────────
    // Prevent raw axios imports — all HTTP calls must go through src/api/client.ts
    // which handles auth headers, token refresh, and error normalization.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'axios',
            message:
              'Do not import axios directly. Use the shared apiClient from src/api/client.ts instead.',
          },
        ],
        patterns: [
          {
            group: ['axios/*'],
            message:
              'Do not import axios sub-paths directly. Use the shared apiClient from src/api/client.ts instead.',
          },
        ],
      },
    ],

    // ── GENERAL QUALITY ───────────────────────────────────────────────────────
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // NOTE: raw fetch() is intentionally NOT blocked globally.
    // Blob downloads (CSV export, file download) legitimately need fetch or
    // apiClient with responseType:'blob'. The rule would produce false positives.
    // Instead: the convention is to use apiClient({ responseType: 'blob' }) for
    // authenticated downloads. Unauthenticated fetch() calls are a code-review
    // concern, not a lint rule — see Announcements.tsx for the correct pattern.
  },
  overrides: [
    {
      // The API client itself IS the axios wrapper — exempt from import restriction
      files: ['src/api/client.ts', 'src/api/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      // Config and tooling files
      files: ['*.config.*', 'vite.config.*', 'postcss.config.*', 'tailwind.config.*'],
      env: { node: true },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.d.ts'],
};
