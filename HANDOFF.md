# Handoff: CompStat, stress-tested

Written Sept. 26, 2026, at the end of the cloud Claude Code session that built this, for whoever picks it up next (you or a desktop Claude Code session). Everything described here is on this branch. The cloud container it was built in will be deleted.

## What this is

A private fork of the CompStat Ledger. It is a bolder default view of NYPD's weekly CompStat numbers, built on exactly the same data. It leads with a verdict computed from the data. It runs every year-over-year change through a chance test and accounts for NYPD's habit of revising numbers upward after release. It maps where crime concentrates and prints the arithmetic behind every generated sentence ("Show the math"). The original dashboard is untouched and still reachable at `?classic=1`.

It is **not** an official Vital City product and carries no Vital City branding.

## Where it lives

- **Repo:** `joshgreenman1973/compstat-ledger`
- **Branch:** `claude/compstat-bold-reimagining-vediu3`. All work is here; `main` has not been touched.
- **Commits, oldest first:**
  1. `3359645` Adds "CompStat, stress-tested," the bolder default view.
  2. `2fff18e` Accounts for NYPD revisions.
  3. `ee97361` Drops Vital City branding and adds maps and the press-reports layer.
  4. `2b8d633` Adds the coverage-vs-counts check and the collapsed "Dig deeper" precinct-day view.
  5. `89434ba` Adds `vercel.json`, which stops Vercel from building preview sites for this branch.
  6. The commit that adds this file, `CLAUDE.md` and `tools/verify/`.
- **No pull request exists.** Don't open one unless Josh asks. Merging would replace the live site's default view.

## Standing rules from Josh

- **No public website yet.** Pushing to GitHub is fine. Don't merge to `main`, deploy anywhere or remove the `vercel.json` block. Note that the repo is on GitHub, so anyone who can see it can read this branch's code; "private" here means no hosted site.
- **Don't replace the original.** This is a fork. The classic view stays reachable, and `src/App.js` changed only by adding exports.
- **Not a Vital City product.** No wordmark, logo or house branding. The footer says "An independent prototype, not an official Vital City product."
- **Accuracy is the point.** Every number and every generated sentence must follow from NYPD's published figures. Bold framing is fine; overclaiming is not. When in doubt, say less.
- **House style is AP with no Oxford comma**, including in UI copy.
- **Maps are good.** Josh asked for plenty of them.
- **Don't validate Josh by reflex.** He'd rather hear where he's wrong.

## Get it running on your computer

```bash
git clone https://github.com/joshgreenman1973/compstat-ledger   # or cd into an existing clone
cd compstat-ledger
git fetch origin claude/compstat-bold-reimagining-vediu3
git checkout claude/compstat-bold-reimagining-vediu3
npm install          # `npm ci` fails on a lockfile mismatch inherited from main
git checkout package-lock.json   # npm install rewrites it; don't commit that churn
npm start            # http://localhost:3000 ; classic view at ?classic=1
```

- **Unit tests** (43, all passing): `CI=true npx react-scripts test src/bold --watchAll=false`
- **Production build:** `CI=true npx react-scripts build`. With `CI=true`, any lint warning fails the build, as it will on Vercel. Unused imports are the usual culprit.
- **Independent number check:** `bash tools/verify/run.sh`. See "Verification" below.

## First things to do on the desktop

1. **Test the press layer live.** GDELT (the news index behind "Press reports" and "Coverage vs. the counts") was blocked from the cloud container, so both features have only been tested against a fake response (`tools/verify/gdelt-mock.json`, headlines marked [TEST]).
   - Open `http://localhost:3000/?press=1` and wait. Requests are spaced 5.5 seconds apart because of GDELT's rate limit, so the coverage check takes a minute or two to fill in.
   - Check that real stories load, that they're relevant and that headlines land on the right precincts.
   - Check that each coverage verdict is defensible.
   - Watch the browser console for GDELT's plain-text errors, like "Please limit requests" or "Queries containing OR must be surrounded by ()".
2. **Test "Dig deeper" live.** It calls NYC Open Data (data.cityofnewyork.us), which was only mocked in the cloud. Open a precinct page and expand "Dig deeper."
3. **Delete or lock the two old Vercel previews.** Vercel built them from the first two pushes, before `vercel.json` existed. They still show the Vital City wordmark:
   - `compstat-ledger-7aakoqm9k-josh-greenmans-projects.vercel.app`
   - `compstat-ledger-r36ccpk66-josh-greenmans-projects.vercel.app`

   Open each in a private window. A Vercel login page means they're already protected, which is Vercel's default for newer projects. Otherwise go to Vercel → compstat-ledger → Deployments → each one → ⋯ → Delete. Alternatively, go to Settings → Deployment Protection → Vercel Authentication. Claude can't do this: there's no Vercel access from these sessions. The Vercel connector in claude.ai only lists and reads deployments; it can't delete them.
4. **Optional: move the fork to a private repo.** Creating a repo failed from the cloud session with a GitHub permissions error (403). If Josh wants the code itself hidden, he has to create the private repo, and then the branch can be pushed there.

## How it's built

| Path | What it does |
|---|---|
| `src/index.js` | Renders `BoldApp` by default and the original `App` at `?classic`. |
| `src/App.js` | The original dashboard. The only changes are `export`s on constants the new view reuses: `GITHUB_USER`, `REPO_NAME`, `CITYWIDE_POPULATION`, `TOURIST_PRECINCTS`, `GEO_POPULATIONS`, `PRECINCT_NEIGHBORHOODS`, `RTCI_CSV_URL` and `toOrdinalPrecinct`. |
| `src/bold/stats.js` | All the statistics as pure functions, unit-tested. The page's claims come from here. |
| `src/bold/press.js` | The GDELT layer: query building, place matching, time windows, parsing, the rate-limited fetch queue and the coverage-vs-counts verdicts. |
| `src/bold/BoldApp.js` | The page: data loading, URL state and every section. |
| `src/bold/charts.js` | The signal board, unit chart, long-arc chart, precinct choropleth, small-multiple maps, legends and peer bars (d3-geo). |
| `src/bold/ui.js` | Palette and verdict colors plus shared bits: chips, the "Fragile" tag, "Show the math," section heads and segmented toggles. |
| `src/bold/bold.css` | Neutral fonts (Helvetica Neue/Arial and Georgia) and print rules. |
| `src/bold/snapshot-2026-09-20.json` | Citywide-only copy of the Sept. 20, 2026 report. It's the offline fallback and the test fixture. |
| `src/bold/*.test.js` | Unit tests. |
| `public/precinct-day/index.html` | A copy of `joshgreenman1973/nyc-precinct-day` at `12f1d59`, plus a `?pct=&date=` preselect near the end. Keep it in sync by hand. |
| `vercel.json` | Turns off Vercel builds for `claude/**` branches. |
| `tools/verify/` | The independent end-to-end number check. |

### Data sources

Everything is fetched in the browser; there's no server.

- **CompStat.** `latest_compstat.json` from `joshgreenman1973/nypd-compstat-scraper` (raw GitHub, `data/`). If that fails, the page falls back to the bundled citywide snapshot and says so.
- **Revision archive.** The same repo's `data/index.json` plus the eight archived weekly reports before the current one, about 80 KB each gzipped.
- **Other cities.** Real-Time Crime Index (AH Datalytics) scorecard CSV. If it's unreachable, the page uses a bundled 2025 snapshot and says so.
- **Press.** GDELT DOC 2.0 API. It allows browser requests, covers roughly the last three months and allows one request every 5 seconds.
- **Dig deeper.** NYC Open Data's NYPD calls-for-service dataset, `n2zq-pubd`.

### Page sections, top to bottom

Each section has an anchor you can link to.

- **Verdict hero.** A headline generated from the data. Precinct pages add a locator map and a "Dig deeper" link.
- **Sticky nav.** Includes the "Press reports" on/off toggle.
- **`#signal`** Every change on the chance-test board.
- **`#every-one`** Murders as individual units, this year against last. With press on, it adds a panel of matching stories.
- **`#arc`** Each major felony's annual history since 1993, citywide only, with this year's pace drawn as a range.
- **`#where`** Choropleth by residents or by chance-test verdict. With press on, it adds story pins and two lists: "Covered, but not rising" and "Rising, but no placed stories."
- **`#by-crime`** Eight small-multiple maps.
- **`#then-now`** Each precinct against 2010 or 1993. Year to date only.
- **`#cities`** NYC's murder rate against peer cities.
- **`#coverage`** Coverage vs. the counts. Appears only with press on.
- **`#dig`** Dig deeper, collapsed by default.
- **`#ledger`** Every line with revision and cushion columns, downloadable as CSV.
- **`#method`** The method notes.

### URL parameters

All state lives in the URL, so any view can be shared by link.

| Parameter | Values (default first) |
|---|---|
| `geo` | `citywide`, or a precinct such as `75th Precinct` |
| `period` | `ytd`, `d28` or `wtd` |
| `arc` | a crime; `Murder` is the default |
| `measure` | `shootvic` or other map measures |
| `map` | `rate` or `signal` |
| `rows` | `all` or `major` |
| `peers` | `largest` or other peer groups |
| `press` | `1` turns the press layer on |
| `base` | `2010` or `1993` |

## The statistical rules

Don't loosen these without a reason you can defend in print.

- **Chance test.** A continuity-corrected Poisson test on this year's count (c) against last year's (p): z = sign(c−p) · max(0, |c−p| − 1) / √(c+p). A change is "real" when |z| ≥ 1.96.
  - This was checked against the exact binomial test for all counts from 0 to 150, and it never calls a change real that the exact test wouldn't.
  - The plain, uncorrected z over-called small counts, such as 4 against 0.
  - The noise band shown is ±(1.96√n + 1)/p × 100 percent.
- **Revisions.** Josh flagged this using John Hall's Vital City analysis: every monthly report from 2018 to 2025 was later revised upward, by 13.5% on average for murder.
  - **Measuring the pace.** Revision flow = this week's year-to-date total − last week's year-to-date total − this week's own count. It is summed over the last 8 consecutive archived reports.
  - **The cushion.** `breakEven` is the smallest adverse change that turns a real change into noise.
  - **Fragile changes.** A real change is "fragile" if revisions at the recent pace would erase it in fewer than 8 weeks. The limit is 4 weeks for 28-day counts and 1 week for weekly counts.
  - **What fragile means on the page.** Fragile changes never headline and are shaded as noise on maps. If every real change is fragile, the headline says no major crime moved by enough to outlast both chance and NYPD's revisions.
- **Full-year pace.** Shown as a range between two estimates:
  - Linear: year to date ÷ the share of the year elapsed.
  - Seasonal: year to date ÷ the share of last year's total that had come in by the same date.

  The range is widened by 8 weeks of revision allowance. There's no projection before a quarter of the year has passed, and a superlative like "record low" must hold at the conservative end of the range.
- **Long-view columns.** NYPD's historical columns compare with fixed base years, not rolling ones: `2_yr` is two years before the report year, `14_yr_pct` is 2010 and `31_yr_pct` is 1993.
- **Rape.** NYPD broadened the definition Sept. 1, 2024. Comparisons across that date are flagged "Not comparable" (`rapeYoYComparable`).
- **Precinct quirks.**
  - The 116th Precinct was carved out of the 105th, so the two are merged for per-resident rates and maps.
  - The tourist precincts (the 14th, 18th and 22nd) are left out of per-resident rates.
  - The Then and now section leaves out precincts whose boundaries were redrawn.
- **Peer cities.** RTCI rows are matched by both agency and state. Comparisons use the previous full year, because each city's year-to-date window ends on a different date.
- **Concentration ties** go to the more populous precinct, which makes the claim more conservative.
- **Coverage vs. the counts.** Compares the last four weeks of GDELT story volume with the four weeks before, as a share of all coverage, family by family (murder, shootings, subway attacks and so on). It sets that against NYPD's 28-day counts for the same weeks.
  - A 25% swing in coverage counts as a move.
  - It needs at least 5 stories in the earlier window and 15 overall.
  - The labels are "More coverage, not more crime," "Less coverage, not less crime," "More crime, not more coverage," "Same direction" and "No clear mismatch."
  - Press matches are keyword hits. They are never counted in any figure.
- **Place matching for stories.** Neighborhood names shared by two precincts, or common elsewhere, are dropped. Examples: Jamaica, Chelsea, Riverdale, Astoria, Elmhurst, Richmond Hill, Bayside and St. George. An explicit "75th Precinct" in a headline wins over a neighborhood name.

## Verified numbers (Sept. 20, 2026 report)

`tools/verify/run.sh` re-derives these in Python, independently of the JavaScript, and confirms the page prints them. As of this handoff, 194 of 194 checks pass. If you change the stats code, rerun it. Any difference should be one you intended.

- **Headline:** "Murder is down 24%. Felony assault isn't falling."
- **Signal board:** 11 of 18 citywide year-to-date changes are bigger than chance. Misdemeanor assault is real but fragile.
- **Murder pace:** 234 to 273 for the full year, which would be the fewest in NYPD records going back to 1993, even at the high end.
- **Concentration:** Half of shooting victims were shot in 13 of 78 precincts, home to 19% of New Yorkers.
- **Other cities:** NYC's 2025 murder rate was lower than in seven of the eight other largest U.S. cities.
- **Then and now:** 43 of 73 precincts are above 2010 levels, and 72 of 72 comparable precincts are below 1993, by 46% to 89%.
- **Crime by crime:** 84 real drops and 25 real rises across the small multiples, after fragility.

## Verification harness (`tools/verify/`)

The harness pins everything to the Sept. 20 report.

1. `run.sh` clones the scraper repo at commit `c0165dc` and fetches the RTCI CSV.
2. It builds the app and serves it on port 5055.
3. `shot.js` renders the citywide page, the 75th Precinct page and the weekly view in headless Chromium. All outside requests are answered from local files, and GDELT is answered with the [TEST] mock. It dumps each page's visible text and fails on any console error.
4. `check.py` recomputes every headline number, every ledger line, the fragile set, the pace range, the concentration claim and the peer rates, then checks each against the page text.

To set it up once: `cd tools/verify && npm i --no-save playwright && npx playwright install chromium`.

## Known limitations and loose ends

- **GDELT's three-month window.** Press can't cover the full year to date. The page says when the window is clipped.
- **Coverage measures volume, not tone.** Keyword matching also catches some stories that aren't about NYC. The ambiguous-name list helps but won't catch everything.
- **The precinct-day copy drifts.** If `nyc-precinct-day` changes, copy it over again and keep the preselect snippet near the end.
- **The revision allowance uses recent flow.** Revisions early in the year, or after a batch correction, may run faster or slower than the last 8 weeks suggest.
- **Rape in the Then and now totals.** Year-over-year rape comparisons are flagged only when the prior-year window starts before Sept. 1, 2024, so 2026 against 2025 is clean. But Then and now compares the seven-major total, which counts rape under the broader 2024 definition, with 2010 and 1993. Rape is a small share of that total, so the effect is slight but upward. Consider saying so in that section.
- **`check.py` is pinned to Sept. 20.** It hard-codes day 263 and that week's specific claims. Pointing it at a new week means updating those constants.
