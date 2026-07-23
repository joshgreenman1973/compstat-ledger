/**
 * POST /api/subscribe  { email, geo }
 *
 * Adds a reader to the Buttondown list with a tag naming the precinct they picked. Buttondown
 * owns the confirmation email, the unsubscribe link and the compliance footer; this endpoint
 * only validates input and forwards it, so no subscriber data is ever stored in this repo.
 *
 * Needs BUTTONDOWN_API_KEY in the Vercel project's environment variables.
 */

const { SUBSCRIBABLE, geoToTag } = require('../scripts/lib/geos');

// Deliberately loose: real addresses fail strict regexes more often than fake ones pass this.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }

  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) {
    console.error('BUTTONDOWN_API_KEY is not set on this deployment');
    return res.status(503).json({ ok: false, error: 'Signups are not switched on yet. Try again later.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const geo = String(body.geo || 'citywide').trim();

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'That does not look like an email address.' });
  }
  if (!SUBSCRIBABLE.has(geo)) {
    return res.status(400).json({ ok: false, error: 'Pick a precinct from the list.' });
  }

  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  try {
    const resp = await fetch('https://api.buttondown.com/v1/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'application/json',
        // Someone re-subscribing is switching precincts, so replace their tags rather than stacking them.
        'X-Buttondown-Collision-Behavior': 'overwrite',
      },
      body: JSON.stringify({
        email_address: email,
        tags: [geoToTag(geo)],
        metadata: { precinct: geo },
        ...(forwarded ? { ip_address: forwarded } : {}),
      }),
    });

    const text = await resp.text();

    if (resp.ok) {
      return res.status(200).json({ ok: true, geo });
    }

    // 400 here is almost always "already subscribed" — a duplicate is not an error worth alarming over.
    if (resp.status === 400 && /exist|already|duplicate/i.test(text)) {
      return res.status(200).json({ ok: true, geo, existing: true });
    }

    console.error(`Buttondown subscribe failed: HTTP ${resp.status} ${text.slice(0, 300)}`);
    return res.status(502).json({ ok: false, error: 'The mailing list turned that down. Try again in a minute.' });
  } catch (e) {
    console.error(`Buttondown subscribe threw: ${e.message}`);
    return res.status(502).json({ ok: false, error: 'Could not reach the mailing list. Try again in a minute.' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
