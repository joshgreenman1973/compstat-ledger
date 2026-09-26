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

/* ---------------------- coverage vs. the counts ---------------------- */
// Each crime family: the CompStat line it's compared with, and the word groups a story must match
// (groups are ANDed; words within a group are ORed).
export const COVERAGE_FAMILIES = [
  { key: 'murder', label: 'Murder', line: 'Murder', groups: [PRESS_TERMS.murder] },
  { key: 'shooting', label: 'Shootings', line: 'Shooting Inc.', groups: [PRESS_TERMS.shooting] },
  { key: 'robbery', label: 'Robbery', line: 'Robbery', groups: [['robbery', 'robbed', 'mugging', 'mugged']] },
  { key: 'assault', label: 'Felony assault', line: 'Fel. Assault', groups: [['stabbing', 'stabbed', 'slashing', 'slashed', '"felony assault"']] },
  { key: 'burglary', label: 'Burglary', line: 'Burglary', groups: [['burglary', 'burglar', '"break-in"']] },
  { key: 'car', label: 'Vehicle theft', line: 'G.L.A.', groups: [['"stolen car"', '"car theft"', 'carjacking', '"stolen vehicle"']] },
  { key: 'rape', label: 'Rape', line: 'Rape', groups: [['rape', '"sexual assault"']] },
  { key: 'hate', label: 'Hate crimes', line: 'Hate Crimes', groups: [['"hate crime"', '"hate crimes"', '"bias attack"']] },
  { key: 'subway', label: 'Transit crime', line: 'Transit', groups: [['subway', '"on a train"', '"subway station"'], ['attacked', 'stabbed', 'shoved', 'slashed', 'assaulted', 'robbed']] },
  { key: 'retail', label: 'Retail theft', line: 'Retail Theft', groups: [['shoplifting', 'shoplifter', 'shoplifters', '"retail theft"']] },
];
export const buildGroupsQuery = (groups, geoList) => `${groups.map(group).join(' ')} ${group(geoList)} sourcelang:english`;

export function timelineUrl(query, from, to) {
  const p = new URLSearchParams({ query, mode: 'TimelineVolRaw', format: 'json', startdatetime: stamp(from), enddatetime: stamp(to) });
  return `${GDELT_URL}?${p.toString()}`;
}

// GDELT's TimelineVolRaw JSON: { timeline: [{ series, data: [{ date, value, norm }] }] }.
export function parseTimeline(text) {
  let json;
  try { json = JSON.parse(text); } catch { return { error: (text || 'No response').slice(0, 200) }; }
  const data = json?.timeline?.[0]?.data;
  if (!Array.isArray(data)) return { error: 'No timeline in response' };
  return { points: data.map((d) => ({ date: parseSeen(d.date), value: Number(d.value) || 0, norm: Number(d.norm) || 0 })).filter((d) => d.date) };
}

// The 56 days ending on the report's last day, split into two 28-day windows.
export function coverageWindows(weekEnd) {
  const end = parseMDY(weekEnd);
  if (!end) return null;
  const to = new Date(Date.UTC(end.y, end.m - 1, end.d, 23, 59, 59));
  const mid = new Date(Date.UTC(end.y, end.m - 1, end.d) - 27 * 86400000); // first day of the last 28
  const from = new Date(mid.getTime() - 28 * 86400000);
  return { from, mid, to };
}

// Sum stories in each window. When GDELT supplies `norm` (all stories it monitored), the change is
// measured as a share of all coverage, so a swing in GDELT's overall volume can't masquerade as interest.
export function coverageChange(points, win) {
  const sum = (a, b) => points.filter((p) => p.date >= a && p.date < b).reduce((s, p) => ({ v: s.v + p.value, n: s.n + p.norm }), { v: 0, n: 0 });
  const prev = sum(win.from, win.mid);
  const last = sum(win.mid, new Date(win.to.getTime() + 1000));
  const useNorm = prev.n > 0 && last.n > 0;
  const change = prev.v > 0 ? (useNorm ? ((last.v / last.n) / (prev.v / prev.n) - 1) : (last.v / prev.v - 1)) * 100 : null;
  return { last: last.v, prev: prev.v, change, normalized: useNorm, enough: prev.v >= 5 && last.v + prev.v >= 15 };
}

// Out of step = coverage and the counts pointing different ways. A count "falls" if it's a real drop
// or a noisy change at or below zero; it "rises" if it's a real rise or a noisy change at or above zero.
// Thresholds are deliberately blunt.
export const COVERAGE_SWING = 25;
export function coverageVerdict(crime, cov) {
  if (!cov || !cov.enough || cov.change == null) return { kind: 'thin', label: 'Too little coverage to judge' };
  if (!crime || crime.verdict === 'none' || crime.verdict === 'flagged' || crime.pct == null) return { kind: 'na', label: 'No comparable count' };
  const up = cov.change >= COVERAGE_SWING; const down = cov.change <= -COVERAGE_SWING;
  const notRising = crime.verdict === 'drop' || (crime.verdict === 'noise' && crime.pct <= 0);
  const notFalling = crime.verdict === 'rise' || (crime.verdict === 'noise' && crime.pct >= 0);
  if (up && notRising) return { kind: 'out', label: 'More coverage, not more crime' };
  if (down && notFalling) return { kind: 'out', label: 'Less coverage, not less crime' };
  if (crime.verdict === 'rise' && cov.change <= 0) return { kind: 'out', label: 'More crime, not more coverage' };
  if ((up && crime.pct > 0) || (down && crime.pct < 0)) return { kind: 'in', label: 'Same direction' };
  return { kind: 'quiet', label: 'No clear mismatch' };
}

export function fetchTimeline(url, fetchImpl = (u) => fetch(u)) {
  const key = `tl:${url}`;
  if (cache.has(key)) return cache.get(key);
  const p = (chain = chain.then(async () => {
    const wait = Math.max(0, lastRequest + SPACING_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const res = await fetchImpl(url);
    return parseTimeline(await res.text());
  }).catch((e) => ({ error: String(e?.message || e) })));
  cache.set(key, p);
  p.then((r) => { if (r.error) cache.delete(key); });
  return p;
}
