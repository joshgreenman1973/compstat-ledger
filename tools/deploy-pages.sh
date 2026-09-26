#!/usr/bin/env bash
# Publishes this branch's build to https://joshgreenman1973.github.io/compstat-read-closely/
# (repo joshgreenman1973/compstat-read-closely, build output only). Josh asked for it Sept. 26, 2026,
# to try the page out. It's public to anyone with the link, marked noindex to stay out of search
# engines, and separate from compstat-ledger's own Pages site and its Vercel deployment.
# Run from anywhere; needs gh logged in as joshgreenman1973.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO=joshgreenman1973/compstat-read-closely
SLUG=compstat-read-closely
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ "$(gh api user --jq .login)" = joshgreenman1973 ] || { echo "gh is not acting as joshgreenman1973; stopping"; exit 1; }
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
git -C "$ROOT" diff --quiet HEAD || echo "note: uncommitted changes are included in this build"

(cd "$ROOT" && PUBLIC_URL="/$SLUG" BUILD_PATH="$WORK/site" CI=true npx react-scripts build > "$WORK/build.log" 2>&1) || { cat "$WORK/build.log"; exit 1; }
for f in "$WORK/site/index.html" "$WORK/site/precinct-day/index.html"; do
  sed -i '' 's#<head>#<head><meta name="robots" content="noindex,nofollow">#' "$f"
  grep -q 'content="noindex' "$f" || { echo "noindex tag missing in $f"; exit 1; }
done
printf 'User-agent: *\nDisallow: /\n' > "$WORK/site/robots.txt"
touch "$WORK/site/.nojekyll"
cat > "$WORK/site/README.md" <<EOF
# CompStat, read closely (prototype)

Build output only, published for testing. An independent prototype, not an official Vital City
product. Source: branch claude/compstat-bold-reimagining-vediu3 of joshgreenman1973/compstat-ledger,
commit $SHA. Redeploy with tools/deploy-pages.sh there; don't edit this repo by hand.
EOF

git clone -q "https://github.com/$REPO.git" "$WORK/repo"
find "$WORK/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$WORK/site/." "$WORK/repo/"
cd "$WORK/repo"
git add -A
if git diff --cached --quiet; then echo "nothing changed; already deployed"; exit 0; fi
git commit -q -m "Deploy $SHA" ${DEPLOY_TRAILER:+-m "$DEPLOY_TRAILER"}
git branch -M main
git push -q origin main
echo "pushed $SHA; live in a minute or two at https://joshgreenman1973.github.io/$SLUG/"
