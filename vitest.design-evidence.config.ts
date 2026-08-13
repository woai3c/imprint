import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/design-evidence-regression/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 60_000,
  },
})
