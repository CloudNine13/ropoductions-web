import { test, expect } from "@playwright/test";

test.describe("21+ age gate", () => {
  test("blocks first-time visitors until they confirm", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("21+ AGE VERIFICATION REQUIRED")).toBeVisible();

    await dialog.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await expect(dialog).toBeHidden();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "ropoductions_age_verified")?.value).toBe("true");
  });

  test("stays dismissed for verified visitors across reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "I AM 21 OR OLDER - ENTER" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.reload();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("exit attempts leaving for the configured redirect target", async ({ page }) => {
    await page.goto("/");
    await page.route("https://google.com/**", (route) => route.abort());

    const leave = page.waitForRequest("https://google.com/");
    await page.getByRole("button", { name: "EXIT SITE" }).click();
    await leave;
  });
});
