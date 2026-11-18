// Rules that decide what version A is allowed to claim. They live here, apart from App.js, so each
// one is unit-tested (ledgerRules.test.js) and the tests run before every build (see package.json).
// The Nov. 18, 2026 audit found these claims breaking on the weekly tab, in the first weeks of a
// year, across the 2024 rape-definition change, on redrawn precincts and on incomplete city data.
// Each rule keys off the data itself, never a calendar date, so it keeps working in later years.

// No full-year projection until the year-to-date stretch covers at least this share of last year's
// total. Version B uses the same quarter-year floor. Early in the year a projection is mostly noise.
export const MIN_PROJECTION_SHARE = 0.25;

// First full calendar year counted under each crime's current definition. New York broadened the
// legal definition of rape on Sept. 1, 2024, so annual rape counts before 2025 aren't comparable
// with later ones. Add a line here if NYPD changes another definition.
export const COMPARABLE_FROM = { Rape: 2025 };

// Precincts whose current lines don't match any published population. The 116th was carved from the
// 105th and 113th in December 2024; the 2020 Census crosswalk covers only the old lines, so a rate for
// any of the three would divide current counts by the wrong residents. Add precincts here if NYPD
// redraws lines again.
export const REDRAWN_PRECINCTS = {
  '105th Precinct': 'its lines were redrawn when the 116th Precinct was created in December 2024',
  '113th Precinct': 'its lines were redrawn when the 116th Precinct was created in December 2024',
  '116th Precinct': 'it was created in December 2024 and no population count exists for its lines',
};

// Residents to divide by for a per-100k rate, or null when no honest denominator exists.
export function ratePopulation(geo, populations, citywidePopulation) {
  if (geo === 'citywide') return citywidePopulation;
  if (REDRAWN_PRECINCTS[geo]) return null;
  const pop = populations[geo];
  return typeof pop === 'number' && pop > 0 ? pop : null;
}

// The annual series for one crime, limited to years comparable with the current definition.
export function comparableSeries(history, key) {
  if (!history || !key) return [];
  const from = COMPARABLE_FROM[key] ?? -Infinity;
  return history
    .filter(d => typeof d[key] === 'number' && d.y >= from)
    .map(d => ({ y: d.y, val: d[key] }));
}

// Projects this year's full-year total from a year-to-date count, or returns null when it can't be
// done honestly:
// - the period isn't year to date (a week can't be compared with whole years);
// - last year's full total isn't in the series yet (each January until it's added);
// - too little of the year has passed.
// Projection = this year's YTD ÷ (last year's YTD ÷ last year's full total).
export function projectFullYear({ series, current, prior, reportYear, period }) {
  if (period !== 'ytd') return null;
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior <= 0) return null;
  const lastFull = series.find(d => d.y === reportYear - 1)?.val;
  if (!(lastFull > 0)) return null;
  const ytdFrac = prior / lastFull;
  if (!(ytdFrac >= MIN_PROJECTION_SHARE) || ytdFrac > 1.05) return null;
  return { annualized: current / ytdFrac, ytdFrac };
}

// A rough range around a projection: ±1.96 √n, the chance variation of a Poisson count. Real
// counts vary more than that, so this is a floor on uncertainty, not a prediction interval.
export function projectionRange(annualized) {
  const half = 1.96 * Math.sqrt(Math.max(annualized, 0));
  return { lo: annualized - half, hi: annualized + half };
}

// "Lowest since Y" / "Highest since Y", where Y is the most recent year that was lower (or higher).
// The claim must hold across the whole projection range: every year after Y must be beyond the
// range's far end. If no year in the series beats the range, it's "since at least <first year>".
// Returns null when the claim would reach back fewer than three years (not news) or doesn't hold.
export function sinceSuperlative(series, annualized, reportYear) {
  if (!(annualized > 0)) return null;
  const past = series.filter(d => d.y < reportYear);
  if (past.length < 3) return null;
  const { lo, hi } = projectionRange(annualized);
  const first = past[0].y;
  const lastYear = past[past.length - 1];

  // Low claim: the high end of the range is below last year's total.
  if (hi < lastYear.val) {
    let since = null;
    for (let i = past.length - 1; i >= 0; i--) { if (past[i].val <= hi) { since = past[i].y; break; } }
    if (since === null) return { kind: 'low', year: first, atLeast: true, label: `Lowest since at least ${first}` };
    if (since <= reportYear - 3) return { kind: 'low', year: since, atLeast: false, label: `Lowest since ${since}` };
    return null;
  }
  // High claim: the low end of the range is above last year's total.
  if (lo > lastYear.val) {
    let since = null;
    for (let i = past.length - 1; i >= 0; i--) { if (past[i].val >= lo) { since = past[i].y; break; } }
    if (since === null) return { kind: 'high', year: first, atLeast: true, label: `Highest since at least ${first}` };
    if (since <= reportYear - 3) return { kind: 'high', year: since, atLeast: false, label: `Highest since ${since}` };
    return null;
  }
  return null;
}

// Five-year outlier test: z of the projection against the five full years before this one.
export const OUTLIER_YEARS = 5;
export function outlierBadge(series, annualized, reportYear) {
  const recent = series.filter(d => d.y >= reportYear - OUTLIER_YEARS && d.y < reportYear).map(d => d.val);
  if (recent.length < OUTLIER_YEARS) return null;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const std = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  if (!(std > 0)) return null;
  const z = (annualized - mean) / std;
  if (z >= 2) return { kind: 'spike', label: '5-yr high outlier', tone: 'orange', z };
  if (z <= -2) return { kind: 'plunge', label: '5-yr low outlier', tone: 'green', z };
  return null;
}

// Which crime explains the net change in the seven majors. When other crimes moved the other way,
// one crime's change can exceed the net (a "share" of 600% is meaningless), so the result says so.
export function describeDriver(felonies) {
  const net = felonies.reduce((s, f) => s + f.diff, 0);
  if (net === 0 || !felonies.length) return null;
  const d = felonies.reduce((p, c) => (Math.abs(c.diff) > Math.abs(p.diff) && Math.sign(c.diff) === Math.sign(net) ? c : p), { diff: 0 });
  if (!d.name) return null;
  const others = net - d.diff;
  const share = Math.abs(d.diff / net) * 100;
  return { name: d.name, diff: d.diff, net, others, share, offset: share > 100 };
}

// A city's violent-crime total is usable only if it is made of reported parts. The Real-Time Crime
// Index lists some cities with zero aggravated assaults or rapes (Washington, D.C., for 2025), which
// means not reported, not none. Require every part to be a positive count and the parts to add up.
export const VIOLENT_PARTS = ['murder', 'rape', 'robbery', 'aggravated_assault'];
export function usableViolentTotal(total, parts) {
  if (!(total > 0) || !parts) return null;
  const vals = VIOLENT_PARTS.map(k => parts[k]);
  if (vals.some(v => !(v > 0))) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.abs(sum - total) / total <= 0.02 ? total : null;
}

// The ten largest U.S. cities, in order, by the Census Bureau's Vintage 2025 estimates (July 1, 2025;
// released May 14, 2026): Fort Worth passed Jacksonville for 10th. Keys are the crime index's
// agency|state names. Recheck each May when the Bureau publishes a new vintage.
export const LARGEST_CITIES = [
  'New York City|New York', 'Los Angeles|California', 'Chicago|Illinois', 'Houston|Texas',
  'Phoenix|Arizona', 'Philadelphia|Pennsylvania', 'San Antonio|Texas', 'San Diego|California',
  'Dallas|Texas', 'Fort Worth|Texas',
];

// The report's year, from its week-ending date ("11/15/2026"). Read from the string, not a Date, so
// the year doesn't shift with the reader's time zone.
export function reportYearOf(period) {
  const m = String(period?.week_end || '').match(/(\d{4})\s*$/);
  return m ? +m[1] : null;
}

// ---- Moved from App.js so they can be tested without rendering the page ----

export const RTCI_NYC_KEY = 'New York City|New York';
// Property crime isn't compared: the index's New York "theft" count is NYPD's felony grand larceny
// alone (48,034 in 2025, against NYPD's 48,061), leaving out petit larceny (105,591), while other
// cities count every theft. Violent totals are checked against their parts.
export const RTCI_TYPES = { murder: 'murder', violent_crime: 'violent' };

export function parseRTCIcsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const parseRow = (line) => {
    const vals = []; let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  const nameI = headers.indexOf('agency_name');
  const stateI = headers.indexOf('state_name');
  const typeI = headers.indexOf('crime_type');
  const fullI = headers.indexOf('previous_year_full');
  const popI = headers.indexOf('population');
  const updI = headers.indexOf('last_updated');
  const rangeI = headers.indexOf('ytd_month_range');
  if ([nameI, stateI, typeI, fullI, popI, rangeI].some(i => i < 0)) return null;
  const countCols = ['two_years_prior_full', 'previous_year_full', 'two_years_prior_ytd', 'previous_year_ytd', 'current_year_ytd']
    .map(h => headers.indexOf(h)).filter(i => i >= 0);

  const cityMap = {};
  let updated = '';
  const parts = {};
  rows.forEach(r => {
    const key0 = `${r[nameI]}|${r[stateI]}`;
    if (VIOLENT_PARTS.includes(r[typeI])) {
      (parts[key0] = parts[key0] || {})[r[typeI]] = /^\d+$/.test(r[fullI] || '') ? parseInt(r[fullI], 10) : null;
    }
    const type = RTCI_TYPES[r[typeI]];
    if (!type) return;
    const key = `${r[nameI]}|${r[stateI]}`;
    // "Jan - Apr 2026" -> the previous full year is 2025
    const ym = (r[rangeI] || '').match(/(\d{4})\s*$/);
    const fullYear = ym ? +ym[1] - 1 : null;
    let count = /^\d+$/.test(r[fullI] || '') ? parseInt(r[fullI], 10) : null;
    if (count === 0 && countCols.every(i => !(parseFloat(r[i]) > 0))) count = null; // nothing reported
    const pop = parseInt(r[popI], 10) || 0;
    if (!cityMap[key]) cityMap[key] = { key, city: r[nameI], state: r[stateI], pop, fullYear, murder: null, violent: null, isNYC: key === RTCI_NYC_KEY };
    const c = cityMap[key];
    if (c.fullYear !== fullYear) c.mixedYears = true;
    c[type] = count;
    if (pop > 0) c.pop = pop;
    if (!updated && updI >= 0 && r[updI]) updated = r[updI].slice(0, 10);
  });
  // A violent total counts only if every part was reported and the parts add up to it.
  Object.values(cityMap).forEach(c => { c.violent = usableViolentTotal(c.violent, parts[c.key]); });
  return { cities: cityMap, updated };
}

// Map of CompStat row names to crime_history.json keys (for citywide annual history).
// Names not in this map will fall back to a 2-point sparkline.
export const HISTORICAL_KEY = {
  'Burglary': 'Burglary',
  'Fel. Assault': 'Fel. Assault',
  'G.L.A.': 'G.L.A.',
  'Gr. Larceny': 'Gr. Larceny',
  'Murder': 'Murder',
  'Rape': 'Rape',
  'Robbery': 'Robbery',
  'Misd. Assault': 'Misd. Assault',
  'Petit Larceny': 'Petit Larceny',
  'Shooting Inc.': 'Shooting Inc.',
};

// Returns historical-context info for a given offense row, or null when no honest comparison with
// full years exists (see projectFullYear in ledgerRules.js: weekly tab, early in the year, or last
// year's total not yet in the history file).
//   - Project this year's full-year total from the year-to-date count.
//   - Compare it with the 2017-19 pre-pandemic baseline, the five prior years and the whole series,
//     using only years counted under the crime's current definition (rape: 2025 on).
export function getHistoricalContext(history, item, reportYear, period) {
  const key = HISTORICAL_KEY[item.name];
  if (!key || !history || !history.length) return null;
  const series = comparableSeries(history, key);
  if (series.length < 5) return null;
  const proj = projectFullYear({ series, current: item.current, prior: item.prior, reportYear, period });
  if (!proj) return null;
  const { annualized, ytdFrac } = proj;

  // Pre-pandemic baseline: 2017-2019.
  const pre = series.filter(d => d.y >= 2017 && d.y <= 2019).map(d => d.val);
  let pandemicBadge = null;
  if (pre.length >= 2) {
    const preLow = Math.min(...pre);
    const preHigh = Math.max(...pre);
    const preMean = pre.reduce((a, b) => a + b, 0) / pre.length;
    if (annualized < preLow) {
      pandemicBadge = { kind: 'below', label: 'Below pre-pandemic low', tone: 'green' };
    } else if (annualized < preMean * 0.97) {
      pandemicBadge = { kind: 'belowAvg', label: 'Below pre-pandemic avg', tone: 'green' };
    } else if (annualized > preHigh * 1.03) {
      pandemicBadge = { kind: 'aboveHigh', label: 'Above pre-pandemic high', tone: 'orange' };
    } else if (annualized > preMean * 1.03) {
      pandemicBadge = { kind: 'above', label: 'Above pre-pandemic avg', tone: 'orange' };
    } else {
      pandemicBadge = { kind: 'at', label: 'Back at pre-pandemic level', tone: 'gray' };
    }
  }

  const outlier = outlierBadge(series, annualized, reportYear);
  const since = sinceSuperlative(series, annualized, reportYear);
  const sinceBadge = since ? { kind: since.kind, label: since.label, tone: since.kind === 'low' ? 'green' : 'orange' } : null;

  return { series, annualized, ytdFrac, pandemicBadge, outlierBadge: outlier, sinceSuperlative: sinceBadge, preLow: pre.length ? Math.min(...pre) : null, preHigh: pre.length ? Math.max(...pre) : null };
}

// Summarize how many major felonies have returned to or fallen below their 2017-19 pre-pandemic
// average, using the same full-year projection. Crimes without a comparable 2017-19 baseline (rape,
// after its 2024 redefinition) are listed in leftOut. Returns null when nothing can be projected.
export function getPrePandemicRecovery(felonies, history, reportYear, period) {
  if (!felonies || !history || !history.length) return null;
  const result = { below: 0, total: 0, above: [], at: [], leftOut: [] };
  felonies.forEach(f => {
    const key = HISTORICAL_KEY[f.name];
    if (!key) return;
    const series = comparableSeries(history, key);
    const pre = series.filter(d => d.y >= 2017 && d.y <= 2019).map(d => d.val);
    if (pre.length < 2) { result.leftOut.push(f.name); return; }
    const proj = projectFullYear({ series, current: f.current, prior: f.prior, reportYear, period });
    if (!proj) return;
    const preMean = pre.reduce((a, b) => a + b, 0) / pre.length;
    result.total += 1;
    if (proj.annualized <= preMean) {
      result.below += 1;
    } else {
      result.above.push({ name: f.name, ratio: proj.annualized / preMean, annualized: proj.annualized });
    }
  });
  result.above.sort((a, b) => b.ratio - a.ratio);
  if (result.total === 0) return null;
  return result;
}

// ---- Moderate findings from the Nov. 18, 2026 audit ----

// Below this many last year, a percent change swings on a handful of crimes. The ledger already grays
// these out (VOLATILITY_THRESHOLD in App.js); sentences give the counts instead (audit A11, A17).
export const SMALL_BASE = 30;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
// AP style: spell out whole numbers below 10 in running text.
export const spell = (n) => (Number.isInteger(n) && n >= 0 && n < 10 ? WORDS[n] : Number(n).toLocaleString('en-US'));

// A change in words, never "down 0.0%" for equal counts, "up 0.0%" from zero, or a percent on a base
// under 30: "down 12.5%", "essentially flat", "unchanged at 18", "up from none to three",
// "down to three from eight".
export function changePhrase(cur, prior) {
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return '';
  if (cur === prior) return prior === 0 ? 'zero both years' : `unchanged at ${spell(cur)}`;
  if (prior === 0) return `up from none to ${spell(cur)}`;
  if (prior < SMALL_BASE) return `${cur > prior ? 'up' : 'down'} to ${spell(cur)} from ${spell(prior)}`;
  const pct = ((cur - prior) / prior) * 100;
  if (Math.abs(pct) < 0.05) return 'essentially flat';
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}%`;
}

// The page's headline about the seven major felonies. `when` is "year to date" or "this week".
export function headlineChange(cur, prior, when) {
  const L = 'Major index offenses';
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return `${L}, ${when}.`;
  if (cur === prior) return `${L} are unchanged ${when} from a year earlier, at ${spell(cur)}.`;
  if (prior < SMALL_BASE) return `${L} total ${spell(cur)} ${when}, ${cur > prior ? 'up' : 'down'} from ${prior === 0 ? 'none' : spell(prior)} a year earlier.`;
  return `${L} are ${changePhrase(cur, prior)} ${when} vs. prior year.`;
}

// The small change line beside the index total: the percent only on a base of 30 or more.
export function totalBadge(cur, prior) {
  const arrow = cur > prior ? '▲' : cur < prior ? '▼' : '•';
  const last = Number(prior).toLocaleString('en-US');
  if (cur === prior) return { arrow, text: `unchanged vs ${last} last yr`, pct: null };
  if (prior < SMALL_BASE) return { arrow, text: `vs ${last} last yr`, pct: null };
  const pct = ((cur - prior) / prior) * 100;
  return { arrow, text: `${Math.abs(pct).toFixed(1)}% vs ${last} last yr`, pct };
}

// Lines where a rate per resident means nothing: crimes counted by place (transit, public housing,
// stores), traffic deaths, and a duplicate of the rape line (audit A11).
export const PER_RESIDENT_EXCLUDED = ['Transit', 'Housing', 'Retail Theft', 'Traffic Fatalities', 'UCR Rape*'];
// "1.4 times," in words.
export const timesWord = (r) => `${r.toFixed(1)} times`;
// The line whose local rate is furthest above the city's (high) and the felony furthest below (low).
// Each needs at least 30 crimes in the count it rests on: this year's for a high, last year's for a low.
export function rateOutliers(items, citywideRates) {
  let high = null; let low = null;
  (items || []).forEach((item) => {
    const city = citywideRates?.[item.name];
    if (item.currentRate == null || !(city > 0) || PER_RESIDENT_EXCLUDED.includes(item.name)) return;
    const ratio = item.currentRate / city;
    if (item.current >= SMALL_BASE && ratio > 1.25 && (!high || ratio > high.ratio)) high = { name: item.name, localRate: item.currentRate, cityRate: city, ratio };
    if (item.isFelony && item.prior >= SMALL_BASE && ratio < 0.75 && (!low || ratio < low.ratio)) low = { name: item.name, localRate: item.currentRate, cityRate: city, ratio };
  });
  return { high, low };
}

// Concentration of violent crime by RATE (audit A12): the five precincts with the highest violent-crime
// rates, and how many of the lowest-rate precincts it takes to match their count. units: [{ id, count,
// pop }]; leave out precincts with no population or tourist hubs before calling.
export function rateConcentration(units, top = 5) {
  const ok = (units || []).filter((u) => u.pop > 0 && Number.isFinite(u.count) && u.count >= 0)
    .map((u) => ({ ...u, rate: u.count / u.pop })).sort((a, b) => b.rate - a.rate);
  if (ok.length < top * 2) return null;
  const head = ok.slice(0, top);
  const topSum = head.reduce((s, u) => s + u.count, 0);
  const topPop = head.reduce((s, u) => s + u.pop, 0);
  let bottomSum = 0; let bottomCount = 0; let bottomPop = 0;
  for (let i = ok.length - 1; i >= top && bottomSum < topSum; i--) { bottomSum += ok[i].count; bottomPop += ok[i].pop; bottomCount++; }
  if (bottomSum < topSum || !(topSum > 0)) return null;
  return { topCount: top, topSum, topPop, bottomCount, bottomSum, bottomPop };
}

// The 30-year view's precinct scatter and its quartile table use the same precincts (audit A15). The
// 14th (Midtown South) has so few residents that its per-resident rates are off the chart.
export const SCATTER_EXCLUDED = ['14th'];
// Quartiles by poverty rate: mean poverty, felony assault and grand larceny rates in each quarter.
export function povertyQuartiles(rows) {
  const rs = (rows || []).filter((r) => !SCATTER_EXCLUDED.includes(r.n)).sort((a, b) => a.pov - b.pov);
  const n = rs.length;
  if (n < 8) return [];
  const names = ['Q1: Lowest', 'Q2: Low-mid', 'Q3: Mid-high', 'Q4: Highest'];
  const mean = (xs, k) => xs.reduce((s, r) => s + r[k], 0) / xs.length;
  return names.map((q, i) => {
    const part = rs.slice(Math.floor((i * n) / 4), Math.floor(((i + 1) * n) / 4));
    return { q, n: part.length, pov: mean(part, 'pov'), fa: mean(part, 'fa'), gl: mean(part, 'gl') };
  });
}

/* ---------------- Minor findings (Nov. 18, 2026 audit) ---------------- */

// Dates come from NYPD's "M/D/YYYY" strings (or the scorecard's "YYYY-MM-DD"), read as calendar dates,
// never through new Date(), so the page shows the same day in Paris, Tokyo or New York.
const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
export function parseDay(s) {
  if (typeof s !== 'string') return null;
  let m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { y: +m[3], m: +m[1], d: +m[2] };
  m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  return null;
}
// AP style: "Nov. 15, 2026"; { year: false } gives "Nov. 15".
export function apDate(s, { year = true } = {}) {
  const p = typeof s === 'object' && s ? s : parseDay(s);
  if (!p) return s || '—';
  return `${AP_MONTHS[p.m - 1]} ${p.d}${year ? `, ${p.y}` : ''}`;
}
// "Nov. 9-15, 2026"; "Oct. 27-Nov. 2, 2026"; across the New Year, "Dec. 29, 2026-Jan. 4, 2027".
export function apRange(a, b) {
  const A = parseDay(a); const B = parseDay(b);
  if (!A || !B) return apDate(b);
  if (A.y !== B.y) return `${apDate(A)}-${apDate(B)}`;
  if (A.m === B.m) return A.d === B.d ? apDate(B) : `${apDate(A, { year: false })}-${B.d}, ${B.y}`;
  return `${apDate(A, { year: false })}-${apDate(B)}`;
}
// The viewer's own clock, in AP style: "Nov. 18, 2026, 3:05 p.m."
export function apNow(now = new Date()) {
  const h = now.getHours(); const mm = String(now.getMinutes()).padStart(2, '0');
  return `${apDate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })}, ${h % 12 || 12}:${mm} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

// A rate with a thousands comma and one decimal: "1,304.0".
export const fmt1 = (v) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');

// Where, in a sentence: "in the 7th Precinct," "in the Bronx," "on Staten Island," "in Bronx North."
export function placePhrase(geo) {
  if (!geo || geo === 'citywide') return 'citywide';
  if (geo === 'Bronx') return 'in the Bronx';
  if (geo === 'Staten Island') return 'on Staten Island';
  if (/Precinct/.test(geo)) return `in the ${geo}`;
  return `in ${geo}`;
}

// Precincts in each patrol borough (checked against NYPD's Sept. 20, 2026 report, where each patrol
// borough's counts equal the sum of these precincts).
export const PATROL_BOROUGHS = {
  'Manhattan South': [1, 5, 6, 7, 9, 10, 13, 14, 17, 18],
  'Manhattan North': [19, 20, 22, 23, 24, 25, 26, 28, 30, 32, 33, 34],
  'Bronx North': [46, 47, 48, 49, 50, 52],
  'Bronx South': [40, 41, 42, 43, 44, 45],
  'Brooklyn South': [60, 61, 62, 63, 66, 67, 68, 69, 70, 71, 72, 76, 78],
  'Brooklyn North': [73, 75, 77, 79, 81, 83, 84, 88, 90, 94],
  'Queens South': [100, 101, 102, 103, 105, 106, 107, 113, 116],
  'Queens North': [104, 108, 109, 110, 111, 112, 114, 115],
  'Staten Island': [120, 121, 122, 123],
};
export const precinctKey = (n) => {
  const t = n % 100; const suf = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suf} Precinct`;
};
// Each patrol borough's residents = the sum of its precincts' (a precinct with no population, like the
// 116th, adds none).
export function patrolBoroughPopulations(precinctPops, groups = PATROL_BOROUGHS) {
  return Object.fromEntries(Object.entries(groups).map(([pb, nums]) => [pb, nums.reduce((s, n) => s + (precinctPops[precinctKey(n)] || 0), 0)]));
}

// NYPD's own footnotes. Its line names carry their own asterisk ("UCR Rape*"); the page shows the name
// without it and the footnote in words, so it can't collide with the page's under-30 asterisk.
export const NYPD_FOOTNOTES = {
  'UCR Rape*': 'NYPD’s footnote: Uniform Crime Reporting (UCR) rape consists of all crimes defined in the FBI UCR definition of rape.',
};
export const lineLabel = (name) => (name || '').replace(/\*+$/, '');

// The ledger's change cell. From zero, a rise is a rise ("new"), not a neutral dot.
export function changeCell(cur, prior) {
  if (!Number.isFinite(cur) || !Number.isFinite(prior)) return { dir: 0, text: '—' };
  if (prior === 0) return cur === 0 ? { dir: 0, text: '—' } : { dir: 1, text: 'new' };
  const pct = ((cur - prior) / prior) * 100;
  return { dir: Math.sign(cur - prior), text: `${Math.abs(pct).toFixed(1)}%` };
}
