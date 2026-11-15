module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  // Prefer .ts over the compiled .js files that sit next to them in lib/,
  // so tests exercise the same source that `cdk deploy --prefer-ts-exts` uses.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
}
