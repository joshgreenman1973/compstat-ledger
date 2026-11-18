import * as S from './stats';
import snapshot from './snapshot-2026-09-20.json';
import crimeHistory from '../data/crime_history.json';
import {
  extractRows, sumRows, poissonZ, verdictFor, noiseBandPct, buildHeadline, frequencyRatio,
  paceRange, arcClaim, concentration, rapeYoYComparable, apDate, parseRTCI, peerComparison,
  PEER_GROUPS, MAJORS, quantileCuts, binFor, zBin, historicalColumns,
  revisionFlows, breakEven, revisionRisk, withRevisions,
  dispersionFor, dispersionForSum, Z_HEAD, clause, pTwoSided, benjaminiHochberg, withChance, fmtPct,
  redrawnSince, isSplitPrecinct, spell,
  relativeZ, twoYearsBack, trendShape, notableMoves, contributions, annualRun, PATROL_BOROUGHS,
  smallBase, SMALL_BASE,
} from './stats';

const cw = snapshot.citywide;
const ytd = extractRows(cw, 'ytd');
const row = (rows, name) => rows.find((r) => r.name === name);

describe('rows come straight from the NYPD feed', () => {
  test('murder YTD matches the Sept. 20, 2026 CompStat report', () => {
    const m = row(ytd, 'Murder');
    expect(m.cur).toBe(189);
    expect(m.prior).toBe(250);
    expect(m.pct).toBeCloseTo(-24.4, 1);
    expect(m.pct).toBeCloseTo(cw.seven_major_felonies.Murder.year_to_date.pct_change, 1);
  });

  test('recomputed % change matches NYPD pct_change for every line', () => {
    ytd.filter((r) => r.pct != null).forEach((r) => {
      const src = (cw.seven_major_felonies[r.name] || cw.additional_stats[r.name]).year_to_date.pct_change;
      expect(r.pct).toBeCloseTo(src, 1);
    });
  });

  test('seven-major sum equals NYPD total_seven_major', () => {
    const t = sumRows(ytd, MAJORS, 'Seven major felonies');
    expect(t.cur).toBe(cw.total_seven_major.year_to_date.current_year);
    expect(t.prior).toBe(cw.total_seven_major.year_to_date.prior_year);
  });
});

describe('signal vs. noise', () => {
  test('z statistic', () => {
    expect(poissonZ(189, 250)).toBeCloseTo(-60 / Math.sqrt(439), 6);
    expect(poissonZ(0, 0)).toBeNull();
    expect(poissonZ(7, 7)).toBe(0);
    expect(poissonZ(4, 0)).toBeCloseTo(1.5, 6); // not "real": exact binomial p = 0.125
  });
  test('never calls a change real that the exact binomial test calls noise', () => {
    // Given n = c + p events, under "no change" c ~ Binomial(n, 1/2). Two-sided exact p-value.
    const lf = [0]; for (let i = 1; i <= 300; i++) lf[i] = lf[i - 1] + Math.log(i);
    const exactP = (c, p) => {
      const n = c + p; const k = Math.min(c, p); let tail = 0;
      for (let i = 0; i <= k; i++) tail += Math.exp(lf[n] - lf[i] - lf[n - i] - n * Math.LN2);
      return Math.min(1, 2 * tail);
    };
    let overcalls = 0;
    for (let c = 0; c <= 150; c++) {
      for (let p = 0; p <= 150; p++) {
        if (c + p === 0) continue;
        const real = Math.abs(poissonZ(c, p)) >= 1.96;
        if (real && exactP(c, p) >= 0.05) overcalls++;
      }
    }
    expect(overcalls).toBe(0);
  });
  test('verdicts on the snapshot, allowing for how lumpy each line is', () => {
    expect(row(ytd, 'Murder').verdict).toBe('drop'); // murder varies no more than a plain random count
    expect(row(ytd, 'Fel. Assault').verdict).toBe('noise');
    expect(row(ytd, 'Rape').verdict).toBe('noise');
    // 581 vs. 668 clears 1.96 as a plain count (z −2.43) but shooting victims vary about 2.3 times as
    // much as that week to week (one shooting, several victims), so it is within chance.
    expect(poissonZ(581, 668)).toBeLessThan(-1.96);
    expect(row(ytd, 'Shooting Vic.').verdict).toBe('noise');
    expect(row(ytd, 'Hate Crimes').verdict).toBe('noise'); // 456 vs 393: z 2.13 plain, 1.69 adjusted
    expect(row(ytd, 'Misd. Assault').verdict).toBe('noise');
    expect(row(ytd, 'Retail Theft').verdict).toBe('drop'); // a big change survives any adjustment
  });
  test('dispersion is measured, never below 1, and widens the test', () => {
    expect(dispersionFor('Murder', 'city')).toBe(1); // measured 0.65: floored
    expect(dispersionFor('Shooting Vic.', 'city')).toBeGreaterThan(2);
    expect(dispersionFor('Shooting Vic.', 'precinct')).toBeLessThan(dispersionFor('Shooting Vic.', 'city'));
    expect(dispersionFor('No such line')).toBe(1);
    expect(poissonZ(150, 100, 4)).toBeCloseTo(poissonZ(150, 100) / 2, 10);
    expect(dispersionForSum([{ name: 'Murder', n: 100 }, { name: 'Shooting Vic.', n: 100 }], 'city'))
      .toBeCloseTo((1 + dispersionFor('Shooting Vic.', 'city')) / 2, 10);
    // the seven majors move together: never less than the dispersion measured on their total
    expect(dispersionForSum(MAJORS.map((name) => ({ name, n: 10 })), 'city')).toBeGreaterThanOrEqual(dispersionFor('_majors', 'city'));
  });
  test('the noise band and the verdict agree', () => {
    ytd.filter((r) => r.band != null && r.verdict !== 'flagged').forEach((r) => {
      const outside = Math.abs(r.pct) >= r.band;
      expect(outside).toBe(r.verdict === 'drop' || r.verdict === 'rise');
    });
  });
  test('verdictFor thresholds', () => {
    expect(verdictFor(-1.95)).toBe('noise');
    expect(verdictFor(-1.96)).toBe('drop');
    expect(verdictFor(2)).toBe('rise');
    expect(verdictFor(null)).toBe('none');
    expect(noiseBandPct(5, 0)).toBeNull();
  });
  test('a big weekly percentage on tiny counts is noise', () => {
    const wk = extractRows(cw, 'wtd');
    const m = row(wk, 'Murder'); // 3 vs 6: "down 50%"
    expect(m.pct).toBeCloseTo(-50, 5);
    expect(m.verdict).toBe('noise');
  });
});

describe('headline', () => {
  test('leads with the gravest change beyond the headline bar, then the counterpoint', () => {
    const h = buildHeadline(ytd);
    // murder z −2.87 clears the stricter headline bar (2.73); felony assault is +0.9%: flat, not "isn't falling"
    expect(Math.abs(row(ytd, 'Murder').z)).toBeGreaterThan(Z_HEAD);
    expect(h.sentences).toEqual(['Murder is down 24%.', 'Felony assault is essentially flat.']);
    expect(h.kind).toBe('split');
  });
  test('a change that clears 1.96 but not the headline bar does not headline', () => {
    const rows = [{ name: 'Robbery', label: 'Robbery', cur: 80, prior: 110, pct: -27.3, phi: 1, z: poissonZ(80, 110), verdict: verdictFor(poissonZ(80, 110)) }];
    expect(rows[0].verdict).toBe('drop'); // z ≈ −2.1
    const h = buildHeadline(rows);
    expect(h.lead).toBeNull();
    expect(h.sentences).toEqual(['No major crime’s change clears the stricter headline threshold.']);
    expect(h.cleared.map((r) => r.name)).toEqual(['Robbery']);
  });
  test('small bases headline in counts, not percentages', () => {
    expect(clause({ name: 'Murder', label: 'Murder', cur: 8, prior: 1, pct: 700 }, 'rise')).toBe('Murders rose to eight from one.');
    expect(clause({ name: 'Fel. Assault', label: 'Felony assault', cur: 0, prior: 12, pct: -100 }, 'drop')).toBe('No felony assaults, down from 12.');
    expect(clause({ name: 'Robbery', label: 'Robbery', cur: 1, prior: 0, pct: null }, 'rise')).toBe('One robbery, up from none.');
    expect(clause({ name: 'Robbery', label: 'Robbery', cur: 60, prior: 100, pct: -40 }, 'drop')).toBe('Robbery is down 40%.');
  });
  test('says so when nothing clears the bar', () => {
    const flat = ytd.map((r) => ({ ...r, verdict: 'noise' }));
    expect(buildHeadline(flat).sentences[0]).toBe('No major crime’s change clears this model’s threshold.');
  });
  test('frequency ratio, only on enough murders to mean something', () => {
    const f = frequencyRatio(ytd);
    expect(f.display).toBe(String(Math.round(22023 / 189)));
    expect(frequencyRatio([{ name: 'Fel. Assault', cur: 153 }, { name: 'Murder', cur: 1 }])).toBeNull();
  });
});

describe('rape definition guard', () => {
  test('2026 YTD compares two post-change windows', () => {
    expect(rapeYoYComparable('ytd', '9/20/2026')).toBe(true);
  });
  test('2025 YTD straddles the Sept. 1, 2024 change', () => {
    expect(rapeYoYComparable('ytd', '9/21/2025')).toBe(false);
    expect(rapeYoYComparable('wtd', '9/21/2025')).toBe(true);
    expect(rapeYoYComparable('wtd', '8/10/2025')).toBe(false);
  });
});

describe('pace and the long arc', () => {
  const series = crimeHistory.citywide.map((d) => ({ y: d.y, val: d.Murder }));
  const p = paceRange({ cur: 189, priorYtd: 250, priorFull: 309, weekEnd: '9/20/2026' });
  test('two projection methods bracket the pace', () => {
    expect(p.linear).toBeCloseTo(189 / (263 / 365), 6);
    expect(p.seasonal).toBeCloseTo(189 / (250 / 309), 6);
    expect(p.low).toBeLessThanOrEqual(p.high);
  });
  test('claims are conservative: must hold at the high end of the range', () => {
    const c = arcClaim(series, p);
    expect(c.kind).toBe('record-low'); // 262 < 292 (2017), the series low
    const c2 = arcClaim(series, { low: 290, high: 300 });
    expect(c2.kind).toBe('low-since');
    expect(c2.since).toBe(2018); // 2018 = 295 <= 300
  });
  test('no projection early in the year', () => {
    expect(paceRange({ cur: 36, priorYtd: 61, priorFull: 309, weekEnd: '3/8/2026' }).tooEarly).toBe(true);
  });
});

describe('historical columns are fixed base years, not "N years ago"', () => {
  test('back-calculated bases match 1993 and 2010 same-period levels', () => {
    const cols = historicalColumns(2026);
    expect(cols.map((c) => c.year)).toEqual([2024, 2010, 1993]);
    const m = cw.seven_major_felonies.Murder;
    const base1993 = 189 / (1 + m.historical['31_yr_pct'] / 100);
    const base2010 = 189 / (1 + m.historical['14_yr_pct'] / 100);
    const share = 250 / 309; // share of the year elapsed by this date, from 2025's shape
    const full = (y) => crimeHistory.citywide.find((d) => d.y === y).Murder;
    // Implied full-year totals land within 15% of the named year, and far from the alternative.
    expect(Math.abs(base1993 / share / full(1993) - 1)).toBeLessThan(0.15);
    expect(Math.abs(base1993 / share / full(1995) - 1)).toBeGreaterThan(0.3);
    expect(Math.abs(base2010 / share / full(2010) - 1)).toBeLessThan(0.15);
  });
});

describe('concentration', () => {
  test('counts the fewest places that hold half the total', () => {
    const c = concentration([
      { id: 'a', label: 'A', count: 50, pop: 10 },
      { id: 'b', label: 'B', count: 30, pop: 10 },
      { id: 'c', label: 'C', count: 20, pop: 80 },
    ]);
    expect(c.k).toBe(1);
    expect(c.popShare).toBeCloseTo(0.1, 6);
  });
});

describe('bins', () => {
  test('quintiles and z bins', () => {
    const cuts = quantileCuts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(cuts).toHaveLength(4);
    expect(binFor(1, cuts)).toBe(0);
    expect(binFor(10, cuts)).toBe(4);
    expect(zBin(-4)).toBe(-2);
    expect(zBin(0.5)).toBe(0);
    expect(zBin(2.5)).toBe(1);
  });
});

describe('AP dates', () => {
  test('abbreviates the right months', () => {
    expect(apDate('9/20/2026')).toBe('Sept. 20, 2026');
    expect(apDate('3/8/2026')).toBe('March 8, 2026');
    expect(apDate('12/1/2025', { year: false })).toBe('Dec. 1');
  });
});

describe('peer cities', () => {
  const csv = [
    '"agency_name","state_name","crime_type","ytd_month_range","previous_year_full","current_year_ytd","population","last_updated"',
    '"New York City","New York","murder","Jan - Apr 2026",305,76,8496850,"2026-06-16"',
    '"Jacksonville","Florida","murder","Jan - Apr 2026",80,16,1008920,"2026-06-16"',
    '"Jacksonville","North Carolina","murder","Jan - Apr 2026",3,1,70256,"2026-06-16"',
    '"Chicago","Illinois","murder","Jan - Apr 2026",429,132,2715488,"2026-06-16"',
    '"San Diego","California","murder","Jan - Mar 2026",32,7,1409432,"2026-06-16"',
  ].join('\n');
  const parsed = parseRTCI(csv);
  test('keys by agency and state', () => {
    expect(parsed.cities['Jacksonville|Florida'].pop).toBe(1008920);
    expect(parsed.cities['Jacksonville|North Carolina'].pop).toBe(70256);
  });
  test('compares full-year rates, even when YTD windows differ', () => {
    const cmp = peerComparison(parsed, PEER_GROUPS[0]);
    expect(cmp.year).toBe(2025);
    expect(cmp.nyc.rate).toBeCloseTo(305 / 8496850 * 1e5, 6);
    expect(cmp.list.map((c) => c.agency)).toEqual(['San Diego', 'New York City', 'Chicago']);
    expect(cmp.higher).toBe(1);
  });
});

describe('revisions', () => {
  const snap = (end, rows) => ({
    citywide: {
      report_period: { week_end: end },
      seven_major_felonies: Object.fromEntries(Object.entries(rows).map(([n, [ytdC, ytdP, wkC, wkP]]) => [n, {
        year_to_date: { current_year: ytdC, prior_year: ytdP }, week_to_date: { current_year: wkC, prior_year: wkP },
      }])),
      additional_stats: {},
    },
  });
  test('YTD(t) − YTD(t−1) − week(t) isolates revisions to earlier weeks', () => {
    const flows = revisionFlows([
      snap('9/6/2026', { Murder: [180, 230, 5, 6] }),
      snap('9/13/2026', { Murder: [187, 236, 5, 6] }), // 180 + 5 = 185 → 2 added by revision
      snap('9/20/2026', { Murder: [193, 242, 3, 6] }), // 187 + 3 = 190 → 3 added
    ]);
    expect(flows.weeks).toBe(2);
    expect(flows.byGeo.citywide.Murder).toEqual({ cur: 5, prior: 0 });
  });
  test('stops at a missing week or a New Year boundary', () => {
    const gap = revisionFlows([
      snap('8/30/2026', { Murder: [170, 220, 5, 5] }),
      snap('9/13/2026', { Murder: [187, 236, 5, 6] }),
      snap('9/20/2026', { Murder: [193, 242, 3, 6] }),
    ]);
    expect(gap.weeks).toBe(1);
    const ny = revisionFlows([snap('12/28/2025', { Murder: [300, 370, 5, 5] }), snap('1/4/2026', { Murder: [4, 6, 4, 6] })]);
    expect(ny).toBeNull();
  });
  const rise = { name: 'Test', cur: 150, prior: 100, phi: 1, verdict: verdictFor(poissonZ(150, 100)) }; // z ≈ 3.1
  test('break-even: the smallest revision that turns a real change into noise', () => {
    const m = row(ytd, 'Murder'); // 189 vs 250
    expect(breakEven(m)).toBe(19); // 208 vs 250 is noise; 207 vs 250 is still real
    expect(verdictFor(poissonZ(189 + 18, 250))).toBe('drop');
    expect(verdictFor(poissonZ(189 + 19, 250))).toBe('noise');
    const be = breakEven(rise); // a rise weakens if revised down
    expect(verdictFor(poissonZ(rise.cur - be, rise.prior))).toBe('noise');
    expect(verdictFor(poissonZ(rise.cur - be + 1, rise.prior))).toBe('rise');
    // a lumpier line has less cushion
    expect(breakEven({ ...rise, phi: 2, verdict: verdictFor(poissonZ(150, 100, 2)) })).toBeLessThan(be);
  });
  test('fragile when fewer than eight weeks of recent revisions would erase it', () => {
    expect(revisionRisk(rise, { cur: -60, prior: 0, weeks: 8 }).fragile).toBe(true);
    expect(revisionRisk(row(ytd, 'Murder'), { cur: 8, prior: 0, weeks: 8 }).fragile).toBe(false);
    // Revisions running the other way can't erase it.
    const opp = revisionRisk(rise, { cur: 50, prior: 0, weeks: 8 });
    expect(opp.weeksToErase).toBe(Infinity);
    expect(opp.direction).toBe('opposite');
    // No net revisions at all is not "the other way."
    expect(revisionRisk(rise, { cur: 0, prior: 0, weeks: 8 }).direction).toBe('none');
  });
  test('a fragile change never leads the headline', () => {
    const rows = withRevisions(ytd, { Murder: { cur: 200, prior: 0 } }, 8); // absurd pace: murder fragile
    const h = buildHeadline(rows);
    expect(h.lead.name).not.toBe('Murder');
    expect(rows.find((r) => r.name === 'Murder').fragile).toBe(true);
  });
});

describe('many tests at once', () => {
  test('two-sided p-values', () => {
    expect(pTwoSided(1.96)).toBeCloseTo(0.05, 3);
    expect(pTwoSided(0)).toBeCloseTo(1, 6);
    expect(pTwoSided(-3.29)).toBeCloseTo(0.001, 4);
  });
  test('Benjamini–Hochberg keeps the smallest p-values up to the largest rank under its line', () => {
    // m = 5, q = 0.05: lines at 0.01, 0.02, 0.03, 0.04, 0.05
    expect([...benjaminiHochberg([0.001, 0.8, 0.019, 0.04, 0.2])].sort()).toEqual([0, 2]);
    expect(benjaminiHochberg([0.3, 0.6]).size).toBe(0);
    // 78 precincts each at p = 0.04 would all pass one at a time, and all pass together too
    expect(benjaminiHochberg(Array(78).fill(0.04)).size).toBe(78);
    // one precinct at p = 0.04 among 77 at p = 0.9 does not survive
    expect(benjaminiHochberg([0.04, ...Array(77).fill(0.9)]).size).toBe(0);
  });
});

describe('rest-of-year chance', () => {
  test('widens both ends by 1.96 × √(φ × the count still to come), never below what is recorded', () => {
    const r = withChance({ low: 234, high: 273 }, 189, 1);
    expect(r.high).toBeCloseTo(273 + 1.96 * Math.sqrt(273 - 189), 6);
    expect(r.low).toBeCloseTo(234 - 1.96 * Math.sqrt(234 - 189), 6);
    expect(withChance({ low: 190, high: 200 }, 189, 9).low).toBe(189);
  });
});

describe('formatting and geography', () => {
  test('no negative zero, AP numbers', () => {
    expect(fmtPct(-0.36, 0)).toBe('0%');
    expect(fmtPct(-0.6, 0)).toBe('−1%');
    expect(spell(0)).toBe('no');
    expect(spell(9)).toBe('nine');
    expect(spell(10)).toBe('10');
  });
  test('redrawn precincts and the 105th/113th/116th group', () => {
    expect(redrawnSince(2010, '113th Precinct')).toBe(true);
    expect(redrawnSince(2010, '34th Precinct')).toBe(false);
    expect(redrawnSince(1993, '34th Precinct')).toBe(true);
    expect(isSplitPrecinct('113th Precinct')).toBe(true);
  });
});

describe('notable trends', () => {
  test('the relative test reduces to the plain test when the city is flat', () => {
    expect(relativeZ(150, 100, 1000, 1000)).toBeCloseTo(poissonZ(150, 100), 10);
    // a precinct falling exactly as fast as the city doesn't stand out
    expect(Math.abs(relativeZ(88, 100, 8800, 10000))).toBeLessThan(0.1);
    // flat while the city falls 30%: stands out upward
    expect(relativeZ(100, 100, 7000, 10000)).toBeGreaterThan(1.96);
  });
  test('two years back and the shape of a move', () => {
    expect(twoYearsBack(150, 50)).toBe(100);
    expect(twoYearsBack(0, -100)).toBeNull();
    expect(trendShape(200, 150, 100, 1, 1).kind).toBe('again'); // up last year too
    expect(trendShape(100, 150, 100, 1, -1).kind).toBe('rebound'); // down after last year's jump
    expect(trendShape(200, 150, 148, 1, 1).kind).toBe('new');
  });
  const raw = {
    citywide: { seven_major_felonies: { Robbery: { year_to_date: { current_year: 8800, prior_year: 10000 } } }, additional_stats: {} },
    'A Precinct': { seven_major_felonies: { Robbery: { year_to_date: { current_year: 300, prior_year: 150 }, historical: { '2_yr_pct': 100 } } }, additional_stats: {} },
    'B Precinct': { seven_major_felonies: { Robbery: { year_to_date: { current_year: 88, prior_year: 100 } } }, additional_stats: {} },
    'C Precinct': { seven_major_felonies: { Robbery: { year_to_date: { current_year: 40, prior_year: 120 } } }, additional_stats: {} },
  };
  test('a move is notable only if it clears chance, stands out from the city and survives the correction', () => {
    const r = notableMoves({ raw, places: ['A Precinct', 'B Precinct', 'C Precinct'], crimes: ['Robbery'] });
    expect(r.rises.map((x) => x.geo)).toEqual(['A Precinct']);
    expect(r.drops.map((x) => x.geo)).toEqual(['C Precinct']);
    expect(r.all.find((x) => x.geo === 'B Precinct').notable).toBe(false); // moving with the city
    expect(r.rises[0].shape.kind).toBe('new'); // 2024 was 150 as well
    expect(r.rises[0].rank).toBe(1);
  });
  test('where the citywide change came from', () => {
    const c = contributions(raw, ['A Precinct', 'B Precinct', 'C Precinct'], 'Robbery', 'ytd', 2);
    expect(c.net).toBe(-1200);
    expect(c.lead.map((m) => m.geo)).toEqual(['C Precinct', 'B Precinct']);
    expect(c.share).toBeCloseTo(92 / 1200, 10);
  });
  test('annual runs', () => {
    const r = annualRun([{ y: 2021, val: 488 }, { y: 2022, val: 438 }, { y: 2023, val: 391 }, { y: 2024, val: 382 }, { y: 2025, val: 309 }]);
    expect(r).toMatchObject({ dir: -1, years: 4, from: { y: 2021 } });
    expect(annualRun([{ y: 2024, val: 1 }, { y: 2025, val: 2 }]).years).toBe(1);
  });
  test('patrol boroughs cover every precinct once', () => {
    const all = Object.values(PATROL_BOROUGHS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(78);
  });
});

describe('small bases', () => {
  test('under 30 last year, as in the original ledger', () => {
    expect(SMALL_BASE).toBe(30);
    expect(smallBase(29)).toBe(true);
    expect(smallBase(30)).toBe(false);
    expect(smallBase(null)).toBe(false);
  });
  test('headlines on a small base give counts', () => {
    expect(clause({ name: 'Robbery', label: 'Robbery', cur: 12, prior: 25, pct: -52 }, 'drop')).toBe('Robberies fell to 12 from 25.');
    expect(clause({ name: 'Robbery', label: 'Robbery', cur: 20, prior: 30, pct: -33.3 }, 'drop')).toBe('Robbery is down 33%.');
  });
});

describe('boroughs', () => {
  const line = (wc, wp, yc, yp, h) => ({
    week_to_date: { current_year: wc, prior_year: wp }, year_to_date: { current_year: yc, prior_year: yp },
    ...(h ? { historical: h } : {}),
  });
  test('sumLine adds counts and leaves out any a part lacks', () => {
    const s = S.sumLine([line(1, 2, 100, 80), line(3, null, 50, 20)]);
    expect(s.week_to_date.current_year).toBe(4);
    expect(s.week_to_date.prior_year).toBe(null);
    expect(s.year_to_date).toMatchObject({ current_year: 150, prior_year: 100 });
    expect(s.year_to_date.pct_change).toBeCloseTo(50);
  });
  test('long-view percents are rebuilt from each part\'s base-year count', () => {
    // bases: 100 / 0.5 = 200 and 50 / 1.25 = 40; (150 / 240 − 1) = −37.5%
    const s = S.sumLine([line(0, 0, 100, 90, { '31_yr_pct': -50 }), line(0, 0, 50, 40, { '31_yr_pct': 25 })]);
    expect(s.historical['31_yr_pct']).toBeCloseTo(-37.5);
    // a part at zero can't reveal its base, so the sum gets no long view
    const z = S.sumLine([line(0, 0, 100, 90, { '31_yr_pct': -50 }), line(0, 0, 0, 3, { '31_yr_pct': -100 })]);
    expect(z.historical).toBeUndefined();
  });
  test('withBoroughs sums patrol boroughs and leaves reported ones alone', () => {
    const g = (n) => ({ report_period: { week_end: '9/20/2026' }, seven_major_felonies: { Murder: line(n, n, n, n) }, additional_stats: {}, total_seven_major: line(n, n, n, n) });
    const rep = S.withBoroughs({
      citywide: g(99), 'Brooklyn South': g(3), 'Brooklyn North': g(4), Bronx: g(7), 'Staten Island': g(1), 'Queens South': g(2),
    });
    expect(rep.Brooklyn.seven_major_felonies.Murder.year_to_date.current_year).toBe(7);
    expect(rep.Brooklyn.total_seven_major.year_to_date.current_year).toBe(7);
    expect(rep.Brooklyn.summedFrom).toEqual(['Brooklyn South', 'Brooklyn North']);
    expect(rep.Bronx.summedFrom).toBeUndefined(); // the Bronx before its split, as reported
    expect(rep['Staten Island'].summedFrom).toBeUndefined();
    expect(rep.Queens).toBeUndefined(); // Queens North missing: no Queens
    expect(rep.Manhattan).toBeUndefined();
    expect(S.withBoroughs({ citywide: g(1) })).toEqual({ citywide: g(1) });
  });
  test('levels, membership and wording', () => {
    expect(S.LEVEL('Brooklyn')).toBe('county');
    expect(S.LEVEL('Staten Island')).toBe('county');
    expect(S.LEVEL('Bronx North')).toBe('borough');
    expect(S.dispersionFor('Murder', 'county')).toBeGreaterThanOrEqual(1);
    expect(S.inBorough('Bronx', '50th Precinct')).toBe(true);
    expect(S.inBorough('Queens', '116th Precinct')).toBe(true);
    expect(S.inBorough('Queens', '75th Precinct')).toBe(false);
    expect(S.inBoroughPhrase('Bronx')).toBe('in the Bronx');
    expect(S.inBoroughPhrase('Staten Island')).toBe('on Staten Island');
    expect(S.inBoroughPhrase('Queens')).toBe('in Queens');
  });
});

// Guards from the Nov. 18, 2026 audit (B1-B4, B8, B14 and the January checks). Each one keys off the
// report's own dates and counts, never a calendar year written into the code, so it keeps holding.
describe('audit B1, B2, B8: no percent on a base under 30, and none at all on zero', () => {
  test('counts below 30, percents from 30 up', () => {
    expect(S.changeWords(47, 23)).toBe('up to 47 from 23'); // 123rd Precinct vehicle theft, Nov. 15, 2026
    expect(S.changeWords(3, 0)).toBe('up from none to three'); // 22nd Precinct, week of Nov. 9-15, 2026
    expect(S.changeWords(0, 0)).toBe('zero both years');
    expect(S.changeWords(5, 5)).toBe('unchanged at five');
    expect(S.changeWords(3, 8)).toBe('down to three from eight');
    expect(S.changeWords(88, 100)).toBe('down 12%');
    expect(S.changeWords(30, 30)).toBe('unchanged');
  });
  test('nothing in the output is ever "null", "NaN" or a percent on a small base', () => {
    for (let prior = 0; prior < 60; prior++) {
      for (let cur = 0; cur < 60; cur += 7) {
        const w = S.changeWords(cur, prior);
        expect(w).not.toMatch(/null|NaN|undefined|Infinity/);
        if (prior < SMALL_BASE) expect(w).not.toMatch(/%/);
      }
    }
    expect(S.changeWords(null, 5)).toBe('');
  });
});

describe('audit B3: rape is never compared across the Sept. 1, 2024 definition change', () => {
  test('two years back: not in 2026, yes from the first 2027 report', () => {
    expect(S.rapeComparable('ytd', '11/15/2026', 2)).toBe(false); // Jan. 1, 2024 start
    expect(S.rapeComparable('ytd', '1/4/2027', 2)).toBe(true); // Jan. 1, 2025 start
    expect(S.rapeComparable('wtd', '11/15/2026', 2)).toBe(true); // Nov. 9-15, 2024
    expect(S.rapeComparable('wtd', '8/16/2026', 2)).toBe(false); // Aug. 10-16, 2024
  });
  const raw = (weekEnd) => ({
    citywide: { report_period: { week_end: weekEnd }, seven_major_felonies: { Rape: { year_to_date: { current_year: 2000, prior_year: 2200 } }, Robbery: { year_to_date: { current_year: 8800, prior_year: 10000 } } }, additional_stats: {} },
    '41st Precinct': { seven_major_felonies: {
      Rape: { year_to_date: { current_year: 19, prior_year: 43 }, historical: { '2_yr_pct': -45.7 } },
      Robbery: { year_to_date: { current_year: 300, prior_year: 150 }, historical: { '2_yr_pct': 100 } },
    }, additional_stats: {} },
  });
  test('no two-year shape for rape in 2026; other crimes keep theirs', () => {
    const r = notableMoves({ raw: raw('11/15/2026'), places: ['41st Precinct'], crimes: ['Rape', 'Robbery'] });
    expect(r.all.find((x) => x.name === 'Rape').shape).toBeNull();
    expect(r.all.find((x) => x.name === 'Robbery').shape).not.toBeNull();
  });
  test('in 2027 the rape window two years back starts after the change, so the shape returns', () => {
    const r = notableMoves({ raw: raw('1/4/2027'), places: ['41st Precinct'], crimes: ['Rape'] });
    expect(r.all[0].shape).not.toBeNull();
  });
});

describe('audit B4: a pace claim needs a margin, and says "at least" when it should', () => {
  const series = crimeHistory.citywide.map((d) => ({ y: d.y, val: d.Murder }));
  test('murder, Nov. 15, 2026: a high end 0.53 below 2025 makes no claim', () => {
    expect(arcClaim(series, { low: 252, high: 308.47 }).kind).toBe('in-line');
  });
  test('a year inside the range makes it "since at least"', () => {
    const c = arcClaim(series, { low: 290, high: 300 });
    expect(c).toMatchObject({ kind: 'low-since', since: 2018, atLeast: true });
  });
  test('a year clearly below the range is a plain "since"', () => {
    const s = [{ y: 2018, val: 100 }, { y: 2019, val: 300 }, { y: 2020, val: 310 }, { y: 2021, val: 320 }, { y: 2022, val: 330 }];
    expect(arcClaim(s, { low: 150, high: 200 })).toMatchObject({ kind: 'low-since', since: 2018, atLeast: false });
  });
  test('the margin is 1% of last year, at least one crime', () => {
    expect(S.claimMargin(309)).toBeCloseTo(3.09);
    expect(S.claimMargin(40)).toBe(1);
    const s = [{ y: 2023, val: 50 }, { y: 2024, val: 38 }, { y: 2025, val: 40 }];
    expect(arcClaim(s, { low: 30, high: 39.5 }).kind).toBe('in-line');
    expect(arcClaim(s, { low: 30, high: 39 }).kind).toBe('below-last'); // 2024 was lower still
  });
  test('rises get the same treatment', () => {
    const s = [{ y: 2018, val: 500 }, { y: 2019, val: 300 }, { y: 2020, val: 310 }, { y: 2021, val: 320 }, { y: 2022, val: 330 }];
    expect(arcClaim(s, { low: 332, high: 360 }).kind).toBe('in-line');
    expect(arcClaim(s, { low: 400, high: 450 })).toMatchObject({ kind: 'high-since', since: 2018, atLeast: false });
  });
});

describe('January: dates that cross the New Year say both years', () => {
  const rp = (start, end) => ({ week_start: start, week_end: end });
  test('a week across the New Year', () => {
    const P = S.periodText('wtd', rp('12/29/2026', '1/4/2027'));
    expect(P.dates).toBe('Dec. 29, 2026-Jan. 4, 2027');
    expect(P.cmp).toBe('the same week a year earlier');
    expect(P.kicker).not.toMatch(/of 2026$/);
  });
  test('28 days across the New Year', () => {
    const P = S.periodText('d28', rp('12/29/2026', '1/4/2027'));
    expect(P.dates).toBe('Dec. 8, 2026-Jan. 4, 2027');
    expect(P.tag).toBe('Dec. 8, 2026-Jan. 4, 2027 vs. the same dates a year earlier');
  });
  test('year to date in the first days of January', () => {
    expect(S.periodText('ytd', rp('12/29/2026', '1/4/2027')).dates).toBe('Jan. 1-4, 2027');
    expect(S.periodText('ytd', rp('12/26/2026', '1/1/2027')).dates).toBe('Jan. 1, 2027');
    expect(S.periodText('ytd', rp('12/29/2026', '1/4/2027')).cmp).toBe('the same period of 2026');
  });
  test('ordinary weeks read as before', () => {
    const w = S.periodText('wtd', rp('11/9/2026', '11/15/2026'));
    expect(w.dates).toBe('Nov. 9-15, 2026');
    expect(w.cmp).toBe('the same week of 2025');
    expect(w.lead2).toBe('In the week of Nov. 9-15');
    expect(S.periodText('wtd', rp('10/27/2026', '11/2/2026')).dates).toBe('Oct. 27-Nov. 2, 2026');
    const y = S.periodText('ytd', rp('11/9/2026', '11/15/2026'));
    expect(y.dates).toBe('Jan. 1-Nov. 15, 2026');
    expect(y.lead2).toBe('From Jan. 1 to Nov. 15');
    expect(S.periodText('d28', rp('11/9/2026', '11/15/2026')).dates).toBe('Oct. 19-Nov. 15, 2026');
  });
  test('no pace before a quarter of the year, so January never projects', () => {
    expect(paceRange({ cur: 6, priorYtd: 5, priorFull: 300, weekEnd: '1/4/2027' }).tooEarly).toBe(true);
  });
  test('revision flows never pair a December report with a January one', () => {
    const snap = (end, ytdCur) => ({ citywide: { report_period: { week_end: end }, seven_major_felonies: { Murder: { year_to_date: { current_year: ytdCur, prior_year: 300 }, week_to_date: { current_year: 5, prior_year: 6 } } } } });
    expect(revisionFlows([snap('12/28/2026', 290), snap('1/4/2027', 5)])).toBeNull();
  });
});

// Moderate findings from the Nov. 18, 2026 audit.
describe('audit B5: counts as subjects read as English', () => {
  test('none, one, several', () => {
    expect(S.countSubject(0)).toBe('None of them is');
    expect(S.countSubject(1)).toBe('One of them is');
    expect(S.countSubject(3)).toBe('Three of them are');
    expect(S.countVerb(0, 'shows', 'show')).toBe('none shows');
    expect(S.countVerb(1, 'shows', 'show')).toBe('one shows');
    expect(S.countVerb(4, 'shows', 'show')).toBe('four show');
  });
});

describe('audit B7: a rise from zero can lead the headline, in counts', () => {
  test('ten burglaries from none clears the test and is stated in counts', () => {
    const rows = [{ name: 'Burglary', label: 'Burglary', cur: 10, prior: 0, pct: null, z: 2.9, verdict: 'rise' }];
    const h = buildHeadline(rows);
    expect(h.lead?.name).toBe('Burglary');
    expect(h.sentences[0]).toBe('10 burglaries, up from none.') // AP: numerals from 10;
  });
});

describe('audit B9: version A links keep the place when A has it', () => {
  const raw = S.withBoroughs({ citywide: {}, 'Staten Island': {}, 'Brooklyn South': {}, 'Brooklyn North': {}, '75th Precinct': {} });
  test('Staten Island and precincts carry over; summed boroughs and 28 days say where they land', () => {
    expect(S.classicLink('Staten Island', 'ytd', raw)).toEqual({ query: '?geo=Staten+Island', note: '' });
    expect(S.classicLink('75th Precinct', 'wtd', raw).query).toBe('?geo=75th+Precinct&tab=wtd');
    expect(S.classicLink('citywide', 'ytd', raw)).toEqual({ query: '', note: '' });
    const bk = S.classicLink('Brooklyn', 'd28', raw);
    expect(bk.query).toBe('');
    expect(bk.note).toMatch(/no Brooklyn page/);
    expect(bk.note).toMatch(/no 28-day view/);
  });
});
