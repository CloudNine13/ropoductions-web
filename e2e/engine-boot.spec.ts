import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";
import { installBootReportRecorder, readBootReports } from "./helpers/boot-reports";

const RECOVERY = '[data-testid="engine-boot-recovery"]';
const IFRAME = '[data-testid="game-engine-iframe"]';
const OVERLAY = '[role="progressbar"]';

test.describe("engine boot", () => {
  test("reaches the engine ready state with no recovery surface and no failure report", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
    await installBootReportRecorder(page);

    await page.goto("/play");

    await expect(page.locator(IFRAME)).toBeVisible();
    await expect(page.frameLocator(IFRAME).locator("#gameCanvas")).toBeVisible();
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await expect(page.locator(RECOVERY)).toHaveCount(0);

    const reports = await readBootReports(page);
    expect(reports.ready).toBeGreaterThan(0);
    expect(reports.failures).toEqual([]);
  });
});
