#!/usr/bin/env bash
# Publishes this branch's build as version B, "CompStat in Context: B," at
# https://compstat-in-context-b.vercel.app (Vercel project compstat-in-context-b, in the same Vercel
# account as compstat-ledger, which serves version A from main). Josh moved B here from GitHub Pages
# on Oct. 14, 2026; tools/deploy-pages.sh now only keeps the old Pages address forwarding here.
# This uploads the build output; the repo's own Vercel Git connection stays off for this branch
# (vercel.json). Marked noindex. Needs a one-time `npx vercel login` on this computer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=compstat-in-context-b
VERCEL="npx --yes vercel@64.0.2"
LINK="$ROOT/tools/vercel-project-b.json"   # project and account IDs, so every deploy lands in the same project
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SITE="$WORK/$PROJECT"   # the folder name becomes the project name on the first deploy

git -C "$ROOT" diff --quiet HEAD || echo "note: uncommitted changes are included in this build"
(cd "$ROOT" && BUILD_PATH="$SITE" CI=true npx react-scripts build > "$WORK/build.log" 2>&1) || { cat "$WORK/build.log"; exit 1; }
for f in "$SITE/index.html" "$SITE/precinct-day/index.html"; do
  sed -i '' 's#<head>#<head><meta name="robots" content="noindex,nofollow">#' "$f"
  grep -q 'content="noindex' "$f" || { echo "noindex tag missing in $f"; exit 1; }
done
printf 'User-agent: *\nDisallow: /\n' > "$SITE/robots.txt"
cat > "$SITE/vercel.json" <<'EOF'
{ "headers": [{ "source": "/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }] }
EOF

if [ -f "$LINK" ]; then mkdir -p "$SITE/.vercel" && cp "$LINK" "$SITE/.vercel/project.json"; fi
(cd "$SITE" && $VERCEL deploy --prod --yes)
[ -f "$LINK" ] || { cp "$SITE/.vercel/project.json" "$LINK"; echo "first deploy: saved $LINK; commit it"; }
echo "live at https://$PROJECT.vercel.app/"
