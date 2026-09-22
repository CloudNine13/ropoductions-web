import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, readFounderPatronId, sessionCookies } from "./helpers/session";

const ANY_ADMIN_ENTRY = '[data-testid*="admin-entry"]';

test.describe("admin panel entry point (Epic 6)", () => {
  test("anonymous visitor gets no admin entry in the portal or paywall HTML", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.locator(ANY_ADMIN_ENTRY).count()).toBe(0);
    expect(await page.content()).not.toContain("admin-entry");

    await page.goto("/?paywall=required");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await expect(page.locator("#paywall-section")).toBeVisible();
    expect(await page.locator(ANY_ADMIN_ENTRY).count()).toBe(0);
    expect(await page.content()).not.toContain("admin-entry");
  });

  test("panel admin reaches the panel through the portal header entry", async ({ page }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.panelAdmin.sessionId));

    await page.goto("/");
    const entry = page.getByTestId("portal-admin-entry");
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-status-badge")).toBeVisible();
  });

  test("pledging admin sees one badge plus the entry on /play and reaches the panel", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.pledgingAdmin.sessionId));

    await page.goto("/play");
    const badge = page.getByTestId("play-status-badge");
    await expect(badge).toHaveCount(1);
    await expect(badge).toContainText("Studio Admin");

    const entry = page.getByTestId("play-admin-entry");
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-status-badge")).toBeVisible();
  });

  test("comp pass holder keeps the tier badge and sees no admin entry", async ({ page }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.compHolder.sessionId));

    await page.goto("/play");
    const badge = page.getByTestId("play-status-badge");
    await expect(badge).toHaveCount(1);
    await expect(badge).toContainText("Complimentary Pass");
    expect(await page.locator(ANY_ADMIN_ENTRY).count()).toBe(0);
  });

  test("plain patron sees one tier badge and no admin entry on /play", async ({ page }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));

    await page.goto("/play");
    const badge = page.getByTestId("play-status-badge");
    await expect(badge).toHaveCount(1);
    await expect(badge).toContainText("Ork Patron");
    expect(await page.locator(ANY_ADMIN_ENTRY).count()).toBe(0);
  });

  test("founder with zero override rows reaches the entry via env bootstrap", async ({ page }) => {
    test.skip(
      !readFounderPatronId(),
      "no CREATOR_ADMIN_PATREON_IDS or INITIAL_ADMIN_PATREON_IDS is configured locally"
    );
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.founder.sessionId));

    await page.goto("/");
    await expect(page.getByTestId("portal-admin-entry")).toBeVisible();
  });

  test("mobile drawer carries the entry with parity", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.panelAdmin.sessionId));

    await page.goto("/");
    await expect(page.getByTestId("portal-admin-entry")).toBeHidden();

    const toggle = page.getByRole("button", { name: "Toggle navigation menu" });
    // The row must not push the toggle past the viewport edge: its centre then lands on a classic
    // scrollbar, where Firefox's hit test resolves to <html> and a real tap does nothing.
    expect(
      await toggle.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth)
    ).toBe(true);

    await toggle.click();
    await expect(page.getByTestId("portal-admin-entry-drawer")).toBeVisible();
  });

  test("entry appears after confirming the age gate without a document reload", async ({ page }) => {
    await page.context().addCookies(
      await sessionCookies(E2E_FIXTURES.panelAdmin.sessionId, { ageVerified: false })
    );

    await page.goto("/");
    expect(await page.locator(ANY_ADMIN_ENTRY).count()).toBe(0);

    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__e2eNoReloadMarker = "kept";
    });
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();

    await expect(page.getByTestId("portal-admin-entry")).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__e2eNoReloadMarker
      )
    ).toBe("kept");
  });
});
