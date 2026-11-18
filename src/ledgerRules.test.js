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

// ---- Moderate findings (A10-A17) ----
import {
  changePhrase, headlineChange, totalBadge, rateOutliers, timesWord, PER_RESIDENT_EXCLUDED,
  rateConcentration, povertyQuartiles, SCATTER_EXCLUDED, SMALL_BASE, spell,
} from './ledgerRules';

describe('A10: misdemeanor histories are NYPD’s own table', () => {
  const by = Object.fromEntries(H.map(r => [r.y, r]));
  test('values match NYPD, “Misdemeanor Offenses 2000-2025”', () => {
    expect(by[2025]['Misd. Assault']).toBe(45889);
    expect(by[2015]['Misd. Assault']).toBe(42654);
    expect(by[2025]['Petit Larceny']).toBe(105591);
    expect(by[2000]['Petit Larceny']).toBe(93785);
  });
  test('misdemeanor assault starts after the 2015 classification change; nothing before 2000', () => {
    expect(comparableSeries(H, 'Misd. Assault')[0].y).toBe(2015);
    expect(comparableSeries(H, 'Petit Larceny')[0].y).toBe(2000);
  });
});

describe('A11: rate cards need a real base and a per-resident line', () => {
  const city = { Murder: 3, Housing: 50, Robbery: 140 };
  test('eight murders at four times the city rate is not enough to say so (101st Precinct)', () => {
    const r = rateOutliers([{ name: 'Murder', current: 8, prior: 6, currentRate: 12, isFelony: true }], city);
    expect(r.high).toBeNull();
  });
  test('housing and transit never get a per-resident card', () => {
    expect(PER_RESIDENT_EXCLUDED).toEqual(expect.arrayContaining(['Housing', 'Transit', 'Traffic Fatalities', 'Retail Theft']));
    const r = rateOutliers([{ name: 'Housing', current: 400, prior: 380, currentRate: 300 }], city);
    expect(r.high).toBeNull();
  });
  test('a big enough line passes, and the ratio reads in words', () => {
    const r = rateOutliers([{ name: 'Robbery', current: 300, prior: 280, currentRate: 280, isFelony: true }], city);
    expect(r.high.name).toBe('Robbery');
    expect(timesWord(r.high.ratio)).toBe('2.0 times');
  });
});

describe('A12: concentration ranks precincts by rate, not by count', () => {
  test('a big precinct with many crimes but a low rate is not "highest"', () => {
    const units = [
      { id: 'big', count: 900, pop: 300000 }, // rate 300
      ...Array.from({ length: 5 }, (_, i) => ({ id: `hot${i}`, count: 200, pop: 20000 })), // rate 1,000
      ...Array.from({ length: 10 }, (_, i) => ({ id: `low${i}`, count: 100, pop: 100000 })), // rate 100
    ];
    const c = rateConcentration(units);
    expect(c.topSum).toBe(1000);
    expect(c.bottomCount).toBe(10);
  });
  test('precincts without a population are never in it', () => {
    const units = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, count: 50 + i, pop: i === 0 ? null : 50000 }));
    expect(rateConcentration(units)).not.toBeNull();
    expect(rateConcentration(units.slice(0, 9))).toBeNull();
  });
});

describe('A15: the quartile table uses the scatter’s precincts', () => {
  test('the 14th is out of both', () => {
    expect(SCATTER_EXCLUDED).toContain('14th');
    const rows = Array.from({ length: 12 }, (_, i) => ({ n: i === 0 ? '14th' : `${i}0th`, pov: i, fa: i === 0 ? 99999 : 100, gl: 10 }));
    const q = povertyQuartiles(rows);
    expect(q.reduce((s, x) => s + x.n, 0)).toBe(11);
    expect(q.every(x => x.fa === 100)).toBe(true);
  });
});

describe('A17: headlines never print 0.0% for a non-change or a percent on a small base', () => {
  test('equal counts', () => {
    expect(changePhrase(18, 18)).toBe('unchanged at 18');
    expect(headlineChange(18, 18, 'this week')).toBe('Major index offenses are unchanged this week from a year earlier, at 18.');
  });
  test('from zero (22nd Precinct, week of Nov. 9-15, 2026)', () => {
    expect(changePhrase(3, 0)).toBe('up from none to three');
    expect(headlineChange(3, 0, 'this week')).toBe('Major index offenses total three this week, up from none a year earlier.');
  });
  test('small bases give counts (100th Precinct, 3 vs. 8)', () => {
    expect(changePhrase(3, 8)).toBe('down to three from eight');
    expect(headlineChange(3, 8, 'this week')).toBe('Major index offenses total three this week, down from eight a year earlier.');
    expect(totalBadge(3, 8).text).toBe('vs 8 last yr');
  });
  test('ordinary bases keep the percent', () => {
    expect(headlineChange(88, 100, 'year to date')).toBe('Major index offenses are down 12.0% year to date vs. prior year.');
    expect(totalBadge(88, 100).text).toBe('12.0% vs 100 last yr');
    expect(changePhrase(10001, 10000)).toBe('essentially flat');
    expect(SMALL_BASE).toBe(30);
    expect(spell(7)).toBe('seven');
    expect(spell(1234)).toBe('1,234');
  });
  test('no output ever reads "0.0%", "null" or "NaN"', () => {
    for (let p = 0; p < 50; p += 3) for (let c = 0; c < 50; c += 4) {
      const t = [changePhrase(c, p), headlineChange(c, p, 'this week'), totalBadge(c, p).text].join(' ');
      expect(t).not.toMatch(/\b0\.0%|null|NaN|undefined/);
    }
  });
});

// Minor findings, Nov. 18, 2026 audit.
import { PRECINCT_POPULATIONS_2020 } from './geoPopulations';
import { parseDay, apDate, apRange, apNow, fmt1, placePhrase, patrolBoroughPopulations, PATROL_BOROUGHS, precinctKey, lineLabel, NYPD_FOOTNOTES, changeCell } from './ledgerRules';

describe('minor: dates read the same in every time zone', () => {
  test('report dates are calendar days, not instants', () => {
    expect(parseDay('11/15/2026')).toEqual({ y: 2026, m: 11, d: 15 });
    expect(apDate('11/15/2026')).toBe('Nov. 15, 2026');
    expect(apDate('11/15/2026', { year: false })).toBe('Nov. 15');
    expect(apDate('2026-06-16')).toBe('June 16, 2026');
    expect(apDate('9/7/2026')).toBe('Sept. 7, 2026');
  });
  test('the formatter never goes through a Date, so the zone cannot shift it', () => {
    const real = global.Date;
    global.Date = function () { throw new Error('Date used'); };
    try { expect(apDate('3/8/2026')).toBe('March 8, 2026'); } finally { global.Date = real; }
  });
  test('ranges', () => {
    expect(apRange('11/9/2026', '11/15/2026')).toBe('Nov. 9-15, 2026');
    expect(apRange('10/27/2026', '11/2/2026')).toBe('Oct. 27-Nov. 2, 2026');
    expect(apRange('12/29/2026', '1/4/2027')).toBe('Dec. 29, 2026-Jan. 4, 2027');
  });
  test('the viewer clock in AP style', () => {
    expect(apNow(new Date(2026, 10, 18, 15, 5))).toBe('Nov. 18, 2026, 3:05 p.m.');
    expect(apNow(new Date(2026, 10, 18, 0, 30))).toBe('Nov. 18, 2026, 12:30 a.m.');
  });
});

describe('minor: Bronx North and Bronx South get populations', () => {
  const pb = patrolBoroughPopulations(PRECINCT_POPULATIONS_2020);
  test('every patrol borough is the sum of its precincts', () => {
    Object.entries(PATROL_BOROUGHS).forEach(([name, nums]) => {
      expect(pb[name]).toBe(nums.reduce((s, n) => s + (PRECINCT_POPULATIONS_2020[precinctKey(n)] || 0), 0));
    });
    expect(pb['Bronx North']).toBe(759084);
    expect(pb['Bronx South']).toBe(718388);
    expect(pb['Bronx North'] + pb['Bronx South']).toBe(1477472); // the pre-split Bronx total
    expect(pb['Manhattan South']).toBe(684541);
  });
  test('every listed precinct but the 116th has a population', () => {
    Object.values(PATROL_BOROUGHS).flat().filter((n) => n !== 116).forEach((n) => expect(PRECINCT_POPULATIONS_2020[precinctKey(n)]).toBeGreaterThan(0));
    expect(precinctKey(111)).toBe('111th Precinct');
    expect(precinctKey(101)).toBe('101st Precinct');
  });
});

describe('minor: style', () => {
  test('places in sentences', () => {
    expect(placePhrase('7th Precinct')).toBe('in the 7th Precinct');
    expect(placePhrase('Staten Island')).toBe('on Staten Island');
    expect(placePhrase('Bronx North')).toBe('in Bronx North');
    expect(placePhrase('Bronx')).toBe('in the Bronx');
    expect(placePhrase('citywide')).toBe('citywide');
  });
  test('thousands commas on rates', () => {
    expect(fmt1(1304)).toBe('1,304.0');
    expect(fmt1(2.75)).toBe('2.8');
    expect(fmt1(NaN)).toBe('—');
  });
  test("NYPD's asterisk becomes a footnote, not a second star", () => {
    expect(lineLabel('UCR Rape*')).toBe('UCR Rape');
    expect(NYPD_FOOTNOTES['UCR Rape*']).toMatch(/FBI UCR definition of rape/);
  });
  test('rises from zero show as rises', () => {
    expect(changeCell(10, 0)).toEqual({ dir: 1, text: 'new' });
    expect(changeCell(0, 0)).toEqual({ dir: 0, text: '—' });
    expect(changeCell(8, 10)).toEqual({ dir: -1, text: '20.0%' });
  });
});
