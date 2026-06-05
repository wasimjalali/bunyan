import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Default environment is node (logic + main-process tests).
// Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
    },
  },
})
