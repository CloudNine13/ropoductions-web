import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";

const RECOVERY = '[data-testid="engine-boot-recovery"]';
const TITLE = '[data-testid="engine-boot-recovery-title"]';
const TOGGLE = '[data-testid="engine-boot-recovery-diagnostics-toggle"]';
const DIAGNOSTICS = '[data-testid="engine-boot-recovery-diagnostics"]';
const COPY = '[data-testid="engine-boot-recovery-copy"]';
const IFRAME = '[data-testid="game-engine-iframe"]';

/** The host's budget for a loaded engine document to report readiness or a failure. */
const BOOT_READY_TIMEOUT_MS = 6000;

/**
 * A document that loads but declares no boot script: the shape the engine document
 * takes when a published shell loses its boot script, or when the shell route
 * answers with an error body. It carries no harness marker, so silence from it is
 * a boot failure rather than the website-owned mock harness staying quiet.
 */
const DOCUMENT_WITHOUT_BOOT_SCRIPT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Final Orginity</title></head>
<body>
<p>No boot script here.</p>
</body>
</html>`;

/** The same document with the marker the mock harness carries and nothing else. */
const HARNESS_DOCUMENT_WITHOUT_BOOT_SCRIPT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="ropoductions-harness" content="mock-engine">
<title>Final Orginity</title>
</head>
<body>
<p>No boot script here.</p>
</body>
</html>`;

test.describe("engine document without a boot script (Epic 7)", () => {
  test("reports a boot request failure for a loaded document that declares no boot script", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
    // The copy payload is the only surface that carries the raw sentence, so the
    // clipboard is stubbed instead of read back: the assertion stays inside the page.
    await page.addInitScript(() => {
      const captured: string[] = [];
      (window as unknown as { __copiedDiagnostics?: string[] }).__copiedDiagnostics = captured;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text: string) => {
            captured.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    let documentRequests = 0;
    await page.route("**/engine/index.html*", (route) => {
      documentRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: { "Cross-Origin-Resource-Policy": "same-origin" },
        body: DOCUMENT_WITHOUT_BOOT_SCRIPT,
      });
    });

    await page.goto("/play");
    await expect(page.locator(IFRAME)).toBeVisible();

    await expect(page.locator(RECOVERY)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(RECOVERY)).toHaveAttribute(
      "data-failure-class",
      "boot_request_failed"
    );
    await expect(page.locator(TITLE)).toHaveText("The game files did not finish loading");

    await page.locator(TOGGLE).click();
    await expect(page.locator(DIAGNOSTICS)).toContainText("/engine/index.html");
    // No boot script was declared, so the inventory is empty rather than missing.
    await expect(page.locator(DIAGNOSTICS)).toContainText("None");

    await page.locator(COPY).click();
    const copied = await page.evaluate(
      () => (window as unknown as { __copiedDiagnostics?: string[] }).__copiedDiagnostics?.[0] ?? ""
    );
    expect(copied).toContain("class: boot_request_failed");
    expect(copied).toContain("raw: The engine document declared no boot script.");
    // The document that loaded is the document that failed: the panel is not the
    // product of a re-request the host made on its own.
    expect(documentRequests).toBe(1);
  });

  test("stays silent for a harness-marked document that declares no boot script", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
    await page.route("**/engine/index.html*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: { "Cross-Origin-Resource-Policy": "same-origin" },
        body: HARNESS_DOCUMENT_WITHOUT_BOOT_SCRIPT,
      })
    );

    await page.goto("/play");
    await expect(page.frameLocator(IFRAME).getByText("No boot script here.")).toBeVisible();

    // Readiness is what closes the boot window, and this document never reports it:
    // the watchdog is the host's only remaining failure path, so silence has to be
    // sampled after its budget has expired.
    await page.waitForTimeout(BOOT_READY_TIMEOUT_MS + 1000);

    await expect(page.locator(RECOVERY)).toHaveCount(0);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
  });
});
