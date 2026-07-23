/**
 * Renders the weekly precinct brief as email-safe HTML.
 *
 * Constraints that shape the markup: tables for layout, inline styles only, no web fonts,
 * no background images, max 600px. Gmail strips <style> blocks in some clients and Outlook
 * ignores most modern CSS, so nothing here depends on flexbox, grid or media queries.
 */

const {
  totals,
  offenseRow,
  biggestMover,
  citywideMovers,
  precinctUrl,
  fullName,
  SITE_URL,
} = require('./report');

const META = require('../../src/data/precinct_meta.json');

const C = {
  ink: '#050507',
  paper: '#ffffff',
  wash: '#f5f5f4',
  rule: '#e5e5e3',
  gray: '#6b6b70',
  orange: '#d94f22', // darkened from the site's #ff7c53 for contrast on white in email clients
  green: '#3d7f33',
};

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Number(v || 0).toLocaleString('en-US');

/** "up 12.3%" / "down 4.0%" / "flat" / "no prior-year cases" — never a bare null. */
const movement = (pct, diff) => {
  if (pct === null) return diff > 0 ? 'up from none a year ago' : 'unchanged';
  if (Math.abs(pct) < 0.5) return 'flat';
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}%`;
};

const arrow = (pct, diff) => {
  const rising = pct === null ? diff > 0 : pct > 0.5;
  const falling = pct === null ? diff < 0 : pct < -0.5;
  if (rising) return { glyph: '&#9650;', color: C.orange };
  if (falling) return { glyph: '&#9660;', color: C.green };
  return { glyph: '&#8226;', color: C.gray };
};

const label = (text, color = C.gray) =>
  `<div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${color};">${esc(text)}</div>`;

/** Offense table for one window, with a proportional bar so volume reads at a glance. */
function offenseTable(rows) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.current, r.prior)));
  const body = rows
    .map((r) => {
      const a = arrow(r.pct, r.diff);
      const barW = Math.round((r.current / max) * 100);
      const change = r.pct === null
        ? (r.diff === 0 ? '&mdash;' : `${r.diff > 0 ? '+' : ''}${n(r.diff)}`)
        : `${r.pct > 0 ? '+' : ''}${r.pct.toFixed(0)}%`;
      return `
        <tr>
          <td style="padding:9px 8px 9px 0;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:14px;color:${C.ink};">
            ${esc(r.name)}
            <div style="margin-top:5px;background:${C.wash};height:4px;width:100%;">
              <div style="background:${C.ink};height:4px;width:${barW}%;font-size:0;line-height:0;">&nbsp;</div>
            </div>
          </td>
          <td align="right" style="padding:9px 8px;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink};white-space:nowrap;">${n(r.current)}</td>
          <td align="right" style="padding:9px 8px;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:14px;color:${C.gray};white-space:nowrap;">${n(r.prior)}</td>
          <td align="right" style="padding:9px 0 9px 8px;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:14px;font-weight:700;color:${a.color};white-space:nowrap;">${a.glyph} ${change}</td>
        </tr>`;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <th align="left" style="padding:0 8px 6px 0;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.gray};border-bottom:2px solid ${C.ink};">Offense</th>
        <th align="right" style="padding:0 8px 6px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.gray};border-bottom:2px solid ${C.ink};">28 days</th>
        <th align="right" style="padding:0 8px 6px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.gray};border-bottom:2px solid ${C.ink};">Yr ago</th>
        <th align="right" style="padding:0 0 6px 8px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.gray};border-bottom:2px solid ${C.ink};">Change</th>
      </tr>
      ${body}
    </table>`;
}

function moversList(movers) {
  const line = (m, dir) => {
    const a = arrow(m.pct, m.diff);
    return `<tr><td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${C.ink};border-bottom:1px solid ${C.rule};">
      <span style="color:${a.color};font-weight:700;">${a.glyph} ${Math.abs(m.pct).toFixed(0)}%</span>
      &nbsp;${esc(m.name)} in the ${esc(m.geo)}
      <span style="color:${C.gray};">(${n(m.prior)} &rarr; ${n(m.current)})</span>
    </td></tr>`;
  };
  const rows = [...movers.up.slice(0, 2).map((m) => line(m, 'up')), ...movers.down.slice(0, 2).map((m) => line(m, 'down'))].join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`;
}

/**
 * @param {object} report  Parsed latest_compstat.json
 * @param {string} geo     Precinct key ("20th Precinct") or "citywide"
 */
function renderEmail(report, geo) {
  const geoData = report[geo];
  if (!geoData) throw new Error(`No CompStat data for "${geo}"`);

  const period = geoData.report_period || report.citywide.report_period || {};
  const weekLabel = period.week_start && period.week_end ? `${period.week_start} – ${period.week_end}` : period.week_end || '';

  const isCitywide = geo === 'citywide';
  const meta = META[geo] || {};
  const title = isCitywide ? 'Citywide' : geo;
  const subtitle = isCitywide ? 'All 77 precincts' : (meta.neighborhoods || '');

  const t28 = totals(geoData, 'twenty_eight_day');
  const tWeek = totals(geoData, 'week_to_date');
  const tYtd = totals(geoData, 'year_to_date');

  const mover = biggestMover(t28.rows, isCitywide ? 25 : 3, t28.total.diff);
  const movers = citywideMovers(report);

  const cityYtd = totals(report.citywide, 'year_to_date');
  const shootings = offenseRow(geoData, 'Shooting Vic.', 'twenty_eight_day');
  const murder = offenseRow(geoData, 'Murder', 'twenty_eight_day');

  const a28 = arrow(t28.total.pct, t28.total.diff);

  const moverSentence = mover
    ? `${fullName(mover.offense)} moved the most: ${n(mover.current)} cases over the last 28 days, ${n(Math.abs(mover.diff))} ${mover.diff > 0 ? 'more' : 'fewer'} than the same stretch last year.`
    : `No single offense moved by more than a couple of cases over the last 28 days.`;

  const subject = `${title}: major felonies ${movement(t28.total.pct, t28.total.diff)} over 28 days`;

  const html = `<!-- Weekly precinct brief - NYPD CompStat Ledger -->
<div style="margin:0;padding:0;background:${C.wash};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(title)}: ${esc(moverSentence)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-collapse:collapse;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${C.paper};border-collapse:collapse;">

        <tr><td style="background:${C.ink};padding:12px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.paper};">NYPD CompStat Ledger</td>
            <td align="right" style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9a9aa0;">Weekly brief</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:28px 24px 0;">
          ${label(weekLabel ? `Week of ${weekLabel}` : 'Latest report')}
          <h1 style="margin:8px 0 0;font-family:${SANS};font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-0.8px;color:${C.ink};">${esc(title)}</h1>
          ${subtitle ? `<div style="margin-top:6px;font-family:${SANS};font-size:14px;color:${C.gray};">${esc(subtitle)}</div>` : ''}
        </td></tr>

        <tr><td style="padding:22px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.wash};border-collapse:collapse;">
            <tr><td style="padding:18px 20px;">
              ${label('Major felonies, last 28 days')}
              <div style="margin-top:6px;font-family:${SANS};font-size:44px;line-height:1;font-weight:800;letter-spacing:-1.5px;color:${C.ink};">${n(t28.total.current)}</div>
              <div style="margin-top:8px;font-family:${SANS};font-size:14px;font-weight:700;color:${a28.color};">
                ${a28.glyph} ${esc(movement(t28.total.pct, t28.total.diff))} <span style="color:${C.gray};font-weight:400;">vs ${n(t28.total.prior)} a year ago</span>
              </div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 24px 0;">
          <p style="margin:0;font-family:${SERIF};font-size:16px;line-height:1.6;color:#26262a;">${esc(moverSentence)}</p>
        </td></tr>

        <tr><td style="padding:22px 24px 0;">
          ${label('The seven major felonies')}
          <div style="height:10px;"></div>
          ${offenseTable(t28.rows)}
        </td></tr>

        <tr><td style="padding:22px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td width="50%" valign="top" style="padding-right:8px;">
                <div style="border:1px solid ${C.rule};padding:14px 16px;">
                  ${label('This week alone')}
                  <div style="margin-top:6px;font-family:${SANS};font-size:24px;font-weight:800;color:${C.ink};letter-spacing:-0.5px;">${n(tWeek.total.current)}</div>
                  <div style="margin-top:4px;font-family:${SANS};font-size:13px;color:${C.gray};">vs ${n(tWeek.total.prior)} last year</div>
                </div>
              </td>
              <td width="50%" valign="top" style="padding-left:8px;">
                <div style="border:1px solid ${C.rule};padding:14px 16px;">
                  ${label('Year to date')}
                  <div style="margin-top:6px;font-family:${SANS};font-size:24px;font-weight:800;color:${C.ink};letter-spacing:-0.5px;">${n(tYtd.total.current)}</div>
                  <div style="margin-top:4px;font-family:${SANS};font-size:13px;color:${C.gray};">${esc(movement(tYtd.total.pct, tYtd.total.diff))} vs ${n(tYtd.total.prior)}</div>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:18px 24px 0;">
          <div style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.gray};">
            ${murder.current === 0 && shootings.current === 0
              ? `No murders and no shooting victims here over the same 28 days${murder.prior + shootings.prior > 0 ? `, against ${n(murder.prior)} and ${n(shootings.prior)} a year ago` : ''}.`
              : `Violence over the same 28 days: <strong style="color:${C.ink};">${n(murder.current)}</strong> murder${murder.current === 1 ? '' : 's'}
                 and <strong style="color:${C.ink};">${n(shootings.current)}</strong> shooting victim${shootings.current === 1 ? '' : 's'}, against ${n(murder.prior)} and ${n(shootings.prior)} a year ago.`}
          </div>
        </td></tr>

        <tr><td style="padding:26px 24px 0;">
          <div style="border-top:2px solid ${C.ink};padding-top:16px;">
            ${label('Sharpest citywide movements, 28 days')}
            <div style="height:8px;"></div>
            ${moversList(movers)}
            <div style="margin-top:10px;font-family:${SANS};font-size:11px;line-height:1.5;color:${C.gray};">
              Ranked among precinct-offense pairs with at least 20 cases in the prior year, so a jump from two to six does not top the list.
            </div>
          </div>
        </td></tr>

        <tr><td style="padding:22px 24px 0;">
          <div style="background:${C.wash};padding:16px 20px;">
            ${label('Citywide, year to date')}
            <p style="margin:8px 0 0;font-family:${SERIF};font-size:15px;line-height:1.6;color:#26262a;">
              ${n(cityYtd.total.current)} major felonies citywide, ${esc(movement(cityYtd.total.pct, cityYtd.total.diff))} from ${n(cityYtd.total.prior)}.
              Violent offenses are ${esc(movement(cityYtd.violent.pct, cityYtd.violent.diff))}; property offenses ${esc(movement(cityYtd.property.pct, cityYtd.property.diff))}.
            </p>
          </div>
        </td></tr>

        <tr><td align="center" style="padding:26px 24px 0;">
          <a href="${precinctUrl(geo)}" style="display:inline-block;background:${C.ink};color:${C.paper};font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;text-decoration:none;padding:14px 26px;">See the full ledger &rarr;</a>
        </td></tr>

        <tr><td style="padding:26px 24px 28px;">
          <div style="border-top:1px solid ${C.rule};padding-top:16px;font-family:${SANS};font-size:11px;line-height:1.7;color:${C.gray};">
            <p style="margin:0 0 8px;">
              Source: the NYPD's weekly CompStat report (${esc(weekLabel || 'latest release')}), parsed from the department's own PDF. Counts are preliminary and the NYPD revises them.
            </p>
            <p style="margin:0 0 8px;">
              A single precinct's week is a small number, and small numbers swing hard. This brief leads with the 28-day window for that reason, and ranks citywide movements only where the prior-year count was large enough to mean something.
            </p>
            <p style="margin:0 0 8px;">
              <a href="${SITE_URL}" style="color:${C.ink};">compstat-ledger.vercel.app</a> &nbsp;&middot;&nbsp;
              <a href="${SITE_URL}/#subscribe" style="color:${C.ink};">Change your precinct</a> &nbsp;&middot;&nbsp;
              <a href="{{ unsubscribe_url }}" style="color:${C.ink};">Unsubscribe</a>
            </p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>`;

  return { subject, html, geo };
}

module.exports = { renderEmail };
