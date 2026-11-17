import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

// Configuração independente: jamais sobe/usa o servidor do Claude ou o banco local.
export default defineConfig({
  testDir: "../../e2e", testMatch: "develop-hospedado.spec.ts",
  outputDir: resolve(import.meta.dirname, `../../.oplyra/develop-hosted/${Date.now()}-${process.pid}`),
  preserveOutput: "never", workers: 1, fullyParallel: false, retries: 0, timeout: 30_000,
  reporter: [["./hosted-safe-reporter.mjs"]],
  use: { baseURL: "https://oplyra-develop.netlify.app", trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
