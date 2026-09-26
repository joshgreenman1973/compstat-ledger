import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import crimeHistory from '../data/crime_history.json';
import snapshot from './snapshot-2026-09-20.json';
import {
  GEO_POPULATIONS, PRECINCT_NEIGHBORHOODS, CITYWIDE_POPULATION, TOURIST_PRECINCTS,
  GITHUB_USER, REPO_NAME, RTCI_CSV_URL, toOrdinalPrecinct,
} from '../App';
import * as S from './stats';
import { Chip, FragileTag, Receipt, Kicker, SectionHead, Segmented, SourceLine } from './ui';
import { SignalBoard, UnitChart, LongArc, PrecinctMap, MapLegend, PeerBars, MiniMap, SIGNAL_RAMP } from './charts';
import './bold.css';

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
  shootvic: { label: 'Shooting victims', noun: 'shooting victims', parts: ['Shooting Vic.'] },
  violent: { label: 'Violent felonies', noun: 'violent felonies', parts: S.VIOLENT },
  murder: { label: 'Murder', noun: 'murders', parts: ['Murder'] },
  majors: { label: 'All seven majors', noun: 'major felonies', parts: S.MAJORS },
  property: { label: 'Property felonies', noun: 'property felonies', parts: S.PROPERTY },
};

// Small multiples: one map per crime, shaded by the chance test.
const SMALL_MAPS = [['Murder', 'Murder'], ['Shooting Vic.', 'Shooting victims'], ['Robbery', 'Robbery'], ['Fel. Assault', 'Felony assault'],
  ['Rape', 'Rape'], ['Burglary', 'Burglary'], ['Gr. Larceny', 'Grand larceny'], ['G.L.A.', 'Vehicle theft']];
// Precincts whose lines were redrawn since 2010: the 121st (2013) was carved from the 120th and 122nd, and
// the 116th from the 105th. NYPD's long-view percentages for them compare different territory.
const REDRAWN = ['105th Precinct', '116th Precinct', '120th Precinct', '121st Precinct', '122nd Precinct'];
const THEN_2010 = { cuts: [-25, -5, 5, 25], colors: ['#217ebe', '#90bfdf', '#e8e8ea', '#fabcaa', '#e03a30'], labels: ['25%+ below', '5–25% below', 'Within 5%', '5–25% above', '25%+ above'] };
const THEN_1993 = { cuts: [-85, -75, -65, -50], colors: ['#1a5f8f', '#217ebe', '#4e98cb', '#90bfdf', '#d2e4f0'], labels: ['85%+ below', '75–85% below', '65–75% below', '50–65% below', 'Less than 50% below'] };
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
                  {precincts.map((p) => <option key={p} value={p}>{p}{PRECINCT_NEIGHBORHOODS[p] ? ` · ${PRECINCT_NEIGHBORHOODS[p]}` : ''}</option>)}
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

const ARC_OPTIONS = [
  ['Murder', 'Murder', 'murders'], ['Shooting Inc.', 'Shootings', 'shooting incidents'], ['Robbery', 'Robbery', 'robberies'],
  ['Fel. Assault', 'Felony assault', 'felony assaults'], ['Burglary', 'Burglary', 'burglaries'], ['Gr. Larceny', 'Grand larceny', 'grand larcenies'],
  ['G.L.A.', 'Vehicle theft', 'vehicle thefts'], ['Rape', 'Rape', 'rapes'],
];

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
// AP style: spell out whole numbers below 10 in running text.
const nw = (n) => (Number.isInteger(n) && n >= 0 && n < 10 ? WORDS[n] : S.fmtInt(n));
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
  if (!Number.isFinite(risk.weeksToErase)) return `${base} ${need}, and recent revisions have run the other way.`;
  const wk = risk.weeksToErase;
  const bar = `${nw(risk.thresholdWeeks)}-week bar`;
  return `${base} ${need}: about ${wk < 10 ? wk.toFixed(1) : Math.round(wk)} weeks at the recent pace, ${risk.fragile ? `under our ${bar}, so it's marked fragile` : `beyond our ${bar}`}.`;
}

function periodText(periodId, geoData) {
  const end = S.parseMDY(geoData?.report_period?.week_end);
  const start = S.parseMDY(geoData?.report_period?.week_start);
  const endStr = S.apDate(geoData?.report_period?.week_end, { year: false });
  const y = end?.y;
  if (periodId === 'd28') {
    return { eyebrow: `28 days through ${S.apDate(geoData?.report_period?.week_end)}`, lead: `In the 28 days through ${endStr}`, cmp: `the same 28 days of ${y - 1}`, since: 'in the last 28 days', short: `in the same 28 days of ${y - 1}`, priorLabel: `in the same 28 days of ${y - 1}` };
  }
  if (periodId === 'wtd') {
    const range = start && end && start.m === end.m ? `${S.apDate(geoData.report_period.week_start, { year: false })}–${end.d}` : `${S.apDate(geoData?.report_period?.week_start, { year: false })}–${endStr}`;
    return { eyebrow: `Week of ${range}, ${y}`, lead: `In the week of ${range}`, cmp: `the same week of ${y - 1}`, since: 'this week', short: `in the same week of ${y - 1}`, priorLabel: `in the same week of ${y - 1}` };
  }
  return { eyebrow: `Year to date through ${S.apDate(geoData?.report_period?.week_end)}`, lead: `Through ${endStr}`, cmp: `the same point in ${y - 1}`, since: 'so far this year', short: `at this point in ${y - 1}`, priorLabel: `at this point in ${y - 1}` };
}

const geoPopulation = (geo) => {
  if (geo === 'citywide') return CITYWIDE_POPULATION;
  if (!geo.includes('Precinct')) return null; // patrol-borough lines were redrawn (Bronx North/South); no reliable denominator
  if (geo === S.SPLIT_PRECINCTS.parent || geo === S.SPLIT_PRECINCTS.child) return null;
  return GEO_POPULATIONS[geo] || null;
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
/* reports, as reported (used for change tests); `units` folds the     */
/* 116th into the 105th's footprint (used for maps and anything        */
/* per-resident, since the map and 2020 populations predate the split).*/
/* Each carries the chance test and, when the archive loaded, whether  */
/* recent revisions could erase its change ("fragile").                */
/* ------------------------------------------------------------------ */
function buildUnits(raw, parts, pkey, revs, fragileWeeks) {
  if (!raw) return { units: {}, precinctList: [] };
  const flowFor = (keys) => {
    if (!revs) return null;
    let cur = 0; let prior = 0; let any = false;
    keys.forEach((k) => parts.forEach((n) => { const f = revs.byGeo?.[k]?.[n]; if (f) { cur += f.cur; prior += f.prior; any = true; } }));
    return any ? { cur, prior, weeks: revs.weeks } : null;
  };
  const finish = (u, keys) => {
    u.pct = u.prior > 0 ? ((u.count - u.prior) / u.prior) * 100 : null;
    u.z = S.poissonZ(u.count, u.prior);
    u.verdict = S.verdictFor(u.z);
    u.rate = u.pop ? (u.count / u.pop) * 100000 : null;
    const risk = S.revisionRisk({ verdict: u.verdict, cur: u.count, prior: u.prior }, flowFor(keys), fragileWeeks);
    u.fragile = !!risk?.fragile;
    u.real = (u.verdict === 'drop' || u.verdict === 'rise') && !u.fragile ? u.verdict : null;
    return u;
  };
  const each = [];
  Object.keys(raw).filter((k) => k.includes('Precinct')).forEach((k) => {
    const c = measureCounts(raw[k], parts, pkey);
    if (!c) return;
    const split = k === S.SPLIT_PRECINCTS.parent || k === S.SPLIT_PRECINCTS.child;
    each.push({ num: String(parseInt(k, 10)), geoKey: k, label: k, hood: PRECINCT_NEIGHBORHOODS[k] || '', count: c.cur, prior: c.prior, pop: split ? null : (GEO_POPULATIONS[k] || null), tourist: TOURIST_PRECINCTS.includes(k), size: 1 });
  });
  const out = {};
  each.forEach((u) => { out[u.num] = { ...u }; });
  const par = String(parseInt(S.SPLIT_PRECINCTS.parent, 10)); const ch = String(parseInt(S.SPLIT_PRECINCTS.child, 10));
  const keysFor = {};
  each.forEach((u) => { keysFor[u.num] = [u.geoKey]; });
  if (out[par] && out[ch]) {
    out[par] = { ...out[par], label: '105th + 116th Precincts', hood: `${PRECINCT_NEIGHBORHOODS['105th Precinct'] || 'Southeast Queens'} and the new 116th`, count: out[par].count + out[ch].count, prior: out[par].prior + out[ch].prior, pop: GEO_POPULATIONS[S.SPLIT_PRECINCTS.parent] || null, merged: true, size: 2 };
    keysFor[par] = [S.SPLIT_PRECINCTS.parent, S.SPLIT_PRECINCTS.child];
    delete out[ch];
  }
  Object.values(out).forEach((u) => finish(u, keysFor[u.num]));
  each.forEach((u) => finish(u, [u.geoKey]));
  return { units: out, precinctList: each };
}

/* ------------------------------------------------------------------ */
/* GEOGRAPHY PICKER                                                    */
/* ------------------------------------------------------------------ */
function GeoPicker({ raw, geo, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState('');
  const boroughs = useMemo(() => Object.keys(raw || {}).filter((k) => k !== 'citywide' && !k.includes('Precinct')), [raw]);
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
  const current = geo === 'citywide' ? 'Citywide' : geo;
  return (
    <div className="relative flex items-center gap-2 w-full sm:w-auto">
      <div className="relative flex-1 sm:w-[300px]">
        <input
          type="text"
          aria-label="Choose citywide, a patrol borough or a precinct"
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
            {boroughs.filter(hit).length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#707175]">Patrol boroughs</div>}
            {boroughs.filter(hit).map((b) => <button key={b} onMouseDown={() => pick(b)} className="block w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f7f8dd]">{b}</button>)}
            {precincts.filter((p) => hit(p) || hit(PRECINCT_NEIGHBORHOODS[p] || '')).length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#707175] border-t border-[#eee]">Precincts</div>}
            {precincts.filter((p) => hit(p) || hit(PRECINCT_NEIGHBORHOODS[p] || '')).map((p) => (
              <button key={p} onMouseDown={() => pick(p)} className="block w-full text-left px-3 py-1.5 hover:bg-[#f7f8dd]">
                <span className="text-[13px] font-bold">{p}</span>
                {PRECINCT_NEIGHBORHOODS[p] && <span className="text-[12px] text-[#707175]"> · {PRECINCT_NEIGHBORHOODS[p]}</span>}
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
  const [peerKey, setPeerKey] = useState(S.PEER_GROUPS.some((g) => g.key === init.get('peers')) ? init.get('peers') : 'largest');
  const [thenBase, setThenBase] = useState(init.get('base') === '1993' ? 1993 : 2010);

  useEffect(() => {
    let alive = true;
    fetch(`${COMPSTAT_URL}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!alive) return; if (json?.citywide) { setRaw(json); setSource('live'); } else throw new Error('empty'); })
      .catch(() => { if (alive) { setRaw(snapshot); setSource('snapshot'); } });
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
      .then((snaps) => S.revisionFlows([...snaps.filter(Boolean).reverse(), raw]));
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
    if (peerKey !== 'largest') p.set('peers', peerKey);
    if (thenBase !== 2010) p.set('base', String(thenBase));
    const qs = p.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState({}, '', url);
  }, [raw, activeGeo, period, arcKey, measure, mapMode, scope, peerKey, thenBase]);

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
    if (weekEnd) document.title = `CompStat, Read Closely · Through ${S.apDate(weekEnd)}`;
  }, [weekEnd]);

  const fragileWeeks = S.fragileThreshold(period);
  const geoFlows = revs?.byGeo?.[activeGeo];
  const rows = useMemo(() => (geoData ? S.withRevisions(S.extractRows(geoData, period), geoFlows, revs?.weeks, fragileWeeks) : []), [geoData, period, geoFlows, revs, fragileWeeks]);
  const ytdCityRows = useMemo(() => (cityData ? S.extractRows(cityData, 'ytd') : []), [cityData]);
  const cityRows = useMemo(() => (cityData ? S.extractRows(cityData, period) : []), [cityData, period]);
  const headline = useMemo(() => S.buildHeadline(rows), [rows]);
  const total = useMemo(() => {
    const t = S.sumRows(rows, S.MAJORS, 'Seven major felonies');
    if (!t || !geoFlows || !revs) return t;
    const f = S.MAJORS.reduce((acc, n) => ({ cur: acc.cur + (geoFlows[n]?.cur || 0), prior: acc.prior + (geoFlows[n]?.prior || 0) }), { cur: 0, prior: 0 });
    return S.withRevisions([t], { [t.name]: f }, revs.weeks, fragileWeeks)[0];
  }, [rows, geoFlows, revs, fragileWeeks]);
  const byName = useMemo(() => Object.fromEntries(rows.map((r) => [r.name, r])), [rows]);
  const ratio = useMemo(() => S.frequencyRatio(rows), [rows]);
  const pop = geoPopulation(activeGeo);
  const isTourist = TOURIST_PRECINCTS.includes(activeGeo);
  const isSplit = activeGeo === S.SPLIT_PRECINCTS.parent || activeGeo === S.SPLIT_PRECINCTS.child;
  const rapeOK = S.rapeYoYComparable(period, weekEnd);
  const here = isCity ? 'citywide' : activeGeo.includes('Precinct') ? `in the ${activeGeo}` : `in Patrol Borough ${activeGeo}`;

  /* ---------------- precinct units for the map + concentration ---------------- */
  const measureDef = MEASURES[measure];
  const measureParts = useMemo(() => (rapeOK ? measureDef.parts : measureDef.parts.filter((n) => n !== 'Rape')), [measureDef, rapeOK]);
  const measureNoun = measureDef.noun + (measureParts.length !== measureDef.parts.length ? ' (excluding rape)' : '');
  const { units, precinctList } = useMemo(() => buildUnits(raw, measureParts, pkey, revs, fragileWeeks), [raw, measureParts, pkey, revs, fragileWeeks]);
  const unitList = useMemo(() => Object.values(units), [units]);
  const rateUnits = useMemo(() => unitList.filter((u) => !u.tourist && u.rate != null), [unitList]);
  const zeroUnits = useMemo(() => rateUnits.filter((u) => u.count === 0).sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10)), [rateUnits]);
  const cuts = useMemo(() => S.quantileCuts(rateUnits.map((u) => u.rate)), [rateUnits]);
  const conc = useMemo(() => {
    const c = S.concentration(unitList.map((u) => ({ id: u.num, label: u.label, count: u.count, pop: u.pop || 0, size: u.size })));
    // Report precincts, not map units: the combined 105th + 116th counts as two if it's in the top group.
    return c && { ...c, kPrecincts: c.top.reduce((n, u) => n + (u.size || 1), 0), nPrecincts: precinctList.length };
  }, [unitList, precinctList]);
  const cityMeasure = cityData ? measureCounts(cityData, measureParts, pkey) : null;
  const cityRate = cityMeasure ? (cityMeasure.cur / CITYWIDE_POPULATION) * 100000 : null;
  const selectedNum = activeGeo.includes('Precinct') ? String(parseInt(activeGeo === S.SPLIT_PRECINCTS.child ? S.SPLIT_PRECINCTS.parent : activeGeo, 10)) : null;

  /* ---------------- long arc ---------------- */
  const arcOpt = ARC_OPTIONS.find((a) => a[0] === arcKey) || ARC_OPTIONS[0];
  const arcSeries = useMemo(() => crimeHistory.citywide.filter((d) => typeof d[arcKey] === 'number').map((d) => ({ y: d.y, val: d[arcKey] })), [arcKey]);
  const arcRow = ytdCityRows.find((r) => r.name === arcKey);
  const lastHist = arcSeries[arcSeries.length - 1];
  const cityWeekEnd = cityData?.report_period?.week_end;
  const arcFlagged = arcKey === 'Rape';
  const arcFlow = revs?.byGeo?.citywide?.[arcKey];
  const pace = useMemo(() => {
    if (!arcRow || arcFlagged || !lastHist || lastHist.y !== reportYear - 1) return null;
    const base = S.paceRange({ cur: arcRow.cur, priorYtd: arcRow.prior, priorFull: lastHist.val, weekEnd: cityWeekEnd });
    if (!base || base.tooEarly || !arcFlow || !(revs?.weeks > 0)) return base;
    // Widen the range by REVISION_WEEKS more weeks of revisions at the recent pace, so a claim about
    // where the year will land has to survive the counts rising (or falling) as NYPD revises them.
    const allowance = Math.round((arcFlow.cur / revs.weeks) * S.REVISION_WEEKS);
    const adj = S.paceRange({ cur: arcRow.cur + allowance, priorYtd: arcRow.prior, priorFull: lastHist.val, weekEnd: cityWeekEnd });
    return { ...base, low: Math.min(base.low, adj.low), high: Math.max(base.high, adj.high), allowance, adj };
  }, [arcRow, arcFlagged, lastHist, reportYear, cityWeekEnd, arcFlow, revs]);
  const claim = S.arcClaim(arcSeries, pace);

  /* ---------------- peers ---------------- */
  const peerGroup = S.PEER_GROUPS.find((g) => g.key === peerKey) || S.PEER_GROUPS[0];
  const peers = useMemo(() => (rtci ? S.peerComparison(rtci, peerGroup) : null), [rtci, peerGroup]);

  /* ---------------- crime-by-crime small multiples ---------------- */
  const smalls = useMemo(() => SMALL_MAPS.filter(([name]) => rapeOK || name !== 'Rape').map(([name, label]) => {
    const { units: u, precinctList: pl } = buildUnits(raw, [name], pkey, revs, fragileWeeks);
    return { name, label, units: u, rises: pl.filter((x) => x.real === 'rise').length, drops: pl.filter((x) => x.real === 'drop').length, fragile: pl.filter((x) => x.fragile).length, n: pl.length };
  }), [raw, pkey, revs, fragileWeeks, rapeOK]);

  /* ---------------- then and now: NYPD's own long-view columns, by precinct ---------------- */
  const thenNow = useMemo(() => {
    if (!raw) return null;
    const key = thenBase === 1993 ? '31_yr_pct' : '14_yr_pct';
    const rows = [];
    Object.keys(raw).filter((k) => k.includes('Precinct')).forEach((k) => {
      const v = raw[k]?.total_seven_major?.historical?.[key];
      rows.push({ geoKey: k, num: String(parseInt(k, 10)), hood: PRECINCT_NEIGHBORHOODS[k] || '', v: Number.isFinite(v) ? v : null, redrawn: REDRAWN.includes(k) });
    });
    const usable = rows.filter((r) => r.v != null && !r.redrawn);
    return { key, rows, usable, above: usable.filter((r) => r.v > 0).length, below: usable.filter((r) => r.v < 0).length };
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
  const longView = period === 'ytd' ? histCols.slice(1).reverse().map((c) => ({ year: c.year, v: hist[c.key] })).filter((c) => Number.isFinite(c.v)) : [];

  const deck = (() => {
    if (!total) return null;
    const dir = total.pct == null ? null : Math.abs(total.pct) < 0.05 ? 'flat' : total.pct < 0 ? 'down' : 'up';
    const s1 = dir === 'flat'
      ? `${P.lead}, the seven major felonies ${here} are unchanged from ${P.cmp}: ${S.fmtInt(total.cur)}.`
      : `${P.lead}, the seven major felonies ${here} are ${dir} ${Math.abs(total.pct).toFixed(1)}% from ${P.cmp}: ${S.fmtInt(total.cur)}, or ${S.fmtInt(Math.abs(total.diff))} ${total.diff < 0 ? 'fewer' : 'more'}.`;
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
      <strong>{r.label}:</strong> {S.fmtInt(r.cur)} vs. {S.fmtInt(r.prior)} = {S.fmtSigned(r.diff)} ({S.fmtPct(r.pct)}). Chance test: (gap of {S.fmtInt(Math.abs(r.diff))}, minus 1) ÷ √({S.fmtInt(r.cur)} + {S.fmtInt(r.prior)}) = <strong>z = {r.z < 0 ? '−' : ''}{Math.abs(r.z).toFixed(2)}</strong>.{' '}
      {Math.abs(r.z) >= S.Z_CRIT ? "Beyond ±1.96: if the underlying rate hadn't changed, a gap this big would show up less than 5% of the time." : "Inside ±1.96: a gap this size shows up routinely even when the underlying rate hasn't changed."}
      {r.rev && <>{' '}{revisionSentence(r)}</>}
    </p>
  ));

  const revNote = (() => {
    const tr = total?.rev;
    if (!revs || !tr) return null;
    const mf = geoFlows?.Murder?.cur;
    const counts = Number.isFinite(mf)
      ? `${S.fmtSigned(mf)} ${Math.abs(mf) === 1 ? 'murder' : 'murders'} and ${S.fmtSigned(tr.cur)} major felonies in all`
      : `${S.fmtSigned(tr.cur)} major felonies`;
    const tilt = tr.cur > 0 ? 'Because they mostly add crimes, revisions tilt these comparisons toward decline.'
      : tr.cur < 0 ? 'Here they have mostly subtracted crimes, which tilts these comparisons toward increase.' : '';
    const priorMoved = Math.round(tr.prior) === 0 ? "didn't move" : `moved ${S.fmtSigned(tr.prior)}`;
    return `These are first counts, and NYPD keeps revising them. Over the past ${weeksWord(revs.weeks)}, its revisions to weeks it had already reported came to ${counts}; the ${reportYear - 1} figures they're compared against ${priorMoved}. ${tilt} A real change that ${nw(fragileWeeks)} more ${fragileWeeks === 1 ? 'week' : 'weeks'} of revisions at that pace could erase is marked fragile and kept out of the headline.`.replace(/ {2,}/g, ' ');
  })();

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
    ? `None of the ${S.fmtInt(tested.length)} changes ${periodWord} is bigger than chance would produce.`
    : realCount === tested.length
      ? `All ${S.fmtInt(tested.length)} changes ${periodWord} are bigger than chance would produce.`
      : `${capFirst(nw(realCount))} of ${S.fmtInt(tested.length)} changes ${periodWord} ${realCount === 1 ? 'is' : 'are'} bigger than chance would produce.`;
  const fragileRows = boardRows.filter((r) => r.fragile);
  const fragileDek = fragileRows.length
    ? ` ${capFirst(joinAnd(fragileRows.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1))))} ${fragileRows.length === 1 ? 'clears' : 'clear'} it today but ${fragileRows.length === 1 ? 'is' : 'are'} fragile: ${nw(fragileWeeks)} more ${fragileWeeks === 1 ? 'week' : 'weeks'} of NYPD revisions at the recent pace could erase ${fragileRows.length === 1 ? 'it' : 'them'}.`
    : '';

  const navItems = [
    ['signal', 'Signal'], ['every-one', 'Every one'], ...(isCity ? [['arc', 'Long arc']] : []),
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
          <Kicker dark>{isCity ? 'Citywide' : activeGeo}{!isCity && PRECINCT_NEIGHBORHOODS[activeGeo] ? ` · ${PRECINCT_NEIGHBORHOODS[activeGeo]}` : ''} · {P.eyebrow}</Kicker>
          <h1 id="verdict-h" className="vc-display vc-hero-headline font-black leading-[0.98] tracking-tight text-[40px] sm:text-[60px] md:text-[76px] lg:text-[88px] max-w-[15ch]">
            {headline.sentences.map((s, i) => (
              <span key={s} className={i === 1 && (headline.counterKind === 'stuck' || headline.counterKind === 'rise' || headline.counterKind === 'flat') ? 'vc-counter' : ''}>{s}{i < headline.sentences.length - 1 ? ' ' : ''}</span>
            ))}
          </h1>
          {deck && <p className="vc-serif mt-6 max-w-3xl text-[19px] sm:text-[23px] leading-snug text-white/80">{deck}</p>}
          {ratio && (
            <p className="mt-4 max-w-3xl text-[15px] sm:text-[16px] text-white/70">
              For every murder {P.since}, NYPD recorded <strong className="text-white">{ratio.display} felony assaults</strong>.
            </p>
          )}
          {revNote && <p className="mt-4 max-w-3xl text-[15px] sm:text-[16px] text-white/70">{revNote}</p>}
          {isTourist && <p className="mt-4 max-w-3xl text-[14px] text-[#dde44c]">The {activeGeo} covers {PRECINCT_NEIGHBORHOODS[activeGeo]}, where daytime crowds of workers and visitors dwarf the resident population. Counts and changes are real; per-resident rates are not meaningful here.</p>}
          {isSplit && <p className="mt-4 max-w-3xl text-[14px] text-[#dde44c]">The 116th Precinct was created from part of the 105th. NYPD reports each separately with prior-year comparisons, but the 2020 Census populations and precinct map predate the split, so per-resident rates for either alone would be wrong.</p>}
          </div>
          {selectedNum && (
            <div className="mt-8 lg:mt-2 max-w-[260px]">
              <MiniMap dark fills={{ [selectedNum]: '#dde44c' }} selectedNum={selectedNum} onSelect={(num) => { const k = Object.keys(raw).find((x) => x.includes('Precinct') && String(parseInt(x, 10)) === num); if (k) selectGeo(k); }} label={`Locator map: the ${activeGeo} highlighted among New York City's precincts.`} minWidth={160} />
              <p className="mt-2 text-[11px] uppercase tracking-widest text-white/50">{isSplit ? 'The 105th and 116th share one shape on this map' : 'Tap another precinct to switch'}</p>
              <a href="#day" className="mt-3 inline-block text-[11px] font-bold uppercase tracking-[0.14em] text-[#dde44c] hover:underline">A day in this precinct ↓</a>
            </div>
          )}
          </div>

          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 border-t border-white/15">
            {tiles.map(({ key, label, r }) => (
              <div key={key} className="pt-5 pb-2 pr-4 border-b lg:border-b-0 border-white/10">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">{label}</div>
                <div className="vc-display font-black text-[40px] sm:text-[52px] leading-none mt-2">{S.fmtInt(r.cur)}</div>
                <div className="mt-2 text-[13px] text-white/70" style={{ fontVariantNumeric: 'tabular-nums' }}>{S.fmtSigned(r.diff)} vs. {S.fmtInt(r.prior)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><Chip verdict={r.verdict} dark small />{r.fragile && <FragileTag dark weeks={fragileWeeks} />}</div>
              </div>
            ))}
          </div>

          <Receipt dark>
            {headline.lead ? zLine(headline.lead) : <p>No offense in the headline list (murder, shooting victims, rape, robbery, felony assault, burglary, vehicle theft, grand larceny) had |z| ≥ 1.96.</p>}
            {headline.counter && zLine(headline.counter)}
            {total && zLine(total)}
            {longView.length > 0 && <p>NYPD's own long-view columns for the seven majors: {longView.map((c) => `${S.fmtPct(c.v)} vs. the same period of ${c.year}`).join('; ')}. NYPD compares against fixed base years, so we label them by year rather than "N years ago."</p>}
            {ratio && <p>{S.fmtInt(ratio.numer.cur)} felony assaults ÷ {S.fmtInt(ratio.denom.cur)} murders = {ratio.ratio.toFixed(1)}.</p>}
            <p className="text-white/60">The headline leads with the gravest crime whose change clears the chance test, in this order: murder, shooting victims, rape, robbery, felony assault, burglary, vehicle theft, grand larceny. The second sentence names a serious crime moving the other way or failing to fall.</p>
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
            <span className="hidden xl:inline text-[12px] font-bold text-[#050507]">{isCity ? 'Citywide' : activeGeo}</span>
            {!isCity && <button onClick={() => selectGeo('citywide')} className="text-[11px] font-bold uppercase tracking-wider text-[#ff7c53] hover:text-[#050507]">← Citywide</button>}
          </span>
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-4 sm:px-8">

        {/* ============================ SIGNAL ============================ */}
        <section id="signal" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
          <SectionHead
            id="signal"
            kicker="Signal or noise"
            title={boardTitle}
            dek={`CompStat prints a percent change next to everything. ${noiseCount > tested.length / 2 ? 'Most of them are noise.' : 'Not all of them mean something.'} The gray band shows how big a swing random variation alone could produce, given how many incidents there are. Only dots outside it are real movement.${fragileDek}`}
            right={<Segmented label="Which offenses" size="sm" value={scope} onChange={setScope} options={[['all', 'Everything'], ['major', 'Seven majors']]} />}
          />
          <SignalBoard rows={boardRows} fragileWeeks={fragileWeeks} />
          <Receipt>
            <p>For each line, NYPD gives two counts from windows of equal length: {P.since} and {P.cmp}. If nothing had changed, each count would scatter around the same average roughly like a Poisson process, and z = (the gap between them, minus 1) ÷ √(this year + last year) would fall within ±1.96 about 95% of the time. The minus 1 is a standard correction that keeps small counts from being over-called.</p>
            {m && zLine(m)}
            {fa && zLine(fa)}
            <p>Caveat: real crime counts are lumpier than Poisson (one incident can produce several victims; violence clusters), so this test is generous. Treat a "real" verdict near the line as a flag to look closer, not proof. Weekly counts are small, which is why the weekly view is mostly noise.</p>
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
                ? `${capFirst(nw(m.cur))} ${m.cur === 1 ? 'murder' : 'murders'} ${P.since}${m.diff === 0 ? `, the same as ${P.short}` : ` — ${nw(Math.abs(m.diff))} ${m.diff < 0 ? 'fewer' : 'more'} than ${P.short}`}.`
                : `${capFirst(nw(sv.cur))} shooting victims ${P.since}.`}
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
                if (arcFlagged) return "Rape counts from late 2024 on aren't directly comparable with earlier years.";
                if (!pace) return `${lbl}, citywide, since ${arcSeries[0]?.y}.`;
                if (pace.tooEarly) return `Too early in ${reportYear} to project ${noun}.`;
                switch (claim?.kind) {
                  case 'record-low': return `At this pace, ${reportYear} would set a low for ${noun} in NYPD records going back to ${claim.since}.`;
                  case 'low-since': return `At this pace, ${reportYear} would have the fewest ${noun} since ${claim.since}.`;
                  case 'below-last': return `${lbl} is on pace to finish below ${claim.last.y}.`;
                  case 'above-last': return `${lbl} is on pace to finish above ${claim.last.y}.`;
                  case 'high-since': return `At this pace, ${reportYear} would have the most ${noun} since ${claim.since}.`;
                  case 'record-high': return `At this pace, ${reportYear} would set a high for ${noun} in NYPD records going back to ${claim.since}.`;
                  default: return `${lbl} is on pace to land about where ${claim?.last?.y ?? 'last year'} did.`;
                }
              })()}
              dek={arcFlagged
                ? 'New York broadened its legal definition of rape on Sept. 1, 2024, to cover nonconsensual oral and anal sexual contact. NYPD has attributed part of the rise in reported rapes since then to the change.'
                : `NYPD's annual citywide totals since 1993. The orange bar is ${reportYear}'s full-year pace, shown as a range from two methods. Neither is a forecast.`}
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
                {pace.seasonal != null && <p><strong>Last-year's-shape method:</strong> by this date in {reportYear - 1}, NYPD had recorded {S.fmtInt(arcRow.prior)} of that year's {S.fmtInt(lastHist.val)} ({(pace.seasonalShare * 100).toFixed(1)}%). {S.fmtInt(arcRow.cur)} ÷ {(pace.seasonalShare * 100).toFixed(1)}% = {S.fmtInt(pace.seasonal)}.</p>}
                {pace.allowance != null && <p><strong>Revision allowance:</strong> over the past {weeksWord(revs.weeks)}, NYPD's revisions to already-reported weeks came to {S.fmtSigned(arcFlow.cur)} {arcOpt[2]}. {capFirst(nw(S.REVISION_WEEKS))} more weeks at that pace would be {S.fmtSigned(pace.allowance)}, making the year-to-date {S.fmtInt(arcRow.cur + pace.allowance)} and the pace {S.fmtInt(Math.min(pace.adj.linear, pace.adj.seasonal ?? Infinity))}–{S.fmtInt(Math.max(pace.adj.linear, pace.adj.seasonal ?? -Infinity))}. The range shown spans both.</p>}
                <p>The headline's comparison has to hold at the <em>high</em> end of the range for a low (or the low end for a high). {claim?.kind === 'low-since' && `${claim.since} had ${S.fmtInt(claim.sinceVal)}, at or below the high end, and every year since had more.`}{claim?.kind === 'record-low' && `The lowest full year in the series is ${S.fmtInt(Math.min(...arcSeries.map((d) => d.val)))}, above even the high end.`}{claim?.kind === 'high-since' && `${claim.since} had ${S.fmtInt(claim.sinceVal)}, at or above the low end, and every year since had fewer.`}</p>
              </Receipt>
            )}
            <SourceLine>
              Source: NYPD annual citywide totals, {arcSeries[0]?.y}–{lastHist?.y} (seven major felony offenses; shooting incidents), and the NYPD CompStat report for the week ending {S.apDate(cityWeekEnd)}. Year-end figures are subject to NYPD revision.
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
                if (u.tourist || u.merged || u.rate == null || cityRate == null) {
                  const own = precinctList.find((x) => x.geoKey === activeGeo) || u;
                  const tail = own.verdict === 'noise' ? ', within the range of chance' : own.verdict === 'rise' ? ', a real rise' : own.verdict === 'drop' ? ', a real drop' : '';
                  return `The ${activeGeo}: ${S.fmtInt(own.count)} ${measureNoun} ${P.since}, ${own.pct == null ? 'with no prior-year comparison' : `${S.fmtPct(own.pct)} from ${P.cmp}${tail}`}.`;
                }
                const ranked = [...rateUnits].sort((a, b) => b.rate - a.rate);
                const rank = ranked.findIndex((x) => x.num === u.num) + 1;
                const x = u.rate / cityRate;
                const rel = x >= 1.05 ? `${x.toFixed(1)} times the citywide rate` : x <= 0.95 ? `${Math.round(x * 100)}% of the citywide rate` : 'about the citywide rate';
                return `The ${activeGeo} ranks No. ${rank} of ${ranked.length} precincts for ${measureNoun} per resident, at ${rel}.`;
              }
              if (mapMode === 'signal') {
                const up = precinctList.filter((u) => u.real === 'rise').length;
                const down = precinctList.filter((u) => u.real === 'drop').length;
                return `${capFirst(nw(up))} ${up === 1 ? 'precinct shows' : 'precincts show'} a real rise in ${measureNoun} ${P.since}; ${nw(down)} ${down === 1 ? 'shows' : 'show'} a real drop.`;
              }
              if (!conc || conc.total < 20) return `${capFirst(measureNoun)} by precinct ${P.since}.`;
              const verb = measure === 'shootvic' ? 'were shot' : 'occurred';
              return `At least half the city's ${measureNoun} ${P.since} ${verb} in ${nw(conc.kPrecincts)} of ${conc.nPrecincts} precincts, home to ${Math.round(conc.popShare * 100)}% of New Yorkers.`;
            })()}
            dek={mapMode === 'signal'
              ? `Each precinct is shaded by whether its change clears the same chance test used above.${precinctList.some((u) => u.fragile) ? ` ${capFirst(nw(precinctList.filter((u) => u.fragile).length))} more ${precinctList.filter((u) => u.fragile).length === 1 ? 'clears' : 'clear'} it but ${precinctList.filter((u) => u.fragile).length === 1 ? 'is' : 'are'} fragile (recent revisions could erase ${precinctList.filter((u) => u.fragile).length === 1 ? 'it' : 'them'}), so ${precinctList.filter((u) => u.fragile).length === 1 ? 'it is' : 'they are'} shaded as noise.` : ''} Click a precinct to open it.`
              : 'Shaded by rate per 100,000 residents, in fifths. Click a precinct to open it.'}
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
              <PrecinctMap units={units} mode={mapMode} cuts={cuts} selectedNum={selectedNum} onSelect={selectGeo} measureNoun={measureNoun} />
              <div className="mt-3"><MapLegend mode={mapMode} cuts={cuts} periodNote={P.since} /></div>
            </div>
            <div className="lg:col-span-2 space-y-8">
              {(mapMode === 'signal'
                ? [
                  ['Real rises', precinctList.filter((u) => u.real === 'rise').sort((a, b) => b.z - a.z), 'None'],
                  ['Real drops', precinctList.filter((u) => u.real === 'drop').sort((a, b) => a.z - b.z), 'None'],
                ]
                : [
                  ['Highest rates', [...rateUnits].sort((a, b) => b.rate - a.rate).slice(0, 8), '—'],
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
                        <button key={u.num} type="button" onClick={() => selectGeo(u.geoKey)} title={u.hood} className="rounded-full border border-[#d6d6d6] px-2.5 py-0.5 text-[12px] font-bold hover:bg-[#f7f8dd]">{u.label.replace(' Precincts', '').replace(' Precinct', '')}</button>
                      ))}
                    </div>
                  ) : (
                  <ul>
                    {list.slice(0, 10).map((u) => (
                      <li key={u.num}>
                        <button type="button" onClick={() => selectGeo(u.geoKey)} className={`w-full flex items-baseline justify-between gap-3 py-1.5 text-left border-b border-[#f0f0f0] hover:bg-[#f7f8dd] ${u.num === selectedNum ? 'bg-[#f7f8dd]' : ''}`}>
                          <span className="min-w-0"><span className="text-[14px] font-bold">{u.label.replace(' Precincts', '').replace(' Precinct', '')}</span>{u.hood && <span className="text-[12px] text-[#707175]"> · {u.hood.split(',')[0]}</span>}</span>
                          <span className="text-[13px] whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {mapMode === 'signal' ? <>{S.fmtInt(u.count)} vs. {S.fmtInt(u.prior)} <strong>{S.fmtPct(u.pct, 0)}</strong></> : <strong>{u.rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>}
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
              <p>{S.fmtInt(conc.total)} {measureNoun} across {conc.nPrecincts} precincts {P.since} (citywide line: {cityMeasure ? S.fmtInt(cityMeasure.cur) : '—'}). Sorted from most to fewest (the 105th and 116th combined, as on the map), the first {conc.k} add up to {S.fmtInt(conc.cum)} ({(conc.countShare * 100).toFixed(1)}%):</p>
              <p>{conc.top.map((u) => `${u.label.replace(' Precincts', '').replace(' Precinct', '')} (${S.fmtInt(u.count)})`).join(', ')}.</p>
              <p>Their 2020 Census population: {S.fmtInt(conc.pop)} of {S.fmtInt(conc.popTotal)} ({(conc.popShare * 100).toFixed(1)}%). Incidents are counted where they occurred, not where victims live.</p>
            </Receipt>
          )}
          <SourceLine>
            Rates use 2020 Census population by precinct (John Keefe's census-by-precincts crosswalk). The 14th, 18th and 22nd precincts (Midtown and Central Park) draw far more workers and visitors than they have residents, so they're excluded from rate shading and rankings. The 116th Precinct was created from part of the 105th; the map and population figures predate the split, so the two are combined here.
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
                return `Across ${nw(smalls.length)} crimes in ${smalls[0].n} precincts, NYPD's counts show ${S.fmtInt(d)} real ${d === 1 ? 'drop' : 'drops'} and ${S.fmtInt(r)} real ${r === 1 ? 'rise' : 'rises'} ${P.since}.`;
              })()}
              dek={`One map per crime, each precinct shaded by the chance test (fragile changes count as noise). Blue is a real drop, red a real rise, gray noise. Tap a precinct to open it.${!rapeOK ? ' Rape is left out because its legal definition changed within the comparison window.' : ''}`}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-8">
              {smalls.map((m) => {
                const fills = {}; const titles = {};
                Object.values(m.units).forEach((u) => {
                  const b = S.zBin(u.fragile ? 0 : u.z);
                  if (b != null) fills[u.num] = SIGNAL_RAMP[b];
                  titles[u.num] = `${u.label}: ${S.fmtInt(u.count)} vs. ${S.fmtInt(u.prior)}${u.pct != null ? ` (${S.fmtPct(u.pct, 0)})` : ''}, ${u.real ? `real ${u.real}` : u.fragile ? 'fragile' : u.verdict === 'none' ? 'none either year' : 'noise'}`;
                });
                return (
                  <div key={m.name}>
                    <div className="border-b border-[#050507] pb-1.5 mb-2">
                      <h3 className="text-[13px] font-black uppercase tracking-[0.1em]">{m.label}</h3>
                      <div className="text-[12px] text-[#555]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: SIGNAL_RAMP['-2'] }} aria-hidden="true">▼</span> {m.drops} real {m.drops === 1 ? 'drop' : 'drops'} · <span style={{ color: SIGNAL_RAMP['2'] }} aria-hidden="true">▲</span> {m.rises} real {m.rises === 1 ? 'rise' : 'rises'}
                      </div>
                    </div>
                    <MiniMap fills={fills} titles={titles} selectedNum={selectedNum} onSelect={(num) => m.units[num] && selectGeo(m.units[num].geoKey)} label={`${m.label}: ${m.drops} precincts with a real drop and ${m.rises} with a real rise ${P.since}.`} />
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
                : `Major felonies are below their 1993 level in ${S.fmtInt(thenNow.below)} of ${S.fmtInt(thenNow.usable.length)} precincts, by ${Math.round(Math.min(...thenNow.usable.map((r) => Math.abs(r.v))))}% to ${Math.round(Math.max(...thenNow.usable.map((r) => Math.abs(r.v))))}%.`}
              dek={`NYPD's own comparison of the seven major felonies so far this year with the same stretch of ${thenBase}, precinct by precinct. The 105th, 116th, 120th, 121st and 122nd are hatched and left out: their lines were redrawn when the 121st and 116th were created, so the comparison covers different ground.`}
              right={<Segmented label="Base year" size="sm" value={String(thenBase)} onChange={(v) => setThenBase(+v)} options={[['2010', 'vs. 2010'], ['1993', 'vs. 1993']]} />}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              <div className="lg:col-span-3">
                {(() => {
                  const fills = {}; const titles = {}; const hatch = {};
                  thenNow.rows.forEach((r) => {
                    const num = r.num === '116' ? '105' : r.num;
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
            <SourceLine>NYPD CompStat's long-view columns (year to date versus the same stretch of {thenBase}), which NYPD computes per precinct. Citywide, the seven majors are {S.fmtPct(cityData?.total_seven_major?.historical?.[thenNow.key], 0)} versus {thenBase}.</SourceLine>
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
                if (peers.higher === n) return `In ${peers.year}, New York's murder rate was lower than in any of ${who}.`;
                if (peers.higher === 0) return `In ${peers.year}, New York's murder rate was higher than in all of ${who}.`;
                return `In ${peers.year}, New York's murder rate was lower than in ${nw(peers.higher)} of ${who}.`;
              })()}
              dek={`Murders per 100,000 residents, full year ${peers.year}. Murder is the most comparable crime across cities: definitions barely differ, and nearly every one is recorded.`}
              right={<Segmented label="Comparison group" size="sm" value={peerKey} onChange={setPeerKey} options={S.PEER_GROUPS.map((g) => [g.key, g.label])} />}
            />
            <div className="max-w-3xl"><PeerBars list={peers.list} /></div>
            <Receipt>
              {peers.list.map((c) => <p key={c.agency}>{c.isNYC ? 'New York' : `${c.agency}, ${c.state}`}: {S.fmtInt(c.murderFull)} murders ÷ {S.fmtInt(c.pop)} residents × 100,000 = {c.rate.toFixed(2)}</p>)}
              <p>We use the full calendar year because the index's year-to-date windows differ by city (some agencies report through January, others through April), which makes year-to-date counts incomparable.</p>
            </Receipt>
            <SourceLine>
              Source: <a className="underline" href="https://realtimecrimeindex.com/" target="_blank" rel="noopener noreferrer">Real-Time Crime Index</a> (AH Datalytics){rtci?.updated ? `, updated ${rtci.updated.split(' ')[0]}` : ''}{rtci?.snapshot ? ' (bundled copy; live feed unavailable)' : ''}. Rates use the index's population figures.
              {(() => {
                const nypd = crimeHistory.citywide.find((d) => d.y === peers.year)?.Murder;
                return nypd && nypd !== peers.nyc.murderFull ? ` The index counts New York's ${peers.year} murders as ${S.fmtInt(peers.nyc.murderFull)}; NYPD's annual figure is ${S.fmtInt(nypd)}.` : '';
              })()}
            </SourceLine>
          </section>
        )}

        {/* ============================ A DAY IN THE PRECINCT ============================ */}
        {raw && Object.keys(raw).some((k) => k.includes('Precinct')) && (
          <PrecinctDay
            initialKey={activeGeo.includes('Precinct') ? activeGeo : (conc?.top?.[0]?.label?.includes('+') ? S.SPLIT_PRECINCTS.parent : conc?.top?.[0]?.label) || '75th Precinct'}
            precincts={Object.keys(raw).filter((k) => k.includes('Precinct')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))}
          />
        )}

        {/* ============================ LEDGER ============================ */}
        <section id="ledger" className="pt-14 pb-12 border-b border-[#e6e6e6] scroll-mt-14">
          <SectionHead
            id="ledger"
            kicker="The ledger"
            title="Every CompStat line, with the chance test attached."
            dek={`${isCity ? 'Citywide' : activeGeo}, ${P.eyebrow.charAt(0).toLowerCase()}${P.eyebrow.slice(1)}. Download it and check our work.`}
            right={(
              <button
                type="button"
                onClick={() => {
                  const hc = S.historicalColumns(reportYear);
                  const header = ['Offense (NYPD)', 'Label', 'Current', 'Prior year', 'Change', '% change', 'z', 'Verdict', 'Fragile', `Net revisions, last ${revs?.weeks ?? 0} weeks`, 'Revision break-even', 'Weeks of revisions to erase', 'Per 100k (this area)', 'Per 100k (citywide)', ...hc.map((c) => `YTD % vs ${c.year} (NYPD)`)];
                  const data = rows.map((r) => {
                    const cw = cityRows.find((x) => x.name === r.name);
                    return [r.name, r.label, r.cur, r.prior, r.diff, r.pct == null ? '' : r.pct.toFixed(2), r.z == null ? '' : r.z.toFixed(3), r.verdict,
                      r.fragile ? 'yes' : '', r.rev ? r.rev.cur : '', r.risk ? r.risk.breakEven : '', r.risk ? (Number.isFinite(r.risk.weeksToErase) ? r.risk.weeksToErase.toFixed(1) : 'never at recent pace') : '',
                      pop && !isTourist ? ((r.cur / pop) * 100000).toFixed(2) : '', cw ? ((cw.cur / CITYWIDE_POPULATION) * 100000).toFixed(2) : '',
                      ...hc.map((c) => (Number.isFinite(r.hist?.[c.key]) ? r.hist[c.key].toFixed(2) : ''))];
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
                  <th className="py-2 px-2 text-right">{S.PERIODS[period].short}</th>
                  <th className="py-2 px-2 text-right">Last year</th>
                  <th className="py-2 px-2 text-right">Change</th>
                  <th className="py-2 px-2 text-right">%</th>
                  <th className="py-2 px-2">Chance test</th>
                  {revs && <th className="py-2 px-2 text-right" title={`Net revisions NYPD made in the past ${revs.weeks} weeks to already-reported weeks of this line`}>Revised, {revs.weeks} wks</th>}
                  {revs && <th className="py-2 px-2 text-right" title="Revisions it would take to turn a real change into noise, and how many weeks that is at the recent pace ('opposite' = recent revisions run the other way)">Cushion</th>}
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
                      <td className="py-2 px-2 text-right text-[14px]">{S.fmtPct(r.pct)}</td>
                      <td className="py-2 px-2"><span className="inline-flex items-center gap-2"><Chip verdict={r.verdict} small />{r.fragile && <FragileTag weeks={fragileWeeks} />}<span className="text-[12px] text-[#707175] whitespace-nowrap">{r.z != null ? `z ${r.z < 0 ? '−' : ''}${Math.abs(r.z).toFixed(1)}` : ''}</span></span></td>
                      {revs && <td className="py-2 px-2 text-right text-[13px] text-[#555]">{r.rev ? S.fmtSigned(r.rev.cur) : '—'}</td>}
                      {revs && <td className="py-2 px-2 text-right text-[13px] text-[#555] whitespace-nowrap">{r.risk ? `${S.fmtInt(r.risk.breakEven)} · ${Number.isFinite(r.risk.weeksToErase) ? `${r.risk.weeksToErase < 10 ? r.risk.weeksToErase.toFixed(1) : Math.round(r.risk.weeksToErase)} wks` : 'opposite'}` : '—'}</td>}
                      {pop && !isTourist && <td className="py-2 px-2 text-right text-[13px]">{((r.cur / pop) * 100000).toFixed(1)}</td>}
                      {!isCity && <td className="py-2 px-2 text-right text-[13px] text-[#555]">{cw ? ((cw.cur / CITYWIDE_POPULATION) * 100000).toFixed(1) : '—'}</td>}
                      {period === 'ytd' && histCols.map((c) => <td key={c.key} className="py-2 px-2 text-right text-[13px] text-[#555]">{S.fmtPct(r.hist?.[c.key], 0)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SourceLine>
            Counts are from NYPD's CompStat report for the week ending {S.apDate(weekEnd)}. "Per 100k" divides this period's count by 2020 Census population; it is not an annual rate. "vs." columns are NYPD's own year-to-date comparisons with the same stretch of each base year. The transit and public-housing lines count major felonies on the subway system and in public housing; they are also included in the seven-major totals.
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
              <p>z = (the gap between this year and last, minus 1) ÷ √(this year + last year). Beyond ±1.96 we call a change real; inside it, noise. The minus 1 keeps small counts honest: 4 murders against 0 last year is noise, not a trend. It's a standard screen for comparing two counts, but crime is lumpier than the model assumes, so it still leans toward calling things real. Near the line, treat the verdict as a prompt, not a conclusion.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Pace is a range, not a forecast</h3>
              <p>Full-year pace is shown two ways: the share of the calendar that has passed, and the share of last year's total NYPD had logged by the same date. A superlative ("fewest since…") appears only if it holds at the less flattering end of that range. Before a quarter of the year has passed, we don't project.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">NYPD's base years</h3>
              <p>CompStat's long-view columns compare this year with the same stretch of 1993 and 2010 (the percentages back-calculate to those years' totals), plus two years ago. The feed this page reads names them "14-year" and "31-year" changes, which matched the calendar in 2024. We label them by year.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Rape</h3>
              <p>New York broadened the legal definition of rape on Sept. 1, 2024. Comparisons that reach back before that date are skewed upward, so we flag them and keep rape out of the long-arc projection. NYPD's separate federal-definition line ("UCR Rape*"), whose definition didn't change, is in the ledger.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">Revisions</h3>
              <p>NYPD's weekly numbers are first counts. Victims die and assaults become murders; cases get upgraded, downgraded or filed late. <a className="underline" href={VC_REVISIONS_URL} target="_blank" rel="noopener noreferrer">A Vital City analysis by John Hall</a>, a retired NYPD deputy inspector, found every one of 95 monthly reports from 2018 to 2025 was later revised upward, by about 2.7% on average and 13.5% for murder. Last year's comparison figures have mostly settled, so revisions tilt CompStat's comparisons toward decline. We measure the recent pace from consecutive archived reports (this week's year-to-date total, minus last week's, minus this week's own count) and mark a real change fragile if {nw(S.REVISION_WEEKS)} more weeks of revisions at that pace could erase it (fewer for 28-day and weekly counts, which can only absorb a few weeks' worth). Fragile changes never headline, and the full-year pace range is widened by the same allowance.</p>
            </div>
            <div>
              <h3 className="font-black text-[15px] uppercase tracking-[0.1em] mb-1.5">What CompStat can't see</h3>
              <p>These are crimes reported to and recorded by police. They miss what never gets reported, and they move when reporting, classification or enforcement changes. CompStat figures are preliminary and NYPD revises them. Per-resident rates use 2020 Census counts, which ignore commuters and visitors, and are withheld where that distortion is severe.</p>
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
