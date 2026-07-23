/**
 * Shared data helpers for the weekly email.
 *
 * Reads the same file the website reads: the NYPD CompStat weekly PDF, parsed to JSON by
 * joshgreenman1973/nypd-compstat-scraper and committed to that repo. There is no second
 * pipeline and no separate database, so the email can never disagree with the site.
 */

const RAW_URL =
  'https://raw.githubusercontent.com/joshgreenman1973/nypd-compstat-scraper/main/data/latest_compstat.json';

const SITE_URL = 'https://compstat-ledger.vercel.app';

const MAJOR_FELONIES = ['Murder', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'Gr. Larceny', 'G.L.A.'];
const VIOLENT = ['Murder', 'Rape', 'Robbery', 'Fel. Assault'];
const PROPERTY = ['Burglary', 'Gr. Larceny', 'G.L.A.'];

const FULL_NAMES = {
  'Murder': 'Murder',
  'Rape': 'Rape',
  'Robbery': 'Robbery',
  'Fel. Assault': 'Felony assault',
  'Burglary': 'Burglary',
  'Gr. Larceny': 'Grand larceny',
  'G.L.A.': 'Grand larceny auto',
  'Petit Larceny': 'Petit larceny',
  'Retail Theft': 'Retail theft',
  'Misd. Assault': 'Misdemeanor assault',
  'Shooting Vic.': 'Shooting victims',
  'Shooting Inc.': 'Shooting incidents',
  'Hate Crimes': 'Hate crimes',
  'Other Sex Crimes': 'Other sex crimes',
  'Traffic Fatalities': 'Traffic fatalities',
  'Transit': 'Transit',
  'Housing': 'Housing',
  'UCR Rape*': 'UCR rape',
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// The scraped PDF carries its own pct_change, but it is null whenever the prior-year count is
// zero. Recompute so the email decides how to describe that case rather than printing "null".
const pctChange = (cur, prior) => (prior > 0 ? ((cur - prior) / prior) * 100 : null);

const fullName = (k) => FULL_NAMES[k] || k;

async function fetchReport(url = RAW_URL) {
  const resp = await fetch(`${url}?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`CompStat data fetch failed: HTTP ${resp.status} from ${url}`);
  const json = await resp.json();
  // Fail loud: a truncated or reshaped file must stop the send, not produce an empty email.
  if (!json || !json.citywide || !json.citywide.seven_major_felonies) {
    throw new Error('CompStat data fetch returned no citywide seven_major_felonies block');
  }
  const weekEnd = json.citywide.report_period && json.citywide.report_period.week_end;
  if (!weekEnd) throw new Error('CompStat data has no report_period.week_end');
  return json;
}

/** One offense row for a given geography and window ('week_to_date' | 'twenty_eight_day' | 'year_to_date'). */
function offenseRow(geoData, offense, window) {
  const stats = (geoData.seven_major_felonies || {})[offense] || (geoData.additional_stats || {})[offense];
  const w = (stats || {})[window] || {};
  const current = num(w.current_year);
  const prior = num(w.prior_year);
  return { offense, name: fullName(offense), current, prior, diff: current - prior, pct: pctChange(current, prior) };
}

/** Totals across the seven major felonies, plus violent/property splits, for one window. */
function totals(geoData, window) {
  const rows = MAJOR_FELONIES.map((o) => offenseRow(geoData, o, window));
  const sum = (list) => list.reduce((acc, r) => ({ current: acc.current + r.current, prior: acc.prior + r.prior }), { current: 0, prior: 0 });
  const all = sum(rows);
  const violent = sum(rows.filter((r) => VIOLENT.includes(r.offense)));
  const property = sum(rows.filter((r) => PROPERTY.includes(r.offense)));
  return {
    rows,
    total: { ...all, diff: all.current - all.prior, pct: pctChange(all.current, all.prior) },
    violent: { ...violent, diff: violent.current - violent.prior, pct: pctChange(violent.current, violent.prior) },
    property: { ...property, diff: property.current - property.prior, pct: pctChange(property.current, property.prior) },
  };
}

/**
 * The biggest mover in a window, in counts rather than percent.
 *
 * Precinct weeks are small numbers — one burglary against a prior year of one is "up 100%" and
 * means nothing. Ranking by absolute change, with a floor on the size of the move, keeps the
 * sentence honest.
 */
function biggestMover(rows, minDiff = 3, totalDiff = null) {
  const ranked = [...rows].filter((r) => Math.abs(r.diff) >= minDiff).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  // Prefer the biggest mover pushing the same way as the total. A brief whose headline number is up
  // should not open by explaining a decline.
  if (totalDiff) {
    const sameWay = ranked.find((r) => Math.sign(r.diff) === Math.sign(totalDiff));
    if (sameWay) return sameWay;
  }
  return ranked[0] || null;
}

/** Precincts ranked by 28-day percent change, ignoring precinct-offense pairs too small to mean anything. */
function citywideMovers(report, minPrior = 20) {
  const out = [];
  Object.keys(report).forEach((geo) => {
    if (geo === 'citywide' || !/Precinct/.test(geo)) return;
    MAJOR_FELONIES.forEach((offense) => {
      const r = offenseRow(report[geo], offense, 'twenty_eight_day');
      if (r.prior >= minPrior && r.pct !== null) out.push({ ...r, geo });
    });
  });
  out.sort((a, b) => b.pct - a.pct);
  return { up: out.slice(0, 3), down: out.slice(-3).reverse() };
}

const precinctUrl = (geo) => `${SITE_URL}/?geo=${encodeURIComponent(geo)}&tab=wtd`;

module.exports = {
  RAW_URL,
  SITE_URL,
  MAJOR_FELONIES,
  VIOLENT,
  PROPERTY,
  num,
  pctChange,
  fullName,
  fetchReport,
  offenseRow,
  totals,
  biggestMover,
  citywideMovers,
  precinctUrl,
};
