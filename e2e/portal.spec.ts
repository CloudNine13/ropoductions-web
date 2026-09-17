import { test, expect } from "@playwright/test";

test.describe("portal landing", () => {
  test("renders the studio portal for first-time visitors", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("ROPODUCTIONS", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("PROJECT SHOWCASE")).toBeVisible();
    await expect(page.getByText("COMMUNITY & SOCIAL HUB")).toBeVisible();
  });

  test("serves edge security headers on every response", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'self'");
  });
});
