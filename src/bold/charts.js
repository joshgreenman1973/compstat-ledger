import React, { useMemo, useState } from 'react';
import { geoPath, geoMercator } from 'd3-geo';
import precinctGeoJSON from '../data/nyc_precincts.json';
import { C, VERDICT, useWidth, Chip, FragileTag, Reveal } from './ui';
import { fmtInt, fmtPct, zBin, binFor, spell } from './stats';

const Z_CRIT_BAND = 1.96;
const niceMax = (v) => [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100].find((s) => s >= v) || 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ */
/* SIGNAL BOARD — % change per offense, against the band chance alone  */
/* could produce. Dots outside the gray band are beyond chance.        */
/* ------------------------------------------------------------------ */
// Nice round axis limits for counts.
const niceCount = (v) => [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find((s) => s >= v) || Math.ceil(v / 50000) * 50000;
// mode 'pct': each line's percent change against the band chance alone could produce. mode 'count': the
// same, in number of crimes, on one shared axis, so a line a hundred times as common as another shows
// as a change a hundred times as large.
export function SignalBoard({ rows, fragileWeeks = 8, mode = 'pct' }) {
  const isCount = mode === 'count';
  const bandOf = (r) => (isCount ? Z_CRIT_BAND * Math.sqrt((r.phi || 1) * (r.cur + r.prior)) + 1 : r.band);
  const valOf = (r) => (isCount ? r.diff : r.pct);
  const sorted = useMemo(() => [...rows].sort((a, b) => ((isCount ? b.diff : b.pct) ?? -Infinity) - ((isCount ? a.diff : a.pct) ?? -Infinity)), [rows, isCount]);
  const D = useMemo(() => {
    if (isCount) return niceCount(Math.max(10, ...rows.map((r) => Math.max(Math.abs(r.diff), bandOf(r) || 0))) * 1.04);
    const m = Math.max(5, ...rows.filter((r) => r.pct != null).map((r) => Math.max(Math.abs(r.pct), r.band || 0)));
    return niceMax(Math.min(100, m * 1.04));
  }, [rows, isCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (v) => 50 + (clamp(v, -D, D) / D) * 50;
  const ticks = [-D, -D / 2, 0, D / 2, D];
  const fmtTick = (t) => (t === 0 ? '0' : isCount ? `${t > 0 ? '+' : '−'}${fmtInt(Math.abs(t))}` : fmtPct(t, 0));

  return (
    <div className="w-full">
      {/* axis */}
      <div className="hidden sm:flex items-end gap-4 pb-2 border-b border-[#e6e6e6]">
        <div className="w-[34%] text-[11px] font-bold uppercase tracking-widest text-[#707175]">Offense</div>
        <div className="flex-1 relative h-5">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 text-[11px] text-[#707175]" style={{ left: `${pos(t)}%`, fontVariantNumeric: 'tabular-nums' }}>
              {fmtTick(t)}
            </span>
          ))}
        </div>
        <div className="w-[140px] text-right text-[11px] font-bold uppercase tracking-widest text-[#707175]">{isCount ? 'Crimes' : 'Change'}</div>
      </div>
      <Reveal as="ul">
        {sorted.map((r, i) => {
          const v = VERDICT[r.verdict] || VERDICT.none;
          const val = valOf(r);
          const hasPct = val != null;
          const clipped = hasPct && Math.abs(val) > D;
          const band = bandOf(r);
          const bandLo = band != null ? pos(-band) : null;
          const bandHi = band != null ? pos(band) : null;
          const solid = r.verdict === 'drop' || r.verdict === 'rise';
          const tip = `${r.label}: ${fmtInt(r.cur)} vs. ${fmtInt(r.prior)}, ${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${fmtInt(Math.abs(r.diff))} (${fmtPct(r.pct)}).${r.z != null ? ` Chance test z = ${r.z.toFixed(2)}.` : ''}${band != null ? ` Changes within ±${isCount ? fmtInt(band) : `${band.toFixed(1)}%`} could be chance.` : ''}`;
          return (
            <li key={r.name} title={tip} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 py-2.5 border-b border-[#f0f0f0] vc-rise" style={{ '--d': `${i * 35}ms` }}>
              <div className="flex-1 min-w-0 sm:flex-none sm:w-[34%]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px] text-[#050507] leading-tight">{r.label}</span>
                  <Chip verdict={r.verdict} small />
                  {r.fragile && <FragileTag weeks={fragileWeeks} />}
                </div>
              </div>
              <div className="order-last sm:order-none w-full sm:w-auto sm:flex-1 relative h-6" aria-hidden="true">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-[#ececec]" />
                {bandLo != null && (
                  <div className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm bg-[#e4e4e8] vc-ease-left" style={{ left: `${bandLo}%`, width: `${Math.max(0.5, bandHi - bandLo)}%` }} />
                )}
                <div className="absolute top-0 bottom-0 w-px bg-[#9a9a9a]" style={{ left: '50%' }} />
                {hasPct && (
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full vc-ease-left"
                    style={{
                      left: `${pos(val)}%`, width: 14, height: 14,
                      background: solid ? v.color : C.white,
                      border: solid ? `2px solid ${C.white}` : `2.5px solid ${v.color}`,
                      boxShadow: solid ? `0 0 0 1px ${v.color}` : 'none',
                    }}
                  />
                )}
                {clipped && (
                  <span className="absolute top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#050507]" style={{ [val > 0 ? 'right' : 'left']: -2 }}>{val > 0 ? '›' : '‹'}</span>
                )}
              </div>
              <div className="w-[124px] sm:w-[140px] shrink-0 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <div className="font-black text-[16px] text-[#050507] leading-tight">{isCount ? `${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${fmtInt(Math.abs(r.diff))}` : r.pct != null ? fmtPct(r.pct) : 'n/a'}</div>
                <div className="text-[12px] text-[#555]">{isCount ? (r.pct != null ? fmtPct(r.pct) : 'n/a') : `${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${fmtInt(Math.abs(r.diff))}`}</div>
                <div className="text-[12px] text-[#707175]">{fmtInt(r.cur)} vs. {fmtInt(r.prior)}</div>
              </div>
            </li>
          );
        })}
      </Reveal>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#444]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: VERDICT.drop.color }} />Drop beyond chance</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: VERDICT.rise.color }} />Rise beyond chance</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-3.5 rounded-full border-[2.5px]" style={{ borderColor: VERDICT.noise.color }} />Within chance</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-3 rounded-sm bg-[#e4e4e8]" />Range chance alone could produce (95%)</span>
        {rows.some((r) => r.fragile) && <span className="flex items-center gap-1.5"><FragileTag weeks={fragileWeeks} />Beyond chance today; {spell(fragileWeeks)} more {fragileWeeks === 1 ? 'week' : 'weeks'} of NYPD revisions at the recent pace could erase it</span>}
        <span className="text-[#707175]">{isCount ? `Axis: ±${fmtInt(D)} crimes, shared by every line.` : `Axis capped at ±${D}%; ‹ › mark values beyond it.`}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* UNIT CHART — one square per incident. The gap to last year is drawn */
/* as outlined squares (fewer) or orange squares (more).               */
/* ------------------------------------------------------------------ */
export function UnitChart({ cur, prior, noun, priorLabel, curLabel = 'this period' }) {
  const total = Math.max(cur, prior);
  if (!(total > 0)) return <p className="text-[14px] text-[#707175]">No {noun} recorded in either period.</p>;
  if (total > 2500) return <p className="text-[14px] text-[#707175]">Too many to draw one by one ({fmtInt(total)}).</p>;
  const size = total <= 120 ? 14 : total <= 400 ? 10 : total <= 900 ? 8 : 6;
  const gap = size >= 10 ? 3 : 2;
  const kept = Math.min(cur, prior);
  const fewer = Math.max(0, prior - cur);
  const more = Math.max(0, cur - prior);
  const cells = [];
  for (let i = 0; i < total; i++) cells.push(i < kept ? 'k' : fewer ? 'f' : 'm');
  return (
    <div>
      <div className="flex flex-wrap" style={{ gap }} role="img" aria-label={`${fmtInt(cur)} ${noun} this period versus ${fmtInt(prior)} ${priorLabel}.`}>
        {cells.map((t, i) => (
          <span
            key={i}
            className="inline-block rounded-[2px]"
            style={{
              width: size, height: size,
              background: t === 'k' ? C.ink : t === 'm' ? VERDICT.rise.color : 'transparent',
              boxShadow: t === 'f' ? `inset 0 0 0 1.5px ${VERDICT.drop.color}` : 'none',
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[#444]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[2px] bg-[#050507]" />{more ? `${fmtInt(prior)} (the count ${priorLabel})` : `${fmtInt(cur)} ${curLabel}`}</span>
        {fewer > 0 && <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[2px]" style={{ boxShadow: `inset 0 0 0 1.5px ${VERDICT.drop.color}` }} />{fmtInt(fewer)} fewer than {priorLabel}</span>}
        {more > 0 && <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[2px]" style={{ background: VERDICT.rise.color }} />{fmtInt(more)} more {curLabel}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LONG ARC — NYPD annual totals since 1993, plus this year's pace as a */
/* range (not a point: two methods, neither a forecast).               */
/* ------------------------------------------------------------------ */
export function LongArc({ series, pace, events = [], noun }) {
  const [ref, w] = useWidth(760);
  const [hover, setHover] = useState(null);
  const h = w < 520 ? 260 : 320;
  const m = { l: 46, r: w < 520 ? 92 : 120, t: 26, b: 28 };
  const iw = w - m.l - m.r; const ih = h - m.t - m.b;
  const hasPace = pace && !pace.tooEarly && Number.isFinite(pace.low);
  const x0 = series[0].y; const x1 = hasPace ? pace.year : series[series.length - 1].y;
  const maxV = Math.max(...series.map((d) => d.val), hasPace ? pace.high : 0);
  const step = [1, 2, 5].map((k) => k * 10 ** Math.floor(Math.log10(maxV / 4 || 1))).find((s) => maxV / s <= 5) || 10 ** Math.ceil(Math.log10(maxV / 4 || 1));
  const yMax = Math.ceil((maxV * 1.04) / step) * step;
  const X = (y) => m.l + ((y - x0) / Math.max(1, x1 - x0)) * iw;
  const Y = (v) => m.t + ih - (v / yMax) * ih;
  const ticks = []; for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  const line = series.map((d, i) => `${i ? 'L' : 'M'}${X(d.y).toFixed(1)},${Y(d.val).toFixed(1)}`).join('');
  const area = `${line}L${X(series[series.length - 1].y).toFixed(1)},${Y(0)}L${X(x0).toFixed(1)},${Y(0)}Z`;
  const first = series[0]; const last = series[series.length - 1];
  const min = series.reduce((a, b) => (b.val < a.val ? b : a), series[0]);
  const showMin = min.y !== first.y && min.y !== last.y && Math.abs(X(min.y) - X(last.y)) > 60;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const yr = Math.round(x0 + ((px - m.l) / iw) * (x1 - x0));
    const d = series.find((s) => s.y === yr);
    setHover(d || null);
  };
  const xTicks = series.filter((d) => (d.y - x0) % (w < 520 ? 8 : 4) === 0).map((d) => d.y);
  return (
    <Reveal>
    <div ref={ref} className="relative w-full">
      <svg width={w} height={h} role="img" aria-label={`Annual ${noun}, ${x0}-${last.y}${hasPace ? `, with a ${pace.year} pace of ${fmtInt(pace.low)} to ${fmtInt(pace.high)}` : ''}.`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? '#bdbdbd' : '#ededed'} strokeWidth="1" />
            <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill={C.charcoal} style={{ fontVariantNumeric: 'tabular-nums' }}>{t.toLocaleString('en-US')}</text>
          </g>
        ))}
        {xTicks.map((y) => (
          <text key={y} x={X(y)} y={h - 8} textAnchor="middle" fontSize="11" fill={C.charcoal}>{y}</text>
        ))}
        {events.filter((e) => e.y >= x0 && e.y <= x1).map((e) => (
          <g key={e.y}>
            <line x1={X(e.y)} x2={X(e.y)} y1={m.t} y2={m.t + ih} stroke={C.charcoal} strokeWidth="1" strokeDasharray="1.5 3" />
            <text x={X(e.y) - 5} y={m.t + 4} fontSize="11" fill={C.charcoal} textAnchor="end" transform={`rotate(-90 ${X(e.y) - 5} ${m.t + 4})`}>{e.label}</text>
          </g>
        ))}
        <path d={area} fill={C.periwinkle} fillOpacity="0.14" />
        <path d={line} pathLength="400" className="vc-draw" fill="none" stroke={C.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* labels: first, lowest, last */}
        <circle cx={X(first.y)} cy={Y(first.val)} r="4.5" fill={C.ink} stroke={C.white} strokeWidth="2" />
        <text x={X(first.y) + 8} y={Y(first.val) + 4} fontSize="12" fontWeight="700" fill={C.ink}>{fmtInt(first.val)} in {first.y}</text>
        {showMin && (
          <g>
            <circle cx={X(min.y)} cy={Y(min.val)} r="4" fill={C.ink} stroke={C.white} strokeWidth="2" />
            <text x={X(min.y)} y={Y(min.val) + 18} fontSize="11" fill={C.ink} textAnchor="middle">Low: {fmtInt(min.val)} ({min.y})</text>
          </g>
        )}
        <circle cx={X(last.y)} cy={Y(last.val)} r="4.5" fill={C.ink} stroke={C.white} strokeWidth="2" />
        <text x={X(last.y) + (hasPace ? -8 : 8)} y={Y(last.val) - 10} fontSize="12" fontWeight="700" fill={C.ink} textAnchor={hasPace ? 'end' : 'start'}>{fmtInt(last.val)} in {last.y}</text>
        {hasPace && (
          <g>
            <line x1={X(last.y)} y1={Y(last.val)} x2={X(pace.year)} y2={Y((pace.low + pace.high) / 2)} stroke={C.orange} strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1={X(pace.year)} x2={X(pace.year)} y1={Y(pace.high)} y2={Y(pace.low)} stroke={C.orange} strokeWidth="4" strokeLinecap="round" className="vc-pop" style={{ '--d': '1000ms' }} />
            <circle cx={X(pace.year)} cy={Y(pace.high)} r="4" fill={C.orange} stroke={C.white} strokeWidth="2" />
            <circle cx={X(pace.year)} cy={Y(pace.low)} r="4" fill={C.orange} stroke={C.white} strokeWidth="2" />
            <text x={X(pace.year) + 10} y={Y((pace.low + pace.high) / 2) - 4} fontSize="12" fontWeight="700" fill={C.ink}>{pace.year} pace</text>
            <text x={X(pace.year) + 10} y={Y((pace.low + pace.high) / 2) + 11} fontSize="12" fill={C.ink} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtInt(pace.low)}-{fmtInt(pace.high)}</text>
          </g>
        )}
        {hover && (
          <g pointerEvents="none">
            <line x1={X(hover.y)} x2={X(hover.y)} y1={m.t} y2={m.t + ih} stroke="#bdbdbd" strokeWidth="1" />
            <circle cx={X(hover.y)} cy={Y(hover.val)} r="5" fill={C.ink} stroke={C.white} strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover && (
        <div className="absolute pointer-events-none bg-white border border-[#ddd] shadow-lg rounded px-3 py-2 text-[12px]" style={{ left: clamp(X(hover.y) + 10, 0, w - 140), top: 4 }}>
          <div className="font-bold text-[#050507]">{hover.y}</div>
          <div style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtInt(hover.val)} {noun}</div>
        </div>
      )}
    </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* PRECINCT MAP                                                        */
/* ------------------------------------------------------------------ */
export const RATE_RAMP = ['#fde5dd', '#fabcaa', '#f69577', '#fb693c', '#e03a30'];
export const SIGNAL_RAMP = { '-2': '#217ebe', '-1': '#90bfdf', 0: '#e8e8ea', 1: '#fabcaa', 2: '#e03a30' };
const ZERO_FILL = '#fbfaf8';

export function PrecinctMap({ units, mode, cuts, selectedNum, onSelect, measureNoun, priorLabel = 'at this point last year' }) {
  const [ref, w] = useWidth(640);
  const [hover, setHover] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const h = Math.round(w * 0.98);
  const { pathFn, features } = useMemo(() => {
    const projection = geoMercator().fitSize([w, h], precinctGeoJSON);
    return { pathFn: geoPath().projection(projection), features: precinctGeoJSON.features };
  }, [w, h]);
  const fillFor = (u) => {
    if (!u) return '#f4f4f4';
    if (mode === 'signal') {
      // Colored only if the change is beyond chance after the correction for testing every precinct,
      // and not fragile (u.real); otherwise shaded as within chance.
      if (u.z == null) return '#f4f4f4';
      return SIGNAL_RAMP[zBin(u.real ? u.z : 0)];
    }
    if (u.tourist || u.rate == null) return '#efefef';
    if (u.count === 0) return ZERO_FILL;
    const b = cuts.length === 4 ? binFor(u.rate, cuts) : 2;
    return b == null ? '#f4f4f4' : RATE_RAMP[b];
  };
  const hovered = hover != null ? units[hover] : null;
  const ordered = [...features].sort((a, b) => {
    const s = (f) => (f.properties.precinct === selectedNum ? 2 : f.properties.precinct === hover ? 1 : 0);
    return s(a) - s(b);
  });
  return (
    <div ref={ref} className="relative w-full" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMouse({ x: e.clientX - r.left, y: e.clientY - r.top }); }}>
      <svg width={w} height={h} role="img" aria-label={`Map of NYPD precincts shaded by ${mode === 'signal' ? 'whether the change in ' + measureNoun + ' is beyond chance' : measureNoun + ' per 100,000 residents'}.`}>
        <defs>
          <pattern id="vc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#707175" strokeOpacity="0.55" strokeWidth="1.2" />
          </pattern>
        </defs>
        {ordered.map((f) => {
          const num = f.properties.precinct;
          const u = units[num];
          const isSel = num === selectedNum; const isHov = num === hover;
          const d = pathFn(f);
          return (
            <g key={num}>
              <path
                d={d}
                className="vc-ease-fill"
                fill={fillFor(u)}
                stroke={isSel ? C.ink : isHov ? '#555' : C.white}
                strokeWidth={isSel ? 2.5 : isHov ? 1.5 : 0.6}
                style={{ cursor: u ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(num)}
                onMouseLeave={() => setHover(null)}
                onClick={() => u && onSelect(u.geoKey)}
              />
              {mode === 'rate' && u?.tourist && <path d={d} fill="url(#vc-hatch)" pointerEvents="none" />}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div className="absolute pointer-events-none z-20 bg-white border border-[#ddd] shadow-xl rounded p-3 text-[12px] w-[230px]" style={{ left: clamp(mouse.x + 14, 0, w - 236), top: clamp(mouse.y - 10, 0, h - 150) }}>
          <div className="font-black text-[13px] text-[#050507]">{hovered.label}</div>
          {hovered.hood && <div className="text-[#707175] mb-1.5">{hovered.hood}</div>}
          <div style={{ fontVariantNumeric: 'tabular-nums' }}>
            <div><strong>{fmtInt(hovered.count)}</strong> {measureNoun} <span className="text-[#707175]">vs. {fmtInt(hovered.prior)} {priorLabel}</span></div>
            <div className="mt-1 flex items-center gap-2"><span>{fmtPct(hovered.pct)}</span><Chip verdict={hovered.real || (hovered.verdict === 'none' ? 'none' : 'noise')} small /></div>
            {mode === 'signal' && !hovered.real && hovered.sig === false && (hovered.verdict === 'drop' || hovered.verdict === 'rise') && <div className="mt-1 text-[#707175] italic">Clears the test on its own, but not after correcting for testing every precinct</div>}
            {hovered.rate != null && !hovered.tourist && <div className="mt-1">{hovered.rate.toFixed(1)} per 100k residents</div>}
            {hovered.tourist && <div className="mt-1 text-[#707175] italic">Commuter and visitor hub; per-resident rate not meaningful</div>}
            {hovered.merged && <div className="mt-1 text-[#707175] italic">105th, 113th and 116th shown combined (see note)</div>}
            {hovered.fragile && hovered.sig && <div className="mt-1 text-[#707175] italic">Fragile: recent revisions could erase this change, so the map shades it as within chance</div>}
          </div>
          <div className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-[#ff7c53]">Click to open</div>
        </div>
      )}
    </div>
  );
}

export function MapLegend({ mode, cuts, periodNote }) {
  if (mode === 'signal') {
    const items = [['-2', 'Strong drop'], ['-1', 'Drop'], ['0', 'Within chance'], ['1', 'Rise'], ['2', 'Strong rise']];
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[#444]">
        {items.map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: SIGNAL_RAMP[k] }} />{l}</span>)}
        <span className="text-[#707175]">"Strong" = beyond 99.9% of chance variation.</span>
      </div>
    );
  }
  const labels = [];
  const fmt = (v) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? v.toFixed(0) : v.toFixed(1));
  for (let i = 0; cuts.length === 4 && i < 5; i++) {
    labels.push(i === 0 ? `Under ${fmt(cuts[0])}` : i === 4 ? `Over ${fmt(cuts[3])}` : `${fmt(cuts[i - 1])}-${fmt(cuts[i])}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[#444]">
      <span className="text-[#707175]">Per 100k residents{periodNote ? `, ${periodNote}` : ''}{cuts.length === 4 ? ' (fifths of precincts with any)' : ''}:</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm border border-[#e2e2e2]" style={{ background: ZERO_FILL }} />None</span>
      {cuts.length === 4 && labels.map((l, i) => <span key={l} className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: RATE_RAMP[i] }} />{l}</span>)}
      {cuts.length !== 4 && <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ background: RATE_RAMP[2] }} />Any recorded</span>}
      <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #efefef 0 2px, #9a9a9a 2px 3px)' }} />Commuter and visitor hubs (14th, 18th, 22nd)</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MINI MAP — small multiples, the then-and-now map, the hero locator.  */
/* Every shape carries a native tooltip; the lists beside each map     */
/* carry the same values for keyboard and screen-reader users.         */
/* ------------------------------------------------------------------ */
let miniId = 0;
export function MiniMap({ fills = {}, titles = {}, hatch = {}, selectedNum = null, onSelect, dark = false, label, minWidth = 120 }) {
  const [ref, w] = useWidth(300, minWidth);
  const h = Math.round(w * 0.98);
  const pathFn = useMemo(() => geoPath().projection(geoMercator().fitSize([w, h], precinctGeoJSON)), [w, h]);
  const [hatchId] = useState(() => `mm-hatch-${++miniId}`);
  const ordered = [...precinctGeoJSON.features].sort((a, b) => (a.properties.precinct === selectedNum) - (b.properties.precinct === selectedNum));
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={h} role="img" aria-label={label}>
        <defs>
          <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={dark ? '#ffffff' : '#707175'} strokeOpacity="0.45" strokeWidth="1" />
          </pattern>
        </defs>
        {ordered.map((f) => {
          const num = f.properties.precinct; const sel = num === selectedNum; const d = pathFn(f);
          return (
            <g key={num}>
              <path
                d={d}
                className="vc-ease-fill"
                fill={fills[num] || (dark ? '#232328' : '#f1f1f1')}
                stroke={sel ? (dark ? C.chartreuse : C.ink) : (dark ? '#050507' : C.white)}
                strokeWidth={sel ? 2 : 0.4}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onClick={() => onSelect && onSelect(num)}
              >
                {titles[num] && <title>{titles[num]}</title>}
              </path>
              {hatch[num] && <path d={d} fill={`url(#${hatchId})`} pointerEvents="none" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PEER CITIES                                                         */
/* ------------------------------------------------------------------ */
export function PeerBars({ list }) {
  const max = Math.max(...list.map((c) => c.rate), 1);
  return (
    <ul className="space-y-2.5">
      {list.map((c) => (
        <li key={`${c.agency}|${c.state}`} className="flex items-center gap-3">
          <span className={`w-[118px] sm:w-[150px] text-right text-[14px] leading-tight ${c.isNYC ? 'font-black text-[#050507]' : 'text-[#333]'}`}>{c.isNYC ? 'New York' : c.agency}</span>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-[18px] rounded-r-[4px]" style={{ width: `${(c.rate / max) * 100}%`, minWidth: 3, background: c.isNYC ? C.magenta : C.cerulean }} />
            <span className={`text-[13px] whitespace-nowrap ${c.isNYC ? 'font-black' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{c.rate.toFixed(1)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* PAIR BARS — a precinct's change and the city's, as two labeled     */
/* bars from one zero line, so the gap between them is the story.     */
/* ------------------------------------------------------------------ */
export function PairBars({ pct, cityPct, max = 60, placeLabel }) {
  const row = (label, v, col, strong, delay) => {
    const w = (Math.min(Math.abs(v), max) / max) * 50; // share of the track; each side is half
    const up = v >= 0;
    return (
      <div className="grid grid-cols-[52px_1fr_44px] items-center gap-2 h-[18px]">
        <span className={`text-[11px] text-right truncate ${strong ? 'font-bold text-[#050507]' : 'text-[#555]'}`}>{label}</span>
        <div className="relative h-full">
          <div className="absolute inset-y-0 left-1/2 w-px bg-[#bdbdc4]" aria-hidden="true" />
          <div className="absolute top-[3px] bottom-[3px] vc-grow-x" aria-hidden="true" style={{ [up ? 'left' : 'right']: '50%', width: `${Math.max(w, 0.6)}%`, background: col, borderRadius: up ? '0 4px 4px 0' : '4px 0 0 4px', transformOrigin: up ? 'left center' : 'right center', '--d': `${delay}ms` }} />
        </div>
        <span className={`text-[11px] text-right whitespace-nowrap ${strong ? 'font-bold text-[#050507]' : 'text-[#555]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Number.isFinite(v) ? fmtPct(v, 0) : 'n/a'}
        </span>
      </div>
    );
  };
  return (
    <div className="w-full max-w-[360px]" role="img" aria-label={`${placeLabel}: ${fmtPct(pct, 0)}; citywide: ${fmtPct(cityPct, 0)}`}>
      {row(placeLabel, pct, pct >= 0 ? VERDICT.rise.color : VERDICT.drop.color, true, 0)}
      {row('Citywide', cityPct, '#a3a3ad', false, 140)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SHARE BAR — a citywide change split into the precincts that moved  */
/* it most and everyone else.                                          */
/* ------------------------------------------------------------------ */
export function ShareBar({ net, lead, nameFor }) {
  const total = Math.abs(net);
  const leadSum = lead.reduce((s, m) => s + Math.abs(m.diff), 0);
  const denom = Math.max(total, leadSum); // if other precincts moved the other way, the leaders can exceed the net
  const col = net < 0 ? VERDICT.drop.color : VERDICT.rise.color;
  const rest = Math.max(0, total - leadSum);
  return (
    <div className="w-full">
      <div className="flex w-full h-3.5 gap-[2px] vc-grow-x" style={{ transformOrigin: 'left center' }} role="img" aria-label={`${lead.map((m) => `${nameFor(m.geo)} ${m.diff}`).join(', ')}; all other precincts ${net < 0 ? '−' : '+'}${rest}`}>
        {lead.map((m, i) => (
          <span key={m.geo} title={`${nameFor(m.geo)}: ${m.diff > 0 ? '+' : '−'}${fmtInt(Math.abs(m.diff))}`} className={i === 0 ? 'rounded-l-[4px]' : ''} style={{ width: `${(Math.abs(m.diff) / denom) * 100}%`, background: col, opacity: 1 - i * 0.12 }} />
        ))}
        {rest > 0 && <span title={`All other precincts, net: ${net < 0 ? '−' : '+'}${fmtInt(rest)}`} className="rounded-r-[4px]" style={{ width: `${(rest / denom) * 100}%`, background: '#e4e4e8' }} />}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[#555] leading-snug" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {lead.map((m, i) => (
          <span key={m.geo} className="whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: col, opacity: 1 - i * 0.12 }} />{nameFor(m.geo)} {m.diff > 0 ? '+' : '−'}{fmtInt(Math.abs(m.diff))}</span>
        ))}
        {rest > 0 && <span className="whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1 bg-[#e4e4e8]" />all others {net < 0 ? '−' : '+'}{fmtInt(rest)}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SPARK — a crime's full-year NYPD totals for the last dozen years,  */
/* with this year's pace range at the end.                            */
/* ------------------------------------------------------------------ */
export function Spark({ series, pace, years = 12, noun }) {
  const W = 150; const H = 40; const pad = 5;
  const s = series.slice(-years);
  const hasPace = pace && !pace.tooEarly && Number.isFinite(pace.low);
  const vals = [...s.map((d) => d.val), ...(hasPace ? [pace.low, pace.high] : [])];
  const lo = Math.min(...vals); const hi = Math.max(...vals);
  const n = s.length + (hasPace ? 1 : 0);
  const X = (i) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * pad);
  const line = s.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(d.val).toFixed(1)}`).join('');
  const last = s[s.length - 1];
  const tip = `${noun}: ${s.map((d) => `${d.y} ${fmtInt(d.val)}`).join(', ')}${hasPace ? `; ${pace.year} pace ${fmtInt(pace.low)}-${fmtInt(pace.high)}` : ''}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" role="img" aria-label={tip}>
      <title>{tip}</title>
      <path d={line} pathLength="400" className="vc-draw" fill="none" stroke={C.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(s.length - 1)} cy={Y(last.val)} r="4" fill={C.ink} stroke={C.white} strokeWidth="2" className="vc-pop" style={{ '--d': '900ms' }} />
      {hasPace && (
        <line x1={X(n - 1)} x2={X(n - 1)} y1={Y(pace.high)} y2={Math.max(Y(pace.low), Y(pace.high) + 3)} stroke={C.orange} strokeWidth="5" strokeLinecap="round" className="vc-pop" style={{ '--d': '1100ms' }} />
      )}
    </svg>
  );
}
