import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// E2E_BASE_URL points the suite at an already-running app (e.g. the live Vercel URL);
// otherwise it builds and serves the app locally in production mode.
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? "http://localhost:3100";

export const AUTH_STATE = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "signed-in",
      testMatch: /signed-in\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3100",
        url: "http://localhost:3100/login",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
