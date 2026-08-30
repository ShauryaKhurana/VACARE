import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // upload/consoleErrors/startOver/affordances/draftForm/firstPrompt need a
  // real backend on :8000 to prove anything (playwright.live.config.ts's
  // own testMatch scopes them there) -- against this config's isolated
  // mock-mode server on :3100 they can only ever time out waiting for real
  // HTTP responses that never arrive. Without this exclusion `npm run
  // test:e2e` always reported ~28 failures unrelated to whatever was
  // actually being changed.
  testIgnore: /(upload|consoleErrors|startOver|affordances|draftForm|firstPrompt)\.spec\.ts/,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
  },
  projects: [
    { name: "iPhone", use: { ...devices["iPhone 14"] } },
    { name: "Android", use: { ...devices["Pixel 7"] } },
    // The VSO app is desktop-first (plan: async-percolating-dewdrop,
    // "Design stance: the inverse of the veteran app") -- a professional
    // power user at a desk, not a phone. 1440x900 matches the size this
    // surface was actually designed and manually verified at.
    { name: "Desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { MOCK_MODE: "true" },
  },
});
