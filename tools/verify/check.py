# Independent re-derivation of every headline number on the page, compared with the rendered text.
# Pinned to NYPD's Sept. 20, 2026 report (day 263 of the year). Run via run.sh, from the repo root:
#   python3 tools/verify/check.py <work dir holding latest.json, rtci.csv, scraper/ and the page-text dumps>
import json, re, math, csv, sys
SP = sys.argv[1]
d = json.load(open(f'{SP}/latest.json'))
hist = json.load(open('src/data/crime_history.json'))['citywide']
src = open('src/App.js').read()
gp = {k: int(v) for k, v in re.findall(r'"([^"]+ Precinct)": (\d+)', src[src.index('export const GEO_POPULATIONS'):src.index('const GEO_POPULATIONS_2010')])}
fails = []; oks = 0
def expect(text, needle, why):
    global oks
    if needle in text: oks += 1
    else: fails.append(f'MISSING [{why}]: {needle!r}')
def fmt(n): return f'{round(n):,}'
def row(geo, name, per='year_to_date'):
    s = d[geo]['seven_major_felonies'].get(name) or d[geo]['additional_stats'].get(name)
    return s[per]['current_year'], s[per]['prior_year']
def z(c, p): return math.copysign(max(0, abs(c - p) - 1), c - p) / math.sqrt(c + p)
MAJ = ['Murder','Rape','Robbery','Fel. Assault','Burglary','Gr. Larceny','G.L.A.']

for fname, geo, per in [('cw.txt', 'citywide', 'year_to_date'), ('cw75.txt', '75th Precinct', 'year_to_date'), ('cwwk.txt', 'citywide', 'week_to_date')]:
    t = open(f'{SP}/{fname}').read().replace('−', '-')
    c, p = row(geo, 'Murder', per)
    tc = sum(row(geo, n, per)[0] for n in MAJ); tp = sum(row(geo, n, per)[1] for n in MAJ)
    pct = (tc - tp) / tp * 100
    expect(t, f'{"down" if pct < 0 else "up"} {abs(pct):.1f}% from', f'{fname} total pct')
    expect(t, f': {fmt(tc)}, or {fmt(abs(tc-tp))} {"fewer" if tc < tp else "more"}', f'{fname} total counts')
    fa = row(geo, 'Fel. Assault', per)[0]
    if c > 0: expect(t, f'{round(fa / c):,} felony assaults', f'{fname} ratio')
    # every ledger line: cur, prior, diff, pct and z as rendered
    for grp in ('seven_major_felonies', 'additional_stats'):
        for name, s in d[geo][grp].items():
            cc, pp = s[per]['current_year'], s[per]['prior_year']
            if cc is None or pp is None: continue
            line = f'{fmt(cc)}\t{fmt(pp)}\t{"+" if cc-pp>0 else "-" if cc-pp<0 else ""}{fmt(abs(cc-pp))}'
            expect(t, line, f'{fname} ledger {name}')
            if pp > 0:
                pc = (cc - pp) / pp * 100
                expect(t, f'{"+" if pc>0 else "-" if pc<0 else ""}{abs(pc):.1f}%', f'{fname} ledger pct {name}')
            if cc + pp > 0:
                zz = z(cc, pp)
                expect(t, f'z {"-" if zz<0 else ""}{abs(zz):.1f}', f'{fname} ledger z {name}')
    if per == 'year_to_date':
        h = d[geo]['total_seven_major']['historical']
        for key, yr in (('31_yr_pct', 1993), ('14_yr_pct', 2010)):
            v = h[key]
            expect(t, f'{round(abs(v))}% {"below" if v < 0 else "above"} {yr}', f'{fname} long view {yr}')

t = open(f'{SP}/cw.txt').read().replace('−', '-')
# headline
c, p = row('citywide', 'Murder')
expect(t, f'Murder is down {round(abs((c-p)/p*100))}%.', 'headline murder')
fc, fp = row('citywide', 'Fel. Assault'); assert abs(z(fc, fp)) < 1.96 and fc >= fp
expect(t, "Felony assault isn't falling.", 'headline FA')
# board count
names = [n for g in ('seven_major_felonies','additional_stats') for n in d['citywide'][g]]
zs = [z(*row('citywide', n)) for n in names if sum(row('citywide', n)) > 0]
real = sum(abs(x) >= 1.96 for x in zs)
words = ['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine']
expect(t, f'{words[real] if real < 10 else real} of {len(zs)} changes this year are bigger than chance', 'board title')
# unit chart
expect(t, f'{c} murders so far this year — {p - c} fewer than at this point in 2025', 'unit headline')
# pace
full25 = [r for r in hist if r['y'] == 2025][0]['Murder']
# revision flows: weekly residuals over the last 8 consecutive archived reports
import glob, os
arch = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob(f'{SP}/scraper/data/archive/*.json')}
ds = sorted(arch)[-9:]
def flow(geo, name, side='current_year'):
    tot = 0
    for a_, b_ in zip(ds, ds[1:]):
        A = arch[a_][geo]; B = arch[b_][geo]
        sa = A['seven_major_felonies'].get(name) or A['additional_stats'].get(name); sb = B['seven_major_felonies'].get(name) or B['additional_stats'].get(name)
        tot += sb['year_to_date'][side] - sa['year_to_date'][side] - sb['week_to_date'][side]
    return tot
fm = flow('citywide', 'Murder'); fM = sum(flow('citywide', n) for n in MAJ); fMp = sum(flow('citywide', n, 'prior_year') for n in MAJ)
expect(t, f"came to +{fm} murders and +{fmt(fM)} major felonies in all; the 2025 figures they're compared against moved +{fmt(fMp)}", 'hero revision note')
lin = c / (263 / 365); sea = c / (p / full25)
adj = c + round(fm)
lo = min(lin, sea); hi = max(adj / (263 / 365), adj / (p / full25), lin, sea)
expect(t, f'{fmt(lo)}–{fmt(hi)}', 'pace range with revision allowance')
assert hi < min(r['Murder'] for r in hist), 'record-low claim must hold at high end'
# fragile set, citywide YTD: break-even by brute force vs 8 weeks of flow
fragile = []
for n in names:
    cc, pp = row('citywide', n)
    if cc + pp == 0: continue
    zz = z(cc, pp)
    if abs(zz) < 1.96: continue
    dd = 1 if zz < 0 else -1
    k = 1
    while abs(z(cc + dd * k, pp)) >= 1.96: k += 1
    per = dd * flow('citywide', n) / 8
    if per > 0 and k / per < 8: fragile.append(n)
print('independent fragile set:', fragile)
expect(t, 'Misdemeanor assault clears it today but is fragile', 'fragile dek')
assert fragile == ['Misd. Assault'], fragile
expect(t, 'would set a low for murders in NYPD records going back to 1993', 'arc claim')
# concentration (shooting victims), 105+116 combined, ties -> more populous
units = {}
for k in d:
    if 'Precinct' in k: units[k] = [row(k, 'Shooting Vic.')[0], gp.get(k, 0)]
units['105th Precinct'][0] += units.pop('116th Precinct')[0]
tot = sum(u[0] for u in units.values()); ptot = sum(u[1] for u in units.values())
cum = pop = k = 0
for n, (cnt, pp) in sorted(units.items(), key=lambda kv: (-kv[1][0], -kv[1][1])):
    if cum >= tot / 2: break
    cum += cnt; pop += pp; k += 1
expect(t, f'were shot in {k + (1 if any(n == "105th Precinct" for n, _ in sorted(units.items(), key=lambda kv: (-kv[1][0], -kv[1][1]))[:k]) else 0)} of {len(units) + 1} precincts, home to {round(pop / ptot * 100)}% of New Yorkers', 'concentration')
# peers
rows = list(csv.DictReader(open(f'{SP}/rtci.csv')))
big = [('New York City','New York'),('Los Angeles','California'),('Chicago','Illinois'),('Houston','Texas'),('Phoenix','Arizona'),('Philadelphia','Pennsylvania'),('San Antonio','Texas'),('San Diego','California'),('Dallas','Texas')]
rate = {}
for a, s_ in big:
    r = [x for x in rows if x['agency_name'] == a and x['state_name'] == s_ and x['crime_type'] == 'murder'][0]
    rate[a] = int(r['previous_year_full']) / int(r['population']) * 1e5
    expect(t, f'{rate[a]:.1f}', f'peer rate {a}')
higher = sum(v > rate['New York City'] for a, v in rate.items() if a != 'New York City')
expect(t, f'lower than in {words[higher].lower()} of the eight other largest U.S. cities', 'peer headline')
# the press layer was removed Sept. 26, 2026; make sure no trace of it renders
def absent(text, needle, why):
    global oks
    if needle in text: fails.append(f'SHOULD BE ABSENT [{why}]: {needle!r}')
    else: oks += 1
absent(t.upper(), 'PRESS REPORTS', 'press layer removed')
print(f'{oks} checks passed, {len(fails)} failed')
print('\n'.join(fails[:40]))
sys.exit(1 if fails else 0)
