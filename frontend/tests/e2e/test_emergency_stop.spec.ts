import { test, expect } from "@playwright/test";

const baseUrl =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.E2E_BASE_URL ?? "http://localhost:5173";

test.describe("Emergency stop", () => {
  test("triggers immediate halt and lockout", async ({ page }) => {
    await page.goto(baseUrl);

    const emergencyButton = page.getByRole("button", { name: /emergency stop/i });
    await expect(emergencyButton).toBeVisible();

    await emergencyButton.click();

    await expect(page.getByRole("alert")).toContainText(/emergency stop engaged/i);

    const commandLog = page.getByRole("list", { name: /command history/i });
    await expect(commandLog.getByRole("listitem").first()).toHaveText(/e-stop/i);

    const manualRegion = page.getByRole("region", { name: /manual control/i });
    await expect(manualRegion.getByRole("button", { name: /forward/i })).toBeDisabled();
    await expect(manualRegion.getByRole("button", { name: /rotate left/i })).toBeDisabled();

    const resetButton = page.getByRole("button", { name: /reset e-stop/i });
    await expect(resetButton).toBeVisible();
  });
});
