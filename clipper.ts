import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import * as path from 'node:path';

chromium.use(StealthPlugin());

function ask(question: string): Promise<string> {
  const reader = readline.createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => {
    reader.question(question, (answer) => {
      reader.close();
      resolve(answer);
    });
  });
}

function randomDelayMs(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

const RESTRICTED_TEXT = /Access is temporarily restricted/i;

const userDataDir = path.resolve('./.playwright-profile');
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome',
  headless: false,
  viewport: null,
});
const page = context.pages()[0] ?? await context.newPage();

async function isRestricted(): Promise<boolean> {
  for (const frame of page.frames()) {
    const text = await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (RESTRICTED_TEXT.test(text)) {
      return true;
    }
  }
  return false;
}

async function bailIfRestricted(): Promise<void> {
  if (await isRestricted()) {
    console.error('Access has been temporarily restricted by Stop & Shop. Try again later.');
    await context.close();
    process.exit(2);
  }
}

async function waitUntilRestricted(): Promise<void> {
  while (true) {
    if (await isRestricted()) {
      return;
    }
    await page.waitForTimeout(1_000);
  }
}

await page.goto('https://stopandshop.com/savings/coupons/browse');
await page.waitForLoadState('domcontentloaded');

await bailIfRestricted();

const signInTrigger = page.getByRole('button', { name: /sign in/i }).first();
const signInVisible = await signInTrigger
  .waitFor({ state: 'visible', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);

if (signInVisible) {
  console.log('Not logged in. Sign in manually in the browser window — the script will wait.');
  const result = await Promise.race([
    signInTrigger.waitFor({ state: 'hidden', timeout: 0 }).then(() => 'logged-in' as const),
    waitUntilRestricted().then(() => 'restricted' as const),
  ]);
  if (result === 'restricted') {
    await bailIfRestricted();
  }
  console.log('Detected sign in. Continuing...');
  await page.goto('https://stopandshop.com/savings/coupons/browse');
}

await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
await bailIfRestricted();

const clipButtons = page.locator('button:has-text("Clip Coupon")');
const showMoreButton = page.locator('button:has-text("Show More")');

while (true) {
  let remaining = await clipButtons.count();
  while (remaining > 0) {
    await clipButtons.first().click();
    console.log('Clipped coupon.');
    await page.waitForTimeout(randomDelayMs(300, 800));
    await bailIfRestricted();
    remaining = await clipButtons.count();
  }

  const hasShowMore = await showMoreButton.first().isVisible().catch(() => false);
  if (!hasShowMore) {
    break;
  }

  const previousCount = await clipButtons.count();
  await showMoreButton.first().click();

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const current = await clipButtons.count();
    const showMoreGone = !(await showMoreButton.first().isVisible().catch(() => false));
    if (current > previousCount || (current === 0 && showMoreGone)) {
      break;
    }
    await page.waitForTimeout(200);
  }
  await bailIfRestricted();
}

console.log('All coupons have been clipped.');
await context.close();
process.exit(0);
