import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // fora de test-results/: o Playwright limpa o outputDir e já apagou estado/evidência de release (CR-033 A-5)
  outputDir: ".oplyra/playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @oplyra/web dev",
    url: "http://localhost:3100/entrar",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
