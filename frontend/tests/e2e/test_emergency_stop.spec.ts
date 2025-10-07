/**
 * E2E Test: Emergency Stop (Scenario 5 from quickstart.md)
 * Tests emergency stop functionality from web interface
 * Requirements: FR-014, FR-036
 * Priority: P0 (Critical - Safety)
 */

import { test, expect } from '@playwright/test';

test.describe('Emergency Stop', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('should display emergency stop button prominently', async ({ page }) => {
    // Emergency stop button should always be visible
    const eStopButton = page.locator('[data-testid="emergency-stop"]');
    await expect(eStopButton).toBeVisible();
    
    // Verify it's styled as prominent (red, large)
    const buttonStyle = await eStopButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
      };
    });
    
    // Should have red-ish background (danger color)
    expect(buttonStyle.backgroundColor).toMatch(/rgb\(239, 68, 68\)|#ef4444/i);
  });

  test('should stop robot immediately when E-Stop clicked during manual movement', async ({ page }) => {
    // Enter manual mode
    const modeSelector = page.locator('[data-testid="mode-selector"]');
    await modeSelector.selectOption('MANUAL');
    
    // Start forward movement
    const forwardButton = page.locator('[data-testid="jogging-forward"]');
    await forwardButton.dispatchEvent('mousedown');
    
    // Wait a moment for movement to start
    await page.waitForTimeout(100);
    
    // Click E-Stop
    const eStopButton = page.locator('[data-testid="emergency-stop"]');
    const beforeStop = Date.now();
    await eStopButton.click();
    
    // Wait for command acknowledgement
    await page.waitForSelector('[data-testid="command-ack"]', { timeout: 1000 });
    const afterAck = Date.now();
    
    // Verify response time < 500ms (critical safety requirement)
    const responseTime = afterAck - beforeStop;
    expect(responseTime).toBeLessThan(500);
  });

  test('should stop robot in exploration mode', async ({ page }) => {
    // Select exploration mode
    const modeSelector = page.locator('[data-testid="mode-selector"]');
    await modeSelector.selectOption('EXPLORATION');
    
    // Wait for mode change
    await page.waitForTimeout(200);
    
    // Click E-Stop
    const eStopButton = page.locator('[data-testid="emergency-stop"]');
    await eStopButton.click();
    
    // Verify command sent (acknowledgement appears)
    await expect(page.locator('[data-testid="command-ack"]')).toBeVisible({ timeout: 1000 });
  });

  test('should stop robot in cleaning mode', async ({ page }) => {
    // Select cleaning mode
    const modeSelector = page.locator('[data-testid="mode-selector"]');
    await modeSelector.selectOption('CLEANING');
    
    // Wait for mode change
    await page.waitForTimeout(200);
    
    // Click E-Stop
    const eStopButton = page.locator('[data-testid="emergency-stop"]');
    await eStopButton.click();
    
    // Verify command sent
    await expect(page.locator('[data-testid="command-ack"]')).toBeVisible({ timeout: 1000 });
  });

  test('should be accessible via keyboard', async ({ page }) => {
    // E-Stop should be keyboard accessible for accessibility
    const eStopButton = page.locator('[data-testid="emergency-stop"]');
    
    // Focus the button
    await eStopButton.focus();
    
    // Press Enter or Space
    await page.keyboard.press('Enter');
    
    // Verify command sent
    await expect(page.locator('[data-testid="command-ack"]')).toBeVisible({ timeout: 1000 });
  });

  test('should work multiple times in succession', async ({ page }) => {
    const eStopButton = page.locator('[data-testid="emergency-stop"]');
    
    // Click E-Stop multiple times
    for (let i = 0; i < 3; i++) {
      await eStopButton.click();
      await page.waitForTimeout(100);
      
      // Each click should trigger acknowledgement
      await expect(page.locator('[data-testid="command-ack"]')).toBeVisible({ timeout: 1000 });
      await page.waitForTimeout(900); // Wait for ack to disappear
    }
  });

  test('should display confirmation that robot has stopped', async ({ page }) => {
    // Enter manual mode and start movement
    await page.locator('[data-testid="mode-selector"]').selectOption('MANUAL');
    await page.locator('[data-testid="jogging-forward"]').dispatchEvent('mousedown');
    
    // Wait for movement
    await page.waitForTimeout(100);
    
    // Click E-Stop
    await page.locator('[data-testid="emergency-stop"]').click();
    
    // Wait for acknowledgement
    await page.waitForSelector('[data-testid="command-ack"]', { timeout: 1000 });
    
    // Verify velocity returns to 0 (or status shows stopped)
    // Note: This requires real-time state updates via WebSocket
    await page.waitForTimeout(500);
    
    // Velocity should be 0.0 m/s
    const velocityText = await page.locator('[data-testid="velocity-display"]').textContent();
    expect(velocityText).toContain('0.0');
  });

  test('E-Stop latency measurement', async ({ page }) => {
    // This test measures end-to-end latency for E-Stop command
    // Critical requirement: < 500ms response time
    
    await page.locator('[data-testid="mode-selector"]').selectOption('MANUAL');
    await page.locator('[data-testid="jogging-forward"]').dispatchEvent('mousedown');
    await page.waitForTimeout(100);
    
    // Measure latency
    const latencies: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      await page.locator('[data-testid="emergency-stop"]').click();
      await page.waitForSelector('[data-testid="command-ack"]', { timeout: 1000 });
      const endTime = Date.now();
      
      latencies.push(endTime - startTime);
      await page.waitForTimeout(1000); // Wait between tests
    }
    
    // Calculate average latency
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    // Log results
    console.log(`E-Stop latencies (ms): ${latencies.join(', ')}`);
    console.log(`Average latency: ${avgLatency.toFixed(1)}ms`);
    
    // Verify average < 500ms
    expect(avgLatency).toBeLessThan(500);
    
    // Verify all individual latencies < 500ms
    for (const latency of latencies) {
      expect(latency).toBeLessThan(500);
    }
  });
});

