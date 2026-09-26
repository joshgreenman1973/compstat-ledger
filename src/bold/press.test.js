import {
  placeHeadline, normalizeTitle, headlineMatchesFamily, locateStories, familyQuery, FAMILIES, MAX_QUERY,
  pressWindow, gdeltUrl, parseArticles, parseSeen, fetchStories, geoScope, storiesFor, precinctKey, nyMidnight, MAX_RECORDS,
} from './press';
import GAZ from './press-places.json';

// Headlines below are real GDELT titles (Sept. 2026), in GDELT's own spacing where it matters.
describe('where a headline puts a story', () => {
  const at = (t) => placeHeadline(t);
  test('a neighborhood lying inside one precinct places the story', () => {
    const p = at('2 men shot and killed at Brownsville , Brooklyn playground');
    expect(p.precinct).toBe('73rd Precinct');
    expect(p.boro).toBe('Brooklyn');
    expect(p.via).toBe('Brownsville');
  });
  test('a neighborhood that straddles precinct lines gives the borough only', () => {
    const p = at('Third arrest made in Crown Heights hookah lounge mass shooting , NYPD says');
    expect(p.city).toBe(true);
    expect(p.precinct).toBeNull();
    expect(p.boro).toBe('Brooklyn');
    expect(at('18 - year - old shot , killed in Williamsburg Brooklyn , NYPD says').precinct).toBeNull();
  });
  test('two scenes in one headline are not placed', () => {
    expect(at('Separate shootings in Coney Island , Crown Heights cap July Fourth Celebrations').precinct).toBeNull();
  });
  test('home boroughs, prosecutors and streets are not scenes', () => {
    expect(at('Bronx man arrested in fatal shooting of 12 - year - old outside bodega').boro).toBeNull();
    expect(at('Queens man shot in East New York').precinct).toBe('75th Precinct');
    expect(at('Man shot on Flatbush Avenue').precinct).toBeNull();
    expect(at('Brooklyn DA charges man in Canarsie stabbing').precinct).toBe('69th Precinct');
    expect(at('Crown Heights woman killed at her own barbecue').boro).toBeNull();
  });
  test('an explicit precinct places the story unless it names the officer’s command', () => {
    expect(at('Man shot in 75th Precinct stairwell').precinct).toBe('75th Precinct');
    expect(at('75th Precinct cop hurt in Brownsville crash').precinct).toBe('73rd Precinct');
  });
  test('any place outside the five boroughs drops the story', () => {
    expect(at('2 dead in separate shootings in Brooklyn , Illinois').city).toBe(false);
    expect(at('Beloved Long Island grandmother , 62 , was killed by ex - boyfriend').city).toBe(false);
    expect(at('Mt . Vernon man accused of gunning down niece').city).toBe(false);
    expect(at('Man shot in Long Island City').city).toBe(true);
    expect(at('Man stabbed in Washington Heights').city).toBe(true);
  });
  test('stories with no city place are not local', () => {
    expect(at('Patrick Clancy opens up about the loss of his children in new interview').city).toBe(false);
    expect(at('10 Classic Movies Without a Single Flaw').city).toBe(false);
  });
  test('a directional prefix the table doesn’t know blocks placement', () => {
    expect(at('Shooting in South Park Slope').precinct).toBeNull();
    expect(at('Shooting in East Flatbush').precinct).toBe('67th Precinct');
  });
});

describe('titles and crime words', () => {
  test('undoes GDELT’s punctuation spacing and outlet tags', () => {
    expect(normalizeTitle('Man , 34 , stabbed on Bed - Stuy street near St . George')).toBe('Man, 34, stabbed on Bed-Stuy street near St. George');
    expect(normalizeTitle('Two men fatally shot at Brooklyn playground ; NYPD searching – NBC New York')).toBe('Two men fatally shot at Brooklyn playground; NYPD searching');
    expect(normalizeTitle('Exclusive | Accused shooter was out on bail')).toBe('Accused shooter was out on bail');
    expect(normalizeTitle('Brooklyn man who shot dog : D . A .')).toBe('Brooklyn man who shot dog: D.A.');
  });
  test('the headline has to be about the crime', () => {
    expect(headlineMatchesFamily('Man, 34, stabbed to death on Bronx street', 'murder')).toBe(true);
    expect(headlineMatchesFamily('Suspect arrested for stabbing woman to death at Brooklyn park', 'murder')).toBe(true);
    expect(headlineMatchesFamily('Man dies after bashed in head during argument at Queens park', 'murder')).toBe(true);
    expect(headlineMatchesFamily('Brother of dirt bike rider killed after driver runs him over', 'murder')).toBe(false);
    expect(headlineMatchesFamily('Pedestrian killed by truck in Queens', 'murder')).toBe(false);
    expect(headlineMatchesFamily('Man in stable condition after Bronx fire', 'violent')).toBe(false);
    expect(headlineMatchesFamily('Mamdani plan shot down by Council', 'shooting')).toBe(false);
    expect(headlineMatchesFamily('Gunman opens fire in Brooklyn playground', 'shooting')).toBe(true);
    expect(headlineMatchesFamily('Thieves steal $2K from Queens smoke shop', 'property')).toBe(true);
  });
});

describe('locating stories', () => {
  const d = (s) => parseSeen(s);
  const win = { from: new Date(Date.UTC(2026, 6, 1)), to: new Date(Date.UTC(2026, 8, 21, 3, 59, 59)) };
  const arts = [
    { url: 'https://gothamist.com/a', domain: 'gothamist.com', title: '2 men shot and killed at Brownsville , Brooklyn playground', date: d('20260912T141500Z') },
    { url: 'https://example.com/b', domain: 'example.com', title: '2 men shot and killed at Brownsville , Brooklyn playground (copy)', date: d('20260912T141500Z') },
    { url: 'https://www.nydailynews.com/opinion/c', domain: 'nydailynews.com', title: 'Shootings in the Bronx demand action', date: d('20260912T141500Z') },
    { url: 'https://nypost.com/d', domain: 'nypost.com', title: 'Man shot in Mott Haven', date: d('20260921T120000Z') }, // after the window
    { url: 'https://nypost.com/e', domain: 'nypost.com', title: 'Readers sound off on shootings in NYC', date: d('20260912T141500Z') },
    { url: 'https://amny.com/f', domain: 'amny.com', title: 'Man shot in Mott Haven', date: d('20260915T120000Z') },
  ];
  test('keeps local outlets, in the window, not opinion, with a city place and a crime word', () => {
    const got = locateStories(arts, 'shooting', win);
    expect(got.map((a) => a.url)).toEqual(['https://gothamist.com/a', 'https://amny.com/f']);
    expect(got[1].precinct).toBe('40th Precinct');
  });
  test('each view gets its own stories', () => {
    const got = locateStories(arts, 'shooting', win);
    expect(storiesFor(got, 'citywide')).toHaveLength(2);
    expect(storiesFor(got, '73rd Precinct')).toHaveLength(1);
    expect(storiesFor(got, 'Brooklyn North')).toHaveLength(1);
    expect(storiesFor(got, 'Bronx South')).toHaveLength(1);
    expect(storiesFor(got, '75th Precinct')).toHaveLength(0);
    expect(geoScope('116th Precinct').merged).toBe(true);
    expect(geoScope('Staten Island')).toMatchObject({ kind: 'borough', boro: 'Staten Island' });
  });
});

describe('the boundary table', () => {
  test('placeable names clear the threshold in one precinct and one borough', () => {
    Object.values(GAZ.places).forEach((r) => {
      expect(r.share).toBeGreaterThanOrEqual(GAZ.threshold);
      expect(r.boro).toBeTruthy();
    });
  });
  test('spot checks against NYPD precinct maps', () => {
    expect(GAZ.places['Morningside Heights'].precinct).toBe(26);
    expect(GAZ.places['East New York'].precinct).toBe(75);
    expect(GAZ.places.Canarsie.precinct).toBe(69);
    expect(GAZ.places['Mott Haven'].precinct).toBe(40);
    expect(GAZ.places['Central Park'].precinct).toBe(22);
    expect(GAZ.places['Crown Heights']).toBeUndefined();
    expect(GAZ.places['Bedford-Stuyvesant']).toBeUndefined();
    expect(GAZ.places.Rockaways).toBeUndefined();
  });
  test('precinct names are AP ordinals', () => {
    expect([1, 22, 73, 101, 112, 123].map(precinctKey)).toEqual(['1st Precinct', '22nd Precinct', '73rd Precinct', '101st Precinct', '112th Precinct', '123rd Precinct']);
  });
});

describe('query', () => {
  test('every family query fits GDELT’s length limit', () => {
    Object.keys(FAMILIES).forEach((f) => expect(familyQuery(f).length).toBeLessThanOrEqual(MAX_QUERY));
  });
  test('requires NYPD and a local outlet', () => {
    expect(familyQuery('shooting')).toBe('(shooting OR shot OR gunfire OR gunman) NYPD (domain:nypost.com OR domain:nydailynews.com OR domain:gothamist.com OR domain:amny.com OR domain:nbcnewyork.com OR domain:abc7ny.com OR domain:fox5ny.com)');
  });
});

describe('window', () => {
  const now = new Date(Date.UTC(2026, 8, 26, 12));
  test('New York midnight, daylight time and standard time', () => {
    expect(nyMidnight(2026, 9, 20).toISOString()).toBe('2026-09-20T04:00:00.000Z');
    expect(nyMidnight(2026, 1, 1).toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });
  test('YTD is clamped to GDELT’s three-month window and ends at midnight New York time', () => {
    const w = pressWindow('ytd', { week_start: '9/14/2026', week_end: '9/20/2026' }, now);
    expect(w.clamped).toBe(true);
    expect(w.start).toBe('20260628120000');
    expect(w.end).toBe('20260921035959');
  });
  test('a week inside the window is not clamped', () => {
    const w = pressWindow('wtd', { week_start: '9/14/2026', week_end: '9/20/2026' }, now);
    expect(w.clamped).toBe(false);
    expect(w.start).toBe('20260914040000');
  });
  test('URL carries the documented ArtList parameters', () => {
    const w = pressWindow('d28', { week_start: '9/14/2026', week_end: '9/20/2026' }, now);
    const u = new URL(gdeltUrl('shooting', w));
    expect(u.searchParams.get('mode')).toBe('ArtList');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('maxrecords')).toBe('250');
    expect(u.searchParams.get('startdatetime')).toBe('20260824040000');
  });
});

describe('parsing and fetching', () => {
  test('parses, dedupes syndicated copies and sorts newest first', () => {
    const body = JSON.stringify({
      articles: [
        { url: 'https://a.example/1', title: 'Man shot in Brownsville', seendate: '20260915T101500Z', domain: 'a.example' },
        { url: 'https://b.example/1', title: 'Man shot in Brownsville ', seendate: '20260915T111500Z', domain: 'b.example' },
        { url: 'https://c.example/1', title: 'Robbery in Canarsie', seendate: '20260918T080000Z', domain: 'c.example' },
      ],
    });
    const { articles, count } = parseArticles(body);
    expect(count).toBe(3);
    expect(articles.map((a) => a.domain)).toEqual(['c.example', 'a.example']);
    expect(parseSeen('20260915T101500Z').toISOString()).toBe('2026-09-15T10:15:00.000Z');
  });
  test('treats GDELT’s plain-text errors as errors', () => {
    expect(parseArticles('Please limit requests to one every 5 seconds').error).toMatch(/limit/);
    expect(parseArticles('{}').articles).toEqual([]);
  });
  const win = pressWindow('d28', { week_start: '9/14/2026', week_end: '9/20/2026' }, new Date(Date.UTC(2026, 8, 26, 12)));
  const noSleep = { sleep: async () => {}, spacing: 0, store: false };
  test('retries a rate limit and a bare network error, then caches', async () => {
    let calls = 0;
    const replies = [
      () => { throw new TypeError('Failed to fetch'); }, // a 429 without CORS headers looks like this
      () => 'Please limit requests to one every 5 seconds',
      () => JSON.stringify({ articles: [{ url: 'https://nypost.com/x', title: 'Man shot in Canarsie', seendate: '20260915T101500Z', domain: 'nypost.com' }] }),
    ];
    const fake = async () => { const r = replies[calls++](); return { text: async () => r }; };
    const r = await fetchStories('shooting', win, { fetchImpl: fake, ...noSleep });
    expect(r.articles).toHaveLength(1);
    expect(r.complete).toBe(true);
    await fetchStories('shooting', win, { fetchImpl: fake, ...noSleep });
    expect(calls).toBe(3);
  });
  test('pages back when a response is full', async () => {
    const urls = [];
    const page = (startMin, n) => ({ articles: Array.from({ length: n }, (_, i) => ({ url: `https://nypost.com/${startMin}-${i}`, title: `Story ${startMin}-${i}`, seendate: `2026091${startMin}T${String(10 + (i % 10)).padStart(2, '0')}0000Z`, domain: 'nypost.com' })) });
    const fake = async (u) => { urls.push(u); return { text: async () => JSON.stringify(urls.length === 1 ? page(8, MAX_RECORDS) : page(2, 3)) }; };
    const r = await fetchStories('murder', win, { fetchImpl: fake, ...noSleep });
    expect(urls).toHaveLength(2);
    expect(new URL(urls[1]).searchParams.get('enddatetime')).toBe('20260918100000');
    expect(r.articles).toHaveLength(MAX_RECORDS + 3);
    expect(r.complete).toBe(true);
  });
});
