import { defineConfig } from '@playwright/test'

/**
 * The packaged smoke suite deliberately has no webServer.  It launches the
 * executable produced by electron-builder and therefore must never fall back
 * to Vite or the source Electron entry point.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /packaged-smoke\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'test-results/packaged-smoke/playwright.json' }]],
  outputDir: 'test-results/packaged-smoke/test-results',
  use: {
    trace: 'off',
  },
})
