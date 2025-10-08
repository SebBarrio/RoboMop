import { test, expect } from "@playwright/test";

const baseUrl =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.E2E_BASE_URL ?? "http://localhost:5173";

test.describe("Restricted zones", () => {
  test("user can paint and save a restricted zone", async ({ page }) => {
    await page.goto(baseUrl);

    const mapRegion = page.getByRole("region", { name: /map viewer/i });
    await expect(mapRegion).toBeVisible();

    const zoneTool = page.getByRole("button", { name: /paint restricted zone/i });
    await expect(zoneTool).toBeVisible();
    await zoneTool.click();
    await expect(zoneTool).toHaveAttribute("aria-pressed", "true");

    const canvas = mapRegion.getByTestId("map-canvas");
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
      throw new Error("Map canvas bounding box unavailable");
    }

    const { x, y, width, height } = canvasBox;

    await page.mouse.move(x + width * 0.2, y + height * 0.2);
    await page.mouse.down();
    await page.mouse.up();

    await page.mouse.move(x + width * 0.4, y + height * 0.2);
    await page.mouse.down();
    await page.mouse.up();

    await page.mouse.move(x + width * 0.4, y + height * 0.4);
    await page.mouse.down();
    await page.mouse.up();

    await page.mouse.move(x + width * 0.2, y + height * 0.4);
    await page.mouse.down();
    await page.mouse.up();

    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: /new restricted zone/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: /zone name/i }).fill("Test Zone");
    await dialog.getByRole("button", { name: /save zone/i }).click();

    await expect(page.getByRole("alert")).toContainText(/zone created/i);

    const zoneList = page.getByRole("list", { name: /restricted zones/i });
    await expect(zoneList.getByRole("listitem", { name: /test zone/i })).toBeVisible();
  });
});
