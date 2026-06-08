module.exports = {
  root: true,
  env: { node: true, browser: true },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Globally forbid the legacy path from anywhere
    'no-restricted-imports': ['error', {
      paths: [
        { name: '@/services/demoApiClients', message: 'Use @/services/api instead.' },
        { name: '@/services/mockApiService', message: 'Use @/services/api instead.' },
      ],
    }],
  },
  overrides: [
    {
      // Views must NOT import from the API or service layer directly
      files: ['src/views/**/*.vue'],
      rules: {
        'no-restricted-imports': ['error', {
          paths: [
            { name: '@/services/demoApiClients', message: 'Views must go through Pinia stores.' },
            { name: '@/services/mockApiService', message: 'Views must go through Pinia stores.' },
            { name: '@/services/s3Service', message: 'Views must go through Pinia stores.' },
          ],
          patterns: [
            { group: ['@/api/*', '@/api/**'], message: 'Views must go through Pinia stores. (Req 3.4)' },
            { group: ['@/services/api', '@/services/api/*', '@/services/api/**'], message: 'Views must go through Pinia stores. (Req 3.3)' },
          ],
        }],
      },
    },
    {
      // Stores must use @/services/api ONLY
      files: ['src/stores/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          paths: [
            { name: '@/services/demoApiClients', message: 'Use @/services/api instead.' },
            { name: '@/services/mockApiService', message: 'Use @/services/api instead.' },
          ],
          patterns: [
            { group: ['@/api/*', '@/api/**'], message: 'Stores must use @/services/api, not @/api/* directly. (Req 3.2)' },
          ],
        }],
      },
    },
  ],
}
