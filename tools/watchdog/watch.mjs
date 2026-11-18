// Renders both builds against NYPD's live feed and checks the text. See run.sh.
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../package.json'));
const { chromium } = require('playwright');
const WORK = process.argv[2];
const FEED = 'https://raw.githubusercontent.com/joshgreenman1973/nypd-compstat-scraper/main/data/latest_compstat.json';
const LIVE = ['https://compstat-ledger.vercel.app/', 'https://compstat-in-context-b.vercel.app/'];
const fails = [];
const fail = (msg) => { fails.push(msg); };

const feed = await (await fetch(FEED)).json();
const geos = Object.keys(feed).filter((k) => feed[k]?.seven_major_felonies);
const end = feed.citywide?.report_period?.week_end;
const [m, d, y] = (end || '').split('/').map(Number);
const ageDays = (Date.now() - Date.UTC(y, m - 1, d)) / 86400000;
// NYPD posts Sunday's report by Wednesday; 12 days means a week was missed.
if (!(ageDays < 12)) fail(`feed: the latest report ends ${end}, ${Math.floor(ageDays)} days ago (scraper or NYPD stalled)`);
if (geos.length < 80) fail(`feed: only ${geos.length} geographies (usually 88)`);

for (const u of LIVE) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const t = await r.text();
    if (!r.ok || !/<div id="root">/.test(t)) fail(`live: ${u} answered ${r.status}`);
  } catch (e) { fail(`live: ${u} unreachable (${e.message})`); }
}

const q = (o) => { const p = new URLSearchParams(o); const s = p.toString(); return s ? `?${s}` : ''; };
const boroughs = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];
const views = [
  ...geos.map((g) => ({ v: 'A', qs: q(g === 'citywide' ? {} : { geo: g }), period: 'ytd' })),
  { v: 'A', qs: q({ tab: 'wtd' }), period: 'wtd' },
  ...geos.filter((g) => g !== 'citywide').slice(0, 12).map((g) => ({ v: 'A', qs: q({ geo: g, tab: 'wtd' }), period: 'wtd' })),
  ...geos.map((g) => ({ v: 'B', qs: q(g === 'citywide' ? { period: 'wtd' } : { geo: g, period: 'wtd' }), period: 'wtd' })),
  ...['citywide', ...boroughs].flatMap((g) => ['ytd', 'd28'].map((p) => ({ v: 'B', qs: q({ ...(g === 'citywide' ? {} : { geo: g }), ...(p === 'ytd' ? {} : { period: p }) }), period: p }))),
];

// ONLY=<regex> limits the run to matching views (for testing the watchdog itself).
if (process.env.ONLY) { const re = new RegExp(process.env.ONLY); views.splice(0, views.length, ...views.filter((x) => re.test(`${x.v} ${x.qs}`))); }
const types = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const browser = await chromium.launch();
const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
for (const v of ['a', 'b']) {
  const dir = path.join(WORK, `${v}-build`);
  await ctx.route(`http://${v}.test/**`, (route) => {
    let f = path.join(dir, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
    route.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' });
  });
}

const BAD = [
  [/\bnull\b|\bNaN\b|\bundefined\b|Infinity|\[object Object\]/, 'a missing value printed'],
  [/(?<![\d.])[−-]0(?:\.0+)?%/, 'a "−0%"'],
  [/(?:Nov|Dec)\. \d{1,2}-Jan\. \d{1,2}, \d{4}/, 'a New Year date range without its first year'],
  [/Loading NYPD/, 'the page never finished loading'],
  [/\bNo of them\b|\bOne of them are\b|, and no show\b/, 'a garbled count sentence'],
  [/\bnew\s*·\s*0 vs\. 0\b/, '"new" printed for zero both years'],
];
async function check(view) {
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const url = `http://${view.v.toLowerCase()}.test/${view.qs}`;
  const label = `${view.v} ${view.qs || '(citywide)'}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    if (errs.length) fail(`${label}: script error: ${errs[0].slice(0, 120)}`);
    if (text.length < 3000) fail(`${label}: page nearly empty (${text.length} characters)`);
    for (const [re, what] of BAD) {
      const hit = text.match(re);
      if (hit) { const i = hit.index; fail(`${label}: ${what}: "…${text.slice(Math.max(0, i - 60), i + 30).replace(/\s+/g, ' ')}…"`); }
    }
    for (const hit of text.matchAll(/(\d{3,})(?:\.\d+)?% of (?:the |this |all )/g)) {
      if (+hit[1] > 100) fail(`${label}: a share over 100%: "${text.slice(Math.max(0, hit.index - 60), hit.index + 40).replace(/\s+/g, ' ')}"`);
    }
    if (view.v === 'A' && view.period === 'wtd') {
      // Weekly counts are never compared with whole years (audit A1).
      if (/LOWEST SINCE|HIGHEST SINCE|5-YR (?:LOW|HIGH) OUTLIER|major felonies compared are tracking/.test(text)) fail(`${label}: a weekly view compared with whole years`);
    }
  } catch (e) {
    fail(`${label}: didn't load (${e.message.split('\n')[0]})`);
  } finally { await page.close(); }
}
const queue = [...views];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await check(queue.shift()); }));
await browser.close();

const out = fails.length ? fails.map((f) => `FAIL ${f}`).join('\n') : `OK ${views.length} views of A and B clean on the report ending ${end}`;
fs.writeFileSync(path.join(WORK, 'last.txt'), `${new Date().toISOString()}\n${out}\n`);
console.log(out);
process.exit(fails.length ? 1 : 0);
