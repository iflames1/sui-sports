import { expect, test } from "@playwright/test";

test("home page renders value proposition", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toContainText("Structured, monetizable access");
});

test("feed page explains wallet requirement", async ({ page }) => {
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Wallet required" })).toBeVisible();
});

test("start page shows journeys", async ({ page }) => {
  await page.goto("/start");
  await expect(
    page.getByRole("heading", { level: 1, name: /wallet to feed/i }),
  ).toBeVisible();
});
