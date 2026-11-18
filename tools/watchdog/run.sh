#!/usr/bin/env bash
# Weekly watchdog for CompStat in Context A and B (set up after the Nov. 18, 2026 audit).
# Builds both versions from what's on GitHub (A: main; B: this branch), renders every precinct, borough
# and the city with NYPD's live feed in headless Chromium, and checks the text for output that should
# never appear (null, NaN, a percent over 100% of a net change, a weekly view comparing with whole
# years, a New Year date range without its first year, a page that never finishes loading).
# Prints "OK ..." and exits 0 when clean; prints one FAIL line per problem and exits 1 otherwise.
# Pages are built locally and served from disk, so the check doesn't trip Vercel's bot checkpoint;
# two live requests confirm both sites are up. Needs node, git and Playwright (in ../../node_modules).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-$HERE/.work}"
B_BRANCH=claude/compstat-bold-reimagining-vediu3
rm -rf "$WORK/a" "$WORK/b" "$WORK/a-build" "$WORK/b-build"; mkdir -p "$WORK/a" "$WORK/b"
git -C "$ROOT" fetch -q origin main "$B_BRANCH"
git -C "$ROOT" archive origin/main | tar -x -C "$WORK/a"
git -C "$ROOT" archive "origin/$B_BRANCH" | tar -x -C "$WORK/b"
for v in a b; do
  ln -s "$ROOT/node_modules" "$WORK/$v/node_modules"
  (cd "$WORK/$v" && BUILD_PATH="$WORK/$v-build" CI=true npx react-scripts build > "$WORK/$v-build.log" 2>&1) \
    || { echo "FAIL build: version $v doesn't build from GitHub (see $WORK/$v-build.log)"; exit 1; }
done
node "$HERE/watch.mjs" "$WORK"
