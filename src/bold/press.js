/* ------------------------------------------------------------------ */
/* PRESS LAYER                                                         */
/* News coverage from the GDELT DOC 2.0 API (free, no key, CORS "*").  */
/* GDELT searches a rolling three-month window, matches by keyword and */
/* asks callers to space requests at least five seconds apart. These   */
/* are unverified keyword matches: context, never counted in a figure. */
/* ------------------------------------------------------------------ */
import { parseMDY } from './stats';

export const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
export const GDELT_WINDOW_DAYS = 90;
const SPACING_MS = 5500;

// Crime families, phrased the way news copy words them.
export const PRESS_TERMS = {
  murder: ['murder', 'homicide', '"fatally shot"', '"stabbed to death"', '"shot dead"'],
  shooting: ['shooting', 'gunfire', '"was shot"', '"shot and wounded"'],
  violent: ['shooting', 'stabbing', 'slashing', 'robbery', 'assault', 'murder'],
  property: ['burglary', 'burglar', '"stolen car"', '"car theft"', 'larceny', 'shoplifting'],
};
export const PRESS_TERMS_FOR_MEASURE = { shootvic: 'shooting', violent: 'violent', murder: 'murder', majors: 'violent', property: 'property' };

// CompStat-style neighborhood labels → how newsrooms write them.
const CLEAN = [
  [/\bWash\.\s*/g, 'Washington '], [/\bWall St\b/g, 'Wall Street'], [/\bStuy Town\b/g, 'Stuyvesant Town'],
  [/\s+(North|South|East|West)$/g, ''],
];
export const cleanPlace = (s) => CLEAN.reduce((t, [re, rep]) => t.replace(re, rep), s.trim()).trim();

// Place names that routinely mean somewhere else (a country, a TV show, a London club, other states).
const AMBIGUOUS_ELSEWHERE = new Set(['Jamaica', 'Chelsea', 'Riverdale', 'Astoria', 'Elmhurst', 'Richmond Hill', 'Bayside', 'St. George']);

// { name → precinct key } for names that point to exactly one precinct.
export function buildPlaceIndex(neighborhoods) {
  const seen = {};
  Object.entries(neighborhoods || {}).forEach(([pct, hoods]) => {
    hoods.split(',').map(cleanPlace).filter((n) => n.length >= 4).forEach((n) => {
      (seen[n] = seen[n] || new Set()).add(pct);
    });
  });
  const index = {};
  Object.entries(seen).forEach(([name, set]) => {
    if (set.size === 1 && !AMBIGUOUS_ELSEWHERE.has(name)) index[name] = [...set][0];
  });
  return index;
}

// Precinct a headline names, if exactly one: an explicit "75th Precinct", else the longest
// unambiguous neighborhood name found (so "South Jamaica" beats a shorter overlapping name).
export function placeHeadline(title, placeIndex) {
  const t = title || '';
  const pm = t.match(/\b(\d{1,3})(st|nd|rd|th)\s+Precinct\b/i);
  if (pm) return { precinct: `${parseInt(pm[1], 10)}${pm[2].toLowerCase()} Precinct`, via: pm[0] };
  let best = null;
  Object.keys(placeIndex).forEach((name) => {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(t) && (!best || name.length > best.length)) best = name;
  });
  return best ? { precinct: placeIndex[best], via: best } : null;
}

// Geography terms for the query.
export function geoTerms(geo, neighborhoods) {
  if (geo === 'citywide') return ['NYPD', '"New York City"', 'Manhattan', 'Brooklyn', 'Bronx', 'Queens', '"Staten Island"'];
  if (geo.includes('Precinct')) {
    const hoods = (neighborhoods?.[geo] || '').split(',').map(cleanPlace).filter((n) => n.length >= 4);
    return [`"${geo}"`, ...hoods.map((h) => (h.includes(' ') ? `"${h}"` : h))];
  }
  const boro = ['Manhattan', 'Brooklyn', 'Bronx', 'Queens', 'Staten Island'].find((b) => geo.includes(b));
  return boro ? [boro.includes(' ') ? `"${boro}"` : boro, 'NYPD'] : ['NYPD'];
}

const group = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' OR ')})`);
export const buildQuery = (family, geoList) => `${group(PRESS_TERMS[family])} ${group(geoList)} sourcelang:english`;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

// The report period, clamped to what GDELT can search. `now` is injectable for tests.
export function pressWindow(periodId, reportPeriod, now = new Date()) {
  const end = parseMDY(reportPeriod?.week_end);
  if (!end) return null;
  const endDate = new Date(Date.UTC(end.y, end.m - 1, end.d, 23, 59, 59));
  let startDate;
  if (periodId === 'wtd') {
    const s = parseMDY(reportPeriod?.week_start);
    startDate = s ? new Date(Date.UTC(s.y, s.m - 1, s.d)) : new Date(endDate.getTime() - 6 * 86400000);
  } else if (periodId === 'd28') {
    startDate = new Date(Date.UTC(end.y, end.m - 1, end.d) - 27 * 86400000);
  } else {
    startDate = new Date(Date.UTC(end.y, 0, 1));
  }
  const earliest = new Date(now.getTime() - GDELT_WINDOW_DAYS * 86400000);
  const clamped = startDate < earliest;
  const from = clamped ? earliest : startDate;
  if (from >= endDate) return { empty: true, clamped, requestedStart: startDate, endDate };
  return { from, to: endDate, clamped, requestedStart: startDate, start: stamp(from), end: stamp(endDate) };
}

export function gdeltUrl(query, win, max = 75) {
  const p = new URLSearchParams({ query, mode: 'ArtList', format: 'json', maxrecords: String(max), sort: 'DateDesc', startdatetime: win.start, enddatetime: win.end });
  return `${GDELT_URL}?${p.toString()}`;
}

// "20260915T143000Z" → Date
export function parseSeen(s) {
  const m = typeof s === 'string' && s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : null;
}

// GDELT answers errors (bad query, rate limit) as plain text, so parse defensively.
export function parseArticles(text) {
  let json;
  try { json = JSON.parse(text); } catch { return { error: (text || 'No response').slice(0, 200) }; }
  const seen = new Set();
  const articles = (json?.articles || []).map((a) => ({
    url: a.url, title: (a.title || '').trim(), domain: a.domain || '', date: parseSeen(a.seendate),
  })).filter((a) => {
    if (!a.url || !a.title) return false;
    const key = a.title.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) return false; // syndicated copies of the same story
    seen.add(key);
    return true;
  }).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  return { articles };
}

/* ---------------------- polite, cached fetching ---------------------- */
const cache = new Map();
let lastRequest = 0;
let chain = Promise.resolve();
export function fetchPress(url, fetchImpl = (u) => fetch(u)) {
  if (cache.has(url)) return cache.get(url);
  const p = (chain = chain.then(async () => {
    const wait = Math.max(0, lastRequest + SPACING_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const res = await fetchImpl(url);
    return parseArticles(await res.text());
  }).catch((e) => ({ error: String(e?.message || e) })));
  cache.set(url, p);
  p.then((r) => { if (r.error) cache.delete(url); });
  return p;
}
