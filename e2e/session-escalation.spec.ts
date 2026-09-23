import { test, expect, type Page } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";

const RECOVERY = '[data-testid="engine-boot-recovery"]';
const IFRAME = '[data-testid="game-engine-iframe"]';
const OVERLAY = '[role="progressbar"]';
const LOAD_COUNTER = "__ropoductions_e2e_document_loads";

/**
 * The report the injected plugin posts when the asset layer answers 401/403: the
 * session, not the network, failed. The host owns what happens next, and that is the
 * behaviour under test — the producer side is covered in tests/engine-asset-retry.test.ts.
 */
const SESSION_REJECTED_REPORT = {
  type: "ROPODUCTIONS_ENGINE_BOOT_FAILURE",
  failureClass: "asset_load_failed",
  diagnostics: { url: "/api/game/img/missing.png", status: 403, sessionRejected: true },
};

const PLAIN_ASSET_FAILURE_REPORT = {
  type: "ROPODUCTIONS_ENGINE_BOOT_FAILURE",
  failureClass: "asset_load_failed",
  diagnostics: { url: "/api/game/img/missing.png", status: 404 },
};

async function reportFromEngineFrame(page: Page, payload: unknown): Promise<void> {
  const frame = page.frames().find((candidate) => candidate.url().includes("/engine/"));
  expect(frame, "the engine frame must be mounted before it can report").toBeTruthy();
  await frame?.evaluate(
    (message) => window.parent.postMessage(message, window.location.origin),
    payload
  );
}

function readDocumentLoads(page: Page): Promise<number> {
  return page.evaluate(
    (key) => Number(window.sessionStorage.getItem(key) ?? "0"),
    LOAD_COUNTER
  );
}

async function openPlayWithLoadCounter(page: Page): Promise<void> {
  await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
  await page.addInitScript((key) => {
    if (window.top !== window) return;
    window.sessionStorage.setItem(key, String(Number(window.sessionStorage.getItem(key) ?? "0") + 1));
  }, LOAD_COUNTER);
  await page.goto("/play");
  await expect(page.frameLocator(IFRAME).locator("#gameCanvas")).toBeVisible();
}

test.describe("session-rejected asset escalation (Epic 7)", () => {
  test("reloads /play once for a session-rejected asset report instead of offering a blind retry", async ({
    page,
  }) => {
    await openPlayWithLoadCounter(page);
    expect(await readDocumentLoads(page)).toBe(1);

    const reloaded = page.waitForEvent("load");
    await reportFromEngineFrame(page, SESSION_REJECTED_REPORT);
    await reloaded;

    await expect.poll(() => readDocumentLoads(page)).toBe(2);
    await expect(page.locator(RECOVERY)).toHaveCount(0);
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await expect(page.frameLocator(IFRAME).locator("#gameCanvas")).toBeVisible();
  });

  test("leaves the document alone for the same asset failure when the session was not rejected", async ({
    page,
  }) => {
    await openPlayWithLoadCounter(page);

    await reportFromEngineFrame(page, PLAIN_ASSET_FAILURE_REPORT);
    // Nothing-happened assertion: the escalation is the only reload this document may
    // take, so give it the window it would have used before reading the counter.
    await page.waitForTimeout(750);

    expect(await readDocumentLoads(page)).toBe(1);
  });
});
