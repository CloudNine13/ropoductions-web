import { test, expect } from "@playwright/test";

// NOTE: assertions scope to aside[role="alert"], never bare getByRole("alert").
// Next.js renders a <next-route-announcer/> live region that Chromium exposes
// with the "alert" accessible role after client navigations, so a bare alert
// locator matches the announcer and survives toast dismissal (flaky green/red).
const toast = (page: import("@playwright/test").Page) =>
  page.locator('aside[role="alert"]');

test.describe("auth error toast", () => {
  test("renders the access-denied toast and dismisses it while cleaning the URL", async ({
    page,
  }) => {
    await page.goto("/?auth_error=access_denied");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();

    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText("Access Denied");
    await expect(toast(page)).toContainText("Patreon authorization was cancelled or denied.");

    await toast(page).getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast(page)).toHaveCount(0);
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/");
    expect(currentUrl.searchParams.has("auth_error")).toBe(false);
  });

  test("renders the client-configuration toast variant", async ({ page }) => {
    await page.goto("/?auth_error=client_configuration_error");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();

    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText("Client Configuration Error");
  });
  test("renders the server-configuration toast variant", async ({ page }) => {
    await page.goto("/?auth_error=server_configuration_error");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();

    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText("Server Configuration Error");
  });

  test("falls back to the generic toast for unknown error codes", async ({ page }) => {
    await page.goto("/?auth_error=some_future_code");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();

    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText("Authentication Error");
  });
});
