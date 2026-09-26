import snapshot from './snapshot-2026-09-20.json';
import crimeHistory from '../data/crime_history.json';
import {
  extractRows, sumRows, poissonZ, verdictFor, noiseBandPct, buildHeadline, frequencyRatio,
  paceRange, arcClaim, concentration, rapeYoYComparable, apDate, parseRTCI, peerComparison,
  PEER_GROUPS, MAJORS, quantileCuts, binFor, zBin, historicalColumns,
  revisionFlows, breakEven, revisionRisk, withRevisions,
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
  test('verdicts on the snapshot', () => {
    expect(row(ytd, 'Murder').verdict).toBe('drop');
    expect(row(ytd, 'Fel. Assault').verdict).toBe('noise');
    expect(row(ytd, 'Rape').verdict).toBe('noise');
    expect(row(ytd, 'Hate Crimes').verdict).toBe('rise'); // 456 vs 393: z = 63/√849 ≈ 2.16
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
  test('leads with the gravest real change, then the counterpoint', () => {
    const h = buildHeadline(ytd);
    expect(h.sentences).toEqual(['Murder is down 24%.', "Felony assault isn't falling."]);
    expect(h.kind).toBe('split');
  });
  test('says so when nothing clears the bar', () => {
    const flat = ytd.map((r) => ({ ...r, verdict: 'noise' }));
    expect(buildHeadline(flat).sentences[0]).toMatch(/chance/);
  });
  test('frequency ratio', () => {
    const f = frequencyRatio(ytd);
    expect(f.display).toBe(String(Math.round(22023 / 189)));
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
  test('break-even: the smallest revision that turns a real change into noise', () => {
    const m = row(ytd, 'Murder'); // 189 vs 250
    expect(breakEven(m)).toBe(19); // 208 vs 250 is noise; 207 vs 250 is still real
    expect(verdictFor(poissonZ(189 + 18, 250))).toBe('drop');
    expect(verdictFor(poissonZ(189 + 19, 250))).toBe('noise');
    const ma = row(ytd, 'Misd. Assault'); // a rise weakens if revised down
    const be = breakEven(ma);
    expect(verdictFor(poissonZ(ma.cur - be, ma.prior))).toBe('noise');
    expect(verdictFor(poissonZ(ma.cur - be + 1, ma.prior))).toBe('rise');
  });
  test('fragile when fewer than eight weeks of recent revisions would erase it', () => {
    const ma = row(ytd, 'Misd. Assault');
    expect(revisionRisk(ma, { cur: -131, prior: 0, weeks: 8 }).fragile).toBe(true);
    expect(revisionRisk(row(ytd, 'Murder'), { cur: 8, prior: 0, weeks: 8 }).fragile).toBe(false);
    // Revisions running the other way can't erase it.
    expect(revisionRisk(ma, { cur: 50, prior: 0, weeks: 8 }).weeksToErase).toBe(Infinity);
  });
  test('a fragile change never leads the headline', () => {
    const rows = withRevisions(ytd, { Murder: { cur: 200, prior: 0 } }, 8); // absurd pace: murder fragile
    const h = buildHeadline(rows);
    expect(h.lead.name).not.toBe('Murder');
    expect(rows.find((r) => r.name === 'Murder').fragile).toBe(true);
  });
});
