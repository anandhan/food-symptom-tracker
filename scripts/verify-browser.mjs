// Headless Chrome verification. Writes screenshots to /opt/cursor/artifacts/screenshots/

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';

const BASE = process.env.APP_URL || 'http://localhost:43123';
const OUT = '/opt/cursor/artifacts/screenshots';
const DOWNLOADS = '/tmp/food-tracker-downloads';
const FIXTURE =
  '/workspace/uploads/c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DOWNLOADS, { recursive: true });

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
const context = browser.defaultBrowserContext();
await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-sanitized-write']);
page.on('pageerror', (err) => log(`PAGEERROR ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') log(`CONSOLE ${msg.text()}`);
});
const client = await page.createCDPSession();
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: DOWNLOADS,
});

async function shot(name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: true });
  log(`SHOT ${name} (${fs.statSync(dest).size} bytes)`);
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  await shot('01-login.png');
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.click('#username', { clickCount: 3 });
  await page.type('#username', 'testuser', { delay: 20 });
  await page.click('#password', { clickCount: 3 });
  await page.type('#password', 'password123', { delay: 20 });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 20000 });
  log(`LOGIN ok, url=${page.url()}`);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const dashText = await page.evaluate(() => document.body.innerText);
  log(`DASHBOARD today-line: ${(dashText.match(/Today[^\n]*/)?.[0] || 'NOT FOUND')}`);
  log(`DASHBOARD has Top Foods: ${/Top Foods/i.test(dashText)}`);
  log(`DASHBOARD has bad-day foods: ${/Associated with Bad Days/i.test(dashText)}`);
  log(`DASHBOARD has good-day foods: ${/Associated with Good Days/i.test(dashText)}`);
  log(`DASHBOARD has trend: ${/Symptom Trend/i.test(dashText)}`);
  log(`DASHBOARD has weekly: ${/Latest Weekly Report/i.test(dashText)}`);
  await shot('02-dashboard.png');

  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#food-search', { timeout: 10000 });
  await page.click('#food-search', { clickCount: 3 });
  await page.type('#food-search', 'chicken');
  await new Promise((r) => setTimeout(r, 400));
  const afterFood = await page.evaluate(() => document.body.innerText);
  log(`HISTORY food search Showing: ${(afterFood.match(/Showing[^\n]*/)?.[0] || '?')}`);
  await shot('03-history-search-food.png');

  await page.click('#food-search', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#note-search', 'bloating');
  await new Promise((r) => setTimeout(r, 400));
  const afterNotes = await page.evaluate(() => document.body.innerText);
  log(`HISTORY notes search Showing: ${(afterNotes.match(/Showing[^\n]*/)?.[0] || '?')}`);
  await shot('04-history-search-notes.png');

  await page.click('#note-search', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.click('#rating-filter');
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  const badOpt = await page.evaluateHandle(() =>
    [...document.querySelectorAll('[role="option"]')].find((o) => /Bad/i.test(o.textContent || '') && !/Very/i.test(o.textContent || ''))
  );
  if (badOpt.asElement()) await badOpt.asElement().click();
  await new Promise((r) => setTimeout(r, 400));
  const afterRating = await page.evaluate(() => document.body.innerText);
  log(`HISTORY rating Bad Showing: ${(afterRating.match(/Showing[^\n]*/)?.[0] || '?')}`);
  await shot('05-history-severity-filter.png');

  await page.goto(`${BASE}/food?food=${encodeURIComponent('Coffee')}`, { waitUntil: 'networkidle2' });
  const foodText = await page.evaluate(() => document.body.innerText);
  log(`PER-FOOD has Times Eaten: ${/Times Eaten/i.test(foodText)}`);
  log(`PER-FOOD has same-day: ${/Same-Day Symptom Rate/i.test(foodText)}`);
  log(`PER-FOOD has next-day: ${/Next-Day Symptom Rate/i.test(foodText)}`);
  log(`PER-FOOD has comparison: ${/Comparison/i.test(foodText)}`);
  await shot('08-per-food-detail.png');

  await page.goto(`${BASE}/analysis`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  const analysisText = await page.evaluate(() => document.body.innerText);
  log(`ANALYSIS has concept coverage: ${/Ingredient concept coverage|coffee/i.test(analysisText)}`);
  log(`ANALYSIS has coffee: ${/\bcoffee\b/i.test(analysisText)}`);
  log(`ANALYSIS has milk: ${/\bmilk\b/i.test(analysisText)}`);
  await shot('22-analysis-concepts.png');

  await page.goto(`${BASE}/entry?date=2026-10-06`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  log(`EXTRACT url=${page.url()}`);
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('No file input on entry page');
  await fileInput.uploadFile(FIXTURE);
  await page.waitForFunction(
    () => document.body.innerText.includes('Dunkin') || document.body.innerText.includes('Failed to process'),
    { timeout: 25000 }
  );
  await page.waitForSelector('[data-testid="date-mismatch-warning"]', { timeout: 8000 }).catch(() => {});
  const extractText = await page.evaluate(() => document.body.innerText);
  const warningEl = await page.$('[data-testid="date-mismatch-warning"]');
  log(`EXTRACT has Dunkin: ${/Dunkin/i.test(extractText)}`);
  log(`EXTRACT has Wellwish: ${/Wellwish/i.test(extractText)}`);
  log(`EXTRACT date warning testid: ${Boolean(warningEl)}`);
  log(`EXTRACT date warning text: ${/date mismatch|you're editing|Oct|2026-10-05/i.test(extractText)}`);
  log(`EXTRACT failed?: ${/Failed to process/i.test(extractText)}`);
  await shot('16-extraction-success.png');
  await shot('13-extraction-meals.png');
  await shot('20-date-mismatch-warning.png');

  const saveBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /Save/i.test(b.textContent || ''))
  );
  if (saveBtn.asElement()) {
    page.once('dialog', async (d) => {
      log(`EXTRACT save dialog: ${d.message()}`);
      await d.accept();
    });
    await saveBtn.asElement().click();
    await new Promise((r) => setTimeout(r, 2000));
  }

  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const settingsText = await page.evaluate(() => document.body.innerText);
  log(`SETTINGS has concept review: ${/Food concepts|active concepts/i.test(settingsText)}`);
  log(`SETTINGS has coffee concept: ${/\bcoffee\b/i.test(settingsText)}`);
  log(`SETTINGS has milk concept: ${/\bmilk\b/i.test(settingsText)}`);
  await shot('09-settings-export.png');
  await shot('21-settings-concepts.png');
  const jsonBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /Download JSON/i.test(b.textContent || ''))
  );
  if (jsonBtn.asElement()) await jsonBtn.asElement().click();
  await new Promise((r) => setTimeout(r, 2500));
  const jsonFiles = fs.readdirSync(DOWNLOADS).filter((f) => f.endsWith('.json'));
  log(`EXPORT json files: ${jsonFiles.join(', ') || 'NONE'}`);
  if (jsonFiles[0]) {
    const raw = fs.readFileSync(path.join(DOWNLOADS, jsonFiles[0]), 'utf8');
    const data = JSON.parse(raw);
    log(`EXPORT json version=${data.version} entries=${data.entries?.length} reports=${data.weeklyReports?.length}`);
    const hasFood = JSON.stringify(data).includes('rawText') || JSON.stringify(data).includes('foodItems');
    const hasSym = JSON.stringify(data).includes('symptomRecord') || JSON.stringify(data).includes('freeTextNotes');
    log(`EXPORT json has foods=${hasFood} symptoms=${hasSym}`);
    const preview = path.join(OUT, '10-exported-json.png');
    fs.writeFileSync('/tmp/export-preview.html', `<pre style="font:12px monospace;white-space:pre-wrap">${raw.slice(0, 4000).replace(/</g, '&lt;')}</pre>`);
    const previewPage = await browser.newPage();
    await previewPage.goto('file:///tmp/export-preview.html');
    await previewPage.screenshot({ path: preview, fullPage: true });
    await previewPage.close();
    log(`SHOT 10-exported-json.png`);
  }

  const csvBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /Download CSV/i.test(b.textContent || ''))
  );
  if (csvBtn.asElement()) await csvBtn.asElement().click();
  await new Promise((r) => setTimeout(r, 3000));
  const zipFiles = fs.readdirSync(DOWNLOADS).filter((f) => f.endsWith('.zip'));
  log(`EXPORT zip files: ${zipFiles.join(', ') || 'NONE'}`);
  if (zipFiles[0]) {
    const { execSync } = await import('child_process');
    const unzipDir = '/tmp/food-tracker-csv';
    fs.rmSync(unzipDir, { recursive: true, force: true });
    fs.mkdirSync(unzipDir, { recursive: true });
    execSync(`unzip -o "${path.join(DOWNLOADS, zipFiles[0])}" -d ${unzipDir}`);
    const csvs = fs.readdirSync(unzipDir);
    log(`EXPORT csv members: ${csvs.join(', ')}`);
    const foodCsv = fs.readFileSync(path.join(unzipDir, csvs.find((c) => c.includes('food')) || csvs[0]), 'utf8');
    log(`EXPORT food csv first line: ${foodCsv.split('\n')[0]}`);
    const foodConceptsCsv = csvs.find((c) => c.includes('concept'));
    if (foodConceptsCsv) {
      const conceptCsv = fs.readFileSync(path.join(unzipDir, foodConceptsCsv), 'utf8');
      const conceptRows = conceptCsv.split('\n').filter((l) => l.trim()).length - 1;
      log(`EXPORT food_concepts.csv rows: ${conceptRows}`);
      fs.writeFileSync(
        '/tmp/concepts-preview.html',
        `<pre style="font:12px monospace">${conceptCsv.slice(0, 3000).replace(/</g, '&lt;')}</pre>`
      );
      const conceptPage = await browser.newPage();
      await conceptPage.goto('file:///tmp/concepts-preview.html');
      await conceptPage.screenshot({ path: path.join(OUT, '23-food-concepts-csv.png'), fullPage: true });
      await conceptPage.close();
      log(`SHOT 23-food-concepts-csv.png`);
    }
    fs.writeFileSync('/tmp/csv-preview.html', `<pre style="font:12px monospace">${foodCsv.slice(0, 3000).replace(/</g, '&lt;')}</pre>`);
    const csvPage = await browser.newPage();
    await csvPage.goto('file:///tmp/csv-preview.html');
    await csvPage.screenshot({ path: path.join(OUT, '11-exported-csv.png'), fullPage: true });
    await csvPage.close();
    log(`SHOT 11-exported-csv.png`);
  }

  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle2' });
  const genBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /Generate/i.test(b.textContent || ''))
  );
  if (genBtn.asElement()) {
    await genBtn.asElement().click();
    await new Promise((r) => setTimeout(r, 4000));
  }
  const reportText = await page.evaluate(() => document.body.innerText);
  log(`REPORTS has week: ${/Week of/i.test(reportText)}`);
  await shot('12-reports-generated.png');

  // Cmd/Ctrl+V paste: copy fixture with xclip, paste on a different entry date
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/entry?date=2026-10-04`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="image-dropzone"]', { timeout: 10000 });
  const display = process.env.DISPLAY || ':1';
  try {
    execSync(`DISPLAY=${display} xclip -selection clipboard -t image/png -i "${FIXTURE}"`);
    const targets = execSync(`DISPLAY=${display} xclip -selection clipboard -t TARGETS -o`, {
      encoding: 'utf8',
    });
    log(`PASTE xclip TARGETS: ${targets.replace(/\n/g, ' ')}`);
  } catch (err) {
    log(`PASTE xclip failed: ${err.message}`);
  }
  await page.click('[data-testid="image-dropzone"]');
  await page.focus('[data-testid="image-dropzone"]');
  await page.keyboard.down('ControlLeft');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('ControlLeft');
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('Dunkin') ||
      document.body.innerText.includes('Uploading') ||
      document.body.innerText.includes('Extracting') ||
      document.body.innerText.includes('Failed to process'),
    { timeout: 15000 }
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  const pasteText = await page.evaluate(() => document.body.innerText);
  log(`PASTE has Dunkin: ${/Dunkin/i.test(pasteText)}`);
  log(`PASTE has extracting/uploaded: ${/Extracting|uploaded and processed|Uploading/i.test(pasteText)}`);
  log(`PASTE failed?: ${/Failed to process/i.test(pasteText)}`);
  await shot('24-clipboard-paste.png');

  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  await shot('06-mobile-view.png');
} catch (err) {
  log(`ERROR ${err.message}`);
  await shot('99-error.png').catch(() => {});
} finally {
  await browser.close();
  fs.writeFileSync('/opt/cursor/artifacts/browser-verify-log.txt', notes.join('\n'));
}
