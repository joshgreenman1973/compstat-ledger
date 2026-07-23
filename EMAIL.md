# The weekly precinct brief

A reader picks a precinct on the site and gets one email a week: that precinct's 28-day trend,
the week's own numbers, the sharpest movements across New York City and a citywide year-to-date line.

Nothing here invents a number. The email reads the same file the website reads.

## How it moves

```
NYPD CompStat weekly PDF
  -> nypd-compstat-scraper (GitHub Actions, Mon-Wed)  ->  data/latest_compstat.json
       -> the website (fetches the JSON in the browser)
       -> scripts/send-weekly.js (GitHub Actions, Wed 8 AM ET)  ->  Buttondown  ->  inbox
```

| Piece | File | What it does |
| --- | --- | --- |
| Signup form | `src/App.js` (`SubscribeBlock`) | Precinct dropdown plus email, posts to the API route |
| API route | `api/subscribe.js` | Validates, then hands the address to Buttondown with a precinct tag |
| Geography list | `scripts/lib/geos.js` | The 77 precincts plus citywide, and the tag each one maps to |
| Data helpers | `scripts/lib/report.js` | Fetches the CompStat JSON, computes windows and movers |
| Email HTML | `scripts/lib/render-email.js` | Renders the brief, inline styles only |
| Send job | `scripts/send-weekly.js` | Groups subscribers by tag, sends one email per precinct |
| Schedule | `.github/workflows/weekly-email.yml` | Wednesday 8 AM ET, Thursday backup, manual trigger |

Subscriber addresses live in Buttondown and nowhere else. This repo stores no list, and the
send job reads the list fresh on every run.

## Editorial choices, and why

**The brief leads with 28 days, not the week.** A single precinct's week is a small number.
The 20th Precinct can log three burglaries one week and seven the next without anything having
changed. The 28-day window is the most stable figure the NYPD publishes at precinct level, so it
gets the headline; the week's own total is still shown, in a smaller box, because that is the
report's nominal subject.

**The "sharpest citywide movements" list ignores small bases.** A precinct-offense pair only
qualifies with at least 20 cases in the prior year. Without that floor the list fills up with
two-to-six jumps reported as "up 200%."

**The opening sentence follows the direction of the total.** If a precinct's 28-day total is up,
the sentence names the largest offense that is also up. A brief that says "up 3.6%" and then
explains a decline reads like a correction.

**Percent change is recomputed, not copied.** The scraped PDF carries a `pct_change` that is null
whenever the prior-year count was zero. The email says "up from none a year ago" in that case
rather than printing a hole.

**Counts are preliminary.** The NYPD revises CompStat figures. The footer of every email says so.

## Running it

```bash
npm run email:preview                                   # renders previews, sends nothing
node scripts/send-weekly.js --dry-run --geo "75th Precinct"
npm run email:check                                     # who is subscribed, by precinct
npm run email:send                                      # the real thing
```

Previews land in `scripts/preview/` (gitignored). Open them in a browser.

`--check` and `--send` need `BUTTONDOWN_API_KEY` in the environment. `--dry-run` needs nothing.

A re-run of `--send` will not send twice: before sending, the script asks Buttondown whether an
email already went out carrying this week's `week_end` in its metadata, and stops if one did.
`--force` overrides that.

## Setup, once

1. Create the Buttondown account and newsletter at <https://buttondown.com>.
2. Copy the API key from Settings, API.
3. Vercel project, Settings, Environment Variables: add `BUTTONDOWN_API_KEY`. Redeploy.
   Without it the form returns "Signups are not switched on yet."
4. GitHub repo, Settings, Secrets and variables, Actions: add `BUTTONDOWN_API_KEY`.
5. Run the workflow once by hand (Actions tab, "Weekly precinct brief", Run workflow) and read the log.

## What this costs

Buttondown is free up to 100 subscribers. Above that it is priced per subscriber.

Per-precinct sending needs Buttondown's tagging and segmentation feature, which is a **$9 a month
add-on**. Without it every subscriber gets the same email. Two ways to stay at zero:

- Send everyone the citywide brief. `renderEmail(report, 'citywide')` already produces it, and the
  send job would drop its per-tag loop.
- Keep the list in Buttondown but send through a service that bills per email rather than per
  segment. That means building the unsubscribe handling by hand, which Buttondown currently does.

The GitHub Actions minutes and the Vercel function are inside the free tiers of accounts that
already exist.

## Known gaps

- The per-tag filter payload in `sendOne()` follows Buttondown's documented email `filters` shape
  but has not been exercised against a live account yet. The first real run will confirm the field
  names, and the script fails loudly with the API's own error text if they are wrong.
- Readers change precinct by submitting the form again, which overwrites their tag. There is no
  self-serve precinct switcher inside the email beyond a link back to the form.
- Patrol boroughs are not offered as a subscription option, only precincts and citywide.
