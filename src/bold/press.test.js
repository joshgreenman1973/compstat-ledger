import {
  cleanPlace, buildPlaceIndex, placeHeadline, geoTerms, buildQuery, pressWindow, gdeltUrl, parseArticles, parseSeen, fetchPress,
} from './press';

const HOODS = {
  '75th Precinct': 'East New York', '73rd Precinct': 'Brownsville', '103rd Precinct': 'Jamaica',
  '113th Precinct': 'South Jamaica', '79th Precinct': 'Bed-Stuy West', '81st Precinct': 'Bed-Stuy East',
  '34th Precinct': 'Inwood, Wash. Heights', '1st Precinct': 'Tribeca, Wall St',
};

describe('place names', () => {
  test('cleans CompStat shorthand into newsroom spelling', () => {
    expect(cleanPlace('Wash. Heights')).toBe('Washington Heights');
    expect(cleanPlace('Bed-Stuy West')).toBe('Bed-Stuy');
    expect(cleanPlace('Wall St')).toBe('Wall Street');
  });
  const idx = buildPlaceIndex(HOODS);
  test('drops names shared by two precincts or common elsewhere', () => {
    expect(idx['Bed-Stuy']).toBeUndefined(); // 79th and 81st
    expect(idx.Jamaica).toBeUndefined(); // the country
    expect(idx['South Jamaica']).toBe('113th Precinct');
    expect(idx['Washington Heights']).toBe('34th Precinct');
  });
  test('places a headline by explicit precinct first, then longest unambiguous name', () => {
    expect(placeHeadline('Man shot in 75th Precinct stairwell', idx).precinct).toBe('75th Precinct');
    expect(placeHeadline('Teen killed in South Jamaica shooting', idx).precinct).toBe('113th Precinct');
    expect(placeHeadline('Bed-Stuy stabbing leaves one dead', idx)).toBeNull();
    expect(placeHeadline('Shooting in East New York', idx).precinct).toBe('75th Precinct');
  });
});

describe('query', () => {
  test('ORs are grouped in parentheses, phrases quoted', () => {
    const q = buildQuery('murder', geoTerms('75th Precinct', HOODS));
    expect(q).toBe('(murder OR homicide OR "fatally shot" OR "stabbed to death" OR "shot dead") ("75th Precinct" OR "East New York") sourcelang:english');
  });
});

describe('window', () => {
  const now = new Date(Date.UTC(2026, 8, 26, 12));
  test('YTD is clamped to GDELT’s three-month window', () => {
    const w = pressWindow('ytd', { week_start: '9/14/2026', week_end: '9/20/2026' }, now);
    expect(w.clamped).toBe(true);
    expect(w.start).toBe('20260628120000');
    expect(w.end).toBe('20260920235959');
  });
  test('a week inside the window is not clamped', () => {
    const w = pressWindow('wtd', { week_start: '9/14/2026', week_end: '9/20/2026' }, now);
    expect(w.clamped).toBe(false);
    expect(w.start).toBe('20260914000000');
  });
  test('URL carries the documented ArtList parameters', () => {
    const w = pressWindow('d28', { week_start: '9/14/2026', week_end: '9/20/2026' }, now);
    const u = new URL(gdeltUrl('shooting', w));
    expect(u.searchParams.get('mode')).toBe('ArtList');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('startdatetime')).toBe('20260824000000');
  });
});

describe('parsing', () => {
  test('parses, dedupes syndicated copies and sorts newest first', () => {
    const body = JSON.stringify({
      articles: [
        { url: 'https://a.example/1', title: 'Man shot in Brownsville', seendate: '20260915T101500Z', domain: 'a.example' },
        { url: 'https://b.example/1', title: 'Man shot in Brownsville ', seendate: '20260915T111500Z', domain: 'b.example' },
        { url: 'https://c.example/1', title: 'Robbery on Wall Street', seendate: '20260918T080000Z', domain: 'c.example' },
      ],
    });
    const { articles } = parseArticles(body);
    expect(articles.map((a) => a.domain)).toEqual(['c.example', 'a.example']);
    expect(parseSeen('20260915T101500Z').toISOString()).toBe('2026-09-15T10:15:00.000Z');
  });
  test('treats GDELT’s plain-text errors as errors', () => {
    expect(parseArticles('Please limit requests to one every 5 seconds').error).toMatch(/limit/);
    expect(parseArticles('{}').articles).toEqual([]);
  });
  test('fetchPress caches successful responses', async () => {
    let calls = 0;
    const fake = async () => { calls++; return { text: async () => JSON.stringify({ articles: [] }) }; };
    await fetchPress('https://x.example/q1', fake);
    await fetchPress('https://x.example/q1', fake);
    expect(calls).toBe(1);
  });
});

describe('coverage vs. the counts', () => {
  const { coverageWindows, coverageChange, coverageVerdict, parseTimeline, buildGroupsQuery, COVERAGE_FAMILIES, timelineUrl } = require('./press');
  const win = coverageWindows('9/20/2026');
  test('two back-to-back 28-day windows ending on the report date', () => {
    expect(win.mid.toISOString()).toBe('2026-08-24T00:00:00.000Z');
    expect(win.from.toISOString()).toBe('2026-07-27T00:00:00.000Z');
    expect(win.to.toISOString()).toBe('2026-09-20T23:59:59.000Z');
  });
  const day = (iso, value, norm) => ({ date: iso, value, norm });
  const tl = JSON.stringify({ timeline: [{ series: 'Article Count', data: [
    day('20260801T000000Z', 10, 1000), day('20260815T000000Z', 10, 1000), // prev: 20 of 2,000
    day('20260830T000000Z', 20, 1000), day('20260915T000000Z', 20, 1000), // last: 40 of 2,000
    day('20260921T000000Z', 99, 1000), // after the report date: ignored
  ] }] });
  test('parses the timeline and measures the change as a share of all coverage', () => {
    const { points } = parseTimeline(tl);
    const c = coverageChange(points, win);
    expect(c.prev).toBe(20);
    expect(c.last).toBe(40);
    expect(c.normalized).toBe(true);
    expect(c.change).toBeCloseTo(100, 6);
  });
  test('verdict rules', () => {
    const cov = { enough: true, change: 100 };
    expect(coverageVerdict({ verdict: 'noise', pct: 0 }, cov).label).toBe('More coverage, not more crime');
    expect(coverageVerdict({ verdict: 'drop', pct: -20 }, cov).label).toBe('More coverage, not more crime');
    expect(coverageVerdict({ verdict: 'noise', pct: 12 }, cov).kind).toBe('in'); // both up, count not significant
    expect(coverageVerdict({ verdict: 'rise', pct: 30 }, cov).kind).toBe('in');
    expect(coverageVerdict({ verdict: 'rise', pct: 30 }, { enough: true, change: -5 }).label).toBe('More crime, not more coverage');
    expect(coverageVerdict({ verdict: 'noise', pct: -20 }, { enough: true, change: -60 }).kind).toBe('in'); // both down
    expect(coverageVerdict({ verdict: 'noise', pct: 3 }, { enough: true, change: -60 }).label).toBe('Less coverage, not less crime');
    expect(coverageVerdict({ verdict: 'noise', pct: 2 }, { enough: true, change: 10 }).kind).toBe('quiet');
    expect(coverageVerdict({ verdict: 'noise', pct: 2 }, { enough: false, change: 300 }).kind).toBe('thin');
  });
  test('two-group queries AND the groups', () => {
    const subway = COVERAGE_FAMILIES.find((f) => f.key === 'subway');
    expect(buildGroupsQuery(subway.groups, ['NYPD'])).toBe('(subway OR "on a train" OR "subway station") (attacked OR stabbed OR shoved OR slashed OR assaulted OR robbed) NYPD sourcelang:english');
    expect(new URL(timelineUrl('x', win.from, win.to)).searchParams.get('mode')).toBe('TimelineVolRaw');
  });
  test('plain-text errors are errors', () => {
    expect(parseTimeline('Queries containing OR must be surrounded by ()').error).toBeTruthy();
  });
});
