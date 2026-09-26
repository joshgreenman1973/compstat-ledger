# Handoff: CompStat, read closely

Written Sept. 26, 2026, at the end of the cloud Claude Code session that built this, and updated the same day by the desktop session that tested it live (see "Desktop session, Sept. 26"). Everything described here is on this branch.

## What this is

A private fork of the CompStat Ledger. It is a bolder default view of NYPD's weekly CompStat numbers, built on exactly the same data. It leads with a verdict computed from the data. It runs every year-over-year change through a chance test and accounts for NYPD's habit of revising numbers upward after release. It maps where crime concentrates and prints the arithmetic behind every generated sentence ("Show the math"). The original dashboard is untouched and still reachable at `?classic=1`.

It is **not** an official Vital City product and carries no Vital City branding.

## Where it lives

- **Repo:** `joshgreenman1973/compstat-ledger`
- **Branch:** `claude/compstat-bold-reimagining-vediu3`. All work is here; `main` has not been touched.
- **Commits, oldest first:**
  1. `3359645` Adds the bolder default view (first called "CompStat, stress-tested"; renamed "CompStat, read closely" Sept. 26).
  2. `2fff18e` Accounts for NYPD revisions.
  3. `ee97361` Drops Vital City branding and adds maps and the press-reports layer.
  4. `2b8d633` Adds the coverage-vs-counts check and the collapsed "Dig deeper" precinct-day view.
  5. `89434ba` Adds `vercel.json`, which stops Vercel from building preview sites for this branch.
  6. `67ad5d9` Adds this file, `CLAUDE.md` and `tools/verify/`.
  7. The desktop session's commit: the rename, the rebuilt press layer, the removal of "Coverage vs. the counts" and the precinct-day ordinal fix.
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

- **Unit tests** (53, all passing): `CI=true npx react-scripts test src/bold --watchAll=false`
- **Production build:** `CI=true npx react-scripts build`. With `CI=true`, any lint warning fails the build, as it will on Vercel. Unused imports are the usual culprit.
- **Independent number check:** `bash tools/verify/run.sh`. See "Verification" below.

## Desktop session, Sept. 26

The cloud session's checklist, and what happened to each item:

1. **Press layer, tested live: it didn't hold up, so it was rebuilt.** The old query matched a crime word anywhere in a story's text plus a borough name anywhere. Of 75 citywide "murder" stories it returned, about 2 were New York City crimes. The rest were the Lindsay Clancy case in Massachusetts, movie lists, a book tour and "Brooklyn, Illinois." GDELT also returned stories up to a day past the requested end date, and its 429 rate-limit replies carry no CORS header, so the browser saw a bare "Failed to fetch" and never retried. See "Press placement" under the statistical rules for what replaced it.
2. **"Coverage vs. the counts" was removed.** GDELT indexes only a slice of local coverage: about 20 located city shooting or stabbing stories in two weeks, often five outlets on one incident. At 10 to 20 stories a month, the 25% swing rule turns on two or three stories, and one big incident can flip a verdict. The "Covered, but not rising" and "Rising, but no placed stories" lists on the map went for the same reason. The code is in git history (`2b8d633`) if a sturdier source turns up.
3. **"Dig deeper" works live.** The 75th Precinct on June 30 returned 453 dispatched jobs from NYC Open Data. The copy's precinct menu said "1th," "22th," "41th" and so on; fixed here. The original `nyc-precinct-day` has the same bug and was flagged separately.
4. **The two old Vercel previews are protected.** Both redirect to Vercel's login (checked Sept. 26), so they aren't public. Delete them only if you want them gone.
5. **Private repo:** not done; still Josh's call.
6. **Renamed** from "CompStat, stress-tested" to "CompStat, read closely" at Josh's request.

GDELT rate limits are harsher than documented. After a burst of requests it refused this connection for more than 15 minutes, answering every request with a 10-second stall and a 429, even at 15-second spacing. The page now spaces requests 6 seconds apart, retries twice (after 10 and 30 seconds), caches results in the browser tab for an hour and tells the reader to come back in 10 or 15 minutes if GDELT is refusing.

## How it's built

| Path | What it does |
|---|---|
| `src/index.js` | Renders `BoldApp` by default and the original `App` at `?classic`. |
| `src/App.js` | The original dashboard. The only changes are `export`s on constants the new view reuses: `GITHUB_USER`, `REPO_NAME`, `CITYWIDE_POPULATION`, `TOURIST_PRECINCTS`, `GEO_POPULATIONS`, `PRECINCT_NEIGHBORHOODS`, `RTCI_CSV_URL` and `toOrdinalPrecinct`. |
| `src/bold/stats.js` | All the statistics as pure functions, unit-tested. The page's claims come from here. |
| `src/bold/press.js` | The GDELT layer: the local-outlet query, headline filters, place matching, New York time windows, parsing, the rate-limited and cached fetch queue, and which stories each view gets. |
| `src/bold/press-places.json` | The headline gazetteer: 210 neighborhood names that lie at least 85% inside one precinct, and 74 that mark a story as local but can't place it. Generated; don't edit by hand. |
| `tools/places/build_places.py` | Builds that table from the city's 2020 Neighborhood Tabulation Areas (NYC Open Data `9nt8-h7nd`) and the precinct shapes in `src/data/nyc_precincts.json`. Needs shapely and pyproj. |
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
- **Press.** GDELT DOC 2.0 API. It allows browser requests (except on its 429 replies), covers roughly the last three months, asks for one request every 5 seconds and rejects queries longer than about 245 characters. Of New York City outlets, it indexes the Post, the Daily News, Gothamist, amNY, NBC New York, ABC7 New York and Fox 5 New York with some regularity. The Staten Island Advance, The City, PIX11, NY1 and The New York Times returned nothing for a month of NYPD stories.
- **Dig deeper.** NYC Open Data's NYPD calls-for-service dataset, `n2zq-pubd`.

### Page sections, top to bottom

Each section has an anchor you can link to.

- **Verdict hero.** A headline generated from the data. Precinct pages add a locator map and a "Dig deeper" link.
- **Sticky nav.** Includes the "Press reports" on/off toggle.
- **`#signal`** Every change on the chance-test board.
- **`#every-one`** Murders as individual units, this year against last. With press on, it adds a panel of stories for murders and one for shootings. Precinct pages show only stories placed in that precinct, and offer the borough's unplaceable stories behind a button; patrol-borough pages show the whole borough.
- **`#arc`** Each major felony's annual history since 1993, citywide only, with this year's pace drawn as a range.
- **`#where`** Choropleth by residents or by chance-test verdict. With press on, it adds a dot per precinct counting the stories whose headlines place them there, and lists those stories.
- **`#by-crime`** Eight small-multiple maps.
- **`#then-now`** Each precinct against 2010 or 1993. Year to date only.
- **`#cities`** NYC's murder rate against peer cities.
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
- **Press placement.** GDELT only gathers candidates; the headline decides.
  - The query asks for crime words and "NYPD" anywhere in the text, from the seven local outlets above. One citywide query per crime family serves every view, so moving between precincts costs no new searches.
  - A story is shown only if its headline uses a crime word for that family and names a place in the city (NYC, a borough, NYPD, the subway or a neighborhood), and names no place outside it (Long Island, Mount Vernon, New Jersey, any other state and so on). Letters and opinion URLs are dropped, as are stories seen outside the report period in New York time.
  - A place named as someone's home or office ("Queens man," "Brooklyn DA") or as a street, bridge or hospital ("Flatbush Avenue," "Coney Island Hospital") doesn't count as the scene.
  - A story is placed in a precinct only when its headline names that precinct, or a neighborhood lying at least 85% inside it by area, and nothing in the headline points elsewhere. That includes a second neighborhood that straddles precinct lines, as in "shootings in Coney Island, Crown Heights."
  - Names that straddle precinct lines (Crown Heights, Bed-Stuy, Harlem, Washington Heights, Williamsburg, the Upper West Side and others) give a borough, not a precinct. Flatbush, Long Island City and Fordham are held back too, because everyday use stretches past the official area.
  - Names that mean something else in a headline (Jamaica, Chelsea, Madison, Corona, Clifton, South Beach and others) are never used. The lists are in `tools/places/build_places.py`.
  - Checked against real GDELT results Sept. 26: every kept story was a New York City crime story with the right borough. The cost is recall. Only about 1 in 15 names a neighborhood that sits in one precinct, so pins are sparse.

## Verified numbers (Sept. 20, 2026 report)

`tools/verify/run.sh` re-derives these in Python, independently of the JavaScript, and confirms the page prints them. As of Sept. 26, 207 of 207 checks pass, including 13 on the press layer against the fake GDELT reply. If you change the stats code, rerun it. Any difference should be one you intended.

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
3. `shot.js` renders the citywide page, the 75th Precinct page and the weekly view in headless Chromium, plus the citywide and 75th Precinct pages with press on. All outside requests are answered from local files, and GDELT is answered with the [TEST] mock, which includes stories the filters must drop (Brooklyn, Illinois; a non-local outlet; an opinion URL; a story after the report week). It dumps each page's visible text and fails on any console error.
4. `check.py` recomputes every headline number, every ledger line, the fragile set, the pace range, the concentration claim and the peer rates, then checks each against the page text.

To set it up once: `cd tools/verify && npm i --no-save playwright && npx playwright install chromium`.

## Known limitations and loose ends

- **GDELT's three-month window.** Press can't cover the full year to date. The page says when the window is clipped. The press mock's dates also sit inside that window, so the press checks in `run.sh` will start failing after about mid-December 2026 unless the mock's dates move.
- **GDELT is a thin, fragile source.** It indexes a fraction of what local outlets publish, and it shuts out a connection for minutes after a burst. The press layer is a sample of leads, and the page says so. A sturdier option would be a scheduled job (like the CompStat scraper) that queries GDELT or outlet RSS feeds once a day and commits JSON for the page to read, which would also take GDELT out of the reader's browser.
- **Headline placement is area-based.** A neighborhood that is 85% inside one precinct by area can still have a story in the other 15%. Headlines also use neighborhood names loosely. The threshold and the held-back names are the guard; they aren't a guarantee.
- **The precinct-day copy drifts.** If `nyc-precinct-day` changes, copy it over again and keep the preselect snippet near the end.
- **The revision allowance uses recent flow.** Revisions early in the year, or after a batch correction, may run faster or slower than the last 8 weeks suggest.
- **Rape in the Then and now totals.** Year-over-year rape comparisons are flagged only when the prior-year window starts before Sept. 1, 2024, so 2026 against 2025 is clean. But Then and now compares the seven-major total, which counts rape under the broader 2024 definition, with 2010 and 1993. Rape is a small share of that total, so the effect is slight but upward. Consider saying so in that section.
- **`check.py` is pinned to Sept. 20.** It hard-codes day 263 and that week's specific claims. Pointing it at a new week means updating those constants.
