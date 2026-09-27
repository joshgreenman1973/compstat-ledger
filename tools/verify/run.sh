#!/usr/bin/env bash
# Independent check of the "read closely" view against NYPD's Sept. 20, 2026 report: builds the app,
# renders five pages offline with pinned data, re-derives every headline number in Python and
# confirms the page prints exactly those. Needs git, curl, python3, node and Playwright
# (once: cd tools/verify && npm i --no-save playwright && npx playwright install chromium) and python3 with xlrd.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-$HERE/.work}"
PORT="${PORT:-5055}"
mkdir -p "$WORK"
# The scraper repo at the commit that published the Sept. 20 report, with its archive of earlier weeks.
[ -d "$WORK/scraper/.git" ] || git clone -q https://github.com/joshgreenman1973/nypd-compstat-scraper "$WORK/scraper"
git -C "$WORK/scraper" checkout -q c0165dc
cp "$WORK/scraper/data/archive/2026-09-20.json" "$WORK/latest.json"
# RTCI changes monthly; the page and check.py both read this same copy, so either vintage works.
[ -f "$WORK/rtci.csv" ] || curl -sSfL https://raw.githubusercontent.com/AH-Datalytics/rtci/main/docs/app_data/scorecard.csv -o "$WORK/rtci.csv"
# NYPD's own annual table, to check the page's history file against (nyc.gov refuses curl's default agent).
[ -f "$WORK/nypd7.xls" ] || curl -sSfL -A "Mozilla/5.0" https://www.nyc.gov/assets/nypd/downloads/excel/analysis_and_planning/historical-crime-data/seven-major-felony-offenses-2000-2025.xls -o "$WORK/nypd7.xls"
# 2020 Census counts by precinct (John Keefe's crosswalk), to check the page's population table against.
[ -f "$WORK/keefe2020.csv" ] || curl -sSfL https://raw.githubusercontent.com/jkeefe/census-by-precincts/master/data/nyc/nyc_precinct_2020pop.csv -o "$WORK/keefe2020.csv"
(cd "$ROOT" && CI=true npx react-scripts build > "$WORK/build.log" 2>&1) || { cat "$WORK/build.log"; exit 1; }
python3 -m http.server "$PORT" --directory "$ROOT/build" > "$WORK/http.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
SP="$WORK" PORT="$PORT" node "$HERE/shot.js" '[{"name":"cw","w":1280,"expand":true,"text":true},{"name":"cw75","w":1280,"q":"?geo=75th+Precinct","expand":true,"text":true},{"name":"cwwk","w":1280,"q":"?period=wtd","expand":true,"text":true},{"name":"bk","w":1280,"q":"?geo=Brooklyn","expand":true,"text":true},{"name":"bx","w":1280,"q":"?geo=Bronx","expand":true,"text":true}]'
cd "$ROOT" && python3 "$HERE/check.py" "$WORK"
