import { defineConfig, devices } from "@playwright/test";

/**
 * Runs e2e against the already-running dev stack (Next on :3000 talking to
 * the Python backend on :8000), rather than the default config's isolated
 * mock-mode server on :3100. Used to verify real upload/parse behaviour,
 * which mock mode by definition cannot exercise.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(upload|consoleErrors|startOver|affordances|draftForm)\.spec\.ts/,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? "http://localhost:3000",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
