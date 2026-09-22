import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";

const RECOVERY = '[data-testid="engine-boot-recovery"]';
const RETRY = '[data-testid="engine-boot-recovery-retry"]';
const TITLE = '[data-testid="engine-boot-recovery-title"]';
const IFRAME = '[data-testid="game-engine-iframe"]';

/** Served in place of the real shell on the first document request only. */
const SHELL_WITHOUT_BRIDGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Final Orginity</title></head>
<body>
<script src="/engine/js/main.js"></script>
</body>
</html>`;

test.describe("engine boot failure recovery surface (Epic 7)", () => {
  test("refuses to mount the engine and reports the probe when WebGL is unavailable", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
    let engineDocumentRequests = 0;
    await page.route("**/engine/index.html*", (route) => {
      engineDocumentRequests += 1;
      return route.continue();
    });
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype as unknown as {
        getContext: (contextId: string, ...rest: unknown[]) => unknown;
      };
      const originalGetContext = proto.getContext;
      proto.getContext = function (this: HTMLCanvasElement, contextId: string, ...rest: unknown[]) {
        if (typeof contextId === "string" && contextId.startsWith("webgl")) {
          const refusal = new Event("webglcontextcreationerror");
          Object.defineProperty(refusal, "statusMessage", {
            value: "GPU process crashed while creating the context",
          });
          this.dispatchEvent(refusal);
          return null;
        }
        return originalGetContext.apply(this, [contextId, ...rest]);
      };
    });

    await page.goto("/play");

    await expect(page.locator(RECOVERY)).toBeVisible();
    await expect(page.locator(TITLE)).toHaveText("3D graphics are unavailable");
    await expect(page.locator(IFRAME)).toHaveCount(0);
    expect(engineDocumentRequests).toBe(0);

    await page.locator('[data-testid="engine-boot-recovery-diagnostics-toggle"]').click();
    await expect(page.getByTestId("engine-boot-recovery-diagnostics")).toContainText(
      "GPU process crashed while creating the context"
    );
  });

  test("classifies a failed boot script, then retries in place on the same iframe", async ({
    page,
  }) => {
    await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
    let shellRequests = 0;
    await page.route("**/engine/index.html*", (route) => {
      shellRequests += 1;
      if (shellRequests === 1) {
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          headers: { "Cross-Origin-Resource-Policy": "same-origin" },
          body: SHELL_WITHOUT_BRIDGE,
        });
      }
      return route.continue();
    });
    await page.route("**/engine/js/main.js*", (route) => route.abort());

    await page.goto("/play");
    await expect(page.locator(IFRAME)).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __engineFrame?: Element | null }).__engineFrame =
        document.querySelector('[data-testid="game-engine-iframe"]');
    });

    await expect(page.locator(RECOVERY)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(TITLE)).toHaveText("The game files did not finish loading");

    await page.locator('[data-testid="engine-boot-recovery-diagnostics-toggle"]').click();
    await expect(page.getByTestId("engine-boot-recovery-diagnostics")).toContainText(
      "/engine/js/main.js"
    );

    await page.locator(RETRY).click();

    await expect(page.locator(RECOVERY)).toHaveCount(0);
    await expect(page.frameLocator(IFRAME).locator("#gameCanvas")).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __engineFrame?: Element | null }).__engineFrame ===
          document.querySelector('[data-testid="game-engine-iframe"]')
      )
    ).toBe(true);
    expect(shellRequests).toBe(2);
  });
});
