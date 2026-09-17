import { test, expect } from "@playwright/test";

const VERIFIED_COOKIES = [
  { name: "ropoductions_session", value: "e2e-session-uuid", domain: "127.0.0.1", path: "/" },
  { name: "ropoductions_age_verified", value: "true", domain: "127.0.0.1", path: "/" },
];

test.describe("patron edge gating", () => {
  test("redirects unverified play entry to landing with a renewal flag", async ({ page }) => {
    await page.goto("/play");

    expect(page.url()).toBe("http://127.0.0.1:3100/?auth_required=true");
    await expect(page.getByText("PROJECT SHOWCASE")).toBeVisible();
  });

  test("rejects anonymous game asset requests with the 403 envelope", async ({ request }) => {
    const response = await request.get("/api/game/data/file1.rpgsave");

    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Active patron session and 21+ age verification required.",
      },
    });
  });

  test("bounces forged sessions through clearing to the required paywall", async ({
    page,
  }) => {
    await page.context().addCookies(VERIFIED_COOKIES);

    await page.goto("/play");
    expect(page.url()).toBe("http://127.0.0.1:3100/?paywall=required");
    await expect(page.locator("#paywall-section")).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "ropoductions_session")).toBe(false);
    expect(
      cookies.find((c) => c.name === "ropoductions_age_verified")?.value
    ).toBe("true");

    const assetResponse = await page.request.get("/api/game/data/file1.rpgsave");
    expect(assetResponse.status()).toBe(403);
    expect(await assetResponse.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Active patron session and 21+ age verification required.",
      },
    });
  });
});
