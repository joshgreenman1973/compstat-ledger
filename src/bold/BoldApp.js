import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import annualHistory from './annual-history.json';
import snapshot from './snapshot-2026-09-20.json';
import {
  GEO_POPULATIONS, PRECINCT_NEIGHBORHOODS, TOURIST_PRECINCTS,
  GITHUB_USER, REPO_NAME, RTCI_CSV_URL, toOrdinalPrecinct,
} from '../App';
import * as S from './stats';
import { currentPopulations, CITY_POPULATION, CITY_CENSUS_2020, ESTIMATE_DATE, boroughChange } from './population';
import { Chip, FragileTag, Receipt, Kicker, SectionHead, Segmented, SourceLine, Tag, Reveal, CountUp, Pct } from './ui';
import { SignalBoard, UnitChart, LongArc, PrecinctMap, MapLegend, PeerBars, MiniMap, SIGNAL_RAMP, PairBars, ShareBar, Spark } from './charts';
import './bold.css';

// Residents by precinct, 2020 Census counts moved to the Census Bureau's July 2025 borough estimates.
const POPULATION = currentPopulations(GEO_POPULATIONS);
const popPct = (ratio) => `${Math.abs((ratio - 1) * 100).toFixed(1)}%`;

const DATA_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/data/`;
const COMPSTAT_URL = `${DATA_BASE}latest_compstat.json`;
const VC_REVISIONS_URL = 'https://www.vitalcitynyc.org/real-crime-numbers-nyc-nypd/';

// Used only if the RTCI feed can't be reached: full-year 2025 murders and RTCI populations from
// the scorecard last updated 2026-06-16.
const RTCI_SNAPSHOT = {
  updated: '2026-06-16 15:38:53 EDT',
  snapshot: true,
  cities: Object.fromEntries([
    ['New York City', 'New York', 8496850, 305], ['Los Angeles', 'California', 3874484, 224], ['Chicago', 'Illinois', 2715488, 429],
    ['Houston', 'Texas', 2362928, 272], ['Phoenix', 'Arizona', 1688662, 128], ['Philadelphia', 'Pennsylvania', 1562379, 224],
    ['San Antonio', 'Texas', 1549295, 105], ['San Diego', 'California', 1409432, 32], ['Dallas', 'Texas', 1246336, 139],
    ['Boston', 'Massachusetts', 671262, 25], ['Baltimore', 'Maryland', 562811, 133], ['Washington', 'District of Columbia', 693645, 127],
    ['Pittsburgh', 'Pennsylvania', 306794, 34], ['Buffalo', 'New York', 276384, 30], ['Newark', 'New Jersey', 318638, 33],
  ].map(([agency, state, pop, murderFull]) => [`${agency}|${state}`, { agency, state, pop, murderFull, fullYear: 2025, range: 'Jan - Apr 2026' }])),
};

const MEASURES = {
  shootvic: { label: 'Shooting victims', noun: 'shooting victims', one: 'shooting victim', parts: ['Shooting Vic.'] },
  violent: { label: 'Violent felonies', noun: 'violent felonies', one: 'violent felony', parts: S.VIOLENT },
  murder: { label: 'Murder', noun: 'murders', one: 'murder', parts: ['Murder'] },
  majors: { label: 'All seven majors', noun: 'major felonies', one: 'major felony', parts: S.MAJORS },
  property: { label: 'Property felonies', noun: 'property felonies', one: 'property felony', parts: S.PROPERTY },
};

// Small multiples: one map per crime, shaded by the chance test.
const SMALL_MAPS = [['Murder', 'Murder'], ['Shooting Vic.', 'Shooting victims'], ['Robbery', 'Robbery'], ['Fel. Assault', 'Felony assault'],
  ['Rape', 'Rape'], ['Burglary', 'Burglary'], ['Gr. Larceny', 'Grand larceny'], ['G.L.A.', 'Vehicle theft']];
// Neighborhood labels, cleaned up for AP style, plus the 116th, which the classic view's table predates
// (the mayor's office: "Rosedale, Springfield Gardens, Brookville, and Laurelton").
const HOOD_FIX = { 'Wall St': 'Wall Street', 'Wash. Heights': 'Washington Heights', 'Stuy Town': 'Stuyvesant Town' };
const hoodOf = (k) => {
  if (k === '116th Precinct') return 'Rosedale, Laurelton';
  const h = PRECINCT_NEIGHBORHOODS[k] || '';
  return Object.entries(HOOD_FIX).reduce((t, [a, b]) => t.replace(a, b), h);
};
const shortName = (label) => label.replace(' Precincts', '').replace(' Precinct', '');
const lc = (l) => l.charAt(0).toLowerCase() + l.slice(1);
const seriesFor = (key) => annualHistory.citywide.filter((d) => typeof d[key] === 'number').map((d) => ({ y: d.y, val: d[key] }));
const THEN_2010 = { cuts: [-25, -5, 5, 25], colors: ['#217ebe', '#90bfdf', '#e8e8ea', '#fabcaa', '#e03a30'], labels: ['25%+ below', '5-25% below', 'Within 5%', '5-25% above', '25%+ above'] };
const THEN_1993 = { cuts: [-85, -75, -65, -50], colors: ['#1a5f8f', '#217ebe', '#4e98cb', '#90bfdf', '#d2e4f0'], labels: ['85%+ below', '75-85% below', '65-75% below', '50-65% below', 'Less than 50% below'] };
const thenFill = (v, base) => {
  if (v == null) return null;
  const sc = base === 1993 ? THEN_1993 : THEN_2010;
  if (base === 1993 && v >= 0) return '#e03a30';
  return sc.colors[sc.cuts.filter((c) => v > c).length];
};

/* ------------------------------------------------------------------ */
/* A DAY IN THE PRECINCT — the precinct-day explorer (a copy lives in  */
/* public/precinct-day), collapsed until asked for, loaded on demand.  */
/* ------------------------------------------------------------------ */
const CFS_MAX_URL = 'https://data.cityofnewyork.us/resource/n2zq-pubd.json?$select=max(incident_date)%20as%20m';
function PrecinctDay({ precincts, initialKey }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(initialKey);
  useEffect(() => setKey(initialKey), [initialKey]);
  const [maxDate, setMaxDate] = useState(null);
  const [date, setDate] = useState('');
  useEffect(() => {
    if (!open || maxDate) return undefined;
    let alive = true;
    fetch(CFS_MAX_URL).then((r) => r.json())
      .then((j) => { const m = j?.[0]?.m?.slice(0, 10); if (alive) { setMaxDate(m || 'unknown'); if (m) setDate((d) => d || m); } })
      .catch(() => { if (alive) { setMaxDate('unknown'); setDate((d) => d || '2026-06-30'); } });
    return () => { alive = false; };
  }, [open, maxDate]);
  const pct = key ? parseInt(key, 10) : null;
  const src = pct && date ? `${process.env.PUBLIC_URL}/precinct-day/index.html?pct=${pct}&date=${date}` : null;
  return (
    <section id="day" className="py-8 border-b border-[#e6e6e6] scroll-mt-14">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-4 text-left group">
        <span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff7c53] mb-1">A day in the precinct</span>
          <span className="vc-display block text-[22px] sm:text-[26px] font-black leading-tight">A day on the police radio{key ? ` in the ${key}` : ''}</span>
        </span>
        <span className="flex-shrink-0 rounded-full border-2 border-[#050507] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] group-hover:bg-[#dde44c]">{open ? 'Close' : 'Open'}</span>
      </button>
      <p className="mt-2 max-w-3xl text-[14px] leading-snug text-[#555]">Every 911 call and radio run NYPD dispatched in one precinct on one day, rebuilt from the department's own dispatch log on NYC Open Data. It counts jobs, not crimes, and a single day is a snapshot, not a pattern. The log runs months behind CompStat.</p>
      {open && (
        <div className="mt-5">
          <div className="flex flex-wrap items-end gap-3 mb-3">
            {precincts && (
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#555]">Precinct
                <select value={key || ''} onChange={(e) => setKey(e.target.value)} className="block mt-1 rounded border border-[#d6d6d6] px-2 py-1.5 text-[14px] normal-case tracking-normal font-normal text-[#050507]">
                  {precincts.map((p) => <option key={p} value={p}>{p}{hoodOf(p) ? ` · ${hoodOf(p)}` : ''}</option>)}
                </select>
              </label>
            )}
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#555]">Day
              <input type="date" min="2018-01-01" max={maxDate && maxDate !== 'unknown' ? maxDate : undefined} value={date} onChange={(e) => setDate(e.target.value)} className="block mt-1 rounded border border-[#d6d6d6] px-2 py-1.5 text-[14px] font-normal text-[#050507]" />
            </label>
            {maxDate && maxDate !== 'unknown' && <span className="text-[12px] text-[#707175] pb-2">Latest day in the log: {S.apDate(`${+maxDate.slice(5, 7)}/${+maxDate.slice(8, 10)}/${maxDate.slice(0, 4)}`)}</span>}
            {src && <a href={src} target="_blank" rel="noopener noreferrer" className="pb-2 text-[11px] font-bold uppercase tracking-wider underline">Open full page ↗</a>}
          </div>
          {src
            ? <iframe title={`A day on the police radio in the ${key}`} src={src} loading="lazy" className="w-full h-[80vh] min-h-[640px] rounded border border-[#d6d6d6] bg-[#0b0f14]" />
            : <p className="text-[14px] text-[#707175]">Finding the latest day in the dispatch log…</p>}
          <p className="mt-2 text-[12px] text-[#707175]">From "A day on the police radio" (nyc-precinct-day). Source: NYPD Calls for Service, NYC Open Data. Response times are medians for dispatched calls; see that tool's notes.</p>
        </div>
      )}
    </section>
  );
}

// One precinct-and-crime move in the notable-trends section: the precinct's change as a bar against
// the city's (tick), the size in big type, and short tags whose tooltips carry the explanation.
function MoveItem({ x: raw, onPick, showPlace = true, status = false, max = 60, year }) {
  const x = { ...raw, yearNow: year };
  const up = x.diff > 0;
  const beyond = x.verdict === 'drop' || x.verdict === 'rise';
  const tags = [];
  if (x.notable && x.rank === 1) tags.push(<Tag key="rank" tone="accent" title={`The biggest ${lc(x.label)} ${up ? 'rise' : 'drop'} against the citywide trend of any precinct.`}>Biggest in city</Tag>);
  if (status) {
    if (x.notable) tags.push(<Tag key="st" tone="ink" title="Clears the chance test, differs from the citywide trend and survives the correction for testing every precinct and crime.">Stands out</Tag>);
    else if (!beyond) tags.push(<Tag key="st" tone="line" title="A change this size shows up routinely by chance.">Within chance</Tag>);
    else if (x.fragile) tags.push(<Tag key="st" tone="line" title="Beyond chance on today's counts, but recent NYPD revisions could erase it.">Fragile</Tag>);
    else if (Math.abs(x.zRel || 0) >= S.Z_CRIT) tags.push(<Tag key="st" tone="line" title="Beyond chance and unusual next to the city, but not once you allow for how many precincts and crimes were tested.">Close call</Tag>);
    else tags.push(<Tag key="st" tone="soft" title="Beyond chance, but moving about as the city is.">In step with city</Tag>);
  }
  // The three-year pattern, in words a reader can check against the counts shown under the bars.
  if (x.shape && beyond) {
    const way = up ? 'Up' : 'Down';
    if (x.shape.kind === 'again') tags.push(<Tag key="sh" tone="soft" title="The count also moved this way from 2024 to 2025, by more than chance would explain.">{way} two years running</Tag>);
    else if (x.shape.kind === 'rebound') tags.push(<Tag key="sh" tone="warn" title={`The count ${x.shape.last === 'rise' ? 'jumped' : 'dipped'} from 2024 to 2025 by more than chance would explain. When a count swings unusually one year, it tends to swing back, so part of this year's change may be a return to normal (regression to the mean).`}>{way} after a 2025 {x.shape.last === 'rise' ? 'spike' : 'dip'}</Tag>);
    else tags.push(<Tag key="sh" tone="soft" title="The change from 2024 to 2025 was within what chance alone produces; this year's move is the first clear one.">{way} after a flat 2025</Tag>);
  }
  const years = x.shape?.twoBack != null
    ? [[x.yearNow - 2, x.shape.twoBack], [x.yearNow - 1, x.prior], [x.yearNow, x.cur]]
    : [[x.yearNow - 1, x.prior], [x.yearNow, x.cur]];
  const body = (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 items-start">
      <div className="min-w-0 pr-1">
        <div className="text-[15px] font-bold leading-tight">{x.label}{showPlace && <span className="font-normal text-[#555]"> · {shortName(x.geo)}{hoodOf(x.geo) ? `, ${hoodOf(x.geo).split(',')[0]}` : ''}</span>}</div>
        <div className="mt-2"><PairBars pct={x.pct ?? 0} cityPct={x.cityPct} max={max} placeLabel={shortName(x.geo)} /></div>
        <div className="mt-1 text-[12px] text-[#555]" style={{ fontVariantNumeric: 'tabular-nums' }} title="Counts for the same dates in each year">
          {years.map(([yy, v], i) => <span key={yy}>{i > 0 && <span className="text-[#aaa]"> → </span>}<span className="text-[#707175]">{yy}:</span> <span className={i === years.length - 1 ? 'font-bold text-[#050507]' : ''}>{S.fmtInt(v)}</span></span>)}
        </div>
        {tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5 vc-rise" style={{ '--d': '350ms' }}>{tags}</div>}
      </div>
      <div className="text-right">
        <div className="text-[24px] font-black leading-none"><Pct pct={x.pct} prior={x.prior} digits={0} /></div>
        <div className="mt-1 text-[11px] text-[#707175] whitespace-nowrap">vs. {x.yearNow - 1}</div>
      </div>
    </div>
  );
  return (
    <Reveal as="li" className="border-b border-[#eee]">
      <div className="vc-rise">
        {onPick
          ? <button type="button" onClick={() => onPick(x.geo)} className="w-full text-left py-3 px-1.5 -mx-1.5 rounded hover:bg-[#f7f8dd]">{body}</button>
          : <div className="py-3">{body}</div>}
      </div>
    </Reveal>
  );
}
// A shared scale for a list of moves, so bars compare.
const moveMax = (list) => {
  const m = Math.max(10, ...list.map((x) => Math.max(Math.abs(x.pct ?? 0), Math.abs(x.cityPct ?? 0))));
  return Math.min(150, Math.ceil((m * 1.45) / 10) * 10); // headroom so the value label fits past the bar end
};

const ARC_OPTIONS = [
  ['Murder', 'Murder', 'murders'], ['Shooting Inc.', 'Shootings', 'shooting incidents'], ['Robbery', 'Robbery', 'robberies'],
  ['Fel. Assault', 'Felony assault', 'felony assaults'], ['Burglary', 'Burglary', 'burglaries'], ['Gr. Larceny', 'Grand larceny', 'grand larcenies'],
  ['G.L.A.', 'Vehicle theft', 'vehicle thefts'], ['Rape', 'Rape', 'rapes'],
];

// AP style: spell out whole numbers below 10 in running text.
const nw = S.spell;
const plural = (n, one, many) => (Math.abs(n) === 1 ? one : many);
// AP: "down 25%" in prose, not "−25.0%".
const pctProse = (v) => (Math.round(Math.abs(v)) === 0 ? 'unchanged' : `${v < 0 ? 'down' : 'up'} ${Math.round(Math.abs(v))}%`);
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pctWord = (v) => `${Math.round(Math.abs(v))}%`;
const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// "added 8 murders" / "removed 131" / "made no net change to"
const weeksWord = (n) => `${nw(n)} ${n === 1 ? 'week' : 'weeks'}`;

// The revision half of a receipt: what NYPD has been doing to this line, and what it would take to erase the verdict.
function revisionSentence(r) {
  const { rev, risk } = r;
  const net = rev.cur > 0 ? `added ${S.fmtInt(rev.cur)}` : rev.cur < 0 ? `subtracted ${S.fmtInt(-rev.cur)}` : 'netted to zero';
  const priorMoved = Math.round(rev.prior) === 0 ? "didn't move" : `moved ${S.fmtSigned(rev.prior)}`;
  const base = `Revisions: over the past ${weeksWord(rev.weeks)}, NYPD's revisions to already-reported weeks ${net}; last year's figure ${priorMoved}.`;
  if (!risk) return base;
  const verb = r.verdict === 'drop' ? 'adding' : 'subtracting';
  const share = r.cur > 0 ? ` (${((risk.breakEven / r.cur) * 100).toFixed(1)}% of this year's count)` : '';
  const need = `Erasing this ${r.verdict} would take revisions ${verb} ${S.fmtInt(risk.breakEven)}${share}`;
  if (risk.direction === 'none') return `${base} ${need}, and NYPD hasn't revised this line on net in that time.`;
  if (!Number.isFinite(risk.weeksToErase)) return `${base} ${need}, and recent revisions have run the other way.`;
  const wk = risk.weeksToErase;
  const bar = `${nw(risk.thresholdWeeks)}-week bar`;
  return `${base} ${need}: about ${wk < 10 ? wk.toFixed(1) : Math.round(wk)} weeks at the recent pace, ${risk.fragile ? `under our ${bar}, so it's marked fragile` : `beyond our ${bar}`}.`;
}

// Every change on the page compares a stretch of this year with the SAME dates a year earlier (CompStat's
// own comparison), never with the previous week or month. These strings name the dates so each
// sentence can say so.
function periodText(periodId, geoData) {
  const end = S.parseMDY(geoData?.report_period?.week_end);
  const start = S.parseMDY(geoData?.report_period?.week_start);
  const endStr = S.apDate(geoData?.report_period?.week_end, { year: false });
  const y = end?.y;
  const md = (d) => S.apDate(`${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`, { year: false });
  const range = (a, b) => (a && b ? (md(a).split(' ')[0] === md(b).split(' ')[0] ? `${md(a)}-${b.getUTCDate()}` : `${md(a)}-${md(b)}`) : '');
  const endDate = end ? new Date(Date.UTC(end.y, end.m - 1, end.d)) : null;
  if (periodId === 'd28') {
    const dates = endDate ? range(new Date(endDate.getTime() - 27 * 86400000), endDate) : '';
    return {
      eyebrow: `28 days through ${S.apDate(geoData?.report_period?.week_end)}`, lead: `In the 28 days through ${endStr}`, cmp: `the same 28 days of ${y - 1}`, since: 'in the last 28 days', short: `in the same 28 days of ${y - 1}`, priorLabel: `in the same 28 days of ${y - 1}`,
      dates: `${dates}, ${y}`, kicker: `28 days, ${dates}, ${y}, vs. the same dates in ${y - 1}`, lead2: `From ${dates.replace('-', ' to ')}`, over: `compared with the same dates in ${y - 1}`, tag: `${dates} vs. the same dates in ${y - 1}`, compares: `${dates}, ${y}, with the same dates in ${y - 1}`,
    };
  }
  if (periodId === 'wtd') {
    const dates = start && end && start.m === end.m ? `${S.apDate(geoData.report_period.week_start, { year: false })}-${end.d}` : `${S.apDate(geoData?.report_period?.week_start, { year: false })} to ${endStr}`;
    return {
      eyebrow: `Week of ${dates}, ${y}`, lead: `In the week of ${dates}`, cmp: `the same week of ${y - 1}`, since: 'this week', short: `in the same week of ${y - 1}`, priorLabel: `in the same week of ${y - 1}`,
      dates: `${dates}, ${y}`, kicker: `Week of ${dates}, ${y}, vs. the same week of ${y - 1}`, lead2: `In the week of ${dates}`, over: `compared with the same week of ${y - 1}`, tag: `${dates} vs. the same week of ${y - 1}`, compares: `the week of ${dates}, ${y}, with the same week of ${y - 1}`,
    };
  }
  const dates = `Jan. 1-${endStr}`;
  return {
    eyebrow: `Year to date through ${S.apDate(geoData?.report_period?.week_end)}`, lead: `Through ${endStr}`, cmp: `the same period of ${y - 1}`, since: 'so far this year', short: `at this point in ${y - 1}`, priorLabel: `at this point in ${y - 1}`,
    dates: `${dates}, ${y}`, kicker: `Year to date, ${dates}, ${y}, vs. the same dates in ${y - 1}`, lead2: `From Jan. 1 to ${endStr}`, over: `compared with the same dates in ${y - 1}`, tag: `${dates} vs. the same dates in ${y - 1}`, compares: `${dates}, ${y}, with the same dates in ${y - 1}`,
  };
}

// "The Bronx" as a label; everything else as NYPD names it.
const placeLabel = (geo) => (geo === 'Bronx' ? 'The Bronx' : geo);

const geoPopulation = (geo) => {
  if (geo === 'citywide') return CITY_POPULATION;
  // A borough's counts follow police lines, so its residents do too: the sum of its precincts'.
  if (S.isBorough(geo)) return Object.keys(POPULATION).filter((k) => S.inBorough(geo, k)).reduce((n, k) => n + POPULATION[k], 0);
  if (!geo.includes('Precinct')) return null; // patrol-borough lines were redrawn (Bronx North/South); no reliable denominator
  if (S.isSplitPrecinct(geo)) return null;
  return POPULATION[geo] || null;
};

function measureCounts(geoData, parts, pkey) {
  let cur = 0; let prior = 0; let any = false;
  parts.forEach((n) => {
    const s = geoData?.seven_major_felonies?.[n] || geoData?.additional_stats?.[n];
    const w = s?.[pkey];
    if (w && Number.isFinite(w.current_year) && Number.isFinite(w.prior_year)) { cur += w.current_year; prior += w.prior_year; any = true; }
  });
  return any ? { cur, prior } : null;
}

/* ------------------------------------------------------------------ */
/* PRECINCT UNITS                                                      */
/* Two views of the precincts: `precinctList` is every precinct NYPD   */
/* reports, as reported (used for change tests); `units` is keyed by   */
/* map shape and folds the 105th, 113th and 116th into one unit over   */
/* the old 105th and 113th shapes (the map and 2020 populations use    */
/* the old lines; see S.SPLIT_PRECINCTS). Each unit carries the chance */
/* test (with precinct-level dispersion) and whether recent revisions  */
/* could erase its change ("fragile"). Because a map tests every       */
/* precinct at once, `real` also requires surviving the Benjamini-     */
/* Hochberg procedure across the map (a 5% false-discovery rate).      */
/* ------------------------------------------------------------------ */
function buildUnits(raw, parts, pkey, revs, fragileWeeks) {
  if (!raw) return { units: {}, unitList: [], precinctList: [] };
  const flowFor = (keys) => {
    if (!revs) return null;
    let cur = 0; let prior = 0; let any = false; let weeks = 0;
    keys.forEach((k) => {
      weeks = Math.max(weeks, revs.weeksByGeo?.[k] ?? revs.weeks);
      parts.forEach((n) => { const f = revs.byGeo?.[k]?.[n]; if (f) { cur += f.cur; prior += f.prior; any = true; } });
    });
    return any && weeks > 0 ? { cur, prior, weeks } : null;
  };
  const partCounts = (geo) => parts.map((n) => {
    const w = (raw[geo]?.seven_major_felonies?.[n] || raw[geo]?.additional_stats?.[n])?.[pkey];
    return { name: n, n: (w?.current_year || 0) + (w?.prior_year || 0) };
  });
  const finish = (u, keys) => {
    u.pct = u.prior > 0 ? ((u.count - u.prior) / u.prior) * 100 : null;
    u.phi = S.dispersionForSum(keys.flatMap(partCounts), 'precinct');
    u.z = S.poissonZ(u.count, u.prior, u.phi);
    u.verdict = S.verdictFor(u.z);
    u.p = u.verdict === 'drop' || u.verdict === 'rise' || u.verdict === 'noise' ? S.pTwoSided(u.z) : null;
    u.rate = u.pop ? (u.count / u.pop) * 100000 : null;
    const risk = S.revisionRisk({ verdict: u.verdict, cur: u.count, prior: u.prior, phi: u.phi }, flowFor(keys), fragileWeeks);
    u.fragile = !!risk?.fragile;
    return u;
  };
  // A change counts on a map only if it clears the chance test, survives the false-discovery
  // correction across all the precincts on that map, and isn't fragile.
  const correct = (list) => {
    const keep = S.benjaminiHochberg(list.map((u) => (u.p == null ? NaN : u.p)));
    list.forEach((u, i) => {
      u.sig = (u.verdict === 'drop' || u.verdict === 'rise') && keep.has(i);
      u.real = u.sig && !u.fragile ? u.verdict : null;
    });
  };
  const each = [];
  Object.keys(raw).filter((k) => k.includes('Precinct')).forEach((k) => {
    const c = measureCounts(raw[k], parts, pkey);
    if (!c) return;
    const split = S.isSplitPrecinct(k);
    each.push({ num: String(parseInt(k, 10)), geoKey: k, label: k, hood: hoodOf(k), count: c.cur, prior: c.prior, pop: split ? null : (POPULATION[k] || null), tourist: TOURIST_PRECINCTS.includes(k), size: 1 });
  });
  const units = {};
  const keysFor = {};
  each.forEach((u) => { if (!S.isSplitPrecinct(u.geoKey)) { units[u.num] = { ...u }; keysFor[u.num] = [u.geoKey]; } });
  const members = each.filter((u) => S.isSplitPrecinct(u.geoKey));
  if (members.length) {
    const [a] = S.SPLIT_PRECINCTS.shapes;
    const combined = {
      num: a, geoKey: S.SPLIT_PRECINCTS.members[0], label: `${S.SPLIT_PRECINCTS.label} Precincts`, hood: 'Southeast Queens',
      count: members.reduce((n, u) => n + u.count, 0), prior: members.reduce((n, u) => n + u.prior, 0),
      pop: S.SPLIT_PRECINCTS.members.filter((k) => k !== '116th Precinct').reduce((n, k) => n + (POPULATION[k] || 0), 0) || null,
      merged: true, size: members.length,
    };
    keysFor[a] = members.map((u) => u.geoKey);
    units[a] = combined;
    S.SPLIT_PRECINCTS.shapes.slice(1).forEach((shape) => { units[shape] = combined; }); // same unit, second shape
  }
  const unitList = [...new Set(Object.values(units))];
  unitList.forEach((u) => finish(u, keysFor[u.num]));
  each.forEach((u) => finish(u, [u.geoKey]));
  correct(unitList);
  correct(each);
  return { units, unitList, precinctList: each };
}

/* ------------------------------------------------------------------ */
/* GEOGRAPHY PICKER                                                    */
/* ------------------------------------------------------------------ */
function GeoPicker({ raw, geo, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState('');
  const boroughs = useMemo(() => Object.keys(S.BOROUGHS).filter((k) => raw?.[k]), [raw]);
  const patrol = useMemo(() => Object.keys(raw || {}).filter((k) => k !== 'citywide' && !k.includes('Precinct') && !S.isBorough(k)), [raw]);
  const precincts = useMemo(() => Object.keys(raw || {}).filter((k) => k.includes('Precinct'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10)), [raw]);
  const needle = q.trim().toLowerCase();
  const hit = (s) => !needle || s.toLowerCase().includes(needle);
  const pick = (k) => { onPick(k); setOpen(false); setQ(''); };
  const locate = () => {
    if (!navigator.geolocation) { setMsg('Location not available'); return; }
    setLocating(true); setMsg('');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://data.cityofnewyork.us/resource/78dh-3ptz.json?$where=intersects(the_geom, 'POINT(${longitude} ${latitude})')`);
        const data = await res.json();
        const name = data?.[0]?.precinct ? toOrdinalPrecinct(data[0].precinct) : null;
        if (name && raw?.[name]) pick(name); else setMsg('No NYC precinct found here');
      } catch { setMsg('Could not look up your precinct'); } finally { setLocating(false); }
    }, () => { setLocating(false); setMsg('Location permission denied'); });
  };
  const current = geo === 'citywide' ? 'Citywide' : placeLabel(geo);
  return (
    <div className="relative flex items-center gap-2 w-full sm:w-auto">
      <div className="relative flex-1 sm:w-[300px]">
        <input
          type="text"
          aria-label="Choose citywide, a borough, a patrol borough or a precinct"
          value={open ? q : current}
          placeholder="Precinct, neighborhood or borough"
          onFocus={() => { setOpen(true); setQ(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
          className="w-full rounded-full bg-white/10 border border-white/25 text-white placeholder-white/50 text-[13px] font-bold px-4 py-2 focus:outline-none focus:border-[#dde44c]"
        />
        {open && (
          <div className="absolute z-50 mt-1.5 w-full max-h-80 overflow-y-auto rounded-lg bg-white text-[#050507] shadow-2xl border border-[#ddd]">
            {hit('citywide') && <button onMouseDown={() => pick('citywide')} className="block w-full text-left px-3 py-2 text-[13px] font-bold hover:bg-[#f7f8dd]">Citywide</button>}
            {boroughs.filter(hit).length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#707175]">Boroughs</div>}
            {boroughs.filter(hit).map((b) => <button key={b} onMouseDown={() => pick(b)} className="block w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f7f8dd]">{b}</button>)}
            {patrol.filter(hit).length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#707175] border-t border-[#eee]">Patrol boroughs</div>}
            {patrol.filter(hit).map((b) => <button key={b} onMouseDown={() => pick(b)} className="block w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f7f8dd]">{b}</button>)}
            {precincts.filter((p) => hit(p) || hit(hoodOf(p))).length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#707175] border-t border-[#eee]">Precincts</div>}
            {precincts.filter((p) => hit(p) || hit(hoodOf(p))).map((p) => (
              <button key={p} onMouseDown={() => pick(p)} className="block w-full text-left px-3 py-1.5 hover:bg-[#f7f8dd]">
                <span className="text-[13px] font-bold">{p}</span>
                {hoodOf(p) && <span className="text-[12px] text-[#707175]"> · {hoodOf(p)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={locate} disabled={locating} title="Find my precinct" className="rounded-full border border-white/25 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-2 hover:border-[#dde44c] disabled:opacity-50 whitespace-nowrap">
        {locating ? 'Locating…' : 'Near me'}
      </button>
      {msg && <span className="absolute -bottom-5 left-2 text-[11px] text-[#dde44c]">{msg}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MAIN                                                                */
/* ------------------------------------------------------------------ */
export default function BoldApp() {
  const init = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [raw, setRaw] = useState(null);
  const [source, setSource] = useState('loading');
  const [rtci, setRtci] = useState(null);
  const [revs, setRevs] = useState(null);
  const [revStatus, setRevStatus] = useState('idle');
  const [geo, setGeo] = useState(init.get('geo') || 'citywide');
  const [period, setPeriod] = useState(S.PERIODS[init.get('period')] ? init.get('period') : 'ytd');
  const [arcKey, setArcKey] = useState(ARC_OPTIONS.some((a) => a[0] === init.get('arc')) ? init.get('arc') : 'Murder');
  const [measure, setMeasure] = useState(MEASURES[init.get('measure')] ? init.get('measure') : 'shootvic');
  const [mapMode, setMapMode] = useState(init.get('map') === 'signal' ? 'signal' : 'rate');
  const [scope, setScope] = useState(init.get('rows') === 'major' ? 'major' : 'all');
  const [boardMode, setBoardMode] = useState(init.get('board') === 'count' ? 'count' : 'pct');
  const [peerKey, setPeerKey] = useState(S.PEER_GROUPS.some((g) => g.key === init.get('peers')) ? init.get('peers') : 'largest');
  const [thenBase, setThenBase] = useState(init.get('base') === '1993' ? 1993 : 2010);

  useEffect(() => {
    let alive = true;
    fetch(`${COMPSTAT_URL}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!alive) return; if (json?.citywide) { setRaw(S.withBoroughs(json)); setSource('live'); } else throw new Error('empty'); })
      .catch(() => { if (alive) { setRaw(S.withBoroughs(snapshot)); setSource('snapshot'); } });
    fetch(RTCI_CSV_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => { if (alive) setRtci(S.parseRTCI(t) || RTCI_SNAPSHOT); })
      .catch(() => { if (alive) setRtci(RTCI_SNAPSHOT); });
    return () => { alive = false; };
  }, []);

  // Revision pace: the scraper archives each weekly report, so the last few consecutive reports show
  // how much NYPD has been adding to weeks it had already published (~80 KB each, gzipped).
  useEffect(() => {
    if (!raw || source !== 'live') return undefined;
    let alive = true;
    setRevStatus('loading');
    const p = S.parseMDY(raw.citywide?.report_period?.week_end);
    const endIso = p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '';
    const work = fetch(`${DATA_BASE}index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((index) => {
        const older = (Array.isArray(index) ? index : []).filter((e) => e?.date && e?.path && e.date < endIso)
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, S.REVISION_WEEKS);
        return Promise.all(older.map((e) => fetch(DATA_BASE + e.path).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      })
      .then((snaps) => S.revisionFlows([...snaps.filter(Boolean).reverse().map(S.withBoroughs), raw]));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000));
    Promise.race([work, timeout])
      .then((f) => { if (alive) { setRevs(f); setRevStatus('done'); } })
      .catch(() => { if (alive) setRevStatus('failed'); });
    return () => { alive = false; };
  }, [raw, source]);

  const activeGeo = raw && raw[geo] ? geo : 'citywide';
  // Picking a place from the map or a list jumps back up to its verdict.
  const selectGeo = useCallback((g) => {
    setGeo(g);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
  }, []);
  const isCity = activeGeo === 'citywide';

  // Shareable URL state (replaceState: no back-stack clutter).
  useEffect(() => {
    if (!raw) return;
    const p = new URLSearchParams();
    if (activeGeo !== 'citywide') p.set('geo', activeGeo);
    if (period !== 'ytd') p.set('period', period);
    if (arcKey !== 'Murder') p.set('arc', arcKey);
    if (measure !== 'shootvic') p.set('measure', measure);
    if (mapMode !== 'rate') p.set('map', mapMode);
    if (scope !== 'all') p.set('rows', scope);
    if (boardMode !== 'pct') p.set('board', boardMode);
    if (peerKey !== 'largest') p.set('peers', peerKey);
    if (thenBase !== 2010) p.set('base', String(thenBase));
    const qs = p.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState({}, '', url);
  }, [raw, activeGeo, period, arcKey, measure, mapMode, scope, boardMode, peerKey, thenBase]);

  // Honor a #section deep link once content has rendered.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!raw || scrolledRef.current) return;
    scrolledRef.current = true;
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
  }, [raw]);

  const geoData = raw?.[activeGeo];
  const cityData = raw?.citywide;
  const weekEnd = geoData?.report_period?.week_end;
  const end = S.parseMDY(weekEnd);
  const reportYear = end?.y;
  const pkey = S.PERIODS[period].key;
  const P = useMemo(() => periodText(period, geoData), [period, geoData]);

  useEffect(() => {
    if (weekEnd) document.title = `CompStat, read closely · Through ${S.apDate(weekEnd)}`;
  }, [weekEnd]);

  const fragileWeeks = S.fragileThreshold(period);
  const level = S.LEVEL(activeGeo);
  const geoFlows = revs?.byGeo?.[activeGeo];
  const geoWeeks = revs ? (revs.weeksByGeo?.[activeGeo] ?? revs.weeks) : 0;
  const rows = useMemo(() => (geoData ? S.withRevisions(S.extractRows(geoData, period, level), geoFlows, geoWeeks, fragileWeeks) : []), [geoData, period, level, geoFlows, geoWeeks, fragileWeeks]);
  const ytdCityRows = useMemo(() => (cityData ? S.extractRows(cityData, 'ytd', 'city') : []), [cityData]);
  const cityRows = useMemo(() => (cityData ? S.extractRows(cityData, period, 'city') : []), [cityData, period]);
  const headline = useMemo(() => S.buildHeadline(rows), [rows]);
  const total = useMemo(() => {
    const t = S.sumRows(rows, S.MAJORS, 'Seven major felonies', level);
    if (!t || !geoFlows || !revs) return t;
    const f = S.MAJORS.reduce((acc, n) => ({ cur: acc.cur + (geoFlows[n]?.cur || 0), prior: acc.prior + (geoFlows[n]?.prior || 0) }), { cur: 0, prior: 0 });
    return S.withRevisions([t], { [t.name]: f }, geoWeeks, fragileWeeks)[0];
  }, [rows, level, geoFlows, geoWeeks, revs, fragileWeeks]);
  const byName = useMemo(() => Object.fromEntries(rows.map((r) => [r.name, r])), [rows]);
  const ratio = useMemo(() => S.frequencyRatio(rows), [rows]);
  const pop = geoPopulation(activeGeo);
  const isTourist = TOURIST_PRECINCTS.includes(activeGeo);
  const isSplit = S.isSplitPrecinct(activeGeo);
  const rapeOK = S.rapeYoYComparable(period, weekEnd);
  const isBoro = S.isBorough(activeGeo);
  const here = isCity ? 'citywide' : activeGeo.includes('Precinct') ? `in the ${activeGeo}` : isBoro ? S.inBoroughPhrase(activeGeo) : `in Patrol Borough ${activeGeo}`;

  /* ---------------- precinct units for the map + concentration ---------------- */
  const measureDef = MEASURES[measure];
  const measureParts = useMemo(() => (rapeOK ? measureDef.parts : measureDef.parts.filter((n) => n !== 'Rape')), [measureDef, rapeOK]);
  const exRapeNote = measureParts.length !== measureDef.parts.length ? ' (excluding rape)' : '';
  const measureNoun = measureDef.noun + exRapeNote;
  const measureCount = (n) => `${n === 0 ? 'no' : nw(n)} ${n === 1 ? measureDef.one : measureDef.noun}${exRapeNote}`;
  const { units, unitList, precinctList } = useMemo(() => buildUnits(raw, measureParts, pkey, revs, fragileWeeks), [raw, measureParts, pkey, revs, fragileWeeks]);
  const rateUnits = useMemo(() => unitList.filter((u) => !u.tourist && u.rate != null), [unitList]);
  const zeroUnits = useMemo(() => unitList.filter((u) => u.count === 0).sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10)), [unitList]);
  // Fifths over the precincts with any incidents; precincts with none get their own shade, so a map
  // where most precincts had none doesn't print "0.0-0.0" bins.
  const cuts = useMemo(() => S.quantileCuts(rateUnits.filter((u) => u.rate > 0).map((u) => u.rate)), [rateUnits]);
  const conc = useMemo(() => {
    const c = S.concentration(unitList.map((u) => ({ id: u.num, label: u.label, count: u.count, pop: u.pop || 0, size: u.size })));
    // Report precincts, not map units: the combined 105th + 116th counts as two if it's in the top group.
    return c && { ...c, kPrecincts: c.top.reduce((n, u) => n + (u.size || 1), 0), nPrecincts: precinctList.length };
  }, [unitList, precinctList]);
  const cityMeasure = cityData ? measureCounts(cityData, measureParts, pkey) : null;
  const cityRate = cityMeasure ? (cityMeasure.cur / CITY_POPULATION) * 100000 : null;
  const selectedNum = activeGeo.includes('Precinct') ? (activeGeo === '116th Precinct' ? S.SPLIT_PRECINCTS.shapes[0] : String(parseInt(activeGeo, 10))) : null;

  /* ---------------- long arc ---------------- */
  const arcOpt = ARC_OPTIONS.find((a) => a[0] === arcKey) || ARC_OPTIONS[0];
  const arcSeries = useMemo(() => seriesFor(arcKey), [arcKey]);
  const arcRow = ytdCityRows.find((r) => r.name === arcKey);
  const lastHist = arcSeries[arcSeries.length - 1];
  const cityWeekEnd = cityData?.report_period?.week_end;
  const arcFlagged = arcKey === 'Rape';
  const arcFlow = revs?.byGeo?.citywide?.[arcKey];
  const arcPhi = S.dispersionFor(arcKey, 'city');
  // Full-year pace for any citywide line: two methods, widened by REVISION_WEEKS more weeks of revisions
  // at the recent pace (so a claim has to survive the counts rising or falling as NYPD revises them)
  // and by ordinary chance in the count still to come.
  const paceFor = useCallback((key) => {
    const series = seriesFor(key);
    const row = ytdCityRows.find((r) => r.name === key);
    const last = series[series.length - 1];
    if (!row || key === 'Rape' || !last || last.y !== reportYear - 1) return null;
    const base = S.paceRange({ cur: row.cur, priorYtd: row.prior, priorFull: last.val, weekEnd: cityWeekEnd });
    if (!base || base.tooEarly) return base;
    let range = base;
    const flow = revs?.byGeo?.citywide?.[key];
    if (flow && revs?.weeks > 0) {
      const allowance = Math.round((flow.cur / revs.weeks) * S.REVISION_WEEKS);
      const adj = S.paceRange({ cur: row.cur + allowance, priorYtd: row.prior, priorFull: last.val, weekEnd: cityWeekEnd });
      range = { ...base, low: Math.min(base.low, adj.low), high: Math.max(base.high, adj.high), allowance, adj };
    }
    return S.withChance(range, row.cur, S.dispersionFor(key, 'city'));
  }, [ytdCityRows, reportYear, cityWeekEnd, revs]);
  const pace = useMemo(() => (arcFlagged ? null : paceFor(arcKey)), [arcFlagged, paceFor, arcKey]);
  const claim = S.arcClaim(arcSeries, pace);

  /* ---------------- notable trends ---------------- */
  const isPrecinct = activeGeo.includes('Precinct');
  const allPlaces = useMemo(() => (raw ? Object.keys(raw).filter((k) => k.includes('Precinct')) : []), [raw]);
  const notable = useMemo(() => (raw ? S.notableMoves({
    raw, places: allPlaces, periodId: period, crimes: rapeOK ? S.NOTABLE_CRIMES : S.NOTABLE_CRIMES.filter((n) => n !== 'Rape'),
    flows: revs?.byGeo, weeksByGeo: revs?.weeksByGeo, weeks: revs?.weeks || 0, fragileWeeks,
  }) : null), [raw, allPlaces, period, rapeOK, revs, fragileWeeks]);
  const scoped = useMemo(() => {
    if (!notable) return null;
    const keep = (x) => (isCity ? true : isPrecinct ? x.geo === activeGeo : S.isBorough(activeGeo) ? S.inBorough(activeGeo, x.geo) : S.inPatrolBorough(activeGeo, x.geo));
    return { rises: notable.rises.filter(keep), drops: notable.drops.filter(keep), all: notable.all.filter(keep) };
  }, [notable, isCity, isPrecinct, activeGeo]);

  /* ---------------- peers ---------------- */
  const peerGroup = S.PEER_GROUPS.find((g) => g.key === peerKey) || S.PEER_GROUPS[0];
  const peers = useMemo(() => (rtci ? S.peerComparison(rtci, peerGroup) : null), [rtci, peerGroup]);

  /* ---------------- crime-by-crime small multiples ---------------- */
  const smalls = useMemo(() => SMALL_MAPS.filter(([name]) => rapeOK || name !== 'Rape').map(([name, label]) => {
    const { units: u, precinctList: pl } = buildUnits(raw, [name], pkey, revs, fragileWeeks);
    // Precincts with a change beyond chance on its own (before the correction for testing every precinct).
    const raw95 = pl.filter((x) => (x.verdict === 'drop' || x.verdict === 'rise') && !x.fragile).length;
    return { name, label, units: u, rises: pl.filter((x) => x.real === 'rise').length, drops: pl.filter((x) => x.real === 'drop').length, raw95, fragile: pl.filter((x) => x.fragile).length, n: pl.length, testable: pl.filter((x) => x.p != null).length };
  }), [raw, pkey, revs, fragileWeeks, rapeOK]);

  /* ---------------- then and now: NYPD's own long-view columns, by precinct ---------------- */
  const thenNow = useMemo(() => {
    if (!raw) return null;
    const key = thenBase === 1993 ? '31_yr_pct' : '14_yr_pct';
    // The seven-major total counts rape under the definition broadened in 2024; back out rape to see
    // whether that matters. Base = this year's count ÷ (1 + NYPD's % change).
    const exRape = (g) => {
      const t = g?.total_seven_major; const r = g?.seven_major_felonies?.Rape;
      const tc = t?.year_to_date?.current_year; const tp = t?.historical?.[key];
      const rc = r?.year_to_date?.current_year; const rp = r?.historical?.[key];
      if (![tc, tp, rc, rp].every(Number.isFinite) || rp <= -100) return null;
      const base = tc / (1 + tp / 100) - rc / (1 + rp / 100);
      return base > 0 ? ((tc - rc) / base - 1) * 100 : null;
    };
    const rows = [];
    Object.keys(raw).filter((k) => k.includes('Precinct')).forEach((k) => {
      const v = raw[k]?.total_seven_major?.historical?.[key];
      rows.push({ geoKey: k, num: String(parseInt(k, 10)), hood: hoodOf(k), v: Number.isFinite(v) ? v : null, vx: exRape(raw[k]), redrawn: S.redrawnSince(thenBase, k) });
    });
    const usable = rows.filter((r) => r.v != null && !r.redrawn);
    const usableX = usable.filter((r) => r.vx != null);
    const redrawnNames = rows.filter((r) => r.redrawn).map((r) => r.geoKey.replace(' Precinct', ''));
    return {
      key, rows, usable, redrawnNames,
      above: usable.filter((r) => r.v > 0).length, below: usable.filter((r) => r.v < 0).length,
      aboveX: usableX.filter((r) => r.vx > 0).length, belowX: usableX.filter((r) => r.vx < 0).length, nX: usableX.length,
      cityX: exRape(raw.citywide),
    };
  }, [raw, thenBase]);

  const downloadCSV = useCallback((filename, table) => {
    const esc = (c) => { const s = c == null ? '' : String(c); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const blob = new Blob([table.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  /* ---------------- render ---------------- */
  const masthead = (
    <header className="bg-[#050507] text-white vc-noprint">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-5 pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-black uppercase tracking-[0.2em] text-white">CompStat, read closely</span>
          <span className="rounded-full border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/70">Prototype</span>
        </div>
        {raw && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <GeoPicker raw={raw} geo={activeGeo} onPick={setGeo} />
            <Segmented dark label="Time period" value={period} onChange={setPeriod} options={[['ytd', 'Year to date'], ['d28', '28 days'], ['wtd', 'Week']]} />
          </div>
        )}
      </div>
    </header>
  );

  if (!raw || (source === 'live' && (revStatus === 'idle' || revStatus === 'loading'))) {
    return (
      <div className="vc-root min-h-screen bg-[#050507]">
        {masthead}
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-24 text-white/70 text-[18px]">Loading NYPD's latest CompStat report…</div>
      </div>
    );
  }

  const m = byName.Murder; const sv = byName['Shooting Vic.']; const fa = byName['Fel. Assault'];
  const hist = geoData?.total_seven_major?.historical || {};
  const histCols = S.historicalColumns(reportYear);
  // A long-view comparison that isn't like for like: rape across the 2024 definition change, or a
  // precinct whose lines were redrawn after the base year. Returns the reason, or ''.
  const longViewBlocked = (r, year) => {
    if (r.name === 'Rape' && year < 2025) return 'Not comparable: the legal definition of rape broadened on Sept. 1, 2024.';
    if (S.redrawnSince(year, activeGeo)) return `The ${activeGeo}'s lines have been redrawn since ${year}.`;
    return '';
  };
  // Precincts whose lines were redrawn since a base year don't get that comparison (see S.redrawnSince).
  const longView = period === 'ytd' ? histCols.slice(1).reverse().map((c) => ({ year: c.year, v: hist[c.key] })).filter((c) => Number.isFinite(c.v) && !S.redrawnSince(c.year, activeGeo)) : [];

  const deck = (() => {
    if (!total) return null;
    const dir = total.pct == null ? null : Math.abs(total.pct) < 0.05 ? 'flat' : total.pct < 0 ? 'down' : 'up';
    const s1 = dir === 'flat'
      ? `${P.lead}, the seven major felonies ${here} are unchanged from ${P.cmp}: ${S.fmtInt(total.cur)}.`
      : `${P.lead}, the seven major felonies ${here} are ${dir} ${Math.abs(total.pct).toFixed(1)}% from ${P.cmp}: ${S.fmtInt(total.cur)}, or ${nw(Math.abs(total.diff))} ${total.diff < 0 ? 'fewer' : 'more'}.`;
    let s2 = null;
    if (longView.length === 2) {
      const [a, b] = longView; // 1993, 2010
      const phr = (c) => (Math.abs(c.v) < 0.5 ? `level with ${c.year}` : `${pctWord(c.v)} ${c.v < 0 ? 'below' : 'above'} ${c.year}`);
      s2 = Math.sign(a.v) !== Math.sign(b.v)
        ? `That's ${phr(a)} — but ${phr(b)}, comparing the same stretch of each year.`
        : `That's ${phr(a)} and ${phr(b)}, comparing the same stretch of each year.`;
    }
    return [s1, s2].filter(Boolean).join(' ');
  })();

  const zLine = (r) => (r.z == null ? null : (
    <p key={`z-${r.name}`}>
      <strong>{r.label}:</strong> {S.fmtInt(r.cur)} vs. {S.fmtInt(r.prior)} = {S.fmtSigned(r.diff)} ({S.fmtPct(r.pct)}). Chance test: (gap of {S.fmtInt(Math.abs(r.diff))}, minus 1) ÷ √({r.phi > 1 ? `${r.phi.toFixed(2)} × (` : ''}{S.fmtInt(r.cur)} + {S.fmtInt(r.prior)}{r.phi > 1 ? ')' : ''}) = <strong>z = {r.z < 0 ? '−' : ''}{Math.abs(r.z).toFixed(2)}</strong>.{' '}
      {r.phi > 1 && `The ${r.phi.toFixed(2)} allows for how much this line varies from week to week beyond a plain random count, measured from NYPD's weekly reports. `}
      {Math.abs(r.z) >= S.Z_CRIT ? "Beyond ±1.96: if the underlying rate hadn't changed, a gap this big would show up less than 5% of the time." : "Inside ±1.96: a gap this size shows up routinely even when the underlying rate hasn't changed, so the counts can't show whether it did."}
      {r.rev && <>{' '}{revisionSentence(r)}</>}
    </p>
  ));

  const revNote = (() => {
    const tr = total?.rev;
    if (!revs || !tr) return null;
    const mf = geoFlows?.Murder?.cur;
    const fel = (n) => (n === 0 ? 'no net change in major felonies' : `${S.fmtSigned(n)} ${plural(n, 'major felony', 'major felonies')}`);
    const counts = Number.isFinite(mf)
      ? `${mf === 0 ? 'no net change in murders' : `${S.fmtSigned(mf)} ${plural(mf, 'murder', 'murders')}`} and ${fel(tr.cur)} in all`
      : fel(tr.cur);
    // Say which way revisions tilt the comparison only when they've moved the total by a noticeable amount.
    const big = Math.abs(tr.cur) >= Math.max(10, 0.001 * (total?.cur || 0));
    const tilt = !big ? ''
      : tr.cur > 0 ? 'Because they mostly add crimes, revisions tilt these comparisons toward decline.'
        : `On net, revisions here removed ${S.fmtInt(-tr.cur)}; if that continues, it tilts these comparisons toward increase.`;
    const priorMoved = Math.round(tr.prior) === 0 ? "didn't move" : `moved ${S.fmtSigned(tr.prior)}`;
    return `These are first counts, and NYPD keeps revising them. Over the past ${weeksWord(revs.weeks)}, its revisions to weeks it had already reported came to ${counts}; the ${reportYear - 1} figures they're compared against ${priorMoved}. ${tilt} A real change that ${nw(fragileWeeks)} more ${fragileWeeks === 1 ? 'week' : 'weeks'} of revisions at that pace could erase is marked fragile and kept out of the headline.`.replace(/ {2,}/g, ' ');
  })();

  // One line in the hero pointing to what stands out locally.
  const spotlight = (() => {
    if (!scoped) return null;
    const r0 = scoped.rises[0]; const d0 = scoped.drops[0];
    const bit = (x) => `${lc(x.label)} ${pctProse(x.pct)} in the ${shortName(x.geo)}`;
    if (isPrecinct) {
      const x = [...scoped.rises, ...scoped.drops].sort((a, b) => Math.abs(b.zRel) - Math.abs(a.zRel))[0];
      return x ? `Stands out here (${P.tag}): ${lc(x.label)}, ${pctProse(x.pct)}, while citywide it's ${pctProse(x.cityPct)}.` : null;
    }
    if (!r0 && !d0) return null;
    return `Standing out from the citywide trend (${P.tag}): ${[r0, d0].filter(Boolean).map(bit).join('; ')}.`;
  })();
  // The section's kicker and first line of text name the dates compared.
  const moveSentence = (x) => `${x.label} is ${pctProse(x.pct)} in the ${x.geo}; citywide, it's ${pctProse(x.cityPct)}.`;
  const trendsTitle = (() => {
    if (!scoped) return '';
    if (isPrecinct) {
      const x = [...scoped.rises, ...scoped.drops].sort((a, b) => Math.abs(b.zRel) - Math.abs(a.zRel))[0];
      return x
        ? `In the ${activeGeo}, ${lc(x.label)} stands out: ${pctProse(x.pct)}, while citywide it's ${pctProse(x.cityPct)}.`
        : `Nothing in the ${activeGeo} stands out from both chance and the citywide trend ${P.since}.`;
    }
    const r0 = scoped.rises[0]; const d0 = scoped.drops[0];
    if (r0 && d0 && r0.name === d0.name) return `${r0.label} is ${pctProse(r0.pct)} in the ${r0.geo} and ${pctProse(d0.pct)} in the ${shortName(d0.geo)}; citywide, it's ${pctProse(r0.cityPct)}.`;
    if (r0 && d0) return `${r0.label} is ${pctProse(r0.pct)} in the ${r0.geo}; ${lc(d0.label)} is ${pctProse(d0.pct)} in the ${shortName(d0.geo)}.`;
    if (r0 || d0) return moveSentence(r0 || d0);
    return `No precinct's change in a major crime${isCity ? '' : ` ${here}`} stands out from both chance and the citywide trend ${P.since}.`;
  })();

  // Borough and patrol-borough pages highlight their precincts on the locator map (the 116th has no
  // shape of its own; the old 105th and 113th cover it).
  const memberKeys = isCity || isPrecinct ? [] : allPlaces.filter((k) => (isBoro ? S.inBorough(activeGeo, k) : S.inPatrolBorough(activeGeo, k)));
  const memberNums = memberKeys.filter((k) => k !== '116th Precinct').map((k) => String(parseInt(k, 10)));
  // Hover labels for the locator map: every precinct's name and neighborhood.
  const locatorTitles = Object.fromEntries(allPlaces.filter((k) => k !== '116th Precinct').map((k) => [String(parseInt(k, 10)), `${k}: ${hoodOf(k) || 'New York City'}${S.isSplitPrecinct(k) ? ' (shown combined with the 105th, 113th and 116th)' : ''}`]));
  const tiles = [
    m && { key: 'm', label: 'Murders', r: m },
    sv && { key: 'sv', label: 'Shooting victims', r: sv },
    fa && { key: 'fa', label: 'Felony assaults', r: fa },
    total && { key: 't', label: 'Seven major felonies', r: total },
  ].filter(Boolean);

  const boardRows = rows.filter((r) => (scope === 'major' ? r.group === 'major' : true) && r.cur + r.prior > 0);
  const tested = boardRows.filter((r) => r.verdict === 'drop' || r.verdict === 'rise' || r.verdict === 'noise');
  const realCount = tested.filter((r) => r.verdict !== 'noise').length;
  const noiseCount = tested.length - realCount;
  const periodWord = period === 'ytd' ? 'this year' : period === 'd28' ? 'over 28 days' : 'this week';
  const boardTitle = realCount === 0
    ? `None of the ${nw(tested.length)} changes ${periodWord} is bigger than chance would produce.`
    : realCount === tested.length
      ? `All ${nw(tested.length)} changes ${periodWord} are bigger than chance would produce.`
      : `${capFirst(nw(realCount))} of ${nw(tested.length)} changes ${periodWord} ${realCount === 1 ? 'is' : 'are'} bigger than chance would produce.`;
  const lumpy = tested.filter((r) => r.phi >= 1.5).sort((a, b) => b.phi - a.phi);
  // Some lines are hundreds of times as common as others, so one percent means very different numbers.
  const scaleNote = (() => {
    // Only lines with a real base: a 1% change on a count of two is a meaningless fraction of a crime.
    const solid = tested.filter((r) => !S.smallBase(r.prior) && r.prior > 0);
    const big = [...solid].sort((a, b) => b.prior - a.prior)[0];
    const small = solid.includes(byName.Murder) ? byName.Murder : [...solid].sort((a, b) => a.prior - b.prior)[0];
    if (!big || !small || big === small || big.prior < 20 * small.prior) return '';
    const one = (r) => { const v = r.prior / 100; return v >= 10 ? S.fmtInt(v) : v >= 1 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2); };
    return `Some lines are far more common than others: a 1% change in ${lc(big.label)} is ${one(big)} crimes; in ${lc(small.label)}, ${one(small)}. ${boardMode === 'count' ? 'Here every change is drawn as a number of crimes, on one shared scale. ' : 'Switch to "Number of crimes" to compare sizes. '}`;
  })();
  const fragileRows = boardRows.filter((r) => r.fragile);
  const fragileDek = fragileRows.length
    ? ` ${capFirst(joinAnd(fragileRows.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1))))} ${fragileRows.length === 1 ? 'clears' : 'clear'} it today but ${fragileRows.length === 1 ? 'is' : 'are'} fragile: ${nw(fragileWeeks)} more ${fragileWeeks === 1 ? 'week' : 'weeks'} of NYPD revisions at the recent pace could erase ${fragileRows.length === 1 ? 'it' : 'them'}.`
    : '';

  const navItems = [
    ['trends', 'Notable trends'], ['signal', 'Signal'], ['every-one', 'Every one'], ...(isCity ? [['arc', 'Long arc']] : []),
    ...(unitList.length > 0 ? [['where', 'Where'], ['by-crime', 'Crime by crime']] : []), ...(period === 'ytd' && unitList.length > 0 ? [['then-now', 'Then and now']] : []), ...(isCity ? [['cities', 'Other cities']] : []), ['day', 'A day in the precinct'], ['ledger', 'Ledger'], ['method', 'Method'],
  ];

  return (
    <div className="vc-root min-h-screen bg-white">
      {masthead}

      {/* ============================ VERDICT ============================ */}
      <section className="bg-[#050507] text-white" aria-labelledby="verdict-h">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-12 sm:pb-16">
          {source === 'snapshot' && (
            <div className="mb-6 rounded border border-[#ff7c53] px-4 py-3 text-[14px] text-white/90">
              The live feed couldn't be reached, so this page is showing a copy of NYPD's citywide report for the week ending {S.apDate(weekEnd)}, bundled with the page. Precinct views need the live feed.
            </div>
          )}
          <div className={selectedNum ? 'lg:grid lg:grid-cols-[1fr_260px] lg:gap-10' : ''}>
          <div>
          <Kicker dark>{isCity ? 'Citywide' : placeLabel(activeGeo)}{!isCity && hoodOf(activeGeo) ? ` · ${hoodOf(activeGeo)}` : ''} · {P.kicker}</Kicker>
          <h1 id="verdict-h" className="vc-enter vc-display vc-hero-headline font-black leading-[0.98] tracking-tight text-[40px] sm:text-[60px] md:text-[76px] lg:text-[88px] max-w-[15ch]">
            {headline.sentences.map((s, i) => (
              <span key={s} className={i === 1 && (headline.counterKind === 'stuck' || headline.counterKind === 'rise') ? 'vc-counter' : ''}>{s}{i < headline.sentences.length - 1 ? ' ' : ''}</span>
            ))}
          </h1>
          {deck && <p style={{ '--d': '200ms' }} className="vc-enter vc-serif mt-6 max-w-3xl text-[19px] sm:text-[23px] leading-snug text-white/80">{deck}</p>}
          {ratio && (() => {
            // Percentages hide scale: the same percent means very different numbers of crimes.
            const fa = ratio.numer; const mu = ratio.denom;
            // (A change that rounds to 0.0% illustrates nothing, so it's left out.)
            const sized = (r) => (r.diff === 0 || r.pct == null || Math.abs(r.pct) < 0.05 ? null : `${Math.abs(r.pct) < 10 ? Math.abs(r.pct).toFixed(1) : Math.round(Math.abs(r.pct))}% ${r.diff > 0 ? 'rise' : 'drop'}`);
            const parts = [[fa, 'felony assaults', 'assault'], [mu, 'murders', 'murder']].filter(([r]) => sized(r))
              .map(([r, pl, noun]) => `a ${sized(r)} in ${pl} is ${nw(Math.abs(r.diff))} ${r.diff > 0 ? 'more' : 'fewer'} ${noun}${Math.abs(r.diff) === 1 ? '' : 's'}`);
            return (
              <p className="mt-4 max-w-3xl text-[15px] sm:text-[16px] text-white/70">
                Scale matters: NYPD recorded <strong className="text-white">{ratio.display} felony assaults</strong> for every murder {P.since}.{parts.length ? ` ${capFirst(parts.join('; '))}.` : ''}
              </p>
            );
          })()}
          {spotlight && <p className="mt-4 max-w-3xl text-[15px] sm:text-[16px] text-white/85">{spotlight} <a href="#trends" className="underline decoration-[#dde44c] underline-offset-2 hover:text-[#dde44c] whitespace-nowrap">Notable trends ↓</a></p>}
          {revNote && <p className="mt-4 max-w-3xl text-[15px] sm:text-[16px] text-white/70">{revNote}</p>}
          {isTourist && <p className="mt-4 max-w-3xl text-[14px] text-[#dde44c]">The {activeGeo} covers {hoodOf(activeGeo)}, where daytime crowds of workers and visitors dwarf the resident population. Counts and changes are real; per-resident rates are not meaningful here.</p>}
          {isBoro && <p className="mt-4 max-w-3xl text-[14px] text-white/70">{geoData?.summedFrom ? `NYPD doesn't report borough totals; these add up its ${geoData.summedFrom.join(' and ')} patrol-borough reports.` : `${placeLabel(activeGeo)} is a single NYPD patrol borough; these are its figures as reported.`}</p>}
          {isSplit && <p className="mt-4 max-w-3xl text-[14px] text-[#dde44c]">The 116th Precinct was created in December 2024 from parts of the 105th and 113th. NYPD reports all three separately, restated for the new lines, but the population figures and precinct map use the old lines, so per-resident rates for any one of them would be wrong. Maps and rates combine the three.</p>}
          </div>
          {selectedNum && (
            <div className="mt-8 lg:mt-2 max-w-[260px]">
              <MiniMap dark fills={{ [selectedNum]: '#dde44c' }} titles={locatorTitles} selectedNum={selectedNum} onSelect={(num) => { const k = Object.keys(raw).find((x) => x.includes('Precinct') && String(parseInt(x, 10)) === num); if (k) selectGeo(k); }} label={`Locator map: the ${activeGeo} highlighted among New York City's precincts.`} minWidth={160} />
              <p className="mt-2 text-[11px] uppercase tracking-widest text-white/50">{isSplit ? 'The 105th, 113th and 116th are one shape on this map' : 'Click another precinct to switch'}</p>
              <a href="#day" className="mt-3 inline-block text-[11px] font-bold uppercase tracking-[0.14em] text-[#dde44c] hover:underline">A day in this precinct ↓</a>
            </div>
          )}
          {!selectedNum && memberNums.length > 0 && (
            <div className="mt-8 lg:mt-2 max-w-[260px]">
              <MiniMap dark fills={Object.fromEntries(memberNums.map((n) => [n, '#dde44c']))} titles={locatorTitles} onSelect={(num) => { const k = Object.keys(raw).find((x) => x.includes('Precinct') && String(parseInt(x, 10)) === num); if (k) selectGeo(k); }} label={`Locator map: the precincts ${here} highlighted among New York City's precincts.`} minWidth={160} />
              <p className="mt-2 text-[11px] uppercase tracking-widest text-white/50">{memberKeys.length} precincts{memberKeys.includes('116th Precinct') ? ', the 116th drawn within the 105th and 113th' : ''} · click one to open it</p>
            </div>
          )}
          </div>

          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 border-t border-white/15">
            {tiles.map(({ key, label, r }) => (
              <div key={key} className="pt-5 pb-2 pr-4 border-b lg:border-b-0 border-white/10">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">{label}</div>
                <div className="vc-display font-black text-[40px] sm:text-[52px] leading-none mt-2"><CountUp value={r.cur} /></div>
                <div className="mt-2 text-[13px] text-white/70" style={{ fontVariantNumeric: 'tabular-nums' }}><strong className="text-[17px] text-white"><Pct pct={r.pct} prior={r.prior} digits={0} dark /></strong> · {S.fmtSigned(r.diff)} vs. {S.fmtInt(r.prior)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><Chip verdict={r.verdict} dark small />{r.fragile && <FragileTag dark weeks={fragileWeeks} />}</div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[12px] text-white/60">Each tile compares {P.compares}.</p>
          <Receipt dark>
            {headline.lead ? zLine(headline.lead) : (() => {
              const names = (list) => joinAnd(list.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1)));
              if (headline.cleared.length) {
                return (
                  <>
                    <p>{capFirst(names(headline.cleared))} cleared the ordinary chance bar (|z| ≥ 1.96) but not the stricter one a headline has to clear (|z| ≥ {S.Z_HEAD.toFixed(2)}): the headline picks from eight crimes, and at 1.96 one of eight would clear by chance alone about a third of the time.</p>
                    {headline.cleared.map(zLine)}
                  </>
                );
              }
              if (headline.fragileOnes.length) {
                return (
                  <>
                    <p>{capFirst(names(headline.fragileOnes))} cleared the chance test on today's counts but {headline.fragileOnes.length === 1 ? 'is' : 'are'} fragile: {nw(fragileWeeks)} more {plural(fragileWeeks, 'week', 'weeks')} of NYPD revisions at the recent pace could erase {headline.fragileOnes.length === 1 ? 'it' : 'them'}.</p>
                    {headline.fragileOnes.map(zLine)}
                  </>
                );
              }
              return <p>No offense in the headline list (murder, shooting victims, rape, robbery, felony assault, burglary, vehicle theft, grand larceny) had |z| ≥ 1.96.</p>;
            })()}
            {headline.counter && zLine(headline.counter)}
            {total && zLine(total)}
            {longView.length > 0 && <p>NYPD's own long-view columns for the seven majors: {longView.map((c) => `${S.fmtPct(c.v)} vs. the same period of ${c.year}`).join('; ')}. NYPD compares against fixed base years, so we label them by year rather than "N years ago."</p>}
            {ratio && <p>{S.fmtInt(ratio.numer.cur)} felony assaults ÷ {S.fmtInt(ratio.denom.cur)} murders = {ratio.ratio.toFixed(1)}.</p>}
            <p className="text-white/60">The headline leads with the gravest crime whose change clears the headline bar, in this order: murder, shooting victims, rape, robbery, felony assault, burglary, vehicle theft, grand larceny. That bar (|z| ≥ {S.Z_HEAD.toFixed(2)}) is stricter than the 1.96 used elsewhere because the headline picks from eight crimes. The second sentence names a serious crime moving the other way, essentially flat (within {S.FLAT_PCT}%) or failing to fall. When last year's count is under {S.SMALL_BASE}, the headline gives the counts instead of a percentage.</p>
          </Receipt>
        </div>
      </section>

      {/* ============================ NAV ============================ */}
      <nav aria-label="Page sections" className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#e6e6e6] vc-noprint">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-2 flex items-center gap-1 vc-scroll-x whitespace-nowrap">
          {navItems.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#555] hover:text-[#050507] px-2.5 py-1.5 rounded-full hover:bg-[#f7f8dd]">{label}</a>
          ))}
          <span className="ml-auto pl-3 flex items-center gap-3">
            <span className="hidden xl:inline text-[12px] font-bold text-[#050507]">{isCity ? 'Citywide' : placeLabel(activeGeo)}</span>
            {!isCity && <button onClick={() => selectGeo('citywide')} className="text-[11px] font-bold uppercase tracking-wider text-[#ff7c53] hover:text-[#050507]">← Citywide</button>}
          </span>
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-4 sm:px-8">

        {/* ============================ NOTABLE TRENDS ============================ */}
        {scoped && notable && (
          <section id="trends" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
            <SectionHead
              id="trends"
              kicker={`Notable trends · ${P.tag}`}
              title={trendsTitle}
              dek={`Every change here compares ${P.compares}. A move makes this list only if it clears the chance test, stands out from the citywide trend for that crime and holds up after correcting for the ${S.fmtInt(notable.tested)} precinct-and-crime pairs tested at once. A precinct whose robbery fell as fast as the city's isn't a local story.${period !== 'ytd' ? ' Over 28 days or a week, counts are usually too small for any precinct to clear all three; the year-to-date view has more to show.' : ''}`}
            />
            {isPrecinct ? (
              <div className="max-w-3xl">
                <ul>{scoped.all.map((x) => <MoveItem key={x.name} x={x} status showPlace={false} max={moveMax(scoped.all)} year={reportYear} />)}</ul>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2">
                  {(() => {
                    const fills = {}; const titles = {};
                    [...scoped.rises, ...scoped.drops].forEach((x) => {
                      const num = x.geo === '116th Precinct' ? S.SPLIT_PRECINCTS.shapes[0] : String(parseInt(x.geo, 10));
                      const was = fills[num];
                      const col = x.zRel > 0 ? SIGNAL_RAMP['2'] : SIGNAL_RAMP['-2'];
                      fills[num] = was && was !== col ? '#8e6bb0' : col;
                      titles[num] = `${titles[num] ? `${titles[num]}; ` : `${x.geo}: `}${lc(x.label)} ${S.fmtPct(x.pct, 0)} (city ${S.fmtPct(x.cityPct, 0)})`;
                    });
                    return <MiniMap fills={fills} titles={titles} selectedNum={selectedNum} onSelect={(num) => { const x = [...scoped.rises, ...scoped.drops].find((y) => String(parseInt(y.geo, 10)) === num); if (x) selectGeo(x.geo); }} label="Map: precincts with a notable rise (red) or drop (blue) in a major crime." minWidth={220} />;
                  })()}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#444]">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: SIGNAL_RAMP['2'] }} />Notable rise</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: SIGNAL_RAMP['-2'] }} />Notable drop</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: '#8e6bb0' }} />Both</span>
                  </div>
                </div>
                <div className="lg:col-span-3 grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-6">
                  {[['Rising faster than the city', scoped.rises, 1], ['Falling faster than the city', scoped.drops, -1]].map(([title, list, dir]) => (
                    <div key={title}>
                      <h3 className="flex items-baseline justify-between gap-3 text-[12px] font-black uppercase tracking-[0.14em] border-b border-[#050507] pb-2 mb-1"><span>{title}</span>{list.length > 0 && <span className="text-[11px] font-bold normal-case tracking-normal text-[#707175] whitespace-nowrap">{list.length > 8 ? `top 8 of ${list.length}` : `${list.length}`}</span>}</h3>
                      {list.length > 0
                        ? <ul>{list.slice(0, 8).map((x) => <MoveItem key={`${x.geo}-${x.name}`} x={x} onPick={selectGeo} max={moveMax([...scoped.rises.slice(0, 8), ...scoped.drops.slice(0, 8)])} year={reportYear} />)}</ul>
                        : (
                          <>
                            <p className="text-[13px] text-[#707175] py-2">None clears all three bars. The biggest {dir > 0 ? 'rises' : 'drops'} next to the city, for what they're worth:</p>
                            <ul>{scoped.all.filter((x) => Math.sign(x.zRel) === dir && Math.sign(x.diff) === dir).slice(0, 3).map((x) => <MoveItem key={`${x.geo}-${x.name}`} x={x} onPick={selectGeo} status max={100} year={reportYear} />)}</ul>
                          </>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isCity && period === 'ytd' && (
              <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.14em] border-b border-[#050507] pb-2 mb-2">Where the citywide changes came from, {P.dates}, vs. the same dates in {reportYear - 1}</h3>
                  <ul className="space-y-5">
                    {S.NOTABLE_CRIMES.filter((n) => (rapeOK || n !== 'Rape')).map((n) => {
                      const r = cityRows.find((x) => x.name === n);
                      if (!r || (r.verdict !== 'drop' && r.verdict !== 'rise')) return null;
                      const c = S.contributions(raw, allPlaces, n, 'ytd', 5);
                      if (!c) return null;
                      return (
                        <Reveal as="li" key={n}>
                          <div className="flex items-baseline justify-between gap-3 mb-1.5">
                            <span className="text-[15px] font-bold">{r.label} <span className="font-normal text-[#555]" style={{ fontVariantNumeric: 'tabular-nums' }}>{S.fmtSigned(c.net)}</span></span>
                            <span className="text-[12px] text-[#555]">Top five: <strong className="text-[#050507]">{Math.round(c.share * 100)}%</strong></span>
                          </div>
                          <ShareBar net={c.net} lead={c.lead} nameFor={shortName} />
                        </Reveal>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-[12px] text-[#707175]">Each bar is the citywide change; the five precincts that moved most in that direction are split out.</p>
                </div>
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.14em] border-b border-[#050507] pb-2 mb-2">Year after year</h3>
                  <ul>
                    {ARC_OPTIONS.filter(([k]) => k !== 'Rape').map(([k, lbl, noun]) => {
                      const series = seriesFor(k);
                      const run = S.annualRun(series);
                      if (!run || !run.dir) return null;
                      const pc = paceFor(k); const cl = pc && !pc.tooEarly ? S.arcClaim(series, pc) : null;
                      const falling = cl && ['record-low', 'low-since', 'below-last'].includes(cl.kind);
                      const rising = cl && ['record-high', 'high-since', 'above-last'].includes(cl.kind);
                      const runTitle = `${run.dir < 0 ? 'Down' : 'Up'} ${nw(run.years)} ${run.years === 1 ? 'year' : 'years in a row'} through ${run.to.y}: ${S.fmtInt(run.from.val)} in ${run.from.y} to ${S.fmtInt(run.to.val)}.`;
                      const paceTitle = pc && !pc.tooEarly ? `${reportYear} pace: ${S.fmtInt(pc.low)} to ${S.fmtInt(pc.high)}, including revisions and chance, against ${S.fmtInt(run.to.val)} in ${run.to.y}.` : '';
                      return (
                        <Reveal as="li" key={k} className="grid grid-cols-[96px_150px] sm:grid-cols-[110px_150px_1fr] items-center gap-x-3 gap-y-1 py-2 border-b border-[#eee]">
                          <span className="text-[14px] font-bold leading-tight">{lbl}</span>
                          <Spark series={series} pace={pc} noun={noun} />
                          <span className="col-span-2 sm:col-span-1 flex flex-wrap gap-1.5">
                            <Tag tone="soft" title={runTitle}>{run.dir < 0 ? '↓' : '↑'} {run.years} {run.years === 1 ? 'yr' : 'yrs'} through {run.to.y}</Tag>
                            {cl && <Tag tone={falling || rising ? 'ink' : 'line'} title={paceTitle}>{reportYear}: {falling ? 'lower' : rising ? 'higher' : `about as ${run.to.y}`}</Tag>}
                          </span>
                        </Reveal>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[12px] text-[#707175]">Full-year NYPD totals for the last 12 years; the orange mark is this year's pace range (revisions and chance included), which has to clear {lastHist?.y ?? 'last year'} for "lower" or "higher." Rape is left out: its definition changed in 2024.</p>
                </div>
              </div>
            )}
            <Receipt>
              <p>Three bars, all required. <strong>Chance:</strong> the precinct's own change clears the chance test (|z| ≥ 1.96, allowing for how much that crime varies week to week at the precinct level). <strong>The city:</strong> it differs from what the precinct would show had it moved exactly with the city. With n = this year + last year there, the city's ratio r puts this year's expected share at r ÷ (1 + r), tested the same way. <strong>Many tests:</strong> {S.fmtInt(notable.tested)} precinct-and-crime pairs are tested at once, so the city test has to survive the Benjamini-Hochberg correction (a 5% false-discovery rate). Changes that recent NYPD revisions could erase are left out.</p>
              <p>{S.fmtInt(notable.rises.length)} rises and {S.fmtInt(notable.drops.length)} drops clear all three citywide {P.since}.{!isCity ? ` ${capFirst(nw(scoped.rises.length + scoped.drops.length))} of them are ${here}.` : ''}</p>
              {period === 'ytd' && <p><strong>Three years:</strong> NYPD's report also compares each line with the same dates two years back, which gives the 2024 count shown. "Two years running" means the count also moved the same way from 2024 to 2025, beyond chance. "After a flat 2025" means the 2024-to-2025 change was within chance, so this year's move is the first clear one. "After a 2025 spike (or dip)" means the count swung the other way from 2024 to 2025, beyond chance; counts that swing unusually one year tend to swing back, so part of this year's change may be a return to normal, the regression to the mean <a className="underline" href="https://www.vitalcitynyc.org/nypd-zone-strategy-crime-drop-analysis/" target="_blank" rel="noopener noreferrer">John Hall describes in Vital City</a>.</p>}
            </Receipt>
          </section>
        )}

        {/* ============================ SIGNAL ============================ */}
        <section id="signal" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
          <SectionHead
            id="signal"
            kicker="Signal or noise"
            title={boardTitle}
            dek={`Each line compares ${P.compares}. ${scaleNote}CompStat prints a percent change next to everything. ${noiseCount > tested.length / 2 ? 'Most of them are within chance.' : 'Not all of them mean something.'} The gray band shows how big a swing chance alone could produce, given how many incidents there are and how much each line varies week to week. Dots outside it are changes too big to put down to chance. Dots inside it may still reflect a real change, but the counts can't show it.${fragileDek}`}
            right={(
              <div className="flex flex-col items-start md:items-end gap-2">
                <Segmented label="Show changes as" size="sm" value={boardMode} onChange={setBoardMode} options={[['pct', 'Percent'], ['count', 'Number of crimes']]} />
                <Segmented label="Which offenses" size="sm" value={scope} onChange={setScope} options={[['all', 'Everything'], ['major', 'Seven majors']]} />
              </div>
            )}
          />
          <SignalBoard rows={boardRows} fragileWeeks={fragileWeeks} mode={boardMode} />
          <Receipt>
            <p>For each line, NYPD gives two counts from windows of equal length: {P.since} and {P.cmp}. If nothing had changed, and the counts were plain random counts, z = (the gap between them, minus 1) ÷ √(this year + last year) would fall within ±1.96 about 95% of the time. The minus 1 is a standard correction that keeps small counts from being over-called.</p>
            <p>Crime counts vary more than plain random counts: one shooting can wound several people, and violence clusters. So each line's test is widened by how much that line has actually varied from week to week in NYPD's weekly reports ({S.DISPERSION_INFO.pairs} pairs of consecutive weeks, this year and last). {lumpy.length > 0 && `Here that matters most for ${joinAnd(lumpy.slice(0, 4).map((r) => `${r.label.charAt(0).toLowerCase() + r.label.slice(1)} (${r.phi.toFixed(1)} times as variable)`))}. `}{(() => {
              // Only the lines whose measured variation doesn't exceed a plain random count go unwidened; that differs by level.
              const plain = rows.filter((r) => (r.name === 'Murder' || r.name === 'Rape') && r.phi <= 1).map((r) => r.label);
              return plain.length === 2 ? `${plain[0]} and ${plain[1].toLowerCase()} vary no more than chance ${isCity ? 'citywide' : 'at this level'}, so their tests aren't widened.`
                : plain.length === 1 ? `${plain[0]} varies no more than chance ${isCity ? 'citywide' : 'at this level'}, so its test isn't widened.` : '';
            })()}</p>
            {m && zLine(m)}
            {sv && zLine(sv)}
            {fa && zLine(fa)}
            <p>With {nw(tested.length)} lines tested at once, about {nw(Math.max(1, Math.round(tested.length * 0.05)))} could clear the bar by chance alone, and several overlap (transit and public-housing crimes are part of the seven majors; shooting victims and shooting incidents count the same events), so these aren't {nw(tested.length)} separate findings. Weekly counts are small, which is why the weekly view is mostly within chance.</p>
            {!rapeOK && <p>Rape is marked not comparable: New York broadened the legal definition of rape on Sept. 1, 2024, and part of the prior-year window falls before that date.</p>}
          </Receipt>
        </section>

        {/* ============================ EVERY ONE ============================ */}
        {(m || sv) && (
          <section id="every-one" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
            <SectionHead
              id="every-one"
              kicker="Every one counts"
              title={m
                ? `${capFirst(nw(m.cur))} ${m.cur === 1 ? 'murder' : 'murders'} ${P.since}${m.diff === 0 ? `, unchanged from ${P.cmp}` : ` — ${nw(Math.abs(m.diff))} ${m.diff < 0 ? 'fewer' : 'more'} than ${P.short}`}.`
                : `${capFirst(nw(sv.cur))} ${sv.cur === 1 ? 'shooting victim' : 'shooting victims'} ${P.since}.`}
              dek="Percentages flatten. Each square below is one murder or one shooting victim recorded by NYPD."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {[[m, 'Murders', 'murders'], [sv, 'Shooting victims', 'shooting victims']].filter(([r]) => r).map(([r, title, noun]) => (
                <div key={title}>
                  <div className="flex items-baseline justify-between gap-3 mb-3 border-b border-[#050507] pb-2">
                    <h3 className="text-[15px] font-black uppercase tracking-[0.12em]">{title}</h3>
                    <span className="flex items-center gap-2 text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>{S.fmtInt(r.cur)} vs. {S.fmtInt(r.prior)} <Chip verdict={r.verdict} small />{r.fragile && <FragileTag weeks={fragileWeeks} />}</span>
                  </div>
                  <UnitChart cur={r.cur} prior={r.prior} noun={noun} priorLabel={P.priorLabel} curLabel={P.since} />
                </div>
              ))}
            </div>
            <Receipt>{m && zLine(m)}{sv && zLine(sv)}</Receipt>
          </section>
        )}

        {/* ============================ LONG ARC ============================ */}
        {isCity && (
          <section id="arc" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
            <SectionHead
              id="arc"
              kicker="The long arc"
              title={(() => {
                const [, lbl, noun] = arcOpt;
                const is = lbl === 'Shootings' ? 'are' : 'is';
                if (arcFlagged) return "Rape counts from late 2024 on aren't directly comparable with earlier years.";
                if (!pace) return `${lbl}, citywide, since ${arcSeries[0]?.y}.`;
                if (pace.tooEarly) return `Too early in ${reportYear} to project ${noun}.`;
                switch (claim?.kind) {
                  case 'record-low': return `At this pace, ${reportYear} would have the fewest ${noun} since at least ${claim.since}, where this series begins.`;
                  case 'low-since': return `At this pace, ${reportYear} would have the fewest ${noun} since ${claim.since}.`;
                  case 'below-last': return `${lbl} ${is} on pace to finish below ${claim.last.y}.`;
                  case 'above-last': return `${lbl} ${is} on pace to finish above ${claim.last.y}.`;
                  case 'high-since': return `At this pace, ${reportYear} would have the most ${noun} since ${claim.since}.`;
                  case 'record-high': return `At this pace, ${reportYear} would have the most ${noun} since at least ${claim.since}, where this series begins.`;
                  default: return `${lbl} ${is} on pace to land about where ${claim?.last?.y ?? 'last year'} did.`;
                }
              })()}
              dek={arcFlagged
                ? 'New York broadened its legal definition of rape on Sept. 1, 2024, to cover nonconsensual oral and anal sexual contact. NYPD has attributed part of the rise in reported rapes since then to the change.'
                : `NYPD's annual citywide totals since 1993. The orange bar is ${reportYear}'s full-year pace, as a range that spans two ways of projecting it, NYPD's recent revisions and ordinary chance in the months left. It isn't a forecast.`}
            />
            <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Offense">
              {ARC_OPTIONS.map(([k, lbl]) => (
                <button key={k} type="button" aria-pressed={arcKey === k} onClick={() => setArcKey(k)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border ${arcKey === k ? 'bg-[#050507] text-white border-[#050507]' : 'border-[#d6d6d6] text-[#555] hover:text-[#050507]'}`}>{lbl}</button>
              ))}
            </div>
            {arcSeries.length > 2 && (
              <LongArc
                series={arcSeries}
                pace={arcFlagged ? null : pace}
                noun={arcOpt[2]}
                events={[{ y: 2020, label: 'Pandemic' }, ...(arcFlagged ? [{ y: 2024, label: 'Definition broadened' }] : [])]}
              />
            )}
            {!arcFlagged && pace && !pace.tooEarly && arcRow && (
              <Receipt>
                <p>Year to date through {S.apDate(cityWeekEnd)}: <strong>{S.fmtInt(arcRow.cur)}</strong> {arcOpt[2]} ({S.fmtInt(arcRow.prior)} at the same point in {reportYear - 1}).</p>
                <p><strong>Calendar method:</strong> {S.fmtInt(arcRow.cur)} ÷ {(pace.elapsed * 100).toFixed(1)}% of the year elapsed = {S.fmtInt(pace.linear)}. Assumes the YTD window starts Jan. 1 and crime is spread evenly across the calendar.</p>
                {pace.seasonal != null && <p><strong>Last year's shape:</strong> by this date in {reportYear - 1}, NYPD had recorded {S.fmtInt(arcRow.prior)} of that year's {S.fmtInt(lastHist.val)} ({(pace.seasonalShare * 100).toFixed(1)}%). {S.fmtInt(arcRow.cur)} ÷ {(pace.seasonalShare * 100).toFixed(1)}% = {S.fmtInt(pace.seasonal)}.</p>}
                {pace.allowance != null && <p><strong>Revision allowance:</strong> over the past {weeksWord(revs.weeks)}, NYPD's revisions to already-reported weeks came to {S.fmtSigned(arcFlow.cur)} {arcOpt[2]}. {capFirst(nw(S.REVISION_WEEKS))} more weeks at that pace would be {S.fmtSigned(pace.allowance)}, making the year-to-date {S.fmtInt(arcRow.cur + pace.allowance)} and the pace {S.fmtInt(Math.min(pace.adj.linear, pace.adj.seasonal ?? Infinity))} to {S.fmtInt(Math.max(pace.adj.linear, pace.adj.seasonal ?? -Infinity))}.</p>}
                {pace.chanceHigh != null && <p><strong>Chance in the rest of the year:</strong> the count still to come is itself random, so each end is widened by 1.96 × √({arcPhi > 1 ? `${arcPhi.toFixed(1)} × ` : ''}the count still to come): {pace.chanceLow > 0 ? `−${S.fmtInt(pace.chanceLow)} at the low end and ` : ''}+{S.fmtInt(pace.chanceHigh)} at the high end. The range shown, {S.fmtInt(pace.low)} to {S.fmtInt(pace.high)}, spans all of it.</p>}
                <p>The headline's comparison has to hold at the <em>high</em> end of the range for a low (or the low end for a high). {claim?.kind === 'low-since' && `${claim.since} had ${S.fmtInt(claim.sinceVal)}, at or below the high end, and every year since had more.`}{claim?.kind === 'record-low' && `The lowest full year in the series is ${S.fmtInt(Math.min(...arcSeries.map((d) => d.val)))}, above even the high end.`}{claim?.kind === 'high-since' && `${claim.since} had ${S.fmtInt(claim.sinceVal)}, at or above the low end, and every year since had fewer.`}</p>
              </Receipt>
            )}
            <SourceLine>
              Source: NYPD's Seven Major Felony Offenses table for 2000-{lastHist?.y}. Figures for 1993-1999, and for shooting incidents, come from the original CompStat Ledger's compilation: its 1993 and 1998 totals match NYPD CompStat's historical columns, and its shootings from 2006 on match NYC Open Data, but the other 1990s years couldn't be matched to a published NYPD table. This year's counts are from the NYPD CompStat report for the week ending {S.apDate(cityWeekEnd)}. Year-end figures are subject to NYPD revision.
            </SourceLine>
          </section>
        )}

        {/* ============================ WHERE ============================ */}
        {unitList.length > 0 && (
        <section id="where" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
          <SectionHead
            id="where"
            kicker="Where it happens"
            title={(() => {
              if (!isCity && selectedNum && units[selectedNum]) {
                const u = units[selectedNum];
                const own = precinctList.find((x) => x.geoKey === activeGeo) || u;
                const counted = `${measureCount(own.count)} ${P.since}`;
                if (u.tourist || u.merged || u.rate == null || cityRate == null) {
                  const tail = own.verdict === 'noise' ? ', within the range of chance' : own.verdict === 'rise' ? ', a rise beyond chance' : own.verdict === 'drop' ? ', a drop beyond chance' : '';
                  const cmp = own.prior === 0
                    ? (own.count === 0 ? `, and none ${P.short}` : `, up from none ${P.short}`)
                    : S.smallBase(own.prior)
                      ? `, ${own.count === own.prior ? 'the same as' : own.count > own.prior ? 'up from' : 'down from'} ${nw(own.prior)} ${P.short}${tail}`
                      : `, ${pctProse(own.pct)} from ${P.cmp}${tail}`;
                  return `The ${activeGeo}: ${counted}${cmp}.`;
                }
                if (own.count === 0) {
                  const none = precinctList.filter((x) => x.count === 0).length;
                  return `The ${activeGeo} recorded no ${measureNoun} ${P.since}, one of ${nw(none)} precincts with none.`;
                }
                // Rankings on a handful of incidents are mostly luck: a precinct with three murders can rank anywhere from first to 30th.
                if (own.count < 10) return `The ${activeGeo}: ${counted}, too few to rank reliably against other precincts.`;
                const ahead = rateUnits.filter((x) => x.rate > u.rate).length;
                const tied = rateUnits.some((x) => x !== u && x.rate === u.rate);
                const x = u.rate / cityRate;
                const rel = x >= 1.05 ? `${x.toFixed(1)} times the citywide rate` : x <= 0.95 ? `${Math.round(x * 100)}% of the citywide rate` : 'about the citywide rate';
                return `The ${activeGeo} ranks ${tied ? 'tied for ' : ''}No. ${ahead + 1} of ${rateUnits.length} precincts for ${measureNoun} per resident, at ${rel}.`;
              }
              if (mapMode === 'signal') {
                const up = precinctList.filter((u) => u.real === 'rise').length;
                const down = precinctList.filter((u) => u.real === 'drop').length;
                return `${capFirst(nw(up))} ${up === 1 ? 'precinct shows' : 'precincts show'} a rise in ${measureNoun} beyond chance ${P.since}, and ${nw(down)} ${down === 1 ? 'shows' : 'show'} a drop, after allowing for testing every precinct at once.`;
              }
              if (!conc || conc.total < 20) return `${capFirst(measureNoun)} by precinct ${P.since}.`;
              const verb = measure === 'shootvic' ? 'were shot' : 'occurred';
              return `At least half the city's ${measureNoun} ${P.since} ${verb} in ${nw(conc.kPrecincts)} of ${conc.nPrecincts} precincts, home to ${Math.round(conc.popShare * 100)}% of New Yorkers.`;
            })()}
            dek={mapMode === 'signal'
              ? (() => {
                const fr = precinctList.filter((u) => u.fragile && u.sig).length;
                const lone = precinctList.filter((u) => (u.verdict === 'drop' || u.verdict === 'rise') && !u.sig).length;
                return `Each precinct's change compares ${P.compares}, with the same chance test used above. Because the map runs it in all ${precinctList.length} precincts at once, a precinct is colored only if it also survives a correction for that (holding false discoveries to about 5% of the precincts colored).${lone ? ` ${capFirst(nw(lone))} more ${lone === 1 ? 'clears' : 'clear'} the test on ${lone === 1 ? 'its' : 'their'} own but not after the correction.` : ''}${fr ? ` ${capFirst(nw(fr))} ${fr === 1 ? 'is' : 'are'} fragile (recent revisions could erase ${fr === 1 ? 'it' : 'them'}) and shaded as within chance.` : ''} Click a precinct to open it.`;
              })()
              : 'Shaded by rate per 100,000 residents, in fifths of the precincts that recorded any. Click a precinct to open it.'}
          />
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Segmented label="Map shading" size="sm" value={mapMode} onChange={setMapMode} options={[['rate', 'Rate per resident'], ['signal', 'Real change?']]} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Measure">
              {Object.entries(MEASURES).map(([k, d]) => (
                <button key={k} type="button" aria-pressed={measure === k} onClick={() => setMeasure(k)}
                  className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${measure === k ? 'bg-[#050507] text-white border-[#050507]' : 'border-[#d6d6d6] text-[#555] hover:text-[#050507]'}`}>{d.label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              <PrecinctMap units={units} mode={mapMode} cuts={cuts} selectedNum={selectedNum} onSelect={selectGeo} measureNoun={measureNoun} priorLabel={P.short} />
              <div className="mt-3"><MapLegend mode={mapMode} cuts={cuts} periodNote={P.since} /></div>
            </div>
            <div className="lg:col-span-2 space-y-8">
              {(mapMode === 'signal'
                ? [
                  ['Rises beyond chance', precinctList.filter((u) => u.real === 'rise').sort((a, b) => b.z - a.z), 'None'],
                  ['Drops beyond chance', precinctList.filter((u) => u.real === 'drop').sort((a, b) => a.z - b.z), 'None'],
                ]
                : [
                  ['Highest rates', rateUnits.filter((u) => u.count > 0).sort((a, b) => b.rate - a.rate).slice(0, 8), '—'],
                  // When many precincts recorded none, "lowest five" would be an arbitrary pick among ties.
                  zeroUnits.length >= 5
                    ? [`None recorded ${P.since} (${zeroUnits.length})`, zeroUnits, '—', true]
                    : ['Lowest rates', [...rateUnits].sort((a, b) => a.rate - b.rate).slice(0, 5), '—'],
                ]
              ).map(([title, list, empty, compact]) => (
                <div key={title}>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.14em] border-b border-[#050507] pb-2 mb-1">{title}{mapMode === 'signal' && list.length > 10 ? ` (${list.length}; top 10 shown)` : ''}</h3>
                  {list.length === 0 && <p className="text-[14px] text-[#707175] py-2">{empty}</p>}
                  {compact ? (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {list.map((u) => (
                        <button key={u.num} type="button" onClick={() => selectGeo(u.geoKey)} title={u.hood} className="rounded-full border border-[#d6d6d6] px-2.5 py-0.5 text-[12px] font-bold hover:bg-[#f7f8dd]">{shortName(u.label)}</button>
                      ))}
                    </div>
                  ) : (
                  <ul>
                    {list.slice(0, 10).map((u) => (
                      <li key={u.num}>
                        <button type="button" onClick={() => selectGeo(u.geoKey)} className={`w-full flex items-baseline justify-between gap-3 py-1.5 text-left border-b border-[#f0f0f0] hover:bg-[#f7f8dd] ${u.num === selectedNum ? 'bg-[#f7f8dd]' : ''}`}>
                          <span className="min-w-0"><span className="text-[14px] font-bold">{u.label.replace(' Precincts', '').replace(' Precinct', '')}</span>{u.hood && <span className="text-[12px] text-[#707175]"> · {u.hood.split(',')[0]}</span>}</span>
                          <span className="text-[13px] whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {mapMode === 'signal' ? <>{S.fmtInt(u.count)} vs. {S.fmtInt(u.prior)} <strong><Pct pct={u.pct} prior={u.prior} digits={0} /></strong></> : <strong>{u.rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
          {isCity && mapMode === 'rate' && conc && conc.total >= 20 && (
            <Receipt>
              <p>{S.fmtInt(conc.total)} {measureNoun} across {conc.nPrecincts} precincts {P.since} (citywide line: {cityMeasure ? S.fmtInt(cityMeasure.cur) : '—'}). Sorted from most to fewest (the 105th, 113th and 116th combined, as on the map; ties go to the more populous precinct), the first {conc.k} add up to {S.fmtInt(conc.cum)} ({(conc.countShare * 100).toFixed(1)}%):</p>
              <p>{conc.top.map((u) => `${shortName(u.label)} (${S.fmtInt(u.count)})`).join(', ')}.</p>
              <p>Their estimated population: {S.fmtInt(conc.pop)} of {S.fmtInt(conc.popTotal)} ({(conc.popShare * 100).toFixed(1)}%). Incidents are counted where they occurred, not where victims live.</p>
            </Receipt>
          )}
          <SourceLine>
            Rates use each precinct's 2020 Census count (John Keefe's census-by-precincts crosswalk), the latest count by precinct, moved by its borough's change to the Census Bureau's estimate for {ESTIMATE_DATE}. That assumes every precinct changed at its borough's pace; no more local estimate is published. The 14th, 18th and 22nd precincts (Midtown and Central Park) draw far more workers and visitors than they have residents, so they're left out of rate shading and rankings; rates also run high in other business and nightlife districts, such as the 1st, 5th, 6th, 13th and 84th, for the same reason. The 116th Precinct was created in December 2024 from parts of the 105th and 113th; the map and population figures use the old lines, so the three are combined here.
          </SourceLine>
        </section>
        )}

        {/* ============================ CRIME BY CRIME ============================ */}
        {smalls.length > 0 && smalls[0].n > 0 && (
          <section id="by-crime" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
            <SectionHead
              id="by-crime"
              kicker="Crime by crime"
              title={(() => {
                const d = smalls.reduce((n, x) => n + x.drops, 0); const r = smalls.reduce((n, x) => n + x.rises, 0);
                return `Across ${nw(smalls.length)} crimes in ${smalls[0].n} precincts, ${nw(d)} ${plural(d, 'drop', 'drops')} and ${nw(r)} ${plural(r, 'rise', 'rises')} stand out from chance ${P.since}.`;
              })()}
              dek={(() => {
                const tests = smalls.reduce((n, x) => n + x.testable, 0);
                const lone = smalls.reduce((n, x) => n + x.raw95, 0) - smalls.reduce((n, x) => n + x.drops + x.rises, 0);
                return `Each map compares ${P.compares}, precinct by precinct: ${S.fmtInt(tests)} tests in all. At the ordinary bar, chance alone could color up to about ${S.fmtInt(Math.round(tests * 0.05))} precincts across the maps, so a precinct is colored only if it also survives a correction for testing every precinct on its map (holding false discoveries to about 5% of the precincts colored).${lone > 0 ? ` That leaves out ${nw(lone)} ${plural(lone, 'change', 'changes')} that clear the test on ${plural(lone, 'its', 'their')} own.` : ''} Fragile changes count as within chance. Blue is a drop, red a rise, gray within chance. Click a precinct to open it.${!rapeOK ? ' Rape is left out because its legal definition changed within the comparison window.' : ''}`;
              })()}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-8">
              {smalls.map((m) => {
                const fills = {}; const titles = {};
                Object.values(m.units).forEach((u) => {
                  const b = u.z == null ? null : S.zBin(u.real ? u.z : 0);
                  if (b != null) fills[u.num] = SIGNAL_RAMP[b];
                  titles[u.num] = `${u.label}: ${S.fmtInt(u.count)} vs. ${S.fmtInt(u.prior)}${u.pct != null ? ` (${S.fmtPct(u.pct, 0)})` : ''}, ${u.real ? `${u.real} beyond chance` : u.fragile && u.sig ? 'fragile' : u.verdict === 'drop' || u.verdict === 'rise' ? 'clears the test on its own, not after correcting for many precincts' : u.verdict === 'none' ? 'none either year' : 'within chance'}`;
                });
                return (
                  <div key={m.name}>
                    <div className="border-b border-[#050507] pb-1.5 mb-2">
                      <h3 className="text-[13px] font-black uppercase tracking-[0.1em]">{m.label}</h3>
                      <div className="text-[12px] text-[#555]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: SIGNAL_RAMP['-2'] }} aria-hidden="true">▼</span> {m.drops} {plural(m.drops, 'drop', 'drops')} · <span style={{ color: SIGNAL_RAMP['2'] }} aria-hidden="true">▲</span> {m.rises} {plural(m.rises, 'rise', 'rises')}
                      </div>
                    </div>
                    <MiniMap fills={fills} titles={titles} selectedNum={selectedNum} onSelect={(num) => m.units[num] && selectGeo(m.units[num].geoKey)} label={`${m.label}: ${m.drops} precincts with a drop and ${m.rises} with a rise beyond chance ${P.since}.`} />
                  </div>
                );
              })}
            </div>
            <div className="mt-4"><MapLegend mode="signal" cuts={[]} /></div>
          </section>
        )}

        {/* ============================ THEN AND NOW ============================ */}
        {period === 'ytd' && thenNow && thenNow.usable.length > 0 && (
          <section id="then-now" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
            <SectionHead
              id="then-now"
              kicker="Then and now"
              title={thenBase === 2010
                ? `Major felonies are running above their 2010 level in ${S.fmtInt(thenNow.above)} of ${S.fmtInt(thenNow.usable.length)} precincts.`
                : thenNow.below === thenNow.usable.length
                  ? `Major felonies are below their 1993 level in all ${S.fmtInt(thenNow.usable.length)} precincts compared, by ${Math.round(Math.min(...thenNow.usable.map((r) => -r.v)))}% to ${Math.round(Math.max(...thenNow.usable.map((r) => -r.v)))}%.`
                  : `Major felonies are below their 1993 level in ${S.fmtInt(thenNow.below)} of ${S.fmtInt(thenNow.usable.length)} precincts.`}
              dek={`NYPD's own comparison of the seven major felonies so far this year with the same stretch of ${thenBase}, precinct by precinct. These are counts, not rates. The ${joinAnd(thenNow.redrawnNames.map((n) => `${n}`))} are hatched and left out because their lines have been redrawn since ${thenBase}: the 121st was carved from the 120th and 122nd in 2013, and the 116th from the 105th and 113th in 2024${thenBase === 1993 ? ', and the 33rd from the 34th after 1993' : ''}. NYPD says it restated the 2024 change, but we can't check how it did that for ${thenBase}.`}
              right={<Segmented label="Base year" size="sm" value={String(thenBase)} onChange={(v) => setThenBase(+v)} options={[['2010', 'vs. 2010'], ['1993', 'vs. 1993']]} />}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              <div className="lg:col-span-3">
                {(() => {
                  const fills = {}; const titles = {}; const hatch = {};
                  thenNow.rows.forEach((r) => {
                    if (r.num === '116') return; // no shape of its own on this map (see the 105th and 113th)
                    const num = r.num;
                    if (r.redrawn) { hatch[num] = true; titles[num] = `${r.geoKey}: lines redrawn since ${thenBase}, left out`; return; }
                    const f = thenFill(r.v, thenBase);
                    if (f) fills[num] = f;
                    titles[num] = `${r.geoKey}${r.hood ? ` (${r.hood})` : ''}: ${r.v == null ? 'no comparison' : `${S.fmtPct(r.v, 0)} vs. ${thenBase}`}`;
                  });
                  return <MiniMap fills={fills} titles={titles} hatch={hatch} selectedNum={selectedNum} onSelect={(num) => { const r = thenNow.rows.find((x) => x.num === num); if (r) selectGeo(r.geoKey); }} label={`Map: seven major felonies this year versus the same stretch of ${thenBase}, by precinct.`} minWidth={260} />;
                })()}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[#444]">
                  {(thenBase === 1993 ? THEN_1993 : THEN_2010).labels.map((l, i) => <span key={l} className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: (thenBase === 1993 ? THEN_1993 : THEN_2010).colors[i] }} />{l}</span>)}
                  <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #f1f1f1 0 2px, #9a9a9a 2px 3px)' }} />Lines redrawn</span>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-8">
                {[
                  [thenBase === 2010 ? 'Furthest above 2010' : 'Smallest declines since 1993', [...thenNow.usable].sort((a, b) => b.v - a.v).slice(0, 6)],
                  [thenBase === 2010 ? 'Furthest below 2010' : 'Largest declines since 1993', [...thenNow.usable].sort((a, b) => a.v - b.v).slice(0, 6)],
                ].map(([title, list]) => (
                  <div key={title}>
                    <h3 className="text-[12px] font-black uppercase tracking-[0.14em] border-b border-[#050507] pb-2 mb-1">{title}</h3>
                    <ul>
                      {list.map((r) => (
                        <li key={r.geoKey}>
                          <button type="button" onClick={() => selectGeo(r.geoKey)} className="w-full flex items-baseline justify-between gap-3 py-1.5 text-left border-b border-[#f0f0f0] hover:bg-[#f7f8dd]">
                            <span className="min-w-0"><span className="text-[14px] font-bold">{r.geoKey.replace(' Precinct', '')}</span>{r.hood && <span className="text-[12px] text-[#707175]"> · {r.hood.split(',')[0]}</span>}</span>
                            <strong className="text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>{S.fmtPct(r.v, 0)}</strong>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <SourceLine>NYPD CompStat's long-view columns (year to date versus the same stretch of {thenBase}), which NYPD computes per precinct. Citywide, the seven majors are {S.fmtPct(cityData?.total_seven_major?.historical?.[thenNow.key], 0)} versus {thenBase}. The totals count rape under the broader definition New York adopted in September 2024; leaving rape out, {thenBase === 2010 ? `${nw(thenNow.aboveX)} of ${nw(thenNow.nX)} precincts are above 2010` : `${nw(thenNow.belowX)} of ${nw(thenNow.nX)} precincts are below 1993`}{Number.isFinite(thenNow.cityX) ? ` (citywide, ${S.fmtPct(thenNow.cityX, 0)})` : ''}.</SourceLine>
          </section>
        )}

        {/* ============================ OTHER CITIES ============================ */}
        {isCity && peers && (
          <section id="cities" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
            <SectionHead
              id="cities"
              kicker="Other cities"
              title={(() => {
                const n = peers.others.length;
                const who = peerGroup.key === 'largest'
                  ? (peers.missing ? `${nw(n)} of the other largest U.S. cities with data` : `the ${nw(n)} other largest U.S. cities`)
                  : `the ${nw(n)} other cities shown`;
                const hi = peers.others.filter((c) => c.vsNYC === 'higher').length;
                const same = peers.others.filter((c) => c.vsNYC === 'same');
                const sameTail = same.length ? ` and about the same as in ${joinAnd(same.map((c) => c.agency))}` : '';
                if (hi === n) return `In ${peers.year}, New York's murder rate was lower than in any of ${who}.`;
                if (hi === 0 && !same.length) return `In ${peers.year}, New York's murder rate was higher than in all of ${who}.`;
                return `In ${peers.year}, New York's murder rate was lower than in ${nw(hi)} of ${who}${sameTail}.`;
              })()}
              dek={`Murders per 100,000 residents, full year ${peers.year}. Murder is the most comparable crime across cities: definitions barely differ, and nearly every one is recorded.`}
              right={<Segmented label="Comparison group" size="sm" value={peerKey} onChange={setPeerKey} options={S.PEER_GROUPS.map((g) => [g.key, g.label])} />}
            />
            <div className="max-w-3xl"><PeerBars list={peers.list} /></div>
            <Receipt>
              {peers.list.map((c) => <p key={c.agency}>{c.isNYC ? 'New York' : `${c.agency}, ${c.state}`}: {S.fmtInt(c.murderFull)} murders ÷ {S.fmtInt(c.pop)} residents × 100,000 = {c.rate.toFixed(2)}</p>)}
              <p>"Lower" and "about the same" use the same chance test as the rest of the page, applied to rates: a city counts as higher or lower only if the gap from New York is beyond chance, given how few murders a smaller city has.{peers.others.filter((c) => c.vsNYC === 'same').map((c) => ` ${c.agency}: z = ${c.zVsNYC.toFixed(2)}.`).join('')}</p>
              <p>Populations are the index's own, the same source for every city; its figure for New York differs slightly from the Census Bureau estimate used elsewhere on this page.</p>
              <p>We use the full calendar year because the index's year-to-date windows differ by city (some agencies report through January, others through April), which makes year-to-date counts incomparable.</p>
            </Receipt>
            <SourceLine>
              Source: <a className="underline" href="https://realtimecrimeindex.com/" target="_blank" rel="noopener noreferrer">Real-Time Crime Index</a> (AH Datalytics){rtci?.updated && /^\d{4}-\d{2}-\d{2}/.test(rtci.updated) ? `, updated ${S.apDate(`${+rtci.updated.slice(5, 7)}/${+rtci.updated.slice(8, 10)}/${rtci.updated.slice(0, 4)}`)}` : ''}{rtci?.snapshot ? ' (bundled copy; live feed unavailable)' : ''}. Rates use the index's population figures.
              {(() => {
                const nypd = annualHistory.citywide.find((d) => d.y === peers.year)?.Murder;
                return nypd && nypd !== peers.nyc.murderFull ? ` The index counts New York's ${peers.year} murders as ${S.fmtInt(peers.nyc.murderFull)}; NYPD's annual figure is ${S.fmtInt(nypd)}.` : '';
              })()}
            </SourceLine>
          </section>
        )}

        {/* ============================ A DAY IN THE PRECINCT ============================ */}
        {raw && Object.keys(raw).some((k) => k.includes('Precinct')) && (
          <PrecinctDay
            initialKey={activeGeo.includes('Precinct') ? activeGeo : (conc?.top?.[0]?.label?.includes('+') ? S.SPLIT_PRECINCTS.members[0] : conc?.top?.[0]?.label) || '75th Precinct'}
            precincts={Object.keys(raw).filter((k) => k.includes('Precinct')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))}
          />
        )}

        {/* ============================ LEDGER ============================ */}
        <section id="ledger" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
          <SectionHead
            id="ledger"
            kicker="The ledger"
            title="Every CompStat line, with the chance test attached."
            dek={`${isCity ? 'Citywide' : placeLabel(activeGeo)}: ${P.compares}. Download it and check our work.`}
            right={(
              <button
                type="button"
                onClick={() => {
                  const hc = S.historicalColumns(reportYear);
                  const header = ['Offense (NYPD)', 'Label', 'Current', 'Prior year', 'Change', '% change', 'z (adjusted for dispersion)', 'Dispersion', 'Verdict', 'Fragile', `Net revisions, last ${revs?.weeks ?? 0} weeks`, 'Revision break-even', 'Weeks of revisions to erase', 'Per 100k (this area)', 'Per 100k (citywide)', ...hc.map((c) => `YTD % vs ${c.year} (NYPD)`)];
                  const data = rows.map((r) => {
                    const cw = cityRows.find((x) => x.name === r.name);
                    return [r.name, r.label, r.cur, r.prior, r.diff, r.pct == null ? '' : r.pct.toFixed(2), r.z == null ? '' : r.z.toFixed(3), r.phi?.toFixed(2) ?? '', r.verdict === 'drop' || r.verdict === 'rise' ? `${r.verdict} beyond chance` : r.verdict === 'noise' ? 'within chance' : r.verdict,
                      r.fragile ? 'yes' : '', r.rev ? r.rev.cur : '', r.risk ? r.risk.breakEven : '', r.risk ? (Number.isFinite(r.risk.weeksToErase) ? r.risk.weeksToErase.toFixed(1) : r.risk.direction === 'none' ? 'no recent revisions' : 'never at recent pace') : '',
                      pop && !isTourist ? ((r.cur / pop) * 100000).toFixed(2) : '', cw ? ((cw.cur / CITY_POPULATION) * 100000).toFixed(2) : '',
                      ...hc.map((c) => (longViewBlocked(r, c.year) ? 'not comparable' : Number.isFinite(r.hist?.[c.key]) ? r.hist[c.key].toFixed(2) : ''))];
                  });
                  const slug = activeGeo.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
                  downloadCSV(`compstat_${slug}_${period}_${(weekEnd || '').replace(/\//g, '-')}.csv`, [header, ...data]);
                }}
                className="rounded-full border-2 border-[#050507] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] hover:bg-[#dde44c]"
              >
                Download CSV
              </button>
            )}
          />
          <div className="vc-scroll-x">
            <table className="w-full min-w-[1040px] text-left border-collapse" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider text-[#707175] border-b-2 border-[#050507]">
                  <th className="py-2 pr-3">Offense</th>
                  <th className="py-2 px-2 text-right">{reportYear}</th>
                  <th className="py-2 px-2 text-right">{reportYear - 1}, same dates</th>
                  <th className="py-2 px-2 text-right">Change</th>
                  <th className="py-2 px-2 text-right">%</th>
                  <th className="py-2 px-2">Chance test</th>
                  {revs && <th className="py-2 px-2 text-right" title={`Net revisions NYPD made in the past ${revs.weeks} weeks to already-reported weeks of this line`}>Revised, {revs.weeks} wks</th>}
                  {revs && <th className="py-2 px-2 text-right" title="Revisions it would take to bring a change beyond chance back within chance, and how many weeks that is at the recent pace ('opposite' = recent revisions run the other way; 'none' = no net revisions)">Cushion</th>}
                  {pop && !isTourist && <th className="py-2 px-2 text-right">Per 100k</th>}
                  {!isCity && <th className="py-2 px-2 text-right">City per 100k</th>}
                  {period === 'ytd' && histCols.map((c) => <th key={c.key} className="py-2 px-2 text-right">vs. {c.year}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cw = cityRows.find((x) => x.name === r.name);
                  const firstOther = r.group === 'other' && rows[i - 1]?.group === 'major';
                  return (
                    <tr key={r.name} className={`border-b border-[#eee] ${firstOther ? 'border-t-2 border-t-[#bbb]' : ''}`}>
                      <td className="py-2 pr-3">
                        <div className="text-[14px] font-bold">{r.label}</div>
                        <div className="text-[11px] text-[#707175]">NYPD: {r.name}</div>
                      </td>
                      <td className="py-2 px-2 text-right text-[14px] font-black">{S.fmtInt(r.cur)}</td>
                      <td className="py-2 px-2 text-right text-[14px] text-[#555]">{S.fmtInt(r.prior)}</td>
                      <td className="py-2 px-2 text-right text-[14px]">{S.fmtSigned(r.diff)}</td>
                      <td className="py-2 px-2 text-right text-[14px]"><Pct pct={r.pct} prior={r.prior} /></td>
                      <td className="py-2 px-2"><span className="inline-flex items-center gap-2"><Chip verdict={r.verdict} small />{r.fragile && <FragileTag weeks={fragileWeeks} />}<span className="text-[12px] text-[#707175] whitespace-nowrap">{r.z != null ? `z ${r.z < 0 ? '−' : ''}${Math.abs(r.z).toFixed(1)}` : ''}</span></span></td>
                      {revs && <td className="py-2 px-2 text-right text-[13px] text-[#555]">{r.rev ? S.fmtSigned(r.rev.cur) : '—'}</td>}
                      {revs && <td className="py-2 px-2 text-right text-[13px] text-[#555] whitespace-nowrap">{r.risk ? `${S.fmtInt(r.risk.breakEven)} · ${Number.isFinite(r.risk.weeksToErase) ? `${r.risk.weeksToErase < 10 ? r.risk.weeksToErase.toFixed(1) : Math.round(r.risk.weeksToErase)} wks` : r.risk.direction === 'none' ? 'none' : 'opposite'}` : '—'}</td>}
                      {pop && !isTourist && <td className="py-2 px-2 text-right text-[13px]">{((r.cur / pop) * 100000).toFixed(1)}</td>}
                      {!isCity && <td className="py-2 px-2 text-right text-[13px] text-[#555]">{cw ? ((cw.cur / CITY_POPULATION) * 100000).toFixed(1) : '—'}</td>}
                      {period === 'ytd' && histCols.map((c) => {
                        const blocked = longViewBlocked(r, c.year);
                        return <td key={c.key} className="py-2 px-2 text-right text-[13px] text-[#555]" title={blocked || undefined}>{blocked ? (r.name === 'Rape' ? 'n/c' : '—') : S.fmtPct(r.hist?.[c.key], 0)}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SourceLine>
            Counts are from NYPD's CompStat report for the week ending {S.apDate(weekEnd)}. "Per 100k" divides this period's count by the estimated population as of {ESTIMATE_DATE}; it is not an annual rate.{isBoro ? ` A borough's residents are its precincts' residents, since police lines don't follow county lines everywhere: Marble Hill is policed from the Bronx, and Roosevelt and Rikers islands from Queens.` : ''} "vs." columns are NYPD's own year-to-date comparisons with the same stretch of each base year; rape's are marked n/c (not comparable) because its legal definition broadened in September 2024{S.redrawnSince(2010, activeGeo) || S.redrawnSince(1993, activeGeo) ? `, and the ${activeGeo}'s lines have been redrawn since some base years, so those comparisons are left out` : ''}. The transit and public-housing lines count major felonies on the subway system and in public housing; they are also included in the seven-major totals.
          </SourceLine>
        </section>

        {/* ============================ METHOD ============================ */}
        <section id="method" className="pt-14 pb-16 scroll-mt-14">
          <SectionHead id="method" kicker="Method" title="How to read this page, and what it won't tell you." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 text-[16px] leading-relaxed text-[#222] max-w-5xl">
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Same numbers, fewer shortcuts</h3>
              <p>Every count here is NYPD's own, from the weekly CompStat report. We don't adjust or smooth any of them; the only estimates on the page are the full-year pace ranges, labeled as such. What changes is the framing: CompStat puts a percent change next to every line and leaves you to guess which ones matter. This page runs each change through a chance test, draws the full annual history behind CompStat's few long-view percentages, and shows where crime concentrates.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">The chance test</h3>
              <p>z = (the gap between this year and last, minus 1) ÷ √(dispersion × (this year + last year)). Beyond ±1.96, a change is too big to put down to chance; inside it, the counts can't tell a real change from chance, which isn't the same as no change. The minus 1 keeps small counts honest: four murders against none last year is within chance. The dispersion allows for how much each line varies from week to week beyond a plain random count, measured from NYPD's own weekly reports (shooting victims vary about twice as much, because one shooting can wound several people; murder varies no more than chance). Clusters that span several weeks aren't fully caught, so near the line, treat the verdict as a prompt, not a conclusion.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Notable trends</h3>
              <p>The notable-trends section looks for local stories: a precinct's change in a crime that clears the chance test, differs from the citywide trend for that crime, and survives a correction for testing every precinct and crime at once. Year to date, each move is tagged with its two-year shape. A drop right after last year's spike may be partly a return toward normal, not a new trend (<a className="underline" href="https://www.vitalcitynyc.org/nypd-zone-strategy-crime-drop-analysis/" target="_blank" rel="noopener noreferrer">regression to the mean</a>).</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Many tests at once</h3>
              <p>Run enough tests and some will clear the bar by luck. The headline picks from eight crimes, so it has to clear a stricter bar (|z| ≥ {S.Z_HEAD.toFixed(2)}, the usual 5% split eight ways). Precinct maps test every precinct at once, so a precinct is colored only if it survives the Benjamini-Hochberg correction, which holds false discoveries to about 5% of the precincts colored. The signal board shows each line's own test, with a note on how many could clear by chance.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Small numbers</h3>
              <p>When last year's count was under {S.SMALL_BASE}, a percent change swings on a handful of crimes: two to six is "+200%." As in the original CompStat Ledger, those percentages are grayed out and starred wherever they appear, and headlines and sentences give the counts instead. The chance test handles small counts on its own, so a big percentage on a tiny base rarely clears it anyway.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Population</h3>
              <p>Rates per 100,000 residents use the Census Bureau's latest estimates, for {ESTIMATE_DATE}: {S.fmtInt(CITY_POPULATION)} New Yorkers, {popPct(CITY_POPULATION / CITY_CENSUS_2020)} fewer than the 2020 Census counted. The Bureau estimates only down to boroughs, so each precinct starts from its 2020 Census count (the latest by precinct, from <a className="underline" href="https://github.com/jkeefe/census-by-precincts" target="_blank" rel="noopener noreferrer">John Keefe's crosswalk</a>) and moves by its borough's change, from {popPct(boroughChange('Bronx'))} fewer residents in the Bronx to {popPct(boroughChange('Staten Island'))} more on Staten Island. Source: <a className="underline" href="https://s-media.nyc.gov/agencies/dcp/assets/files/pdf/data-tools/population/population-estimates/new-york-city-population-estimates-and-trends-july-2026.pdf" target="_blank" rel="noopener noreferrer">City Planning's July 2026 population report</a>, Appendix A.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Pace is a range, not a forecast</h3>
              <p>Full-year pace is shown two ways: the share of the calendar that has passed, and the share of last year's total NYPD had logged by the same date. The range is then widened for NYPD's recent revisions and for ordinary chance in the count still to come. A superlative ("fewest since…") appears only if it holds at the less flattering end of that range. Before a quarter of the year has passed, we don't project.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">NYPD's base years</h3>
              <p>CompStat's long-view columns compare this year with the same stretch of 1993 and 2010 (the percentages back-calculate to those years' same-period totals), plus two years ago. The feed this page reads names them "14-year" and "31-year" changes, which matched the calendar in 2024. We label them by year, and leave them out for precincts whose lines have been redrawn since the base year.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Rape</h3>
              <p>New York broadened the legal definition of rape on Sept. 1, 2024. Comparisons that reach back before that date are skewed upward, so we flag them and keep rape out of the long-arc projection. NYPD's separate federal-definition line ("UCR Rape*"), whose definition didn't change, is in the ledger.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Revisions</h3>
              <p>NYPD's weekly numbers are first counts. Victims die and assaults become murders; cases get upgraded, downgraded or filed late. <a className="underline" href={VC_REVISIONS_URL} target="_blank" rel="noopener noreferrer">A Vital City analysis by John Hall</a>, a retired police professional, found that every one of 95 monthly major-crime totals from 2018 through November 2025 was later revised upward, by 2.7% on average and 13.5% for murder. That measures how much a single month's first count grows. A year-to-date total mixes months that have already been revised with a few recent weeks that haven't, so it has much less left to grow. Last year's comparison figures have mostly settled, so revisions tilt CompStat's comparisons toward decline. We measure the recent pace from consecutive archived reports (this week's year-to-date total, minus last week's, minus this week's own count) and mark a change fragile if {nw(S.REVISION_WEEKS)} more weeks of revisions at that pace could erase it (fewer for 28-day and weekly counts, which can only absorb a few weeks' worth). Fragile changes never headline, and the full-year pace range is widened by the same allowance.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">What CompStat can't see</h3>
              <p>These are crimes reported to and recorded by police. They miss what never gets reported, and they move when reporting, classification or enforcement changes. CompStat figures are preliminary and NYPD revises them. Per-resident rates count residents only (Census Bureau estimates for {ESTIMATE_DATE}), not commuters or visitors, and are withheld where that distortion is severe.</p>
            </div>
          </div>
          <p className="mt-10 text-[14px] text-[#555]">
            Want the original dashboard? <a href="?classic=1" className="underline font-bold text-[#050507]">Open the classic CompStat Ledger</a>.
          </p>
        </section>
      </main>

      <footer className="bg-[#050507] text-white/80">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[13px] font-black uppercase tracking-[0.2em] text-white">CompStat, read closely</div>
            <p className="mt-3 max-w-xl text-[14px] leading-snug">An independent prototype, not an official Vital City product. Data refreshes after NYPD posts each weekly CompStat report.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-bold uppercase tracking-[0.14em]">
            <a className="hover:underline" href="https://compstat.nypdonline.org/" target="_blank" rel="noopener noreferrer">NYPD CompStat</a>
            <a className="hover:underline" href="?classic=1">Classic view</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
