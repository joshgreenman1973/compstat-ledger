/* ------------------------------------------------------------------ */
/* PRESS LAYER                                                         */
/* News stories from the GDELT DOC 2.0 API (free, no key, CORS "*").   */
/* GDELT indexes only a slice of New York City's local coverage and    */
/* matches words anywhere in a story, so the query only gathers        */
/* candidates. A story is shown only when its headline puts it in the  */
/* city, and pinned to a precinct only when its headline names a       */
/* neighborhood lying almost entirely inside that precinct (the table  */
/* is built from city boundaries by tools/places/build_places.py).     */
/* These are leads: never counted in any figure on the page.           */
/* ------------------------------------------------------------------ */
import { parseMDY } from './stats';
import GAZ from './press-places.json';

export const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
export const GDELT_WINDOW_DAYS = 90;
export const MAX_QUERY = 245; // longer queries get "Your query was too short or too long"
export const MAX_RECORDS = 250; // GDELT's cap per request
const MAX_PAGES = 4;
const SPACING_MS = 6000; // GDELT asks for one request every five seconds
// GDELT answers bursts by refusing a connection for minutes, so retry sparingly.
const RETRY_MS = [10000, 30000];
const STORE_TTL = 60 * 60 * 1000; // reuse results for an hour so reloads don't search again

// New York City outlets that GDELT indexes with some regularity. Checked Sept. 26, 2026: the Staten
// Island Advance, The City, PIX11, NY1 and The New York Times returned nothing for a month of NYPD stories.
export const LOCAL_OUTLETS = ['nypost.com', 'nydailynews.com', 'gothamist.com', 'amny.com', 'nbcnewyork.com', 'abc7ny.com', 'fox5ny.com'];
export const OUTLET_NAMES = {
  'nypost.com': 'New York Post', 'nydailynews.com': 'Daily News', 'gothamist.com': 'Gothamist', 'amny.com': 'amNY',
  'nbcnewyork.com': 'NBC New York', 'abc7ny.com': 'ABC7 New York', 'fox5ny.com': 'Fox 5 New York',
};

/* --------------------------- crime words ---------------------------- */
const MURDER_W = String.raw`murder(?:s|ed|er|ers|ing|ous)?|homicides?|slain|slay(?:s|ing|ings)?|shot dead|shot and killed|stabbed to death|beaten to death|strangled|kill(?:ed|ing|ings|er|ers)?|fatal(?:ly)?|butcher(?:ed|s)?|guns? down|gunned down|to death`;
const SHOOT_W = String.raw`shoot(?:s|ing|ings|er|ers|out|outs)?|shot|gunfire|gunman|gunmen|gunned|guns? down|bullets?|opened fire`;
const VIOLENT_W = String.raw`${MURDER_W}|${SHOOT_W}|gunpoint|stab(?:s|bed|bing|bings)?|slash(?:ed|ing|ings)|robb(?:ed|er|ers|ery|eries|ing)|mugg(?:ed|er|ers|ing|ings)|assault(?:s|ed|ing)?|attack(?:s|ed|er|ers|ing)?|beat(?:en|ing|down)|punch(?:ed|es|ing)|carjack(?:ed|er|ers|ing|ings)|pistol-whip(?:ped|ping)?|slugged|shov(?:e|ed|es|ing)`;
const PROPERTY_W = String.raw`burglar(?:y|ies|s|ized)?|break-ins?|broke into|carjack(?:ed|er|ers|ing|ings)|stole|stolen|steal(?:s|ing)?|thefts?|thie(?:f|ves)|larcen(?:y|ies)|shoplift(?:s|ed|er|ers|ing)?|loot(?:s|ed|er|ers|ing)?|heists?`;
const re = (w) => new RegExp(String.raw`\b(?:${w})\b`, 'i');
// Deaths and injuries that aren't violent crime: dropped unless the headline also names violence.
const ACCIDENT = /\b(?:crash\w*|struck|hit-and-run|run(?:s)? (?:him |her |them )?over|plow\w*|collision|drown\w*|overdos\w*|fire|blaze|fell|falls?|falling|truck|bus|car|SUV|driver|motorcycl\w*|scooter|e-?bikes?|moped|dirt bike|construction|electrocut\w*)\b/i;
const VIOLENCE = /\b(?:murder(?:s|ed|er)?|homicides?|shot|shoot(?:s|ing|ings|er)?|stab(?:s|bed|bing)?|slash(?:ed|ing)|slain|beaten|bashed|pummeled|strangled|shov(?:e|ed|ing)|gunman|gunfire|opened fire|assaulted|attacked)\b/i;
// "Dies," "dead" and "death" count as murder words only next to a word for violence.
const DEATH = /\b(?:dies|died|dead|death|deadly)\b/i;
const NOT_SHOOTING = /\b(?:photo ?shoot|film shoot|shot clock|flu shot|booster shot|mug ?shot|shot down|long shot|big shot)\b/i;

export const FAMILIES = {
  murder: { noun: 'murder', query: ['murder', 'homicide', 'killed', 'slain', '"shot dead"', '"stabbed to death"'], head: re(MURDER_W), accidents: true, deaths: true },
  shooting: { noun: 'shooting', query: ['shooting', 'shot', 'gunfire', 'gunman'], head: re(SHOOT_W), not: NOT_SHOOTING },
  violent: { noun: 'violent-crime', query: ['shooting', 'shot', 'stabbed', 'stabbing', 'robbery', 'assault', 'murder', 'killed'], head: re(VIOLENT_W), accidents: true, deaths: true, not: NOT_SHOOTING },
  property: { noun: 'property-crime', query: ['burglary', 'burglar', 'carjacking', 'theft', 'stolen', 'shoplifting', 'larceny'], head: re(PROPERTY_W) },
};
export const PRESS_FAMILY_FOR_MEASURE = { shootvic: 'shooting', violent: 'violent', murder: 'murder', majors: 'violent', property: 'property' };

export function headlineMatchesFamily(title, family) {
  const f = FAMILIES[family];
  if (!f) return false;
  if (!f.head.test(title) && !(f.deaths && DEATH.test(title) && VIOLENCE.test(title))) return false;
  if (f.not && f.not.test(title) && !VIOLENCE.test(title.replace(f.not, ''))) return false;
  if (f.accidents && ACCIDENT.test(title) && !VIOLENCE.test(title)) return false;
  return true;
}

/* ----------------------------- the query ---------------------------- */
const group = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' OR ')})`);
// Crime words anywhere in the text, NYPD anywhere in the text, from a local outlet.
export const familyQuery = (family) => `${group(FAMILIES[family].query)} NYPD ${group(LOCAL_OUTLETS.map((d) => `domain:${d}`))}`;

/* ------------------------------ places ------------------------------ */
// GDELT spaces out punctuation and drops possessive 's ("Bed - Stuy", "St . George", "Hell Kitchen").
const OUTLET_SUFFIX = /\s+[-–|]\s+(?:NBC New York|ABC7 New York|FOX 5 New York|Fox 5 New York|amNY|Gothamist|New York Post|NY Daily News|New York Daily News)\s*$/i;
export function normalizeTitle(t) {
  return (t || '')
    .replace(OUTLET_SUFFIX, '')
    .replace(/^\s*Exclusive\s*\|\s*/i, '')
    .replace(/\s+-\s+/g, '-')
    .replace(/\b([A-Z])\s\.(?=\s?[A-Z]\s?\.)/g, '$1.')
    .replace(/\s+([.,:;!?%)])/g, '$1')
    .replace(/\b([A-Z])\.\s(?=[A-Z]\.)/g, '$1.')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const BOROUGHS = ['Staten Island', 'Brooklyn', 'Bronx', 'Queens', 'Manhattan'];
const CITY_WORDS = /\b(?:NYC|N\.Y\.C\.|New York City|NYPD|Big Apple|[Ss]ubway|MTA)\b/;
// Places outside the five boroughs. A headline naming one is dropped, even if it also names the city
// ("Queens man killed in Long Island crash").
const STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'West Virginia', 'Wisconsin', 'Wyoming'];
const ELSEWHERE = ['Long Island(?! City| Rail| Railroad| Expressway)', 'LI', 'L\\.I\\.', 'Nassau', 'Suffolk', 'Westchester(?! Square| Ave| Avenue)', 'Yonkers', 'Mount Vernon', 'Mt\\. Vernon', 'New Rochelle', 'White Plains', 'Rockland', 'Hudson Valley', 'Catskills', '[Uu]pstate', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Utica', 'NJ', 'N\\.J\\.', 'Jersey City', 'Newark', 'Hoboken', 'Paterson', 'Conn\\.', 'Stamford', 'Bridgeport', 'New Haven', 'Philadelphia', 'Philly', 'Poconos', 'Boston', 'Miami', 'Los Angeles', 'LA', 'Chicago', 'Atlanta', 'Houston', 'Dallas', 'Detroit', 'Baltimore', 'Seattle', 'San Francisco', 'Las Vegas', 'Nashville', 'Memphis', 'New Orleans', 'Minneapolis', 'St\\. Louis', 'Cleveland', 'D\\.C\\.', 'Washington(?! Heights| Square| Ave| Avenue| Bridge| St| Street| Place| Park| Houses)', 'Brooklyn Park', 'Brooklyn Center', 'London', 'Paris', 'Toronto', 'Canada', 'Mexico', 'Israel', 'Gaza', 'England', 'Britain', 'UK', 'U\\.K\\.', ...STATES];
const OUTSIDE_RE = new RegExp(String.raw`(?<![\w.])(?:${ELSEWHERE.join('|')})(?![\w])`);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Every gazetteer name, plus spellings GDELT produces for names with apostrophes.
const NAMES = (() => {
  const out = {};
  const add = (name, row, placeable) => {
    out[name] = { ...row, placeable, name: row.alias_of || name };
    if (name.includes("'s ")) { out[name.replace("'s ", 's ')] = out[name]; out[name.replace("'s ", ' ')] = out[name]; }
  };
  Object.entries(GAZ.localOnly).forEach(([n, r]) => add(n, r, false));
  Object.entries(GAZ.places).forEach(([n, r]) => add(n, r, true));
  return out;
})();
// Longest names first, so "East Flatbush" wins over "Flatbush" at the same spot.
const PLACE_RE = new RegExp(String.raw`(?<![\w'-])(${[...BOROUGHS, ...Object.keys(NAMES)].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\w'])`, 'g');
const PRECINCT_RE = /\b(\d{1,3})(?:st|nd|rd|th) Precinct\b/g;
// After a place name, these make it a person's home, an office or a street, not where the crime happened:
// "Queens man," "Brooklyn DA," "Flatbush Avenue," "Coney Island Hospital."
const NOT_A_SCENE = /^\s*(?:man|woman|men|women|teens?|teenagers?|boys?|girls?|kids?|child|children|mom|mother|dad|father|sons?|daughters?|grand(?:ma|mother|pa|father)|brothers?|sisters?|residents?|natives?|couple|family|families|rapper|cops?|officers?|detectives?|sergeant|students?|workers?|drivers?|landlords?|tenants?|nurse|doctor|teacher|priest|pastor|rabbi|imam|lawmakers?|pols?|politicians?|councilm[ae]n|councilwoman|assemblym[ae]n|senator|congressman|gang|crew|DA|D\.A\.|district attorney|prosecutors?|judge|jury|grand jury|courts?|courthouse|courtroom|federal court|Supreme Court|Criminal Court|Family Court|jail|federal|feds|borough president|Ave|Avenue|Av|Road|Rd|Blvd|Boulevard|Street|St|Pkwy|Parkway|Expressway|Expwy|Bridge|Tunnel|Hospital|University|College|station|Station|[Ll]ine|Junction|Terminal|River|Creek|West|South|East|North)\b/;
const DIRECTIONAL_BEFORE = /(?:East|West|North|South|Upper|Lower|Northern|Southern|Eastern|Western|Central)\s$/;
const FROM_BEFORE = /\bfrom\s$/i;

const ORD = (n) => { const v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'}`; };
export const precinctKey = (n) => `${ORD(n)} Precinct`;
export const boroOfPrecinct = (n) => (n <= 34 ? 'Manhattan' : n <= 52 ? 'Bronx' : n <= 94 ? 'Brooklyn' : n <= 116 ? 'Queens' : 'Staten Island');

// Where a headline says a story happened. `city` = in the five boroughs; `boro` = one borough;
// `precinct` = one precinct, only when every placeable name in the headline agrees.
export function placeHeadline(rawTitle) {
  const t = normalizeTitle(rawTitle);
  const outside = t.match(OUTSIDE_RE);
  const res = { title: t, city: false, outside: outside ? outside[0] : null, boro: null, precinct: null, via: null };
  const boros = new Set();
  const pcts = new Map(); // precinct number -> the name that placed it
  let loose = 0; // scenes named that straddle precinct lines ("shootings in Coney Island, Crown Heights")
  let city = CITY_WORDS.test(t);
  for (const m of t.matchAll(PRECINCT_RE)) {
    const after = t.slice(m.index + m[0].length);
    const n = parseInt(m[1], 10);
    city = true;
    if (/^\s*(?:cops?|officers?|sergeant|detectives?|commander|captain|stationhouse|station house)\b/i.test(after)) continue;
    pcts.set(n, pcts.get(n) || m[0]);
    boros.add(boroOfPrecinct(n));
  }
  for (const m of t.matchAll(PLACE_RE)) {
    const name = m[1];
    const before = t.slice(Math.max(0, m.index - 12), m.index);
    const after = t.slice(m.index + name.length);
    city = true; // any city place counts as local, even "Queens man"
    if (NOT_A_SCENE.test(after) || FROM_BEFORE.test(before)) continue;
    if (BOROUGHS.includes(name)) { boros.add(name); continue; }
    const row = NAMES[name];
    if (row.boro) boros.add(row.boro);
    if (row.placeable && !DIRECTIONAL_BEFORE.test(before)) pcts.set(row.precinct, pcts.get(row.precinct) || row.name);
    else loose += 1;
  }
  res.city = city && !res.outside;
  if (!res.city) return res;
  if (boros.size === 1) [res.boro] = boros;
  if (pcts.size === 1 && boros.size <= 1 && loose === 0) {
    const [[n, via]] = [...pcts];
    res.precinct = precinctKey(n);
    res.via = via;
    res.boro = boroOfPrecinct(n);
  }
  return res;
}

const OPINION_URL = /\/(?:opinion|opinions|editorials?|letters|columnists?)\//i;
const OPINION_TITLE = /^(?:readers sound off|letters?\b|opinion\b|editorial\b)|:\s*letters\s*$|\|\s*opinion\b/i;

// Keep only stories that pass every test; attach where the headline puts them.
export function locateStories(articles, family, win) {
  return (articles || []).flatMap((a) => {
    if (!LOCAL_OUTLETS.some((d) => a.domain === d || a.domain.endsWith(`.${d}`))) return [];
    if (win && a.date && (a.date < win.from || a.date > win.to)) return [];
    if (OPINION_URL.test(a.url) || OPINION_TITLE.test(a.title)) return [];
    const place = placeHeadline(a.title);
    if (!place.city || !headlineMatchesFamily(place.title, family)) return [];
    return [{ ...a, title: place.title, boro: place.boro, precinct: place.precinct, via: place.via }];
  });
}

/* ------------------------------ windows ----------------------------- */
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
// Midnight in New York on a calendar date, as a UTC instant (NYPD's weeks run on local days).
export function nyMidnight(y, m, d) {
  const probe = new Date(Date.UTC(y, m - 1, d, 5)); // 00:00 EST or 01:00 EDT
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(probe));
  return new Date(probe.getTime() - h * 3600000);
}

// The report period in New York time, clamped to what GDELT can search. `now` is injectable for tests.
export function pressWindow(periodId, reportPeriod, now = new Date()) {
  const end = parseMDY(reportPeriod?.week_end);
  if (!end) return null;
  const to = new Date(nyMidnight(end.y, end.m, end.d + 1).getTime() - 1000);
  let from;
  if (periodId === 'wtd') {
    const s = parseMDY(reportPeriod?.week_start);
    from = s ? nyMidnight(s.y, s.m, s.d) : nyMidnight(end.y, end.m, end.d - 6);
  } else if (periodId === 'd28') {
    from = nyMidnight(end.y, end.m, end.d - 27);
  } else {
    from = nyMidnight(end.y, 1, 1);
  }
  const requestedStart = from;
  const earliest = new Date(now.getTime() - GDELT_WINDOW_DAYS * 86400000);
  const clamped = from < earliest;
  if (clamped) from = earliest;
  if (from >= to) return { empty: true, clamped, requestedStart, to };
  return { from, to, clamped, requestedStart, start: stamp(from), end: stamp(to) };
}

export function gdeltUrl(query, win, max = MAX_RECORDS) {
  const p = new URLSearchParams({ query, mode: 'ArtList', format: 'json', maxrecords: String(max), sort: 'DateDesc', startdatetime: win.start, enddatetime: win.end });
  return `${GDELT_URL}?${p.toString()}`;
}

/* ------------------------------ parsing ----------------------------- */
// "20260915T143000Z" → Date
export function parseSeen(s) {
  const m = typeof s === 'string' && s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : null;
}

// GDELT answers errors (bad query, rate limit) as plain text, so parse defensively.
// `count` is the raw number returned, before de-duplication, so callers can tell when a page was full.
export function parseArticles(text) {
  let json;
  try { json = JSON.parse(text); } catch { return { error: (text || 'No response').slice(0, 200) }; }
  const raw = Array.isArray(json?.articles) ? json.articles : [];
  return { count: raw.length, articles: dedupe(raw.map((a) => ({ url: a.url, title: (a.title || '').trim(), domain: a.domain || '', date: parseSeen(a.seendate) }))) };
}

// Drop repeats of the same URL or the same headline (syndicated copies); newest first.
export function dedupe(list) {
  const urls = new Set(); const titles = new Set();
  return list.filter((a) => {
    if (!a.url || !a.title) return false;
    const key = normalizeTitle(a.title).toLowerCase().replace(/\W+/g, ' ').trim();
    if (urls.has(a.url) || titles.has(key)) return false;
    urls.add(a.url); titles.add(key);
    return true;
  }).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
}

/* ---------------------- polite, cached fetching ---------------------- */
// One queue for the whole page, spaced as GDELT asks. When GDELT rate-limits it answers 429 without
// CORS headers, so the browser reports a bare network error; both kinds of failure are retried.
let lastRequest = 0;
let chain = Promise.resolve();
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
function queued(url, fetchImpl, sleep, spacing) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = Math.max(0, lastRequest + spacing - Date.now());
      if (wait) await sleep(wait);
      lastRequest = Date.now();
      let r;
      try { const res = await fetchImpl(url); r = parseArticles(await res.text()); } catch (e) { r = { error: String(e?.message || e), network: true }; }
      const retry = r.error && (r.network || /limit requests/i.test(r.error));
      if (!retry || attempt >= RETRY_MS.length) return r;
      await sleep(RETRY_MS[attempt]);
    }
  };
  const p = chain.then(run);
  chain = p.catch(() => {});
  return p;
}

// Results survive a reload for an hour (per browser tab). Storage can be missing or full; then we just search.
const STORE = 'press:v1:';
function readStore(key) {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(STORE + key));
    if (v && Date.now() - v.t < STORE_TTL) return { articles: v.a.map((a) => ({ ...a, date: a.date ? new Date(a.date) : null })), complete: v.c };
  } catch { /* no storage */ }
  return null;
}
function writeStore(key, r) {
  try { window.sessionStorage.setItem(STORE + key, JSON.stringify({ t: Date.now(), a: r.articles, c: r.complete })); } catch { /* no storage */ }
}

// All candidate stories for one crime family over one window, paging back when a response is full.
const cache = new Map();
export function fetchStories(family, win, { fetchImpl = (u) => fetch(u), sleep = realSleep, spacing = SPACING_MS, store = true } = {}) {
  const key = `${family}|${win.start}|${win.end}`;
  if (cache.has(key)) return cache.get(key);
  const stored = store && readStore(key);
  if (stored) { const p = Promise.resolve(stored); cache.set(key, p); return p; }
  const p = (async () => {
    const all = []; let end = win.end; let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await queued(gdeltUrl(familyQuery(family), { start: win.start, end }), fetchImpl, sleep, spacing);
      if (r.error) { if (!all.length) return { error: r.error }; break; }
      all.push(...r.articles);
      if (r.count < MAX_RECORDS) { complete = true; break; }
      const oldest = r.articles.reduce((m, a) => (a.date && (!m || a.date < m) ? a.date : m), null);
      if (!oldest || stamp(oldest) <= win.start || stamp(oldest) >= end) break;
      end = stamp(oldest);
    }
    return { articles: dedupe(all), complete };
  })();
  cache.set(key, p);
  p.then((r) => { if (r.error) cache.delete(key); else if (store) writeStore(key, r); });
  return p;
}

/* ---------------------- which stories a view gets ---------------------- */
export const PLACE_THRESHOLD = GAZ.threshold;
const SPLIT = ['105th Precinct', '116th Precinct']; // the boundary table predates the 116th

// What a geography means for placement: citywide, one precinct, or one borough (patrol boroughs
// split a borough, but headlines rarely say which half).
export function geoScope(geo) {
  if (geo === 'citywide') return { kind: 'citywide', label: 'New York City' };
  const n = parseInt(geo, 10);
  if (geo.includes('Precinct') && n) return { kind: 'precinct', label: geo, boro: boroOfPrecinct(n), merged: SPLIT.includes(geo) };
  const boro = ['Staten Island', ...BOROUGHS].find((b) => geo.startsWith(b));
  return { kind: 'borough', label: boro || geo, boro };
}

export function storiesFor(stories, geo) {
  const sc = geoScope(geo);
  if (sc.kind === 'citywide') return stories;
  if (sc.kind === 'precinct') return stories.filter((a) => a.precinct === geo || (sc.merged && SPLIT.includes(a.precinct)));
  return stories.filter((a) => a.boro && a.boro === sc.boro);
}
