import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { spell, fmtInt } from './stats';

// Palette tokens. Verdict colors are a blue/red diverging pair around a neutral
// gray (validated for protan/deutan separation); ▼ / ▲ / ~ glyphs and text labels carry the
// same meaning so color is never the only cue.
export const C = {
  ink: '#050507', white: '#ffffff', cloud: '#dddddd', chartreuse: '#dde44c', orange: '#ff7c53',
  periwinkle: '#9b9fbc', rose: '#cea9be', magenta: '#e7466d', charcoal: '#707175', indigo: '#394882',
  cerulean: '#217ebe', hair: '#e6e6e6', paper: '#f7f7f5',
};
export const VERDICT = {
  drop: { label: 'Beyond chance', title: 'A drop too big to put down to chance', glyph: '▼', color: '#217ebe', onDark: '#4e98cb', tint: '#d2e4f0' },
  rise: { label: 'Beyond chance', title: 'A rise too big to put down to chance', glyph: '▲', color: '#e03a30', onDark: '#fb693c', tint: '#fadad7' },
  noise: { label: 'Within chance', title: "Within the range of chance: the counts can't show whether the rate changed", glyph: '~', color: '#9b9fbc', onDark: '#9b9fbc', tint: '#ececf2' },
  flagged: { label: 'Not comparable', glyph: '!', color: '#707175', onDark: '#b5b6ba', tint: '#eeeeee' },
  none: { label: 'Zero both years', glyph: '·', color: '#bbbbbb', onDark: '#777777', tint: '#f2f2f2' },
};

export function useWidth(initial = 800, min = 260) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(min, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

export function Chip({ verdict, dark = false, small = false, title }) {
  const v = VERDICT[verdict] || VERDICT.none;
  const col = dark ? v.onDark : v.color;
  return (
    <span
      title={title || v.title || v.label}
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase whitespace-nowrap ${small ? 'text-[10px] px-1.5 py-[1px] tracking-wide' : 'text-[11px] px-2 py-0.5 tracking-wider'}`}
      style={{ borderColor: col, color: dark ? C.white : C.ink }}
    >
      <span aria-hidden="true" style={{ color: col }}>{v.glyph}</span>{v.label}
    </span>
  );
}

// A real change that the recent pace of NYPD revisions could erase.
export function FragileTag({ weeks, dark = false }) {
  return (
    <span
      title={`Beyond chance on today's counts, but ${spell(weeks)} more ${weeks === 1 ? 'week' : 'weeks'} of NYPD revisions at the recent pace could erase it.`}
      className={`inline-flex items-center rounded-full border border-dashed px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${dark ? 'border-white/60 text-white/80' : 'border-[#707175] text-[#444]'}`}
    >
      Fragile
    </span>
  );
}

// Every generated claim can show its inputs and arithmetic.
export function Receipt({ children, dark = false, label = 'Show the math' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] border-b-2 pb-0.5 transition-colors ${dark ? 'text-white border-[#dde44c] hover:text-[#dde44c]' : 'text-[#050507] border-[#dde44c] hover:border-[#050507]'}`}
      >
        <span aria-hidden="true" className="font-mono">{open ? '−' : '+'}</span>{open ? 'Hide the math' : label}
      </button>
      {open && (
        <div className={`mt-3 border-l-4 border-[#dde44c] pl-4 py-1 text-[13px] leading-relaxed space-y-1.5 ${dark ? 'text-gray-300' : 'text-[#333]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Kicker({ children, dark = false }) {
  return <div className={`text-[11px] font-bold uppercase tracking-[0.18em] mb-3 ${dark ? 'text-[#dde44c]' : 'text-[#ff7c53]'}`}>{children}</div>;
}

export function SectionHead({ id, kicker, title, dek, right }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((e) => {
    e.preventDefault();
    const url = window.location.origin + window.location.pathname + window.location.search + '#' + id;
    try { navigator.clipboard?.writeText(url).catch(() => {}); } catch { /* clipboard unavailable */ }
    try { window.history.replaceState({}, '', url); } catch { window.location.hash = id; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [id]);
  return (
    <Reveal className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div className="max-w-3xl vc-rise">
        <div className="flex items-center gap-3">
          <Kicker>{kicker}</Kicker>
          <a href={`#${id}`} onClick={copy} className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#707175] hover:text-[#050507]" title="Copy a link to this section">{copied ? 'Copied' : 'Link'}</a>
        </div>
        <h2 className="vc-display text-[28px] sm:text-[36px] md:text-[42px] leading-[1.05] font-black tracking-tight text-[#050507]">{title}</h2>
        {dek && <p className="vc-serif mt-3 text-[17px] md:text-[19px] leading-snug text-[#555]">{dek}</p>}
      </div>
      {right && <div className="flex-shrink-0 vc-rise" style={{ '--d': '150ms' }}>{right}</div>}
    </Reveal>
  );
}

export function Segmented({ options, value, onChange, dark = false, size = 'md', label }) {
  return (
    <div role="group" aria-label={label} className={`inline-flex rounded-full p-0.5 border ${dark ? 'border-white/25 bg-white/5' : 'border-[#d6d6d6] bg-white'}`}>
      {options.map(([val, text]) => {
        const on = value === val;
        return (
          <button
            key={val}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(val)}
            className={`rounded-full font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${size === 'sm' ? 'text-[10px] px-2.5 py-1' : 'text-[11px] px-3.5 py-1.5'} ${on
              ? (dark ? 'bg-[#dde44c] text-[#050507]' : 'bg-[#050507] text-white')
              : (dark ? 'text-white/70 hover:text-white' : 'text-[#555] hover:text-[#050507]')}`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function SourceLine({ children }) {
  return <p className="mt-5 text-[12px] leading-snug text-[#707175]">{children}</p>;
}

// A short label on a finding, with the full explanation in its tooltip.
const TAG_TONES = {
  accent: 'bg-[#dde44c] text-[#050507] border-[#dde44c]',
  ink: 'bg-[#050507] text-white border-[#050507]',
  soft: 'bg-[#f1f1f3] text-[#333] border-[#f1f1f3]',
  warn: 'bg-white text-[#050507] border-[#ff7c53]',
  line: 'bg-white text-[#555] border-[#cfcfd4]',
};
export function Tag({ children, tone = 'soft', title }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-[1px] text-[11px] font-bold whitespace-nowrap ${TAG_TONES[tone] || TAG_TONES.soft} ${title ? 'cursor-help' : ''}`}>
      {children}
    </span>
  );
}

/* ---------------------------- motion ----------------------------- */
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plays the vc-* animations inside an element once, when it scrolls into view. Adds the "before"
// state only when motion will actually play, so the page is fully visible without it.
export function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return undefined;
    el.classList.add('vc-pre');
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { el.classList.remove('vc-pre'); el.classList.add('vc-play'); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}
export const Reveal = React.forwardRef(function Reveal({ as: As = 'div', children, ...rest }, _ref) {
  const ref = useReveal();
  return <As ref={ref} {...rest}>{children}</As>;
});

// A number that counts up to its value once (skipped for reduced motion).
export function CountUp({ value, ms = 800, format = fmtInt }) {
  const [v, setV] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) { setV(value); return undefined; }
    let raf; const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span aria-label={format(value)}>{format(v)}</span>;
}
