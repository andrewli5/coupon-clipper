import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('https://stopandshop.com/savings/coupons/browse');
// Log in...
await page.fill('#email', 'your@email.com');
await page.fill('#password', 'yourpassword');
await page.click('[type="submit"]');

// Find and click all unclipped coupon buttons
const clipButtons = page.locator('button:has-text("Clip Coupon")'); // selector will vary
const count = await clipButtons.count();
for (let i = 0; i < count; i++) {
  await clipButtons.nth(i).click();
  await page.waitForTimeout(500); // be polite, don't hammer the server
}