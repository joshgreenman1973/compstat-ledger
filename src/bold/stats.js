/* ------------------------------------------------------------------ */
/* STATS LAYER FOR THE "READ CLOSELY" VIEW                             */
/* Pure functions only — no React. Every claim the page makes is built */
/* here from NYPD's own counts, so it can be unit-tested and so each   */
/* claim can print its receipt (the inputs and the arithmetic).        */
/* ------------------------------------------------------------------ */
import DISPERSION from './dispersion.json';

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
export const fmtPct = (v, digits = 1) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const r = Math.abs(v).toFixed(digits); // sign only if the rounded value isn't zero: no "−0%"
  const zero = Number(r) === 0;
  return `${zero ? '' : v > 0 ? '+' : '−'}${r}%`;
};
// AP style: spell out whole numbers under 10 in running text.
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const spell = (n) => (Number.isInteger(n) && n >= 0 && n < 10 ? WORDS[n] : fmtInt(n));
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
// If both were plain random (Poisson) counts with the same underlying rate, the gap c − p would have
// standard deviation √(c + p). Crime counts vary more than that: one shooting can wound several
// people and violence clusters. So the variance is scaled by the line's measured "dispersion"
// (variance ÷ mean of weekly counts in NYPD's archived reports, never taken below 1; see
// dispersion.json and tools/dispersion/build_dispersion.py): z = (|c − p| − 1) ÷ √(φ(c + p)).
// |z| ≥ 1.96 means a gap that large would show up less than 5% of the time if nothing had changed.
// The −1 is a continuity correction: without it, small counts get over-called (4 vs. 0 would score
// z = 2.0 although the exact binomial test gives p = 0.125). With it, the verdict never calls a
// change beyond chance that the exact test calls chance (checked for every pair of counts up to 150
// in stats.test.js, at φ = 1).
export const Z_CRIT = 1.96;
// A headline picks the gravest of eight crimes whose change clears the bar, so it gets a stricter
// one: 1.96 for each of eight tries would produce a headline by chance alone about a third of the
// time. 2.734 is the two-sided 5% bar split eight ways (Bonferroni).
export const Z_HEAD = 2.734;
export const LEVEL = (geoKey) => (geoKey === 'citywide' ? 'city' : String(geoKey).includes('Precinct') ? 'precinct' : 'borough');
export const DISPERSION_INFO = { weeks: DISPERSION._weeks, pairs: DISPERSION._pairs };
export function dispersionFor(name, level = 'city') {
  const v = DISPERSION.lines?.[name]?.[level];
  return Number.isFinite(v) ? Math.max(1, v) : 1;
}
// For a sum of lines: the count-weighted average of the parts' dispersion. For the seven majors,
// never less than the value measured on the total directly (the lines tend to move together).
export function dispersionForSum(parts, level = 'city') {
  const w = parts.reduce((s, x) => s + (x.n || 0), 0);
  const avg = w > 0 ? parts.reduce((s, x) => s + dispersionFor(x.name, level) * (x.n || 0), 0) / w : 1;
  const names = parts.map((x) => x.name);
  const isMajors = MAJORS.every((n) => names.includes(n)) && names.length === MAJORS.length;
  return Math.max(1, avg, isMajors ? dispersionFor('_majors', level) : 1);
}
export function poissonZ(cur, prior, phi = 1) {
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return null;
  const n = cur + prior;
  if (!(n > 0)) return null;
  const gap = Math.max(0, Math.abs(cur - prior) - 1);
  return (Math.sign(cur - prior) * gap) / Math.sqrt(Math.max(1, phi) * n);
}
export function verdictFor(z) {
  if (z == null) return 'none';
  if (z <= -Z_CRIT) return 'drop';
  if (z >= Z_CRIT) return 'rise';
  return 'noise';
}
// Half-width of the "could be chance" band, expressed in percent-of-prior so it can sit on the
// same axis as the % change. A dot outside the band <=> |z| >= Z_CRIT.
export function noiseBandPct(cur, prior, phi = 1) {
  if (!(prior > 0) || !Number.isFinite(cur)) return null;
  return ((Z_CRIT * Math.sqrt(Math.max(1, phi) * (cur + prior)) + 1) / prior) * 100;
}

// Two-sided p-value for a z-score (normal approximation), and the Benjamini–Hochberg procedure:
// when a map runs a test in every precinct at once, it holds the expected share of false calls among
// the precincts it colors to q, instead of letting about 5% of all precincts light up by chance.
function erfc(x) {
  // Abramowitz–Stegun 7.1.26, |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return x >= 0 ? y : 2 - y;
}
export const pTwoSided = (z) => (z == null ? 1 : Math.min(1, erfc(Math.abs(z) / Math.SQRT2)));
export function benjaminiHochberg(ps, q = 0.05) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const m = idx.length;
  let k = 0;
  idx.forEach(([p], r) => { if (p <= ((r + 1) / m) * q) k = r + 1; });
  return new Set(idx.slice(0, k).map(([, i]) => i));
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
export function extractRows(geoData, periodId, level = 'city') {
  const pkey = PERIODS[periodId]?.key || PERIODS.ytd.key;
  const weekEnd = geoData?.report_period?.week_end;
  const out = [];
  const push = (group, obj) => Object.entries(obj || {}).forEach(([name, stats]) => {
    const w = stats?.[pkey] || {};
    const cur = num(w.current_year);
    const prior = num(w.prior_year);
    if (cur == null || prior == null) return;
    const phi = dispersionFor(name, level);
    const z = poissonZ(cur, prior, phi);
    const flag = (name === 'Rape' && !rapeYoYComparable(periodId, weekEnd)) ? 'rape-definition' : null;
    out.push({
      name, group, label: labelFor(name), cur, prior, phi,
      diff: cur - prior,
      pct: prior > 0 ? ((cur - prior) / prior) * 100 : null,
      z, verdict: flag ? 'flagged' : verdictFor(z),
      band: noiseBandPct(cur, prior, phi),
      hist: stats?.historical || {},
      flag,
    });
  });
  push('major', geoData?.seven_major_felonies);
  push('other', geoData?.additional_stats);
  return out;
}

export function sumRows(rows, names, label, level = 'city') {
  const picked = rows.filter((r) => names.includes(r.name));
  if (!picked.length) return null;
  const cur = picked.reduce((s, r) => s + r.cur, 0);
  const prior = picked.reduce((s, r) => s + r.prior, 0);
  const phi = dispersionForSum(picked.map((r) => ({ name: r.name, n: r.cur + r.prior })), level);
  const z = poissonZ(cur, prior, phi);
  return { name: label, label, cur, prior, phi, diff: cur - prior, pct: prior > 0 ? ((cur - prior) / prior) * 100 : null, z, verdict: verdictFor(z), band: noiseBandPct(cur, prior, phi), parts: picked.map((r) => r.name) };
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

/* ----------------------------- revisions ---------------------------- */
// NYPD's counts are preliminary. Victims die and assaults become murders; cases are upgraded,
// downgraded or added late. Every weekly report restates the year-to-date total, so two consecutive
// reports isolate the revisions: YTD(this week) − YTD(last week) − this week's own count is what NYPD
// added to (or took from) weeks it had already reported. The prior-year column is a year old and has
// mostly settled, so revisions — which mostly add crimes — tilt CompStat's comparisons toward decline.
// (Vital City's review of 95 monthly reports, 2018–25, found every one later revised upward.)
export const REVISION_WEEKS = 8;
const DAY_MS = 86400000;
const mdyTime = (s) => { const p = parseMDY(s); return p ? Date.UTC(p.y, p.m - 1, p.d) : null; };

// snapshots: full CompStat reports, oldest → newest. Uses the longest run of consecutive weekly
// reports ending with the newest; a pair that straddles New Year (YTD resets) ends the run.
// Returns { weeks, from, to, byGeo: { geo: { offense: { cur, prior } } } } or null.
export function revisionFlows(snapshots) {
  const snaps = (snapshots || []).filter((s) => mdyTime(s?.citywide?.report_period?.week_end) != null);
  const pairs = [];
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1]; const b = snaps[i];
    const ta = mdyTime(a.citywide.report_period.week_end); const tb = mdyTime(b.citywide.report_period.week_end);
    if (tb - ta !== 7 * DAY_MS || new Date(ta).getUTCFullYear() !== new Date(tb).getUTCFullYear()) break;
    pairs.unshift([a, b]);
  }
  if (!pairs.length) return null;
  const byGeo = {};
  const weeksByGeo = {}; // a place missing from some reports (a new precinct) has fewer weeks of flow
  pairs.forEach(([a, b]) => {
    Object.keys(b).forEach((geo) => {
      if (!a[geo]) return;
      weeksByGeo[geo] = (weeksByGeo[geo] || 0) + 1;
      ['seven_major_felonies', 'additional_stats'].forEach((grp) => {
        Object.entries(b[geo][grp] || {}).forEach(([name, sb]) => {
          const sa = a[geo][grp]?.[name];
          const ya = sa?.year_to_date; const yb = sb?.year_to_date; const wb = sb?.week_to_date;
          const ok = (o, k) => Number.isFinite(o?.[k]);
          if (!(ok(ya, 'current_year') && ok(yb, 'current_year') && ok(wb, 'current_year'))) return;
          const g = (byGeo[geo] = byGeo[geo] || {});
          const f = (g[name] = g[name] || { cur: 0, prior: 0 });
          f.cur += yb.current_year - ya.current_year - wb.current_year;
          if (ok(ya, 'prior_year') && ok(yb, 'prior_year') && ok(wb, 'prior_year')) f.prior += yb.prior_year - ya.prior_year - wb.prior_year;
        });
      });
    });
  });
  return { weeks: pairs.length, weeksByGeo, from: pairs[0][0].citywide.report_period.week_end, to: pairs[pairs.length - 1][1].citywide.report_period.week_end, byGeo };
}

// Smallest change to this year's count — in the direction that weakens the finding — that turns a
// real change into noise. (A drop weakens as this year's count is revised up; a rise, as it's revised down.)
export function breakEven(row) {
  if (!row || (row.verdict !== 'drop' && row.verdict !== 'rise')) return null;
  const dir = row.verdict === 'drop' ? 1 : -1;
  let lo = 1; let hi = Math.abs(row.cur - row.prior); // at hi the two counts are equal: z = 0, noise
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (verdictFor(poissonZ(row.cur + dir * mid, row.prior, row.phi)) === row.verdict) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// How many weeks of revisions at the recent pace would erase a real change. "Fragile" if fewer than
// REVISION_WEEKS — i.e., if the next two months of revisions looked like the last two, it could vanish.
// The threshold never exceeds the window's own length: a single week's count can only absorb about one
// week's worth of revisions, a 28-day count about four.
export function revisionRisk(row, flow, thresholdWeeks = REVISION_WEEKS) {
  if (!flow || !(flow.weeks > 0)) return null;
  const be = breakEven(row);
  if (be == null) return null;
  const dir = row.verdict === 'drop' ? 1 : -1;
  const perWeek = (dir * flow.cur) / flow.weeks; // revisions per week in the weakening direction
  const weeksToErase = perWeek > 0 ? be / perWeek : Infinity;
  // 'none': no net revisions to this line; 'opposite': revisions have been strengthening the change.
  const direction = perWeek > 0 ? 'weakening' : perWeek < 0 ? 'opposite' : 'none';
  return { breakEven: be, perWeek, weeksToErase, direction, thresholdWeeks, fragile: weeksToErase < thresholdWeeks };
}
export const WINDOW_WEEKS = { ytd: Infinity, d28: 4, wtd: 1 };
export const fragileThreshold = (periodId) => Math.min(REVISION_WEEKS, WINDOW_WEEKS[periodId] ?? Infinity);

// Attach the recent revision flow and risk to each row (mutates copies, returns new array).
export function withRevisions(rows, flowsForGeo, weeks, thresholdWeeks = REVISION_WEEKS) {
  if (!flowsForGeo || !(weeks > 0)) return rows;
  return rows.map((r) => {
    const f = flowsForGeo[r.name];
    if (!f) return r;
    const rev = { cur: f.cur, prior: f.prior, weeks };
    const risk = revisionRisk(r, rev, thresholdWeeks);
    return { ...r, rev, risk, fragile: !!risk?.fragile };
  });
}

/* ------------------------------ verdict ----------------------------- */
// Ordered by seriousness: the headline leads with the gravest crime that moved beyond chance.
export const HEADLINE_ORDER = ['Murder', 'Shooting Vic.', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'G.L.A.', 'Gr. Larceny'];
// Counterpoint candidates: the high-volume violent lines a reader should not lose sight of.
const STUCK_ORDER = ['Fel. Assault', 'Robbery', 'Rape', 'Shooting Vic.', 'Murder'];
// Plural nouns for headlines written in counts.
export const NOUNS = {
  'Murder': 'murders', 'Shooting Vic.': 'shooting victims', 'Rape': 'rapes', 'Robbery': 'robberies',
  'Fel. Assault': 'felony assaults', 'Burglary': 'burglaries', 'G.L.A.': 'vehicle thefts', 'Gr. Larceny': 'grand larcenies',
};
// Below this many last year, a percentage says more than the counts do ("up 700%" on 8 vs. 1), so the
// headline gives the counts instead.
export const SMALL_BASE = 20;
// A change this small (either way) is "essentially flat," not "isn't falling."
export const FLAT_PCT = 3;

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
export function clause(r, kind) {
  const L = r.label;
  const be = isPlural(r.name) ? 'are' : 'is';
  const noun = NOUNS[r.name] || L.toLowerCase();
  if ((kind === 'drop' || kind === 'rise') && r.prior < SMALL_BASE) {
    if (r.cur === 0) return `No ${noun}, down from ${spell(r.prior)}.`;
    if (r.prior === 0) return `${cap(spell(r.cur))} ${r.cur === 1 ? noun.replace(/s$/, '').replace(/ie$/, 'y') : noun}, up from none.`;
    return `${cap(noun)} ${kind === 'drop' ? 'fell' : 'rose'} to ${spell(r.cur)} from ${spell(r.prior)}.`;
  }
  const pct = Math.round(Math.abs(r.pct));
  if (kind === 'drop') return `${L} ${be} down ${pct}%.`;
  if (kind === 'rise') return `${L} ${be} up ${pct}%.`;
  if (kind === 'stuck') return `${L} ${isPlural(r.name) ? "aren't" : "isn't"} falling.`;
  if (kind === 'flat') return `${L} ${be} essentially flat.`;
  return '';
}

// Returns { sentences, lead, counter, counterKind, kind, cleared, fragileOnes } — kind is
// 'split' | 'rise' | 'fall' | 'noise'. `cleared` lists lines that cleared the ordinary bar (1.96) but
// not the headline bar; `fragileOnes`, lines that cleared it but that revisions could erase.
export function buildHeadline(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  const eligible = HEADLINE_ORDER.map((n) => by[n]).filter((r) => r && r.verdict !== 'flagged' && r.verdict !== 'none' && r.pct != null);
  // A change beyond chance that recent revisions could erase ("fragile") never headlines.
  const firm = (r) => (r.verdict === 'drop' || r.verdict === 'rise') && !r.fragile;
  const strong = (r) => firm(r) && Math.abs(r.z) >= Z_HEAD;
  // "Isn't falling" must survive the recent pace of downward revisions, if any.
  const stuckHolds = (r) => r.cur + Math.min(0, r.rev?.cur || 0) >= r.prior;
  const lead = eligible.find(strong);
  const fragileOnes = eligible.filter((r) => (r.verdict === 'drop' || r.verdict === 'rise') && r.fragile);
  const cleared = eligible.filter((r) => firm(r) && !strong(r));
  if (!lead) {
    const text = cleared.length
      ? 'No major crime moved by a clear margin.'
      : fragileOnes.length
        ? "No major crime moved by enough to outlast both chance and NYPD's revisions."
        : 'No major crime moved more than chance alone would explain.';
    return { kind: 'noise', lead: null, counter: null, cleared, fragileOnes, sentences: [text] };
  }
  const others = eligible.filter((r) => r !== lead);
  const quiet = (r) => r && r !== lead && r.verdict === 'noise' && r.prior >= 30;
  let counter = null; let counterKind = null;
  if (lead.verdict === 'drop') {
    counter = others.find((r) => r.verdict === 'rise' && strong(r));
    if (counter) counterKind = 'rise';
    if (!counter) {
      counter = STUCK_ORDER.map((n) => by[n]).find((r) => quiet(r) && r.pct >= FLAT_PCT && stuckHolds(r));
      if (counter) counterKind = 'stuck';
    }
    if (!counter) {
      counter = STUCK_ORDER.map((n) => by[n]).find((r) => quiet(r) && Math.abs(r.pct) < FLAT_PCT);
      if (counter) counterKind = 'flat';
    }
    if (!counter) {
      counter = others.find((r) => r.verdict === 'drop' && strong(r));
      if (counter) counterKind = 'drop';
    }
  } else {
    counter = others.find((r) => r.verdict === 'drop' && strong(r));
    if (counter) counterKind = 'drop';
    if (!counter) {
      counter = others.find((r) => r.verdict === 'rise' && strong(r));
      if (counter) counterKind = 'rise';
    }
  }
  const sentences = [clause(lead, lead.verdict)];
  if (counter) sentences.push(clause(counter, counterKind));
  const kind = !counter ? (lead.verdict === 'drop' ? 'fall' : 'rise')
    : (lead.verdict === 'drop' && counterKind === 'drop') ? 'fall'
    : (lead.verdict === 'rise' && counterKind === 'rise') ? 'rise' : 'split';
  return { kind, lead, counter, counterKind, sentences, cleared, fragileOnes };
}

// "For every murder, 117 felony assaults." Only when there are enough murders for a ratio to mean
// something: on one or two murders the ratio swings wildly.
export const RATIO_MIN = 20;
export function frequencyRatio(rows, numerName = 'Fel. Assault', denomName = 'Murder') {
  const a = rows.find((r) => r.name === numerName);
  const b = rows.find((r) => r.name === denomName);
  if (!a || !b || !(a.cur > 0) || !(b.cur >= RATIO_MIN)) return null;
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

// The rest of the year is still a random count. Each end of the range is widened by
// 1.96 × √(φ × the count still to come), so a claim about where the year lands also has to survive
// ordinary chance in the months left. The low end can't fall below what's already been recorded.
export function withChance(range, cur, phi = 1) {
  if (!range || range.tooEarly || !Number.isFinite(cur)) return range;
  const f = Math.max(1, phi);
  const dLow = Z_CRIT * Math.sqrt(f * Math.max(0, range.low - cur));
  const dHigh = Z_CRIT * Math.sqrt(f * Math.max(0, range.high - cur));
  return { ...range, paceLow: range.low, paceHigh: range.high, chanceLow: dLow, chanceHigh: dHigh, low: Math.max(cur, range.low - dLow), high: range.high + dHigh };
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
    key: 'northeast', label: 'Northeast and mid-Atlantic',
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
  // The same chance test, applied to rates: is the gap between a city's rate and New York's beyond
  // chance, given how many murders each had? (Poisson standard error of a rate: √count ÷ population.)
  const se2 = (c) => c.murderFull / (c.pop / 100000) ** 2;
  const others = list.filter((c) => !c.isNYC).map((c) => {
    const z = (c.rate - nyc.rate) / Math.sqrt(se2(c) + se2(nyc) || 1);
    return { ...c, zVsNYC: z, vsNYC: z >= Z_CRIT ? 'higher' : z <= -Z_CRIT ? 'lower' : 'same' };
  });
  const higher = others.filter((c) => c.rate > nyc.rate).length;
  return { year, list, nyc, others, higher, missing: group.cities.length - list.length };
}

/* ------------------------------ geography ---------------------------- */
// The 116th Precinct was created in December 2024 from parts of the 105th and the 113th (the mayor's
// announcement: "areas previously covered by either the 105th or the 113th precincts"). NYPD restated
// all three for the new lines, but the precinct map and the 2020 Census populations use the old lines.
// Per-resident figures for any one of the three would be wrong, so anything per-resident or mapped
// combines them: the old 105th and 113th footprints together cover exactly the three new precincts.
export const SPLIT_PRECINCTS = { members: ['105th Precinct', '113th Precinct', '116th Precinct'], shapes: ['105', '113'], label: '105th, 113th + 116th' };
export const isSplitPrecinct = (k) => SPLIT_PRECINCTS.members.includes(k);

// Precincts whose long-view comparisons (NYPD's same-period columns vs. 2010 and 1993) cover different
// ground from today's. The 121st (2013) was carved from the 120th and 122nd; the 116th (2024) from the
// 105th and 113th. NYPD says it restated the 2024 split, but we can't check how for 1993 or 2010, so we
// leave them out. The 33rd was carved from the 34th after 1993 (NYPD prints no 1993 comparison for it).
export const REDRAWN_SINCE_2010 = ['105th Precinct', '113th Precinct', '116th Precinct', '120th Precinct', '121st Precinct', '122nd Precinct'];
export const REDRAWN_SINCE_1993 = [...REDRAWN_SINCE_2010, '33rd Precinct', '34th Precinct'];
export const redrawnSince = (year, geo) => (year <= 1993 ? REDRAWN_SINCE_1993 : year <= 2010 ? REDRAWN_SINCE_2010 : []).includes(geo);
