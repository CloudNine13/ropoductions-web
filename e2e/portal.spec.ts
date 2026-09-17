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

test.describe("paywall interstitial", () => {
  test("shows no paywall window on the plain landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#paywall-section")).toHaveCount(0);
  });

  for (const paywall of ["revoked", "lapsed", "required"] as const) {
    test(`renders the paywall window and five-tier matrix for ?paywall=${paywall}`, async ({
      page,
    }) => {
      await page.goto(`/?paywall=${paywall}`);

      await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
      await expect(page.locator("#paywall-section")).toBeVisible();
      await expect(page.locator("#paywall-section")).toContainText("$5");
      await expect(page.locator("#paywall-section")).toContainText("$50");
      await expect(
        page.locator("#paywall-section a[href='/api/auth/patreon']")
      ).toBeVisible();
      await expect(
        page.locator(
          "#paywall-section a[href='https://www.patreon.com/join/Ropoductions']"
        )
      ).toBeVisible();
    });
  }

  test("collapses ?auth_required=true onto the required interstitial", async ({
    page,
  }) => {
    await page.goto("/?auth_required=true");

    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await expect(page.locator("#paywall-section")).toBeVisible();
  });

  for (const paywall of ["revoked", "lapsed", "required"] as const) {
    test(`closing the ${paywall} window returns to the landing page`, async ({
      page,
    }) => {
      await page.goto(`/?paywall=${paywall}`);

      await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
      await expect(page.locator("#paywall-section")).toBeVisible();
      await expect(page.locator("#paywall-section")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator("#paywall-section")).toHaveCount(0);
      await expect(page.getByText("PROJECT SHOWCASE")).toBeVisible();
    });
  }

  test("preserves landing scroll position when opening and closing the paywall modal", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(200);

    const headerPlayLink = page.locator("header").getByRole("link", { name: "Play" });
    await headerPlayLink.click();

    await expect(page.locator("#paywall-section")).toBeVisible();
    const scrollYDuringModal = await page.evaluate(() => window.scrollY);
    expect(scrollYDuringModal).toBe(400);

    await page.keyboard.press("Escape");
    await expect(page.locator("#paywall-section")).toHaveCount(0);
    const scrollYAfterClose = await page.evaluate(() => window.scrollY);
    expect(scrollYAfterClose).toBe(400);
  });
});
