import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:43123';
const JSON_PATH = fs
  .readdirSync('/tmp/food-tracker-downloads')
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.join('/tmp/food-tracker-downloads', f))[0];

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('dialog', async (d) => {
  console.log('DIALOG', d.message());
  await d.accept();
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await page.waitForSelector('#username');
await page.type('#username', 'testuser', { delay: 15 });
await page.type('#password', 'password123', { delay: 15 });
await page.click('button[type="submit"]');
await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 20000 });

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
const input = await page.$('#import-file');
if (!input) throw new Error('import input missing');
await input.uploadFile(JSON_PATH);
await new Promise((r) => setTimeout(r, 4000));
const text = await page.evaluate(() => document.body.innerText);
console.log('IMPORT page has Importing:', /Importing/i.test(text));
await page.screenshot({
  path: '/opt/cursor/artifacts/screenshots/17-import-restore.png',
  fullPage: true,
});
console.log('SHOT 17-import-restore.png');
await browser.close();
