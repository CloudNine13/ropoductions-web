import { test, expect, type Page } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";
import {
  installBootReportRecorder,
  readBootReports,
  readResourceEntries,
  type BootReports,
} from "./helpers/boot-reports";
import {
  DOCUMENT_REFERENCED_SHELL_REQUESTS,
  E2E_RELEASE_ID,
  SHELL_FIXTURE_URL,
} from "./fixtures/engine-boot-profile";

const RECOVERY = '[data-testid="engine-boot-recovery"]';
const IFRAME = '[data-testid="game-engine-iframe"]';
const OVERLAY = '[role="progressbar"]';
const PLAY_SHELL_DOCUMENT = /\/engine\/index\.html(\?|$)/;
const RELOADS = 4;

/** Addressed shell subresources the fixture document references. */
const ADDRESSED_URLS = DOCUMENT_REFERENCED_SHELL_REQUESTS.map((entry) => entry.url);
/** The css and the boot scripts: 59 references the engine cannot boot without. */
const REQUIRED_ADDRESSED_URLS = ADDRESSED_URLS.filter((url) => !url.includes("/icon/"));

function urlOf(entryName: string): string {
  const parsed = new URL(entryName);
  return `${parsed.pathname}${parsed.search}`;
}

async function addPatronCookies(page: Page): Promise<void> {
  await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
}

async function expectEngineReady(page: Page): Promise<void> {
  await expect(page.locator(IFRAME)).toBeVisible();
  await expect(page.frameLocator(IFRAME).locator("#gameCanvas")).toBeVisible();
  await expect(page.locator(OVERLAY)).toHaveCount(0);
  await expect(page.locator(RECOVERY)).toHaveCount(0);
}

test.describe("reload storm", () => {
  test(`five consecutive reloads of /play boot cleanly and issue one shell document request each`, async ({
    page,
  }) => {
    await addPatronCookies(page);
    await installBootReportRecorder(page);

    let documentRequests: string[] = [];
    page.on("request", (request) => {
      if (PLAY_SHELL_DOCUMENT.test(request.url())) {
        documentRequests.push(request.url());
      }
    });

    const loads: Array<{ documents: number; reports: BootReports }> = [];
    await page.goto("/play");
    await expectEngineReady(page);
    loads.push({ documents: documentRequests.length, reports: await readBootReports(page) });
    documentRequests = [];

    for (let reload = 0; reload < RELOADS; reload += 1) {
      await page.reload();
      await expectEngineReady(page);
      loads.push({ documents: documentRequests.length, reports: await readBootReports(page) });
      documentRequests = [];
    }

    expect(loads).toHaveLength(RELOADS + 1);
    expect(loads.map((load) => load.documents)).toEqual([1, 1, 1, 1, 1]);
    expect(loads.map((load) => load.reports.ready > 0)).toEqual([true, true, true, true, true]);
    expect(loads.flatMap((load) => load.reports.failures)).toEqual([]);
  });

  test("a reload revalidates the shell document and re-downloads no addressed shell subresource", async ({
    page,
  }) => {
    await addPatronCookies(page);

    let documentRequests: string[] = [];
    const conditionalAddressedRequests: string[] = [];
    page.on("request", (request) => {
      const url = urlOf(request.url());
      if (ADDRESSED_URLS.includes(url)) {
        if (request.headers()["if-none-match"]) {
          conditionalAddressedRequests.push(url);
        }
        return;
      }
      if (url === SHELL_FIXTURE_URL) {
        documentRequests.push(url);
      }
    });
    const addressedCacheControl = new Map<string, string>();
    page.on("response", (response) => {
      const url = urlOf(response.url());
      if (ADDRESSED_URLS.includes(url) && !addressedCacheControl.has(url)) {
        addressedCacheControl.set(url, response.headers()["cache-control"] ?? "");
      }
    });

    await page.goto(SHELL_FIXTURE_URL);
    await expect(page).toHaveTitle("Engine shell fixture");

    const firstLoad = (await readResourceEntries(page)).filter((entry) =>
      ADDRESSED_URLS.includes(urlOf(entry.name))
    );
    const addressed = firstLoad.map((entry) => urlOf(entry.name));
    expect(addressed).toEqual(expect.arrayContaining(REQUIRED_ADDRESSED_URLS));
    expect(firstLoad.filter((entry) => entry.transferSize <= 0)).toEqual([]);
    expect(new Set(addressedCacheControl.values())).toEqual(
      new Set(["private, immutable, max-age=31536000"])
    );
    expect(documentRequests).toHaveLength(1);
    documentRequests = [];
    // The document is unaddressed and revalidating; its references are not.
    expect(conditionalAddressedRequests).toEqual([]);

    for (let reload = 0; reload < RELOADS; reload += 1) {
      await page.reload();
      await expect(page).toHaveTitle("Engine shell fixture");

      const entries = await readResourceEntries(page);
      const refetched = addressed.filter((url) => {
        const entry = entries.find((candidate) => urlOf(candidate.name) === url);
        return !entry || entry.transferSize > 0;
      });

      expect(refetched).toEqual([]);
      expect(conditionalAddressedRequests).toEqual([]);
      expect(documentRequests).toHaveLength(1);
      documentRequests = [];
    }

    expect(E2E_RELEASE_ID).toMatch(/^[0-9a-f]{64}$/);
  });
});
