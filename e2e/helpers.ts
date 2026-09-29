import { expect, type Page } from "@playwright/test";

// Text Next.js / the browser shows when a server component throws in production.
const CRASH_TEXT = /This page couldn.t load|Application error|Internal Server Error/i;

// Records uncaught page errors and console errors for the lifetime of the page.
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

export async function expectHealthyPage(page: Page, path: string, heading: string | RegExp) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} HTTP status`).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
}
