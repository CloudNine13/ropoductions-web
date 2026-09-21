import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";

test.describe("admin anti-enumeration guard (Epic 5)", () => {
  test("anonymous visitor to /admin gets a 404 page with no redirect leak", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);
  });

  test("anonymous visitor to /admin/overrides gets a 404 page with no redirect leak", async ({
    page,
  }) => {
    const response = await page.goto("/admin/overrides");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);
  });

  test("forged session cookie to /admin does not redirect (no location header)", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: "ropoductions_session", value: "e2e-forged-session", domain: "127.0.0.1", path: "/" },
      { name: "ropoductions_age_verified", value: "true", domain: "127.0.0.1", path: "/" },
    ]);

    const response = await page.goto("/admin");
    // Fail-closed notFound(): never a 3xx that discloses the route exists.
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);
    expect(response!.headers()["location"]).toBeUndefined();
  });

  test("forged session cookie to /admin/overrides returns 404 with no location header", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: "ropoductions_session", value: "e2e-forged-session", domain: "127.0.0.1", path: "/" },
      { name: "ropoductions_age_verified", value: "true", domain: "127.0.0.1", path: "/" },
    ]);

    const response = await page.goto("/admin/overrides");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);
    expect(response!.headers()["location"]).toBeUndefined();
  });

  test("valid signed session without an admin grant gets 404 with no location header", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));

    const response = await page.goto("/admin");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);
    expect(response!.headers()["location"]).toBeUndefined();
  });

  test("valid signed session without an admin grant gets 404 on /admin/overrides", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));

    const response = await page.goto("/admin/overrides");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);
    expect(response!.headers()["location"]).toBeUndefined();
  });

  // Positive control for the 404 assertions above: without a seeded admin that
  // genuinely reaches the dashboard, every failure path also yields 404 and the
  // negative results prove nothing.
  test("seeded admin session reaches the admin dashboard", async ({ page }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.panelAdmin.sessionId));

    const response = await page.goto("/admin");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
    await expect(page.getByTestId("admin-status-badge")).toBeVisible();
    await expect(page.getByTestId("admin-nav-play")).toBeVisible();
  });
});
