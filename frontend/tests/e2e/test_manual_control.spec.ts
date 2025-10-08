import { test, expect } from "@playwright/test";

const baseUrl =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.E2E_BASE_URL ?? "http://localhost:5173";

test.describe("Manual control jogging", () => {
  test("user can jog robot and adjust speed", async ({ page }) => {
    await page.goto(baseUrl);

    const manualRegion = page.getByRole("region", { name: /manual control/i });
    await expect(manualRegion).toBeVisible();

    const modeSelector = page.getByRole("combobox", { name: /mode/i });
    await expect(modeSelector).toBeVisible();
    await modeSelector.selectOption({ label: "Manual" });

    const speedSlider = page.getByRole("slider", { name: /speed/i });
    await expect(speedSlider).toBeVisible();

    const sliderHandle = await speedSlider.elementHandle();
    await sliderHandle?.evaluate((element) => {
      const slider = element as HTMLInputElement;
      slider.value = "75";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.getByText(/speed: 75%/i)).toBeVisible();

    const commandLog = page.getByRole("list", { name: /command history/i });
    await expect(commandLog).toBeVisible();
    await expect(commandLog.getByRole("listitem")).toHaveCount(0);

    const forwardButton = manualRegion.getByRole("button", { name: /forward/i });
    const rotateLeftButton = manualRegion.getByRole("button", { name: /rotate left/i });
    const stopButton = manualRegion.getByRole("button", { name: /stop/i });

    await forwardButton.click();
    await expect(commandLog.getByRole("listitem").first()).toHaveText(/forward/i);

    await rotateLeftButton.click();
    await expect(commandLog.getByRole("listitem").first()).toHaveText(/rotate left/i);

    await stopButton.click();
    await expect(commandLog.getByRole("listitem").first()).toHaveText(/stop/i);

    const emergencyButton = page.getByRole("button", { name: /emergency stop/i });
    await expect(emergencyButton).toBeVisible();
  });
});
