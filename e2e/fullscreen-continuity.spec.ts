import { test, expect, type Frame, type Page } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";

const VIEWPORT = '[data-testid="game-viewport-container"]';
const IFRAME = '[data-testid="game-engine-iframe"]';
const FULLSCREEN_BUTTON = '[data-testid="save-hud-fullscreen-button fullscreen-toggle-button"]';
const STATUS_OVERLAY = "#statusOverlay";
const ENGINE_DOCUMENT = "/engine/index.html";

/**
 * Drives real input into the engine document. A remounted frame would have to
 * re-establish its own listeners and would lose in-document runtime state, so this
 * both widens the observation window with real work and proves the document still
 * answers input after the toggle.
 */
async function pulseEngineCanvas(page: Page): Promise<void> {
  await page.frameLocator(IFRAME).locator("#gameCanvas").click();
}

interface LoadCounterWindow {
  __engineLoads?: number;
}

interface MutationCounterWindow {
  __frameMutations?: number;
}

interface RuntimeStateWindow {
  __ropoductionsRuntimeState?: string;
}

/**
 * `load` does not bubble, so a document-level capture listener is the only host-side
 * way to observe every engine document load: a remount produces a second one.
 */
async function countIframeLoads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = window as unknown as LoadCounterWindow;
    state.__engineLoads = 0;
    document.addEventListener(
      "load",
      (event) => {
        const target = event.target as Element | null;
        if (target?.tagName === "IFRAME") {
          state.__engineLoads = (state.__engineLoads ?? 0) + 1;
        }
      },
      true,
    );
  });
}

function readIframeLoads(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as LoadCounterWindow).__engineLoads ?? -1);
}

/**
 * React reconciles the frame by position, so a mode toggle that changes the tree
 * shape shows up as a removal plus a re-addition of the frame node, never as an
 * attribute change on it.
 */
async function watchEngineFrameNode(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frameNode = document.querySelector('[data-testid="game-engine-iframe"]');
    const state = window as unknown as MutationCounterWindow;
    state.__frameMutations = 0;

    const touchesFrame = (node: Node): boolean =>
      node === frameNode ||
      (node.nodeType === 1 &&
        ((node as Element).matches('[data-testid="game-engine-iframe"]') ||
          (node as Element).querySelector('[data-testid="game-engine-iframe"]') !== null));

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.target === frameNode ||
          [...mutation.addedNodes].some(touchesFrame) ||
          [...mutation.removedNodes].some(touchesFrame)
        ) {
          state.__frameMutations = (state.__frameMutations ?? 0) + 1;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

function readFrameMutations(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as MutationCounterWindow).__frameMutations ?? -1);
}

async function openPlay(page: Page): Promise<void> {
  await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
  await page.goto("/play");
  await expect(page.locator(IFRAME)).toBeVisible();
  await expect(page.frameLocator(IFRAME).locator("#gameCanvas")).toBeVisible();
}

function engineFrame(page: Page): Frame {
  const frame = page.frames().find((candidate) => candidate.url().includes(ENGINE_DOCUMENT));
  expect(frame, "the engine iframe must own a frame on the engine document").toBeTruthy();
  return frame as Frame;
}

async function enterFullscreen(page: Page): Promise<void> {
  await page.locator(FULLSCREEN_BUTTON).click();
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-fullscreen", "true");
}

async function exitFullscreen(page: Page): Promise<void> {
  await page.locator(FULLSCREEN_BUTTON).click();
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-fullscreen", "false");
}

/**
 * Both toggle paths set the same `data-fullscreen` attribute, so the run records
 * which one actually engaged instead of leaving it to inference.
 */
async function annotateFullscreenPath(page: Page): Promise<void> {
  const native = await page.evaluate(() => document.fullscreenElement !== null);
  const path = native ? "native top layer" : "pseudo-fullscreen fallback";
  console.log(`[6.2] fullscreen path exercised: ${path}`);
  test.info().annotations.push({ type: "fullscreen-path", description: path });
}

test.describe("fullscreen viewport continuity (Epic 6.2)", () => {
  test("engine boots exactly once across fullscreen enter and exit", async ({ page }) => {
    await countIframeLoads(page);
    await openPlay(page);
    // Wait for the engine document's own load event instead of sampling before it lands.
    await expect.poll(() => readIframeLoads(page), { timeout: 15000 }).toBe(1);

    await enterFullscreen(page);
    await annotateFullscreenPath(page);
    await expect.poll(() => readIframeLoads(page), { timeout: 3000 }).toBe(1);

    await exitFullscreen(page);
    await expect.poll(() => readIframeLoads(page), { timeout: 3000 }).toBe(1);

    await pulseEngineCanvas(page);
    expect(await readIframeLoads(page)).toBe(1);
  });

  test("the engine frame node is never moved, replaced, or re-keyed across a toggle", async ({
    page,
  }) => {
    await openPlay(page);
    await watchEngineFrameNode(page);
    const timeOrigin = await engineFrame(page).evaluate(() => performance.timeOrigin);
    const frameHandle = await page.evaluateHandle(
      () => document.querySelector('[data-testid="game-engine-iframe"]'),
    );
    const dockHandle = await page.evaluateHandle(
      () => document.querySelector('[data-testid="save-hud-dock"]'),
    );

    await enterFullscreen(page);
    await exitFullscreen(page);
    await pulseEngineCanvas(page);

    expect(await readFrameMutations(page)).toBe(0);
    expect(
      await page.evaluate(
        (previous) => previous === document.querySelector('[data-testid="game-engine-iframe"]'),
        frameHandle,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        (previous) => previous === document.querySelector('[data-testid="save-hud-dock"]'),
        dockHandle,
      ),
    ).toBe(true);
    expect(await engineFrame(page).evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  });

  test("in-memory engine state survives fullscreen enter and exit", async ({ page }) => {
    await countIframeLoads(page);
    await openPlay(page);
    const frame = engineFrame(page);

    await frame.evaluate(() => {
      (window as unknown as RuntimeStateWindow).__ropoductionsRuntimeState = "mid-scene";
      return (window as unknown as { DataManager: { loadGlobalInfo: () => Promise<void> } }).DataManager.loadGlobalInfo();
    });
    await expect(page.frameLocator(IFRAME).locator(STATUS_OVERLAY)).toHaveText(
      "RPG Maker MZ Engine Ready • Saves Refreshed",
    );

    const timeOrigin = await frame.evaluate(() => performance.timeOrigin);

    await enterFullscreen(page);
    await exitFullscreen(page);
    await pulseEngineCanvas(page);

    await expect(page.frameLocator(IFRAME).locator(STATUS_OVERLAY)).toHaveText(
      "RPG Maker MZ Engine Ready • Saves Refreshed",
    );
    expect(await frame.evaluate(() => (window as unknown as RuntimeStateWindow).__ropoductionsRuntimeState)).toBe(
      "mid-scene",
    );
    expect(await frame.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    expect(page.frames().filter((candidate) => candidate.url().includes(ENGINE_DOCUMENT))).toHaveLength(1);
    expect(await readIframeLoads(page)).toBe(1);
  });
});
