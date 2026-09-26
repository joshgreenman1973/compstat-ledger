// Loads the built page in headless Chromium with every outside request served from local files
// (the Sept. 20, 2026 report, the archive, RTCI), then saves a screenshot
// and, with "text": true, the page's visible text for check.py.
// Usage: SP=<work dir> PORT=5055 node shot.js '[{"name":"cw","w":1280,"expand":true,"text":true}]'
const { chromium } = require('playwright');
const fs = require('fs');
const SP = process.env.SP;
const PORT = process.env.PORT || 5055;
(async () => {
  const browser = await chromium.launch();
  const specs = JSON.parse(process.argv[2]);
  let bad = 0;
  for (const s of specs) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h || 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    // Later routes win, so the catch-all abort goes first.
    await page.route(/^https:\/\/(?!localhost).*/, (r) => r.abort());
    await page.route('**/latest_compstat.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/latest.json') }));
    await page.route('**/data/index.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/scraper/data/index.json') }));
    await page.route('**/data/archive/*.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/scraper/data/archive/' + r.request().url().split('/').pop()) }));
    await page.route('**/scorecard.csv', (r) => r.fulfill({ status: 200, contentType: 'text/csv', body: fs.readFileSync(SP + '/rtci.csv') }));
    await page.goto(`http://localhost:${PORT}/` + (s.q || ''), { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (s.expand) {
      await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /show the math/i.test(b.textContent)).forEach((b) => b.click()));
      await page.waitForTimeout(300);
    }
    if (s.scroll) { await page.evaluate((id) => document.getElementById(id)?.scrollIntoView(), s.scroll); await page.waitForTimeout(300); }
    await page.screenshot({ path: `${SP}/${s.name}.png`, fullPage: !!s.full });
    if (s.text) fs.writeFileSync(`${SP}/${s.name}.txt`, await page.evaluate(() => document.body.innerText));
    console.log(s.name, errors.length ? errors.join('\n') : 'no errors');
    bad += errors.length;
    await ctx.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
