import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE } from "../playwright.config";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

setup("sign in once and save the session", async ({ page }) => {
  mkdirSync(path.dirname(AUTH_STATE), { recursive: true });
  if (!email || !password) {
    // Leave an empty session so the signed-in project can start and skip cleanly.
    writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run signed-in tests.");
    return;
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: AUTH_STATE });
});
