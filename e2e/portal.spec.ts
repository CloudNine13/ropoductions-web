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
  // The landing enables smooth scrolling, so an animated scrollTo may still be
  // settling when the modal opens; Firefox and Chromium disagree by a few
  // pixels. Scroll instantly and assert preservation within a tolerance.
  const SCROLL_TOLERANCE_PX = 5;

  async function scrollLandingTo(
    page: import("@playwright/test").Page,
    y: number
  ): Promise<void> {
    await page.evaluate((target) => {
      document.documentElement.classList.remove("scroll-smooth");
      window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
    }, y);
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
      .toBe(y);
  }

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
    await scrollLandingTo(page, 400);

    const headerPlayLink = page.locator("header").getByRole("link", { name: "Play" });
    await headerPlayLink.click();

    await expect(page.locator("#paywall-section")).toBeVisible();
    const scrollYDuringModal = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollYDuringModal - 400)).toBeLessThanOrEqual(SCROLL_TOLERANCE_PX);

    await page.keyboard.press("Escape");
    await expect(page.locator("#paywall-section")).toHaveCount(0);
    const scrollYAfterClose = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollYAfterClose - 400)).toBeLessThanOrEqual(SCROLL_TOLERANCE_PX);
  });

  test("closing the modal via the dismiss button returns to landing page", async ({
    page,
  }) => {
    await page.goto("/?paywall=required");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await expect(page.locator("#paywall-section")).toBeVisible();
    await page.getByLabel("Dismiss notification").click();
    await expect(page.locator("#paywall-section")).toHaveCount(0);
    await expect(page.getByText("PROJECT SHOWCASE")).toBeVisible();
  });

  test("preserves landing scroll position when opening paywall from showcase play link", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await scrollLandingTo(page, 1000);

    const showcasePlay = page.getByRole("link", { name: "Play in Browser" });
    await showcasePlay.click();

    await expect(page.locator("#paywall-section")).toBeVisible();
    const scrollYDuringModal = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollYDuringModal - 1000)).toBeLessThanOrEqual(SCROLL_TOLERANCE_PX);

    await page.getByLabel("Dismiss notification").click();
    await expect(page.locator("#paywall-section")).toHaveCount(0);
    const scrollYAfterClose = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollYAfterClose - 1000)).toBeLessThanOrEqual(SCROLL_TOLERANCE_PX);
  });
});
