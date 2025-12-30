import { test, expect } from '@playwright/test';

test('TB page renders accounts correctly', async ({ page }) => {
  await page.goto('/tb?orgId=bf6c00c9-de64-4450-ba26-e7445eddb4da&from=2025-10-01&to=2025-11-30');

  // Wait for page to be interactive
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // Assert: No Next.js error overlay
  const errorOverlay = page.locator('text=/Build Error|Runtime Error/');
  await expect(errorOverlay).toHaveCount(0);

  // Wait for page content to load (wait for any text content)
  await page.waitForFunction(
    () => document.body.textContent && document.body.textContent.length > 100,
    { timeout: 30000 }
  );

  // Wait additional time for API call to complete
  await page.waitForTimeout(5000);

  // Get page text content for debugging
  const bodyText = await page.textContent('body') || '';
  console.log('Page contains "TB":', bodyText.includes('TB'));
  console.log('Page contains "Trial Balance":', bodyText.includes('Trial Balance'));

  // Check if table exists
  const tableCount = await page.locator('table').count();
  console.log('Table count:', tableCount);

  if (tableCount > 0) {
    // Wait for table rows
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Assert: "Checking" and "Savings" are visible (case-insensitive)
    const checkingVisible = await page.locator('text=/Checking/i').count() > 0;
    const savingsVisible = await page.locator('text=/Savings/i').count() > 0;
    
    console.log('Checking visible:', checkingVisible);
    console.log('Savings visible:', savingsVisible);

    expect(checkingVisible).toBe(true);
    expect(savingsVisible).toBe(true);

    // Assert: table tbody has > 5 rows
    const tbodyRows = page.locator('table tbody tr');
    const rowCount = await tbodyRows.count();
    console.log('Row count:', rowCount);
    expect(rowCount).toBeGreaterThan(5);

    console.log(`✅ TB test passed: Found ${rowCount} rows in table`);
  } else {
    // Debug: take screenshot
    await page.screenshot({ path: 'test-results/tb-debug.png', fullPage: true });
    console.log('Body text snippet:', bodyText.substring(0, 1000));
    throw new Error('Table not found on page');
  }
});

