import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";

const RECOVERY = '[data-testid="engine-boot-recovery"]';
const TITLE = '[data-testid="engine-boot-recovery-title"]';
const DIAGNOSTICS_TOGGLE = '[data-testid="engine-boot-recovery-diagnostics-toggle"]';
const DIAGNOSTICS = '[data-testid="engine-boot-recovery-diagnostics"]';
const IFRAME = '[data-testid="game-engine-iframe"]';
const ENGINE_DOCUMENT = /\/engine\/index\.html(\?|$)/;

/** The active locale, chosen so the panel copy cannot fall back to English. */
const LOCALE = "ru";

const locale = JSON.parse(
  readFileSync(new URL(`../src/locales/${LOCALE}.json`, import.meta.url), "utf-8")
) as { game: { bootFailure: Record<string, string> } };
const copy = locale.game.bootFailure;

test.describe("WebGL unavailable", () => {
  test("reports the browser's own WebGL refusal in the active locale", async ({ page }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
    await page.context().addCookies([
      { name: "ropoductions_lang", value: LOCALE, domain: "127.0.0.1", path: "/" },
    ]);
    let engineDocumentRequests = 0;
    page.on("request", (request) => {
      if (ENGINE_DOCUMENT.test(request.url())) {
        engineDocumentRequests += 1;
      }
    });

    await page.goto("/play");

    await expect(page.locator("html")).toHaveAttribute("lang", LOCALE);
    await expect(page.locator(RECOVERY)).toBeVisible();
    await expect(page.locator(RECOVERY)).toHaveAttribute("data-failure-class", "webgl_unavailable");
    await expect(page.locator(TITLE)).toHaveText(copy.webglTitle);
    // The engine document is never mounted once the preflight refuses the session.
    await expect(page.locator(IFRAME)).toHaveCount(0);
    expect(engineDocumentRequests).toBe(0);

    await page.locator(DIAGNOSTICS_TOGGLE).click();
    const diagnostics = page.locator(DIAGNOSTICS);
    await expect(diagnostics).toContainText(copy.diagnosticsProbeUnsupported);
    await expect(diagnostics).toContainText(copy.diagnosticsStatusMessage);
    // The status message is the browser's own, untranslated text.
    await expect(diagnostics).toContainText(/WebGL/i);
  });
});
