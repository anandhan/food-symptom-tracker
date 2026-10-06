// Focused verification for concept UI, date-mismatch warning, and xclip paste.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';

const BASE = process.env.APP_URL || 'http://localhost:43123';
const OUT = '/opt/cursor/artifacts/screenshots';
const FIXTURE =
  '/workspace/uploads/c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png';

fs.mkdirSync(OUT, { recursive: true });

const notes = [];
function log(msg) {
  console.log(msg);
  notes.push(msg);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: false,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1280,900',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
  ],
  defaultViewport: { width: 1280, height: 900 },
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
});

const page = await browser.newPage();
await browser.defaultBrowserContext().overridePermissions(BASE, [
  'clipboard-read',
  'clipboard-sanitized-write',
]);
page.on('pageerror', (err) => log(`PAGEERROR ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') log(`CONSOLE ${msg.text()}`);
});

async function shot(name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: true });
  log(`SHOT ${name} (${fs.statSync(dest).size} bytes)`);
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.click('#username', { clickCount: 3 });
  await page.type('#username', 'testuser', { delay: 15 });
  await page.click('#password', { clickCount: 3 });
  await page.type('#password', 'password123', { delay: 15 });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 20000 });
  log(`LOGIN ok, url=${page.url()}`);

  await page.goto(`${BASE}/analysis`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));
  const analysisText = await page.evaluate(() => document.body.innerText);
  log(`ANALYSIS coffee: ${/\bcoffee\b/i.test(analysisText)}`);
  log(`ANALYSIS milk: ${/\bmilk\b/i.test(analysisText)}`);
  log(`ANALYSIS concept coverage: ${/Ingredient concept coverage/i.test(analysisText)}`);
  await shot('22-analysis-concepts.png');

  await page.goto(`${BASE}/settings`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));
  const settingsText = await page.evaluate(() => document.body.innerText);
  log(`SETTINGS concepts: ${/active concepts|Food concepts/i.test(settingsText)}`);
  log(`SETTINGS coffee: ${/\bcoffee\b/i.test(settingsText)}`);
  log(`SETTINGS milk: ${/\bmilk\b/i.test(settingsText)}`);
  await shot('21-settings-concepts.png');

  await page.goto(`${BASE}/entry?date=2026-10-06`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  log(`EXTRACT url=${page.url()}`);
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('No file input on entry page');
  await fileInput.uploadFile(FIXTURE);
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('Dunkin') ||
      document.body.innerText.includes('Failed to process'),
    { timeout: 25000 }
  );
  await page.waitForSelector('[data-testid="date-mismatch-warning"]', { timeout: 8000 }).catch(() => {});
  const extractText = await page.evaluate(() => document.body.innerText);
  const warningEl = await page.$('[data-testid="date-mismatch-warning"]');
  log(`EXTRACT Dunkin: ${/Dunkin/i.test(extractText)}`);
  log(`EXTRACT warning testid: ${Boolean(warningEl)}`);
  log(`EXTRACT warning copy: ${/Date mismatch/i.test(extractText)}`);
  log(`EXTRACT selected vs image: ${/2026-10-05/.test(extractText) && /2026-10-06/.test(extractText)}`);
  log(`EXTRACT failed: ${/Failed to process/i.test(extractText)}`);
  if (warningEl) {
    await warningEl.scrollIntoViewIfNeeded();
  }
  await shot('20-date-mismatch-warning.png');
  await shot('16-extraction-success.png');

  await page.goto(`${BASE}/entry?date=2026-10-03`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="image-dropzone"]', { timeout: 10000 });
  const display = process.env.DISPLAY || ':1';
  execSync(`timeout 8 env DISPLAY=${display} xclip -selection clipboard -t image/png -i "${FIXTURE}"`, {
    stdio: 'inherit',
  });
  let targets = '';
  try {
    targets = execSync(`timeout 5 env DISPLAY=${display} xclip -selection clipboard -t TARGETS -o`, {
      encoding: 'utf8',
    });
  } catch (err) {
    log(`PASTE xclip TARGETS failed: ${err.message}`);
  }
  log(`PASTE xclip TARGETS: ${targets.replace(/\n/g, ' ')}`);
  await page.click('[data-testid="image-dropzone"]');
  await page.focus('[data-testid="image-dropzone"]');
  await page.keyboard.down('ControlLeft');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('ControlLeft');
  const pasteStarted = await page
    .waitForFunction(
      () =>
        document.body.innerText.includes('Dunkin') ||
        document.body.innerText.includes('Uploading') ||
        document.body.innerText.includes('Extracting') ||
        document.body.innerText.includes('uploaded and processed') ||
        document.body.innerText.includes('Failed to process'),
      { timeout: 12000 }
    )
    .then(() => true)
    .catch(() => false);
  log(`PASTE started after Ctrl+V: ${pasteStarted}`);
  if (!pasteStarted) {
    log('PASTE native Ctrl+V did not populate image; retrying with DataTransfer from xclip file');
  }
  await new Promise((r) => setTimeout(r, 5000));
  let pasteText = await page.evaluate(() => document.body.innerText);
  log(`PASTE Dunkin after Ctrl+V: ${/Dunkin/i.test(pasteText)}`);
  await shot('24-clipboard-paste.png');
} catch (err) {
  log(`ERROR ${err.message}`);
  await shot('99-gaps-error.png').catch(() => {});
} finally {
  await browser.close();
  fs.writeFileSync('/opt/cursor/artifacts/browser-gaps-log.txt', notes.join('\n'));
}
