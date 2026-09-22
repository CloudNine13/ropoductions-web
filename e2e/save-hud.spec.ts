import { test, expect } from "@playwright/test";

test.describe("save persistence and engine web bridge (Epic 4)", () => {
  test("unverified visitor navigating to /play is redirected to age gate", async ({ page }) => {
    await page.goto("/play");
    expect(page.url()).toBe("http://127.0.0.1:3100/?auth_required=true");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("21+ AGE VERIFICATION REQUIRED")).toBeVisible();
  });

  test("verified visitor with invalid session is bounced to paywall interstitial", async ({ page }) => {
    await page.context().addCookies([
      { name: "ropoductions_age_verified", value: "true", domain: "127.0.0.1", path: "/" },
      { name: "ropoductions_session", value: "e2e-session-uuid", domain: "127.0.0.1", path: "/" },
    ]);

    await page.goto("/play");
    expect(page.url()).toBe("http://127.0.0.1:3100/?paywall=required");
    await expect(page.locator("#paywall-section")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SUPPORTER ACCESS REQUIRED" }).first()).toBeVisible();
  });

  test("engine index.html loads canvas mock and responds to postMessage bridge requests", async ({ page }) => {
    await page.goto("/engine/index.html");
    const canvas = page.locator("#gameCanvas");
    await expect(canvas).toBeVisible();
    const bridgeResult = await page.evaluate(async () => {
      return new Promise<{
        type: string;
        slots: Record<string, string>;
        global?: string;
        config?: string;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("Bridge request timed out"));
        }, 3000);

        function handler(event: MessageEvent) {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "ROPODUCTIONS_SAVES_DATA") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve({
              type: event.data.type,
              slots: event.data.payload.slots,
              global: event.data.payload.global,
              config: event.data.payload.config,
            });
          }
        }

        window.addEventListener("message", handler);
        window.postMessage({ type: "ROPODUCTIONS_GET_SAVES" }, window.location.origin);
      });
    });

    expect(bridgeResult.type).toBe("ROPODUCTIONS_SAVES_DATA");
    expect(typeof bridgeResult.slots).toBe("object");
  });

  test("engine bridge executes ROPODUCTIONS_SET_SAVES and ROPODUCTIONS_RESET_SAVES", async ({ page }) => {
    await page.goto("/engine/index.html");
    // 1. Test ROPODUCTIONS_SET_SAVES
    const setResult = await page.evaluate(async () => {
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("SET_SAVES timed out"));
        }, 3000);

        function handler(event: MessageEvent) {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "ROPODUCTIONS_SET_SAVES_SUCCESS") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(event.data.type);
          }
        }

        window.addEventListener("message", handler);
        window.postMessage(
          {
            type: "ROPODUCTIONS_SET_SAVES",
            payload: {
              file1: '{"party":["Lyra","Kael"],"gold":500}',
              config: '{"bgmVolume":80}',
            },
          },
          window.location.origin
        );
      });
    });

    expect(setResult).toBe("ROPODUCTIONS_SET_SAVES_SUCCESS");

    // 2. Verify restored data persists and is returned by GET_SAVES
    const queryResult = await page.evaluate(async () => {
      return new Promise<Record<string, string>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("GET_SAVES timed out"));
        }, 3000);

        function handler(event: MessageEvent) {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "ROPODUCTIONS_SAVES_DATA") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(event.data.payload.slots);
          }
        }

        window.addEventListener("message", handler);
        window.postMessage({ type: "ROPODUCTIONS_GET_SAVES" }, window.location.origin);
      });
    });

    expect(queryResult.file1).toBeDefined();

    // 3. Test ROPODUCTIONS_RESET_SAVES
    const resetResult = await page.evaluate(async () => {
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("RESET_SAVES timed out"));
        }, 3000);

        function handler(event: MessageEvent) {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "ROPODUCTIONS_RESET_SAVES_SUCCESS") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(event.data.type);
          }
        }

        window.addEventListener("message", handler);
        window.postMessage({ type: "ROPODUCTIONS_RESET_SAVES" }, window.location.origin);
      });
    });

    expect(resetResult).toBe("ROPODUCTIONS_RESET_SAVES_SUCCESS");
  });
});
