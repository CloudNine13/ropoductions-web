import { test, expect, type Page } from "@playwright/test";
import { E2E_FIXTURES, sessionCookies } from "./helpers/session";
import {
  ENGINE_BOOT_PROFILE,
  SHELL_FIXTURE_DOCUMENT,
  type BootProfileRequest,
} from "./fixtures/engine-boot-profile";

const IMMUTABLE = "private, immutable, max-age=31536000";
const MODERATE = "private, max-age=86400";

function expectedCacheControl(entry: BootProfileRequest): string {
  if (entry.key === SHELL_FIXTURE_DOCUMENT.key) {
    return MODERATE;
  }
  return entry.addressed ? IMMUTABLE : MODERATE;
}

async function addPatronCookies(page: Page): Promise<void> {
  await page.context().addCookies(await sessionCookies(E2E_FIXTURES.plainPatron.sessionId));
}

test.describe("asset burst", () => {
  test("replays the boot request profile and every response is 200 then 304", async ({ page }) => {
    await addPatronCookies(page);

    // The measured profile of one upstream boot; the epic's bound is 65+ gated requests.
    expect(ENGINE_BOOT_PROFILE.length).toBeGreaterThanOrEqual(65);

    for (const entry of ENGINE_BOOT_PROFILE) {
      const first = await page.request.get(entry.url);
      expect(first.status(), `first request for ${entry.represents}`).toBe(200);
      expect(first.headers()["cache-control"], `cache policy for ${entry.key}`).toBe(
        expectedCacheControl(entry)
      );

      const etag = first.headers()["etag"];
      expect(etag, `etag for ${entry.key}`).toBeTruthy();

      const revalidated = await page.request.get(entry.url, {
        headers: { "if-none-match": etag as string },
      });
      expect(revalidated.status(), `conditional request for ${entry.key}`).toBe(304);
      expect(revalidated.headers()["cache-control"]).toBe(expectedCacheControl(entry));
    }
  });
});
