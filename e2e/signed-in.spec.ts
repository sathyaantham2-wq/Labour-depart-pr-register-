import { expect, test } from "@playwright/test";
import { expectHealthyPage, watchForErrors } from "./helpers";

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Set E2E_EMAIL and E2E_PASSWORD in .env.local to run signed-in tests.",
);

const STAFF_SCREENS = [
  { path: "/dashboard", heading: "Dashboard" },
  { path: "/cases", heading: "Current Entries" },
  { path: "/cases/new", heading: "Create Current Entry" },
  { path: "/hearings", heading: "Hearings" },
  { path: "/hearings?view=week", heading: "Hearings" },
  { path: "/hearings?view=month", heading: "Hearings" },
  { path: "/hearings?view=overdue", heading: "Hearings" },
];

const ADMIN_SCREENS = [
  { path: "/sections", heading: "Section Management" },
  { path: "/received-from", heading: "Receive Management" },
  { path: "/staff", heading: "Staff Management" },
  { path: "/mis", heading: "Monthly MIS Report" },
  { path: "/notice-templates", heading: "Notice Templates" },
  { path: "/audit-log", heading: "Audit Log" },
  { path: "/data-import", heading: "Data Import" },
];

// The office register's column order — both the form and the list must follow it.
const REGISTER_COLUMNS = [
  "File Number",
  "Memo Number",
  "Applicant Name",
  "Applicant Phone",
  "Applicant Email",
  "Applicant Address",
  "Management Phone",
  "Management Email",
  "Management Address",
  "Section",
  "Receive From",
  "Hearing Date",
  "Status",
  "Subject",
  "Submission Date",
];

test.describe("office register layout", () => {
  test("Create Current Entry form fields follow the register order", async ({ page }) => {
    await page.goto("/cases/new");
    const labels = (await page.locator("form label").allInnerTexts()).map((t) => t.replace("*", "").trim());
    expect(labels.filter((l) => REGISTER_COLUMNS.includes(l))).toEqual(REGISTER_COLUMNS);
  });

  test("Current Entries list columns follow the register order", async ({ page }) => {
    await page.goto("/cases");
    const table = page.locator("table");
    test.skip((await table.count()) === 0, "No entries yet, so no table is shown.");
    expect(await table.locator("thead th").allInnerTexts()).toEqual(REGISTER_COLUMNS);
  });
});

test.describe("signed in", () => {
  test("app shell shows sidebar, user and sign-out", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Current Entries" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  for (const screen of STAFF_SCREENS) {
    test(`${screen.path} loads without errors`, async ({ page }) => {
      const errors = watchForErrors(page);
      await expectHealthyPage(page, screen.path, screen.heading);
      expect(errors).toEqual([]);
    });
  }

  for (const screen of ADMIN_SCREENS) {
    test(`${screen.path} loads without errors (admin only)`, async ({ page }) => {
      await page.goto("/dashboard");
      const isAdmin = await page.getByRole("navigation").getByRole("link", { name: "Staff" }).count();
      test.skip(!isAdmin, "Test account is not an admin.");

      const errors = watchForErrors(page);
      await expectHealthyPage(page, screen.path, screen.heading);
      expect(errors).toEqual([]);
    });
  }

  test("sidebar navigation moves between screens and highlights the active one", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    await nav.getByRole("link", { name: "Current Entries" }).click();
    await expect(page).toHaveURL(/\/cases$/);
    await expect(page.getByRole("heading", { level: 1, name: "Current Entries" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Current Entries" })).toHaveClass(/btn-3d/);
  });

  test("current entries filters and first entry open cleanly", async ({ page }) => {
    const errors = watchForErrors(page);
    await expectHealthyPage(page, "/cases", "Current Entries");

    const firstEntry = page.locator("table tbody tr a").first();
    if ((await firstEntry.count()) === 0) {
      await expect(page.getByText("No entries found")).toBeVisible();
    } else {
      await firstEntry.click();
      await expect(page.getByRole("link", { name: "Edit Entry" })).toBeVisible();
      await expect(page.getByText(/This page couldn.t load/)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test("new entry form validates required fields without saving", async ({ page }) => {
    await page.goto("/cases/new");
    await page.getByRole("button", { name: /save|create|submit/i }).first().click();
    await expect(page).toHaveURL(/\/cases\/new/);
  });

  test("dashboard shows the Needs attention panel with working links", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await page.getByRole("link", { name: /Overdue hearings/ }).click();
    await expect(page).toHaveURL(/\/hearings\?view=overdue/);
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /No hearing scheduled/ }).click();
    await expect(page.getByText("with no hearing scheduled")).toBeVisible();
  });

  test("Ctrl+K opens search from any screen", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: "Search entries" });
    await expect(box).toBeFocused();
    await expect(page.getByRole("option", { name: "New Entry" })).toBeVisible();
    await box.fill("zzzz-no-such-entry");
    await expect(page.getByText(/No entries match/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(box).toBeHidden();
  });

  test("Export to Excel downloads an .xlsx", async ({ page }) => {
    await page.goto("/cases");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export to Excel" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^current-entries-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test("entry page shows the Documents panel", async ({ page }) => {
    await page.goto("/cases");
    const firstEntry = page.locator("table tbody tr a").first();
    test.skip((await firstEntry.count()) === 0, "No entries yet.");
    await firstEntry.click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(page.getByText("Choose files")).toBeVisible();
  });
});
