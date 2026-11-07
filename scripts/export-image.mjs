// Saves the current map as a 1200×1200 PNG (English) for posting.
// Usage: node scripts/export-image.mjs [site URL] [output file] [YYYY-MM-DD]
//   npm run export:image -- https://day16-you-were-here.<subdomain>.workers.dev docs/day16.png
// Requires Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const site = (process.argv[2] || process.env.SITE_URL || 'http://localhost:8787').replace(/\/$/, '');
const out = process.argv[3] || `docs/day16-${new Date().toISOString().slice(0, 10)}.png`;
const date = process.argv[4] || '';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1, colorScheme: 'light' });
const url = `${site}/?export=1&lang=en${date ? `&date=${date}` : ''}`;
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
await page.waitForTimeout(500);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 1200 } });
await browser.close();
console.log('saved', out, 'from', url);
