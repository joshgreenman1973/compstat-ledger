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
  7. `237b9f4` The rename, a rebuilt press layer, the removal of "Coverage vs. the counts" and the precinct-day ordinal fix.
  8. `77f7ab3` Removes the press layer entirely, at Josh's call.
  9. Adds `tools/deploy-pages.sh`, which publishes the noindexed GitHub Pages copy.
  10. Sept. 27: the fixes from the blind review (see "Blind review, Sept. 27").
  11. Sept. 27: the notable-trends section.
- **No pull request exists.** Don't open one unless Josh asks. Merging would replace the live site's default view.

## Standing rules from Josh

- **One public copy, for Josh to try out.** On Sept. 26 Josh asked for it on GitHub Pages: https://joshgreenman1973.github.io/compstat-read-closely/ (repo `joshgreenman1973/compstat-read-closely`, build output only). It's public to anyone with the link but marked noindex and blocked in robots.txt. Redeploy with `bash tools/deploy-pages.sh`. Otherwise the old rule stands: don't merge to `main`, deploy anywhere else or remove the `vercel.json` block. compstat-ledger's own Pages site and Vercel deployment still serve the classic view from `main`.
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

- **Unit tests** (42, all passing): `CI=true npx react-scripts test src/bold --watchAll=false`
- **Production build:** `CI=true npx react-scripts build`. With `CI=true`, any lint warning fails the build, as it will on Vercel. Unused imports are the usual culprit.
- **Independent number check:** `bash tools/verify/run.sh`. See "Verification" below.
- **Publish the test copy:** `bash tools/deploy-pages.sh` builds with the right base path, adds noindex and pushes to `joshgreenman1973/compstat-read-closely`.

## Desktop session, Sept. 26

The cloud session's checklist, and what happened to each item:

1. **Press layer: tested live, rebuilt, then removed.** It drew on the GDELT news index. The original query matched a crime word anywhere in a story plus a borough name anywhere; of 75 citywide "murder" stories, about 2 were New York City crimes (the rest included the Lindsay Clancy case in Massachusetts, movie lists and "Brooklyn, Illinois"). A rebuild that searched only local outlets and placed stories by their headlines against the city's neighborhood boundaries got the locations right, but GDELT's sample of local coverage was thin (about 20 located city shooting or stabbing stories in two weeks), and GDELT shut this connection out for more than an hour after a burst of test requests. Josh dropped the layer. The rebuild is in `237b9f4` if it's ever wanted, including `tools/places/build_places.py`, which maps neighborhood names to precincts from city boundaries and could be reused.
2. **"Coverage vs. the counts" was removed** with it. At 10 to 20 located stories a month per crime, its 25% swing rule turned on two or three stories. The original is in `2b8d633`.
3. **"Dig deeper" works live, and is now "A day in the precinct"** (Josh's pick; it's one precinct's dispatched jobs on one day). The 75th Precinct on June 30 returned 453 dispatched jobs from NYC Open Data. The copy's precinct menu said "1th," "22th," "41th" and so on; fixed here. The original `nyc-precinct-day` has the same bug and was flagged separately.
4. **The two old Vercel previews are protected.** Both redirect to Vercel's login (checked Sept. 26), so they aren't public. Delete them only if you want them gone.
5. **Private repo:** not done; still Josh's call.
6. **Renamed** from "CompStat, stress-tested" to "CompStat, read closely" at Josh's request.

## Blind review, Sept. 27

Three independent reviewers read the page cold: one on the statistics, one on the numbers against primary sources and one on every generated sentence across all 264 views (88 places × 3 periods). Every weekly count matched NYPD's own CompStat PDFs, and the arithmetic reproduced. The problems were in judgment and in a few inputs, and all were fixed:

- **The chance test assumed crime counts are as steady as a plain random count.** Measured from NYPD's weekly reports, shooting victims vary about 2.3 times as much, felony assault 2.6 and petit larceny 4.3; murder and rape don't exceed chance. The test now scales by each line's measured dispersion (`src/bold/dispersion.json`, built by `tools/dispersion/build_dispersion.py`). Citywide, "11 of 18 changes beyond chance" became 8 of 18. Shooting victims, hate crimes and misdemeanor assault moved to within chance.
- **Many tests at once.** Headlines pick from eight crimes, so they now need |z| ≥ 2.734 (Bonferroni). Precinct maps test every precinct, so they use Benjamini-Hochberg at a 5% false-discovery rate. Crime by crime went from 84 drops and 25 rises to 41 and 9. Headlines on the 264 views went from about 121 directional to 55.
- **"Real" and "noise" overstated.** Chips and prose now say "beyond chance" and "within chance." Failing the test is described as "the counts can't show it," not "no change."
- **Full-year pace** is now widened for chance in the count still to come. Felony assault's "most since 1997" and shootings' "record low" fell away. Murder's "fewest since at least 1993" survives by less than one murder (291.4 against 2017's 292) and should be rechecked each week.
- **History file.** `src/data/crime_history.json` differed from NYPD's official annual table (rape 2000-2008 up to 11% low). The new view now reads `src/bold/annual-history.json`, built from NYPD's table by `tools/history/build_history.py`. The classic view's file is untouched and still wrong in places; see limitations.
- **Geography.** The 116th came from the 105th and the 113th (mayor's announcement; NYPD's 113th report footnote), not just the 105th. The three are now combined for anything per-resident or mapped. The 113th joined the precincts left out of long-view comparisons, and the 33rd and 34th are left out of the 1993 view (the 33rd was carved from the 34th after 1993).
- **Sentence bugs**, all fixed:
  - zero-crime precincts given ranks;
  - "netted to zero … run the other way";
  - receipts contradicting headlines;
  - "no prior-year comparison" for 0 vs. 0;
  - ratios on one murder;
  - percentages on tiny bases (headlines now give counts when last year was under 20);
  - plurals, "−0%" and degenerate legend bins;
  - AP numerals, dates and dashes.
- **Facts.** John Hall is "a retired police professional," per Vital City, and his figures cover 95 monthly totals from 2018 through November 2025. The page now explains why his 13.5% for murder doesn't apply to a year-to-date total. Peer-city "lower" now needs a gap beyond chance; Boston is "about the same" as New York.

## Notable trends (Sept. 27)

Josh asked for the page to spotlight big local moves, rising and falling, which the rigor pass had buried. The `#trends` section (first after the hero, with a pointer line in the hero) does it without loosening the rules:

- **A move is notable only if it clears three bars:** the chance test on its own; a test against the citywide trend for that crime (`S.relativeZ`: had the precinct moved exactly with the city, this year's share of the two years' total would be r ÷ (1 + r), where r is the city's ratio); and Benjamini-Hochberg across every precinct-and-crime pair (612 year to date). Fragile moves are left out. On Sept. 20 that leaves 10 rises and 6 drops year to date and none over 28 days or a week. When nothing qualifies, the section shows the biggest swings next to the city, labeled with why they fall short.
- **Two-year shape** (year to date only), from NYPD's same-stretch-of-2024 column: "second straight" rise or drop; "after a jump (or drop) last year," flagged as possibly a return toward normal (regression to the mean, per John Hall's May 2026 Vital City piece on the zone strategy); or "new this year."
- **Views:** citywide lists the top moves with a map; a patrol borough filters to its own precincts (membership in `S.PATROL_BOROUGHS`, verified against the report: every borough's totals equal its precincts' on all 108 values, except Bronx South, whose reported totals run slightly higher in a few person-crime lines); a precinct lists all its crimes, ranked against the city, with a verdict on each.
- **Citywide extras:** where each citywide change beyond chance came from (the five biggest precinct moves and their share of the net change), and year-after-year runs from NYPD's annual totals with the pace verdict from the long arc.

### Naming the comparison (Sept. 27)

Every change on the page compares a stretch of this year with the same dates a year earlier (CompStat's own comparison), never the previous week or month. At Josh's request, every place that states a change now says so: the hero kicker ("Year to date, Jan. 1-Sept. 20, 2026, vs. the same dates in 2025"), the lead sentences ("From Jan. 1 to Sept. 20, grand larceny is up 54% in the 112th Precinct compared with the same dates in 2025; citywide, it's down 6%."), each section's intro, the tiles and the ledger's column headers. The strings live in `periodText` in `BoldApp.js`.

## How it's built

| Path | What it does |
|---|---|
| `src/index.js` | Renders `BoldApp` by default and the original `App` at `?classic`. |
| `src/App.js` | The original dashboard. The only changes are `export`s on constants the new view reuses: `GITHUB_USER`, `REPO_NAME`, `CITYWIDE_POPULATION`, `TOURIST_PRECINCTS`, `GEO_POPULATIONS`, `PRECINCT_NEIGHBORHOODS`, `RTCI_CSV_URL` and `toOrdinalPrecinct`. |
| `src/bold/stats.js` | All the statistics as pure functions, unit-tested. The page's claims come from here. |
| `src/bold/BoldApp.js` | The page: data loading, URL state and every section. |
| `src/bold/charts.js` | The signal board, unit chart, long-arc chart, precinct choropleth, small-multiple maps, legends and peer bars (d3-geo). |
| `src/bold/ui.js` | Palette and verdict colors plus shared bits: chips, the "Fragile" tag, "Show the math," section heads and segmented toggles. |
| `src/bold/bold.css` | Neutral fonts (Helvetica Neue/Arial and Georgia) and print rules. |
| `src/bold/snapshot-2026-09-20.json` | Citywide-only copy of the Sept. 20, 2026 report. It's the offline fallback and the test fixture. |
| `src/bold/*.test.js` | Unit tests. |
| `public/precinct-day/index.html` | A copy of `joshgreenman1973/nyc-precinct-day` at `12f1d59`, plus a `?pct=&date=` preselect near the end. Keep it in sync by hand. |
| `vercel.json` | Turns off Vercel builds for `claude/**` branches. |
| `tools/verify/` | The independent end-to-end number check. |
| `src/bold/dispersion.json`, `tools/dispersion/` | Each line's week-to-week dispersion by level (city, patrol borough, precinct), measured from the scraper's archive. Rebuild as the archive grows: `python3 tools/dispersion/build_dispersion.py <scraper>/data/archive`. |
| `src/bold/annual-history.json`, `tools/history/` | The annual citywide totals the long arc charts: NYPD's official table for 2000-2025, and the older compilation for 1993-1999 and shootings. Rebuild with `python3 tools/history/build_history.py`. |

### Data sources

Everything is fetched in the browser; there's no server.

- **CompStat.** `latest_compstat.json` from `joshgreenman1973/nypd-compstat-scraper` (raw GitHub, `data/`). If that fails, the page falls back to the bundled citywide snapshot and says so.
- **Revision archive.** The same repo's `data/index.json` plus the eight archived weekly reports before the current one, about 80 KB each gzipped.
- **Other cities.** Real-Time Crime Index (AH Datalytics) scorecard CSV. If it's unreachable, the page uses a bundled 2025 snapshot and says so.
- **A day in the precinct.** NYC Open Data's NYPD calls-for-service dataset, `n2zq-pubd`.

### Page sections, top to bottom

Each section has an anchor you can link to.

- **Verdict hero.** A headline generated from the data. Precinct pages add a locator map and an "A day in this precinct" link.
- **Sticky nav.** Section links and a way back to citywide.
- **`#trends`** Notable trends: local moves that stand out from chance and from the city, with two-year shape; citywide, where each citywide change came from and year-after-year runs.
- **`#signal`** Every change on the chance-test board.
- **`#every-one`** Murders as individual units, this year against last.
- **`#arc`** Each major felony's annual history since 1993, citywide only, with this year's pace drawn as a range.
- **`#where`** Choropleth by residents or by chance-test verdict.
- **`#by-crime`** Eight small-multiple maps.
- **`#then-now`** Each precinct against 2010 or 1993. Year to date only.
- **`#cities`** NYC's murder rate against peer cities.
- **`#day`** A day in the precinct (every job NYPD dispatched in one precinct on one day), collapsed by default. It was "Dig deeper" at `#dig` until Sept. 26.
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
| `base` | `2010` or `1993` |

## The statistical rules

Don't loosen these without a reason you can defend in print.

- **Chance test.** A continuity-corrected test on this year's count (c) against last year's (p), scaled by the line's measured dispersion φ: z = sign(c−p) · max(0, |c−p| − 1) / √(φ(c+p)). A change is "beyond chance" when |z| ≥ 1.96.
  - At φ = 1 it was checked against the exact binomial test for all counts from 0 to 150, and it never calls a change beyond chance that the exact test wouldn't.
  - φ is the variance ÷ mean of weekly counts, from differences between consecutive archived weeks (both years), pooled by level and never taken below 1. Clustering that spans several weeks isn't fully caught, so φ is if anything low.
  - For sums (the seven majors, the map measures), φ is the count-weighted average of the parts, and for the seven majors never less than φ measured on their total.
  - The noise band shown is ±(1.96√(φn) + 1)/p × 100 percent.
- **Headline bar.** The lead and any rise or drop counterpoint need |z| ≥ 2.734, because the headline picks from eight crimes. A counterpoint within ±3% is "essentially flat"; "isn't falling" needs +3% or more. When last year's count is under 20, the clause gives counts ("Vehicle thefts rose to 42 from 18").
- **Precinct maps** (the "Where" map in signal mode and the eight crime-by-crime maps): a precinct is colored only if it clears 1.96, survives Benjamini-Hochberg at q = 0.05 across that map's precincts, and isn't fragile.
- **Revisions.** Josh flagged this using John Hall's Vital City analysis: every monthly report from 2018 to 2025 was later revised upward, by 13.5% on average for murder.
  - **Measuring the pace.** Revision flow = this week's year-to-date total − last week's year-to-date total − this week's own count. It is summed over the last 8 consecutive archived reports, and divided by the weeks each place was actually present.
  - **Hall's 13.5%** measures how much one month's first count grows. A year-to-date total has much less left to grow, which the page now says.
  - **The cushion.** `breakEven` is the smallest adverse change that turns a real change into noise.
  - **Fragile changes.** A real change is "fragile" if revisions at the recent pace would erase it in fewer than 8 weeks. The limit is 4 weeks for 28-day counts and 1 week for weekly counts.
  - **What fragile means on the page.** Fragile changes never headline and are shaded as noise on maps. If every real change is fragile, the headline says no major crime moved by enough to outlast both chance and NYPD's revisions.
- **Full-year pace.** Shown as a range between two estimates:
  - Linear: year to date ÷ the share of the year elapsed.
  - Seasonal: year to date ÷ the share of last year's total that had come in by the same date.

  The range is widened by 8 weeks of revision allowance and then by chance in the rest of the year: 1.96 × √(φ × the count still to come) at each end. There's no projection before a quarter of the year has passed, and a superlative must hold at the conservative end of the range.
- **Long-view columns.** NYPD's historical columns compare with fixed base years, not rolling ones: `2_yr` is two years before the report year, `14_yr_pct` is 2010 and `31_yr_pct` is 1993.
- **Rape.** NYPD broadened the definition Sept. 1, 2024. Comparisons across that date are flagged "Not comparable" (`rapeYoYComparable`).
- **Precinct quirks.**
  - The 116th Precinct was carved out of the 105th and 113th in December 2024, so the three are combined for per-resident rates and maps (the old 105th and 113th shapes and populations cover exactly the three).
  - The tourist precincts (the 14th, 18th and 22nd) are left out of per-resident rates. Other business districts (the 1st, 5th, 6th, 13th and 84th) are noted but kept.
  - Long-view comparisons (deck, ledger, Then and now) are left out for precincts redrawn since the base year: the 105th, 113th, 116th, 120th, 121st and 122nd since 2010, plus the 33rd and 34th since 1993.
  - Rankings skip precincts with none and say "too few to rank" under 10 incidents; ties are labeled.
- **Peer cities.** RTCI rows are matched by both agency and state. Comparisons use the previous full year, because each city's year-to-date window ends on a different date. A city counts as higher or lower than New York only if the rate gap is beyond chance (z from Poisson standard errors of both rates); otherwise "about the same."
- **Notable trends.** A precinct-and-crime move must clear the chance test, differ from the citywide trend (relativeZ, same continuity correction and precinct-level dispersion) and survive Benjamini-Hochberg across every pair tested; fragile moves are out. Ranks ("the biggest … against the citywide trend of any precinct") compare every precinct tested for that crime.
- **Rape** long-view columns in the ledger are marked n/c. The Then and now source line gives the count with rape backed out.
- **Concentration ties** go to the more populous precinct, which makes the claim more conservative.

## Verified numbers (Sept. 20, 2026 report)

`tools/verify/run.sh` re-derives these in Python, independently of the JavaScript, and confirms the page prints them. As of Sept. 27, 453 of 453 checks pass, including an independent Python reimplementation of the notable-trends tests. `check.py` now also re-derives dispersion from the archive and confirms `dispersion.json`, compares `annual-history.json` with NYPD's own spreadsheet (fetched into `.work/nypd7.xls`) year by year, and redoes the Benjamini-Hochberg tallies. It needs python3 with xlrd. If you change the stats code, rerun it. Any difference should be one you intended.

- **Headline:** "Murder is down 24%. Felony assault is essentially flat."
- **Signal board:** 8 of 18 citywide year-to-date changes are beyond chance: murder, robbery, burglary, grand larceny, vehicle theft, public housing, petit larceny and retail theft. None is fragile.
- **Murder pace:** 221 to 291 for the full year, including revisions and chance. That would be the fewest since at least 1993 by less than one murder at the high end (2017: 292).
- **Concentration:** Half of shooting victims were shot in 13 of 78 precincts, home to 19% of New Yorkers.
- **Other cities:** NYC's 2025 murder rate was lower than in seven of the eight other largest U.S. cities; in the Northeast group, lower than six of seven and about the same as Boston.
- **Then and now:** 43 of 72 precincts are above 2010 levels; all 70 compared are below 1993, by 46% to 89%.
- **Crime by crime:** 41 drops and 9 rises stand out after the false-discovery correction and fragility.
- **Notable trends:** 10 rises and 6 drops year to date. The biggest: grand larceny up 54% in the 112th (down 6% citywide) and down 33% in the 43rd.

## Verification harness (`tools/verify/`)

The harness pins everything to the Sept. 20 report.

1. `run.sh` clones the scraper repo at commit `c0165dc` and fetches the RTCI CSV.
2. It builds the app and serves it on port 5055.
3. `shot.js` renders the citywide page, the 75th Precinct page and the weekly view in headless Chromium. All outside requests are answered from local files. It dumps each page's visible text and fails on any console error.
4. `check.py` recomputes every headline number, every ledger line, the fragile set, the pace range, the concentration claim and the peer rates, then checks each against the page text.

To set it up once: `cd tools/verify && npm i --no-save playwright && npx playwright install chromium`.

## Known limitations and loose ends

- **Dispersion comes from 29 week-pairs** (March to September 2026). Rebuild it as the archive grows; early in a year, or after an unusual stretch, it may move.
- **The murder record-low claim is thin.** It holds by less than one murder at the high end of the range and could flip on any week's report. The page's rules will drop it on their own when it does.
- **The classic view's history is wrong in places** (`src/data/crime_history.json`: e.g., 2018 burglary 9,768 against NYPD's 11,687; rape 2000-2008 low). Left alone under the don't-touch-the-original rule; worth fixing on `main` separately.
- **The precinct-day copy drifts.** If `nyc-precinct-day` changes, copy it over again and keep the preselect snippet near the end.
- **The revision allowance uses recent flow.** Revisions early in the year, or after a batch correction, may run faster or slower than the last 8 weeks suggest.
- **`check.py` is pinned to Sept. 20.** It hard-codes day 263 and that week's specific claims. Pointing it at a new week means updating those constants.
