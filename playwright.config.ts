import { defineConfig } from '@playwright/test'

// Electron E2E. We launch the built app (out/main/index.js) directly, so there
// are no browser projects. Run `npm run test:e2e` (it builds first).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
})
