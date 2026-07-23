/**
 * The geographies a reader can subscribe to, and the Buttondown tag that stands for each one.
 *
 * Tags are lowercase and hyphenated because they end up in URLs and in Buttondown's UI.
 * Zero-padding keeps the tag list sorted the way a person expects: pct-005 before pct-020.
 *
 * This file is required by both the browser (api/subscribe.js validates against it) and Node,
 * so it stays plain CommonJS with no dependencies.
 */

const META = require('../../src/data/precinct_meta.json');

const PRECINCTS = Object.keys(META).filter((k) => /Precinct$/.test(k));

const SUBSCRIBABLE = new Set(['citywide', ...PRECINCTS]);

const geoToTag = (geo) => {
  if (geo === 'citywide') return 'pct-citywide';
  const m = /^(\d+)(st|nd|rd|th) Precinct$/.exec(geo);
  if (!m) return null;
  return `pct-${String(m[1]).padStart(3, '0')}`;
};

// Built once, so tagToGeo is a lookup rather than a scan.
const TAG_TO_GEO = new Map();
[...SUBSCRIBABLE].forEach((geo) => {
  const tag = geoToTag(geo);
  if (tag) TAG_TO_GEO.set(tag, geo);
});

const tagToGeo = (tag) => TAG_TO_GEO.get(String(tag || '').trim().toLowerCase()) || null;

/** [{ value, label }] for the signup dropdown, citywide first then precincts in numeric order. */
const options = () => [
  { value: 'citywide', label: 'Citywide' },
  ...PRECINCTS.map((geo) => ({
    value: geo,
    label: META[geo] && META[geo].neighborhoods ? `${geo} — ${META[geo].neighborhoods}` : geo,
    sort: parseInt(geo, 10),
  }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value, label }) => ({ value, label })),
];

module.exports = { PRECINCTS, SUBSCRIBABLE, geoToTag, tagToGeo, options };
