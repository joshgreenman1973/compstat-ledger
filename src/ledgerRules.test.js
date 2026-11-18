// Guards for the claims version A makes. Each block is named for the audit finding it prevents from
// coming back (Nov. 18, 2026 audit). These run before every build: `npm run build` fails if one fails.
import fs from 'fs';
import path from 'path';
import crimeHistory from './data/crime_history.json';
import feed from './__fixtures__/compstat-2026-11-15.json';
import {
  projectFullYear, comparableSeries, sinceSuperlative, outlierBadge, ratePopulation, REDRAWN_PRECINCTS,
  describeDriver, usableViolentTotal, parseRTCIcsv, LARGEST_CITIES, getHistoricalContext,
  getPrePandemicRecovery, reportYearOf, MIN_PROJECTION_SHARE,
} from './ledgerRules';

const H = crimeHistory.citywide;
const rows = (geo, period) => Object.entries(feed[geo].seven_major_felonies).map(([name, s]) => {
  const p = period === 'ytd' ? s.year_to_date : s.week_to_date;
  return { name, current: p.current_year, prior: p.prior_year, diff: p.current_year - p.prior_year };
});
const YEAR = reportYearOf(feed.citywide.report_period);

describe('report year', () => {
  test('comes from the week-ending string, not a time-zone-dependent Date', () => {
    expect(reportYearOf({ week_end: '11/15/2026' })).toBe(2026);
    expect(reportYearOf({ week_end: '1/3/2027' })).toBe(2027);
    expect(reportYearOf({})).toBeNull();
  });
});

describe('A1: the weekly tab never compares a week with whole years', () => {
  test('no historical badges and no recovery card on weekly counts', () => {
    rows('citywide', 'wtd').forEach(item => {
      expect(getHistoricalContext(H, item, YEAR, 'wtd')).toBeNull();
    });
    expect(getPrePandemicRecovery(rows('citywide', 'wtd'), H, YEAR, 'wtd')).toBeNull();
  });
  test('year to date still gets them', () => {
    const murder = rows('citywide', 'ytd').find(r => r.name === 'Murder');
    expect(getHistoricalContext(H, murder, YEAR, 'ytd')).not.toBeNull();
  });
});

describe('A2: January, and any year whose prior total is missing', () => {
  // The first report of 2027: a few days of counts, and crime_history.json may still end at 2025.
  const jan = [{ name: 'Murder', current: 6, prior: 5 }, { name: 'Robbery', current: 260, prior: 280 }];
  test('no projection when last year is not in the history file', () => {
    jan.forEach(item => expect(getHistoricalContext(H, item, 2027, 'ytd')).toBeNull());
    expect(getPrePandemicRecovery(jan, H, 2027, 'ytd')).toBeNull();
  });
  test('no projection before a quarter of last year has been matched, even with the history row', () => {
    const withLastYear = [...H, { ...H[H.length - 1], y: 2026 }];
    jan.forEach(item => expect(getHistoricalContext(withLastYear, item, 2027, 'ytd')).toBeNull());
  });
  test('the floor is a quarter of the year', () => {
    const series = [{ y: 2025, val: 400 }];
    expect(projectFullYear({ series, current: 90, prior: 99, reportYear: 2026, period: 'ytd' })).toBeNull();
    expect(projectFullYear({ series, current: 90, prior: 100, reportYear: 2026, period: 'ytd' }).annualized).toBeCloseTo(360);
    expect(MIN_PROJECTION_SHARE).toBe(0.25);
  });
});

describe('A7: "since" claims name the right year and hold across a range', () => {
  test('a projection inside chance of last year makes no claim (felony assault, Nov. 15, 2026)', () => {
    const fa = rows('citywide', 'ytd').find(r => r.name === 'Fel. Assault');
    const ctx = getHistoricalContext(H, fa, YEAR, 'ytd');
    expect(ctx.sinceSuperlative).toBeNull();
  });
  test('"Lowest since Y" names the most recent year that was as low or lower', () => {
    const series = [{ y: 2018, val: 100 }, { y: 2019, val: 300 }, { y: 2020, val: 310 }, { y: 2021, val: 320 }, { y: 2022, val: 330 }];
    expect(sinceSuperlative(series, 150, 2023).label).toBe('Lowest since 2018');
  });
  test('"Highest since Y" names the most recent year that was as high or higher', () => {
    const series = [{ y: 1997, val: 5000 }, { y: 1998, val: 1000 }, { y: 1999, val: 1000 }, { y: 2000, val: 1000 }];
    expect(sinceSuperlative(series, 3000, 2001).label).toBe('Highest since 1997');
  });
  test('no year beats it: "since at least" the first year', () => {
    const series = [{ y: 1993, val: 900 }, { y: 1994, val: 800 }, { y: 1995, val: 700 }];
    expect(sinceSuperlative(series, 300, 1996).label).toBe('Lowest since at least 1993');
  });
  test('the five-year outlier test uses five years', () => {
    const series = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y, i) => ({ y, val: i === 0 ? 1e6 : 100 + i }));
    // 2019's huge value is outside the five-year window, so it can't affect the result.
    expect(outlierBadge(series, 50, 2026)?.kind).toBe('plunge');
  });
});

describe('A8: rape is never compared across the 2024 definition change', () => {
  test('only full years from 2025 on', () => {
    expect(comparableSeries(H, 'Rape').every(d => d.y >= 2025)).toBe(true);
    expect(comparableSeries(H, 'Murder')[0].y).toBe(1993);
  });
  test('no rape badges, and rape is listed as left out of the recovery count', () => {
    const rape = rows('citywide', 'ytd').find(r => r.name === 'Rape');
    expect(getHistoricalContext(H, rape, YEAR, 'ytd')).toBeNull();
    const rec = getPrePandemicRecovery(rows('citywide', 'ytd'), H, YEAR, 'ytd');
    expect(rec.leftOut).toEqual(['Rape']);
    expect(rec.total).toBe(6);
    expect(rec.above.map(a => a.name)).not.toContain('Rape');
  });
});

describe('A3: no rates for precincts whose lines no longer match a population', () => {
  const pops = { '105th Precinct': 199218, '113th Precinct': 135221, '75th Precinct': 200994 };
  test('105th, 113th and 116th get no denominator; others do', () => {
    ['105th Precinct', '113th Precinct', '116th Precinct'].forEach(p => {
      expect(ratePopulation(p, pops, 8804190)).toBeNull();
      expect(REDRAWN_PRECINCTS[p]).toMatch(/December 2024/);
    });
    expect(ratePopulation('75th Precinct', pops, 8804190)).toBe(200994);
    expect(ratePopulation('citywide', pops, 8804190)).toBe(8804190);
    expect(ratePopulation('Nowhere', pops, 8804190)).toBeNull();
  });
});

describe('A6: a driver never gets a share above 100%', () => {
  test('offsetting moves are described, not turned into a share (30th Precinct, Nov. 15, 2026)', () => {
    const d = describeDriver(rows('30th Precinct', 'ytd'));
    expect(d.net).toBe(rows('30th Precinct', 'ytd').reduce((s, r) => s + r.diff, 0));
    if (d.share > 100) expect(d.offset).toBe(true);
    expect(d.diff + d.others).toBe(d.net);
  });
  test('the 123rd Precinct, where vehicle theft rose more than the net', () => {
    const d = describeDriver([{ name: 'G.L.A.', diff: 24 }, { name: 'Robbery', diff: -12 }, { name: 'Burglary', diff: -8 }]);
    expect(d).toMatchObject({ name: 'G.L.A.', net: 4, others: -20, offset: true });
  });
  test('a plain majority driver is a share', () => {
    const d = describeDriver([{ name: 'Gr. Larceny', diff: -60 }, { name: 'Robbery', diff: -40 }]);
    expect(d.offset).toBe(false);
    expect(d.share).toBeCloseTo(60);
  });
  test('no net change, no driver', () => {
    expect(describeDriver([{ name: 'Robbery', diff: 5 }, { name: 'Burglary', diff: -5 }])).toBeNull();
  });
});

describe('A4 and A5: other cities', () => {
  const csv = fs.readFileSync(path.join(__dirname, '__fixtures__', 'rtci-scorecard-2026-06-16-excerpt.csv'), 'utf8');
  const parsed = parseRTCIcsv(csv);
  test('a violent total with unreported parts is missing, not small (Washington, D.C., 2025)', () => {
    expect(parsed.cities['Washington|District of Columbia'].violent).toBeNull();
    expect(parsed.cities['Washington|District of Columbia'].murder).toBe(127);
  });
  test('complete violent totals pass', () => {
    expect(parsed.cities['New York City|New York'].violent).toBe(47211);
    expect(parsed.cities['Phoenix|Arizona'].violent).toBeGreaterThan(0);
  });
  test('the parts must add up', () => {
    const parts = { murder: 10, rape: 10, robbery: 10, aggravated_assault: 10 };
    expect(usableViolentTotal(40, parts)).toBe(40);
    expect(usableViolentTotal(80, parts)).toBeNull();
    expect(usableViolentTotal(30, { ...parts, rape: 0 })).toBeNull();
  });
  test('property crime is not compared (New York counts only felony larceny)', () => {
    expect(parsed.cities['New York City|New York'].property).toBeUndefined();
  });
  test('the largest-city groups follow the Census ranking: Phoenix is fifth', () => {
    expect(LARGEST_CITIES.slice(0, 5)).toEqual(['New York City|New York', 'Los Angeles|California', 'Chicago|Illinois', 'Houston|Texas', 'Phoenix|Arizona']);
    expect(LARGEST_CITIES).toHaveLength(10);
    expect(new Set(LARGEST_CITIES).size).toBe(10);
  });
});
