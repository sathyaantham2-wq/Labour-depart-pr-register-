import { expect, test } from "@playwright/test";
import { watchForErrors } from "./helpers";

test.describe("signed out", () => {
  test("login page renders the sign-in form", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Labour Case Register" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  for (const path of ["/", "/dashboard", "/cases", "/cases/new", "/staff"]) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(\?|$)/);
    });
  }

  test("wrong password shows an error and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.invalid");
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
