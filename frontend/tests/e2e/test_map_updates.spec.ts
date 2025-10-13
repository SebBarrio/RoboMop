import { test, expect } from "@playwright/test";

const baseUrl =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.E2E_BASE_URL ?? "http://localhost:5173";

test.describe("Real-time map updates", () => {
  test("renders map deltas within one second", async ({ page }) => {
    await page.goto(baseUrl);

    const mapRegion = page.getByRole("region", { name: /map viewer/i });
    await expect(mapRegion).toBeVisible();

    const canvas = mapRegion.getByTestId("map-canvas");
    await expect(canvas).toBeVisible();

    const updateTimestamp = await page.evaluate(() => {
      return window.__testkit.emitMapUpdate({
        mapId: "map-123",
        timestamp: new Date().toISOString(),
        updateType: "delta",
        cells: [
          { row: 10, col: 15, value: 180 },
          { row: 10, col: 16, value: 182 },
          { row: 11, col: 15, value: 178 },
        ],
      });
    });

    const updateIndicator = page.getByText(/last map update/i);
    await expect(updateIndicator).toBeVisible({ timeout: 1000 });
    await expect(updateIndicator).toContainText(updateTimestamp.slice(0, 19));

    await expect(canvas).toHaveAttribute("data-last-update", updateTimestamp);
  });
});
