import { test, expect } from "@playwright/test";

test.describe("language switcher", () => {
  test("switches the portal to Japanese and persists across reloads", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Select language" }).click();
    await page.getByRole("menuitemradio", { name: /日本語/ }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByText("21歳以上 年齢確認が必要です")).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "ropoductions_lang")?.value).toBe("ja");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });
});
