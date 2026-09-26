/* ------------------------------------------------------------------ */
/* STATS LAYER FOR THE "STRESS-TESTED" VIEW                            */
/* Pure functions only — no React. Every claim the page makes is built */
/* here from NYPD's own counts, so it can be unit-tested and so each   */
/* claim can print its receipt (the inputs and the arithmetic).        */
/* ------------------------------------------------------------------ */

export const PERIODS = {
  ytd: { key: 'year_to_date', label: 'Year to date', short: 'YTD' },
  d28: { key: 'twenty_eight_day', label: 'Last 28 days', short: '28 days' },
  wtd: { key: 'week_to_date', label: 'Latest week', short: 'Week' },
};

export const MAJORS = ['Murder', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'Gr. Larceny', 'G.L.A.'];
export const VIOLENT = ['Murder', 'Rape', 'Robbery', 'Fel. Assault'];
export const PROPERTY = ['Burglary', 'Gr. Larceny', 'G.L.A.'];

// Plain-English names. NYPD's abbreviations stay visible in the ledger and CSV.
export const LABELS = {
  'Murder': 'Murder',
  'Rape': 'Rape',
  'Robbery': 'Robbery',
  'Fel. Assault': 'Felony assault',
  'Burglary': 'Burglary',
  'Gr. Larceny': 'Grand larceny',
  'G.L.A.': 'Vehicle theft',
  'Transit': 'Transit (major felonies)',
  'Housing': 'Public housing (major felonies)',
  'Petit Larceny': 'Petit larceny',
  'Retail Theft': 'Retail theft',
  'Misd. Assault': 'Misdemeanor assault',
  'UCR Rape*': 'Rape (federal definition)',
  'Other Sex Crimes': 'Other sex crimes',
  'Shooting Vic.': 'Shooting victims',
  'Shooting Inc.': 'Shooting incidents',
  'Hate Crimes': 'Hate crimes',
  'Traffic Fatalities': 'Traffic deaths',
};
const PLURAL = new Set(['Shooting Vic.', 'Shooting Inc.', 'Hate Crimes', 'Traffic Fatalities', 'Other Sex Crimes']);
export const labelFor = (name) => LABELS[name] || name;
export const isPlural = (name) => PLURAL.has(name);

/* ---------------------------- formatting ---------------------------- */
export const fmtInt = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—');
export const fmtPct = (v, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%` : '—');
export const fmtSigned = (n) => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-US')}` : '—');

// "9/20/2026" -> { y, m, d }. Parsed by hand so no time zone can shift the day.
export function parseMDY(s) {
  const m = typeof s === 'string' && s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return { m: +m[1], d: +m[2], y: +m[3] };
}
// AP style: Jan. Feb. Aug. Sept. Oct. Nov. Dec. abbreviated; March–July spelled out.
const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
export function apDate(s, { year = true } = {}) {
  const p = parseMDY(s);
  if (!p) return s || '—';
  return `${AP_MONTHS[p.m - 1]} ${p.d}${year ? `, ${p.y}` : ''}`;
}
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function dayOfYear({ y, m, d }) {
  const days = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days.slice(0, m - 1).reduce((a, b) => a + b, 0) + d;
}

/* ------------------------- signal vs. noise ------------------------- */
// Two counts from equal-length windows (this year's YTD vs. the same window last year).
// If both were Poisson with the same underlying rate, the gap c − p has standard deviation
// √(c + p), so |z| ≥ 1.96 means a gap that large would show up less than 5% of the time.
// We subtract 1 from the gap (a continuity correction): without it, small counts get
// over-called — 4 vs. 0 scores z = 2.0 although the exact binomial test gives p = 0.125. With
// it, the verdict never calls a change real that the exact test calls noise (checked for every
// pair of counts up to 150 in stats.test.js). Crime counts are also lumpier than Poisson
// (clustering, multi-victim incidents), which makes any such test generous: a screen, not proof.
export const Z_CRIT = 1.96;
export function poissonZ(cur, prior) {
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return null;
  const n = cur + prior;
  if (!(n > 0)) return null;
  const gap = Math.max(0, Math.abs(cur - prior) - 1);
  return (Math.sign(cur - prior) * gap) / Math.sqrt(n);
}
export function verdictFor(z) {
  if (z == null) return 'none';
  if (z <= -Z_CRIT) return 'drop';
  if (z >= Z_CRIT) return 'rise';
  return 'noise';
}
// Half-width of the "could be chance" band, expressed in percent-of-prior so it can sit on the
// same axis as the % change. A dot outside the band <=> |z| >= Z_CRIT.
export function noiseBandPct(cur, prior) {
  if (!(prior > 0) || !Number.isFinite(cur)) return null;
  return ((Z_CRIT * Math.sqrt(cur + prior) + 1) / prior) * 100;
}

/* ------------------------------ rows ------------------------------- */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// New York broadened the legal definition of rape effective Sept. 1, 2024. A year-over-year
// comparison is apples-to-apples only if the prior-year window starts on or after that date.
export const RAPE_DEFINITION_CHANGE = { y: 2024, m: 9, d: 1 };
export function rapeYoYComparable(periodId, weekEnd) {
  const end = parseMDY(weekEnd);
  if (!end) return false;
  const days = periodId === 'ytd' ? dayOfYear(end) - 1 : periodId === 'd28' ? 27 : 6;
  // Start of the prior-year window, as a comparable ordinal (y*1000 + day of year).
  const startDoy = dayOfYear(end) - days;
  const priorStart = (end.y - 1) * 1000 + startDoy;
  const change = RAPE_DEFINITION_CHANGE.y * 1000 + dayOfYear(RAPE_DEFINITION_CHANGE);
  return priorStart >= change;
}

// One row per CompStat line for a geography and period. pct is recomputed from the two counts
// (it matches NYPD's printed pct_change) so the receipt is reproducible from what's shown.
export function extractRows(geoData, periodId) {
  const pkey = PERIODS[periodId]?.key || PERIODS.ytd.key;
  const weekEnd = geoData?.report_period?.week_end;
  const out = [];
  const push = (group, obj) => Object.entries(obj || {}).forEach(([name, stats]) => {
    const w = stats?.[pkey] || {};
    const cur = num(w.current_year);
    const prior = num(w.prior_year);
    if (cur == null || prior == null) return;
    const z = poissonZ(cur, prior);
    const flag = (name === 'Rape' && !rapeYoYComparable(periodId, weekEnd)) ? 'rape-definition' : null;
    out.push({
      name, group, label: labelFor(name), cur, prior,
      diff: cur - prior,
      pct: prior > 0 ? ((cur - prior) / prior) * 100 : null,
      z, verdict: flag ? 'flagged' : verdictFor(z),
      band: noiseBandPct(cur, prior),
      hist: stats?.historical || {},
      flag,
    });
  });
  push('major', geoData?.seven_major_felonies);
  push('other', geoData?.additional_stats);
  return out;
}

export function sumRows(rows, names, label) {
  const picked = rows.filter((r) => names.includes(r.name));
  if (!picked.length) return null;
  const cur = picked.reduce((s, r) => s + r.cur, 0);
  const prior = picked.reduce((s, r) => s + r.prior, 0);
  const z = poissonZ(cur, prior);
  return { name: label, label, cur, prior, diff: cur - prior, pct: prior > 0 ? ((cur - prior) / prior) * 100 : null, z, verdict: verdictFor(z), band: noiseBandPct(cur, prior), parts: picked.map((r) => r.name) };
}

// NYPD's "historical perspective" columns. The scraper names them 2_yr / 14_yr / 31_yr (the labels
// on the 2024 report), but NYPD compares against FIXED base years: back-calculating the base from
// the published percentages on the Sept. 20, 2026 report lands on the 2010 and 1993 same-period
// totals in NYPD's annual series (e.g. murder: 189 / (1 − 0.8675) ≈ 1,427, i.e. 1993's pace, not
// 1995's). The 2-year column is rolling. Labeling them "14 years ago" / "31 years ago" in 2026
// would be wrong, so label by year.
export function historicalColumns(reportYear) {
  return [
    { key: '2_yr_pct', year: reportYear - 2 },
    { key: '14_yr_pct', year: 2010 },
    { key: '31_yr_pct', year: 1993 },
  ];
}

/* ------------------------------ verdict ----------------------------- */
// Ordered by seriousness: the headline leads with the gravest crime that moved beyond chance.
export const HEADLINE_ORDER = ['Murder', 'Shooting Vic.', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'G.L.A.', 'Gr. Larceny'];
// Counterpoint candidates: the high-volume violent lines a reader should not lose sight of.
const STUCK_ORDER = ['Fel. Assault', 'Robbery', 'Rape', 'Shooting Vic.', 'Murder'];

const clause = (r, kind) => {
  const L = r.label;
  const be = isPlural(r.name) ? 'are' : 'is';
  const pct = Math.round(Math.abs(r.pct));
  if (kind === 'drop') return `${L} ${be} down ${pct}%.`;
  if (kind === 'rise') return `${L} ${be} up ${pct}%.`;
  if (kind === 'stuck') return `${L} ${isPlural(r.name) ? "aren't" : "isn't"} falling.`;
  if (kind === 'flat') return `${L} ${be} essentially flat.`;
  return '';
};

// Returns { sentences: [..], lead, counter, kind } — kind is 'split' | 'rise' | 'fall' | 'noise'.
export function buildHeadline(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  const eligible = HEADLINE_ORDER.map((n) => by[n]).filter((r) => r && r.verdict !== 'flagged' && r.verdict !== 'none' && r.pct != null);
  const lead = eligible.find((r) => r.verdict === 'drop' || r.verdict === 'rise');
  if (!lead) {
    return { kind: 'noise', lead: null, counter: null, sentences: ['No major crime moved more than chance alone would explain.'] };
  }
  const others = eligible.filter((r) => r !== lead);
  let counter = null; let counterKind = null;
  if (lead.verdict === 'drop') {
    counter = others.find((r) => r.verdict === 'rise');
    if (counter) counterKind = 'rise';
    if (!counter) {
      counter = STUCK_ORDER.map((n) => by[n]).find((r) => r && r !== lead && r.verdict === 'noise' && r.pct >= 0 && r.prior >= 30);
      if (counter) counterKind = 'stuck';
    }
    if (!counter) {
      counter = STUCK_ORDER.map((n) => by[n]).find((r) => r && r !== lead && r.verdict === 'noise' && r.pct < 0 && r.pct > -3 && r.prior >= 30);
      if (counter) counterKind = 'flat';
    }
    if (!counter) {
      counter = others.find((r) => r.verdict === 'drop');
      if (counter) counterKind = 'drop';
    }
  } else {
    counter = others.find((r) => r.verdict === 'drop');
    if (counter) counterKind = 'drop';
    if (!counter) {
      counter = others.find((r) => r.verdict === 'rise');
      if (counter) counterKind = 'rise';
    }
  }
  const sentences = [clause(lead, lead.verdict)];
  if (counter) sentences.push(clause(counter, counterKind));
  const kind = !counter ? (lead.verdict === 'drop' ? 'fall' : 'rise')
    : (lead.verdict === 'drop' && counterKind === 'drop') ? 'fall'
    : (lead.verdict === 'rise' && counterKind === 'rise') ? 'rise' : 'split';
  return { kind, lead, counter, counterKind, sentences };
}

// "For every murder, 117 felony assaults." Only when both counts are positive.
export function frequencyRatio(rows, numerName = 'Fel. Assault', denomName = 'Murder') {
  const a = rows.find((r) => r.name === numerName);
  const b = rows.find((r) => r.name === denomName);
  if (!a || !b || !(a.cur > 0) || !(b.cur > 0)) return null;
  const ratio = a.cur / b.cur;
  return { ratio, display: ratio >= 10 ? Math.round(ratio).toLocaleString('en-US') : ratio.toFixed(1), numer: a, denom: b };
}

/* ---------------------------- the long arc -------------------------- */
// Full-year pace for the current year, as a RANGE from two methods:
//   seasonal: this YTD ÷ (last year's same-date YTD ÷ last year's full-year total) — assumes this
//             year's calendar shape matches last year's (the method the classic view uses);
//   linear:   this YTD ÷ share of the calendar elapsed — assumes crime is spread evenly.
// Neither is a forecast. Too early in the year (< 25% elapsed) we don't project at all.
export function paceRange({ cur, priorYtd, priorFull, weekEnd, minElapsed = 0.25 }) {
  const end = parseMDY(weekEnd);
  if (!end || !Number.isFinite(cur)) return null;
  const elapsed = dayOfYear(end) / (isLeap(end.y) ? 366 : 365);
  if (elapsed < minElapsed) return { tooEarly: true, elapsed };
  const linear = cur / elapsed;
  const seasonalShare = (priorYtd > 0 && priorFull > 0) ? priorYtd / priorFull : null;
  const seasonal = seasonalShare ? cur / seasonalShare : null;
  const vals = [linear, seasonal].filter((v) => Number.isFinite(v));
  return { low: Math.min(...vals), high: Math.max(...vals), linear, seasonal, seasonalShare, elapsed, year: end.y };
}

// Where a full-year value would rank in a series of complete years ({y, val}, ascending by y).
// Returns the conservative comparison for a pace RANGE — the claim must hold at both ends.
export function arcClaim(series, pace) {
  if (!pace || pace.tooEarly || !series?.length) return null;
  const last = series[series.length - 1];
  const first = series[0];
  if (pace.high < last.val) {
    // Falling. "Fewest since Y": Y is the most recent year at or below the HIGH end.
    const y = [...series].reverse().find((d) => d.val <= pace.high);
    if (!y) return { kind: 'record-low', since: first.y, last };
    // "Fewest since last-year-minus-one" is too thin to headline; just say it's below last year.
    if (y.y <= last.y - 2) return { kind: 'low-since', since: y.y, sinceVal: y.val, last };
    return { kind: 'below-last', last };
  }
  if (pace.low > last.val) {
    const y = [...series].reverse().find((d) => d.val >= pace.low);
    if (!y) return { kind: 'record-high', since: first.y, last };
    if (y.y <= last.y - 2) return { kind: 'high-since', since: y.y, sinceVal: y.val, last };
    return { kind: 'above-last', last };
  }
  return { kind: 'in-line', last };
}

/* --------------------------- concentration -------------------------- */
// units: [{ id, label, count, pop }]. How few places hold half the total?
export function concentration(units, share = 0.5) {
  const valid = units.filter((u) => Number.isFinite(u.count) && u.count >= 0);
  const total = valid.reduce((s, u) => s + u.count, 0);
  const popTotal = valid.reduce((s, u) => s + (u.pop || 0), 0);
  if (!(total > 0) || !(popTotal > 0)) return null;
  // Ties at the cutoff go to the MORE populous place, so the population share is never understated.
  const sorted = [...valid].sort((a, b) => b.count - a.count || (b.pop || 0) - (a.pop || 0) || a.label.localeCompare(b.label));
  let cum = 0; let pop = 0; const top = [];
  for (const u of sorted) {
    if (cum >= total * share) break;
    cum += u.count; pop += u.pop || 0; top.push(u);
  }
  return { k: top.length, n: valid.length, total, cum, countShare: cum / total, popShare: pop / popTotal, pop, popTotal, top };
}

/* --------------------------- choropleth bins ------------------------ */
export function zBin(z) {
  if (z == null) return null;
  if (z <= -3.29) return -2;
  if (z <= -Z_CRIT) return -1;
  if (z < Z_CRIT) return 0;
  if (z < 3.29) return 1;
  return 2;
}
// Quintile thresholds (4 cut points) over finite values.
export function quantileCuts(values, k = 5) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < k) return [];
  return Array.from({ length: k - 1 }, (_, i) => {
    const pos = ((i + 1) / k) * (v.length - 1);
    const lo = Math.floor(pos); const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  });
}
export const binFor = (value, cuts) => (Number.isFinite(value) ? cuts.filter((c) => value > c).length : null);

/* -------------------------- peer-city (RTCI) ------------------------- */
// Real-Time Crime Index scorecard. Keyed by agency AND state — "Jacksonville" alone matches both
// Jacksonville, Fla. and Jacksonville, N.C. The CSV's YTD windows differ by city (some agencies
// report through January, some through April), so YTD counts are NOT comparable across cities;
// we compare the previous FULL calendar year, which is.
export const PEER_GROUPS = [
  {
    key: 'largest', label: 'Nine largest cities',
    cities: [['New York City', 'New York'], ['Los Angeles', 'California'], ['Chicago', 'Illinois'], ['Houston', 'Texas'], ['Phoenix', 'Arizona'], ['Philadelphia', 'Pennsylvania'], ['San Antonio', 'Texas'], ['San Diego', 'California'], ['Dallas', 'Texas']],
    blurb: 'the eight other largest U.S. cities',
  },
  {
    key: 'northeast', label: 'Northeast & mid-Atlantic',
    cities: [['New York City', 'New York'], ['Philadelphia', 'Pennsylvania'], ['Boston', 'Massachusetts'], ['Baltimore', 'Maryland'], ['Washington', 'District of Columbia'], ['Pittsburgh', 'Pennsylvania'], ['Buffalo', 'New York'], ['Newark', 'New Jersey']],
    blurb: 'these Northeast and mid-Atlantic cities',
  },
];

export function parseCSVRow(line) {
  const vals = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { vals.push(cur); cur = ''; }
    else cur += ch;
  }
  vals.push(cur);
  return vals.map((v) => v.trim());
}

export function parseRTCI(csvText) {
  const lines = (csvText || '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const h = parseCSVRow(lines[0]);
  const ix = (k) => h.indexOf(k);
  const need = ['agency_name', 'state_name', 'crime_type', 'previous_year_full', 'population', 'ytd_month_range'];
  if (need.some((k) => ix(k) < 0)) return null;
  const cities = {}; let updated = '';
  lines.slice(1).forEach((line) => {
    const r = parseCSVRow(line);
    if (r[ix('crime_type')] !== 'murder') return;
    const key = `${r[ix('agency_name')]}|${r[ix('state_name')]}`;
    const range = r[ix('ytd_month_range')] || '';
    const ym = range.match(/(\d{4})\s*$/);
    cities[key] = {
      agency: r[ix('agency_name')], state: r[ix('state_name')],
      pop: parseInt(r[ix('population')], 10) || 0,
      murderFull: parseInt(r[ix('previous_year_full')], 10),
      fullYear: ym ? +ym[1] - 1 : null,
      range,
    };
    if (!updated && ix('last_updated') >= 0) updated = r[ix('last_updated')];
  });
  return { cities, updated };
}

export function peerComparison(parsed, group) {
  if (!parsed?.cities || !group) return null;
  const nycRow = parsed.cities['New York City|New York'];
  const year = nycRow?.fullYear;
  const list = group.cities.map(([a, s]) => parsed.cities[`${a}|${s}`])
    .filter((c) => c && c.pop > 0 && Number.isFinite(c.murderFull) && c.fullYear === year)
    .map((c) => ({ ...c, isNYC: c.agency === 'New York City', rate: (c.murderFull / c.pop) * 100000 }))
    .sort((a, b) => a.rate - b.rate);
  const nyc = list.find((c) => c.isNYC);
  if (!nyc) return null;
  const others = list.filter((c) => !c.isNYC);
  const higher = others.filter((c) => c.rate > nyc.rate).length;
  return { year, list, nyc, others, higher, missing: group.cities.length - list.length };
}

/* ------------------------------ geography ---------------------------- */
// The 116th Precinct was created from part of the 105th. The precinct map and the 2020 Census
// populations predate the split, so per-capita figures for either one alone would be wrong;
// the two are combined into the old 105th's footprint for anything per-capita.
export const SPLIT_PRECINCTS = { parent: '105th Precinct', child: '116th Precinct', label: '105th + 116th' };
