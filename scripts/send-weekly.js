#!/usr/bin/env node
/**
 * Weekly precinct brief: build one email per subscribed precinct and send it through Buttondown.
 *
 *   node scripts/send-weekly.js --dry-run                 # render previews to scripts/preview/, send nothing
 *   node scripts/send-weekly.js --dry-run --geo citywide  # one specific geography
 *   node scripts/send-weekly.js --check                   # verify the API key and show who is subscribed
 *   node scripts/send-weekly.js --send                    # the real thing (used by GitHub Actions)
 *
 * Sending requires BUTTONDOWN_API_KEY. Nothing else in this repo needs it.
 */

const fs = require('fs');
const path = require('path');
const { fetchReport } = require('./lib/report');
const { renderEmail } = require('./lib/render-email');
const { geoToTag, tagToGeo, SUBSCRIBABLE } = require('./lib/geos');

const API = 'https://api.buttondown.com/v1';
const KEY = process.env.BUTTONDOWN_API_KEY;

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const val = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};

const die = (msg) => {
  console.error(`\nFAILED: ${msg}\n`);
  process.exit(1);
};

async function bd(pathname, options = {}) {
  if (!KEY) die('BUTTONDOWN_API_KEY is not set.');
  const resp = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Token ${KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!resp.ok) {
    const err = new Error(`Buttondown ${options.method || 'GET'} ${pathname} -> HTTP ${resp.status}: ${text.slice(0, 500)}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Every confirmed subscriber, following Buttondown's pagination. */
async function allSubscribers() {
  const out = [];
  let page = 1;
  for (;;) {
    const data = await bd(`/subscribers?page=${page}`);
    const results = (data && data.results) || [];
    out.push(...results);
    if (!data || !data.next || results.length === 0) break;
    page += 1;
    if (page > 50) break; // hard stop; 50 pages is far more than this list will ever be
  }
  return out;
}

/** tag -> [subscriber], keeping only tags that map to a geography we publish. */
function groupByGeo(subscribers) {
  const groups = new Map();
  subscribers.forEach((s) => {
    const state = s.subscriber_type || s.type || 'regular';
    if (state === 'unactivated' || state === 'unsubscribed') return;
    (s.tags || []).forEach((tag) => {
      const name = typeof tag === 'string' ? tag : tag.name;
      const geo = tagToGeo(name);
      if (!geo) return;
      if (!groups.has(geo)) groups.set(geo, []);
      groups.get(geo).push(s.email_address || s.email);
    });
  });
  return groups;
}

/** Has a brief for this week already gone out? Buttondown holds the record, so no local state file. */
async function alreadySentFor(weekEnd) {
  try {
    const data = await bd('/emails?ordering=-publish_date&page=1');
    const results = (data && data.results) || [];
    return results.some((e) => e && e.metadata && e.metadata.compstat_week_end === weekEnd);
  } catch (e) {
    console.warn(`Could not check for an earlier send (${e.message}). Continuing.`);
    return false;
  }
}

async function sendOne({ subject, html, geo, weekEnd }) {
  const created = await bd('/emails', {
    method: 'POST',
    body: JSON.stringify({
      subject,
      body: `<!-- buttondown-editor-mode: fancy -->${html}`,
      email_type: 'private', // subscriber-only; keeps per-precinct briefs out of the public archive
      status: 'draft',
      metadata: { compstat_week_end: weekEnd, compstat_geo: geo },
      filters: {
        predicate: 'and',
        groups: [],
        filters: [{ field: 'tag', operator: 'equals', value: geoToTag(geo) }],
      },
    }),
  });
  if (!created || !created.id) die(`Buttondown created no email for ${geo}`);
  await bd(`/emails/${created.id}/publish`, { method: 'POST', body: JSON.stringify({}) });
  return created.id;
}

async function main() {
  const dryRun = has('--dry-run');
  const check = has('--check');
  const send = has('--send');
  if (!dryRun && !check && !send) die('Pass one of --dry-run, --check or --send.');

  if (check) {
    const subs = await allSubscribers();
    const groups = groupByGeo(subs);
    console.log(`Subscribers: ${subs.length}`);
    if (groups.size === 0) console.log('No subscriber carries a precinct tag yet.');
    [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([geo, list]) => {
      console.log(`  ${geo.padEnd(18)} ${list.length}`);
    });
    return;
  }

  const report = await fetchReport();
  const weekEnd = report.citywide.report_period.week_end;

  if (dryRun) {
    const only = val('--geo');
    const geos = only ? [only] : ['citywide', '20th Precinct', '75th Precinct'];
    const dir = path.join(__dirname, 'preview');
    fs.mkdirSync(dir, { recursive: true });
    geos.forEach((geo) => {
      const { subject, html } = renderEmail(report, geo);
      const file = path.join(dir, `${geo.replace(/\W+/g, '-').toLowerCase()}.html`);
      fs.writeFileSync(file, html);
      console.log(`${geo}\n  subject: ${subject}\n  preview: ${file}`);
    });
    console.log(`\nWeek ending ${weekEnd}. Nothing was sent.`);
    return;
  }

  // --send
  if (!has('--force') && (await alreadySentFor(weekEnd))) {
    console.log(`A brief for the week ending ${weekEnd} has already gone out. Nothing to do.`);
    return;
  }

  const subs = await allSubscribers();
  const groups = groupByGeo(subs);
  if (groups.size === 0) {
    console.log('No tagged subscribers. Nothing to send.');
    return;
  }

  const results = [];
  for (const [geo, list] of groups.entries()) {
    if (!SUBSCRIBABLE.has(geo)) {
      console.warn(`Skipping unknown geography "${geo}"`);
      continue;
    }
    if (!report[geo]) {
      console.warn(`Skipping ${geo}: this week's report has no data for it`);
      continue;
    }
    const { subject, html } = renderEmail(report, geo);
    const id = await sendOne({ subject, html, geo, weekEnd });
    console.log(`sent ${geo} to ${list.length} subscriber${list.length === 1 ? '' : 's'} (email ${id})`);
    results.push(geo);
  }
  if (results.length === 0) die('Subscribers exist but no email could be built for any of them.');
  console.log(`\nDone. ${results.length} brief${results.length === 1 ? '' : 's'} sent for the week ending ${weekEnd}.`);
}

main().catch((e) => die(e.message));
