#!/usr/bin/env bash
# Keeps the old GitHub Pages address, https://joshgreenman1973.github.io/compstat-read-closely/
# (repo joshgreenman1973/compstat-read-closely), forwarding to version B's home on Vercel,
# https://compstat-in-context-b.vercel.app/. Josh moved B to Vercel on Oct. 14, 2026; until then this
# script published the full build here. The forward keeps the path after /compstat-read-closely/, the
# query string (?geo=, ?period=) and the #section, so links already shared still land in the right place.
# Publish B itself with tools/deploy-vercel.sh. Run from anywhere; needs gh logged in as joshgreenman1973.
set -euo pipefail
REPO=joshgreenman1973/compstat-read-closely
TARGET=https://compstat-in-context-b.vercel.app
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ "$(gh api user --jq .login)" = joshgreenman1973 ] || { echo "gh is not acting as joshgreenman1973; stopping"; exit 1; }

mkdir -p "$WORK/site/precinct-day"
cat > "$WORK/site/index.html" <<EOF
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<title>CompStat in Context: B has moved</title>
<link rel="canonical" href="$TARGET/">
<script>
(function () {
  var p = location.pathname.replace(/^\/compstat-read-closely/, '') || '/';
  location.replace('$TARGET' + p + location.search + location.hash);
})();
</script>
<meta http-equiv="refresh" content="0; url=$TARGET/">
</head>
<body>
<p>CompStat in Context: B has moved to <a href="$TARGET/">compstat-in-context-b.vercel.app</a>.</p>
</body>
</html>
EOF
cp "$WORK/site/index.html" "$WORK/site/precinct-day/index.html"
cp "$WORK/site/index.html" "$WORK/site/404.html"
printf 'User-agent: *\nDisallow: /\n' > "$WORK/site/robots.txt"
touch "$WORK/site/.nojekyll"
cat > "$WORK/site/README.md" <<EOF
# CompStat in Context: B (moved)

This address now forwards to $TARGET/. Source: branch claude/compstat-bold-reimagining-vediu3 of
joshgreenman1973/compstat-ledger. Regenerate with tools/deploy-pages.sh there; don't edit this repo by hand.
EOF

git clone -q "https://github.com/$REPO.git" "$WORK/repo"
find "$WORK/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$WORK/site/." "$WORK/repo/"
cd "$WORK/repo"
git add -A
if git diff --cached --quiet; then echo "nothing changed; already deployed"; exit 0; fi
git commit -q -m "Forward to $TARGET" ${DEPLOY_TRAILER:+-m "$DEPLOY_TRAILER"}
git branch -M main
git push -q origin main
echo "pushed; https://joshgreenman1973.github.io/compstat-read-closely/ forwards to $TARGET/ in a minute or two"
