# CompStat in Context: B (formerly "CompStat, read closely"; private fork)

Read `HANDOFF.md` first: it explains what's built, how and what's left.

Standing rules:
- One public copy only: version B, "CompStat in Context: B," at https://compstat-in-context-b.vercel.app/ (noindexed; its own Vercel project, moved from GitHub Pages at Josh's request Oct. 14, 2026), deployed with `bash tools/deploy-vercel.sh`. The old Pages address only forwards there (`tools/deploy-pages.sh`). Don't merge to `main`, deploy anywhere else or remove the `vercel.json` block. Pushing this branch to GitHub is fine; open a PR only if Josh asks.
- Not an official Vital City product: no Vital City wordmark or branding.
- Every number and generated sentence must follow from NYPD's published figures; when in doubt, claim less. Statistics live in `src/bold/stats.js` and are unit-tested.
- AP style, no Oxford comma, in UI copy too.
- Before pushing: `CI=true npx react-scripts test src/bold --watchAll=false` and `CI=true npx react-scripts build` (warnings fail the build). After touching stats or copy, run `bash tools/verify/run.sh`.
