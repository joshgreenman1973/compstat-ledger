# Independent re-derivation of every headline number on the page, compared with the rendered text.
# Pinned to NYPD's Sept. 20, 2026 report (day 263 of the year). Run via run.sh, from the repo root:
#   python3 tools/verify/check.py <work dir holding latest.json, rtci.csv, nypd7.xls, scraper/ and the page-text dumps>
# Nothing here imports the page's code: dispersion, the chance test, the false-discovery correction,
# revisions and the pace range are all recomputed from NYPD's files.
import json, re, math, csv, sys, glob, os
from datetime import date
SP = sys.argv[1]
d = json.load(open(f'{SP}/latest.json'))
hist = json.load(open('src/bold/annual-history.json'))['citywide']
src = open('src/App.js').read()
gp = {k: int(v) for k, v in re.findall(r'"([^"]+ Precinct)": (\d+)', src[src.index('export const GEO_POPULATIONS'):src.index('const GEO_POPULATIONS_2010')])}
fails = []; oks = 0
def expect(text, needle, why):
    global oks
    if needle in text: oks += 1
    else: fails.append(f'MISSING [{why}]: {needle!r}')
def absent(text, needle, why):
    global oks
    if needle in text: fails.append(f'SHOULD BE ABSENT [{why}]: {needle!r}')
    else: oks += 1
def check(cond, why):
    global oks
    if cond: oks += 1
    else: fails.append(f'FAILED [{why}]')
def fmt(n): return f'{round(n):,}'
WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
def nw(n): return WORDS[n] if 0 <= n < 10 else fmt(n)
def get(geo, name, src_=None):
    g = (src_ or d)[geo]
    return g['seven_major_felonies'].get(name) or g['additional_stats'].get(name)
def row(geo, name, per='year_to_date'):
    s = get(geo, name); return s[per]['current_year'], s[per]['prior_year']
MAJ = ['Murder', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'Gr. Larceny', 'G.L.A.']

# ---- archive: dispersion and revision flows, from scratch ----
arch = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob(f'{SP}/scraper/data/archive/*.json')}
dates = sorted(arch)
def lvl(k): return 'city' if k == 'citywide' else 'precinct' if 'Precinct' in k else 'borough'
num = {}; den = {}
for a_, b_ in zip(dates, dates[1:]):
    if (date.fromisoformat(b_) - date.fromisoformat(a_)).days != 7: continue
    A, B = arch[a_], arch[b_]
    for geo in B:
        if geo not in A: continue
        names = set(A[geo]['seven_major_felonies']) | set(A[geo]['additional_stats'])
        series = {}
        for n in names:
            sa, sb = get(geo, n, A), get(geo, n, B)
            if not sa or not sb: continue
            series[n] = [(sa['week_to_date'][s], sb['week_to_date'][s]) for s in ('current_year', 'prior_year')]
        series['_majors'] = [tuple(sum(get(geo, n, X)['week_to_date'][s] or 0 for n in MAJ) for X in (A, B)) for s in ('current_year', 'prior_year')]
        for n, pairs in series.items():
            for x0, x1 in pairs:
                if x0 is None or x1 is None: continue
                k = (lvl(geo), n); num[k] = num.get(k, 0) + (x1 - x0) ** 2; den[k] = den.get(k, 0) + x0 + x1
disp = {k: num[k] / den[k] for k in num if den[k] > 0}
bundled = json.load(open('src/bold/dispersion.json'))['lines']
for (l, n), v in disp.items():
    check(abs(bundled.get(n, {}).get(l, -9) - v) < 0.006, f'dispersion.json matches the archive: {n} {l} {v:.3f}')
# Having confirmed the bundled values match the archive, compute with them (they're rounded to two
# decimals, and the page uses the rounded values).
def phi(name, level='city'): return max(1.0, bundled.get(name, {}).get(level, disp.get((level, name), 1.0)))
def phi_sum(parts, level):  # parts: [(name, n)]
    w = sum(n for _, n in parts)
    avg = sum(phi(nm, level) * n for nm, n in parts) / w if w else 1
    majors = sorted(nm for nm, _ in parts) == sorted(MAJ)
    return max(1.0, avg, phi('_majors', level) if majors else 1.0)
def z(c, p, f=1.0):
    return math.copysign(max(0, abs(c - p) - 1), c - p) / math.sqrt(f * (c + p)) if c + p > 0 else None
last9 = dates[-9:]
def flow(geo, names, side='current_year'):
    if isinstance(names, str): names = [names]
    tot = 0
    for a_, b_ in zip(last9, last9[1:]):
        for n in names:
            sa, sb = get(geo, n, arch[a_]), get(geo, n, arch[b_])
            tot += sb['year_to_date'][side] - sa['year_to_date'][side] - sb['week_to_date'][side]
    return tot
def break_even(c, p, f):
    zz = z(c, p, f); dd = 1 if zz < 0 else -1; k = 1
    while abs(z(c + dd * k, p, f)) >= 1.96: k += 1
    return k
def fragile(geo, names, c, p, f, weeks=8):
    zz = z(c, p, f)
    if zz is None or abs(zz) < 1.96: return False
    per = (1 if zz < 0 else -1) * flow(geo, names) / 8
    return per > 0 and break_even(c, p, f) / per < weeks

# ---- NYPD's own annual table vs. the page's history file ----
import xlrd
sh = xlrd.open_workbook(f'{SP}/nypd7.xls').sheet_by_index(0)
hdr = next(r for r in range(sh.nrows) if str(sh.cell_value(r, 0)).strip() == 'OFFENSE')
yrs = [int(v) for v in sh.row_values(hdr)[1:] if str(v).strip()]
xmap = {'MURDER & NON-NEGL. MANSLAUGHTER': 'Murder', 'RAPE': 'Rape', 'ROBBERY': 'Robbery', 'FELONY ASSAULT': 'Fel. Assault', 'BURGLARY': 'Burglary', 'GRAND LARCENY': 'Gr. Larceny', 'GRAND LARCENY OF MOTOR VEHICLE': 'G.L.A.'}
H = {r['y']: r for r in hist}
for r in range(hdr + 1, sh.nrows):
    k = xmap.get(str(sh.cell_value(r, 0)).strip())
    if not k: continue
    for y, v in zip(yrs, sh.row_values(r)[1:]):
        check(H.get(y, {}).get(k) == int(v), f'history {y} {k} = NYPD {int(v)}')

# ---- per-page checks ----
for fname, geo, per in [('cw.txt', 'citywide', 'year_to_date'), ('cw75.txt', '75th Precinct', 'year_to_date'), ('cwwk.txt', 'citywide', 'week_to_date')]:
    t = open(f'{SP}/{fname}').read().replace('−', '-')
    L = lvl(geo)
    c, p = row(geo, 'Murder', per)
    tc = sum(row(geo, n, per)[0] for n in MAJ); tp = sum(row(geo, n, per)[1] for n in MAJ)
    pct = (tc - tp) / tp * 100
    expect(t, f'{"down" if pct < 0 else "up"} {abs(pct):.1f}% from', f'{fname} total pct')
    expect(t, f': {fmt(tc)}, or {nw(abs(tc - tp))} {"fewer" if tc < tp else "more"}', f'{fname} total counts')
    fa = row(geo, 'Fel. Assault', per)[0]
    if c >= 20: expect(t, f'{round(fa / c):,} felony assaults', f'{fname} ratio')
    else: absent(t, 'For every murder', f'{fname} no ratio on fewer than 20 murders')
    for grp in ('seven_major_felonies', 'additional_stats'):
        for name, s in d[geo][grp].items():
            cc, pp = s[per]['current_year'], s[per]['prior_year']
            if cc is None or pp is None: continue
            expect(t, f'{fmt(cc)}\t{fmt(pp)}\t{"+" if cc-pp>0 else "-" if cc-pp<0 else ""}{fmt(abs(cc-pp))}', f'{fname} ledger {name}')
            if pp > 0:
                pc = (cc - pp) / pp * 100
                expect(t, f'{"+" if round(abs(pc), 1) and pc > 0 else "-" if round(abs(pc), 1) and pc < 0 else ""}{abs(pc):.1f}%', f'{fname} ledger pct {name}')
            if cc + pp > 0:
                zz = z(cc, pp, phi(name, L))
                expect(t, f'z {"-" if round(zz, 1) < 0 else ""}{abs(zz):.1f}', f'{fname} ledger z {name}')
    if per == 'year_to_date':
        h = d[geo]['total_seven_major']['historical']
        for key, yr in (('31_yr_pct', 1993), ('14_yr_pct', 2010)):
            v = h[key]
            expect(t, f'{round(abs(v))}% {"below" if v < 0 else "above"} {yr}', f'{fname} long view {yr}')
    absent(t.upper(), 'REAL DROP', f'{fname} old verdict labels gone')
    absent(t.upper(), 'PRESS REPORTS', f'{fname} press layer removed')

t = open(f'{SP}/cw.txt').read().replace('−', '-')
# headline: murder clears the stricter headline bar; felony assault is within 3%, so "essentially flat"
c, p = row('citywide', 'Murder')
check(abs(z(c, p, phi('Murder'))) >= 2.734, 'murder clears the headline bar')
expect(t, f'Murder is down {round(abs((c-p)/p*100))}%.', 'headline murder')
fc, fp = row('citywide', 'Fel. Assault'); check(abs(z(fc, fp, phi('Fel. Assault'))) < 1.96 and abs((fc - fp) / fp * 100) < 3, 'FA within chance and within 3%')
expect(t, 'Felony assault is essentially flat.', 'headline FA')
# board count, with dispersion
names = [n for g in ('seven_major_felonies', 'additional_stats') for n in d['citywide'][g]]
tested = [n for n in names if sum(row('citywide', n)) > 0]
real = [n for n in tested if abs(z(*row('citywide', n), phi(n))) >= 1.96]
print('beyond chance, citywide YTD:', real)
expect(t, f'{nw(len(real)).capitalize()} of {len(tested)} changes this year are bigger than chance', 'board title')
for n in ('Shooting Vic.', 'Hate Crimes', 'Misd. Assault'):
    check(n not in real, f'{n} within chance once dispersion is allowed for')
# unit chart
expect(t, f'{c} murders so far this year — {p - c} fewer than at this point in 2025', 'unit headline')
# revision note
fm = flow('citywide', 'Murder'); fM = flow('citywide', MAJ); fMp = flow('citywide', MAJ, 'prior_year')
expect(t, f"came to +{fm} murders and +{fmt(fM)} major felonies in all; the 2025 figures they're compared against moved +{fmt(fMp)}", 'hero revision note')
# pace: two methods, 8 more weeks of revisions, then chance in the rest of the year
full25 = H[2025]['Murder']
lin = c / (263 / 365); sea = c / (p / full25); adj = c + round(fm / 8 * 8)
lo0 = min(lin, sea, adj / (263 / 365), adj / (p / full25)); hi0 = max(lin, sea, adj / (263 / 365), adj / (p / full25))
lo = max(c, lo0 - 1.96 * math.sqrt(phi('Murder') * (lo0 - c))); hi = hi0 + 1.96 * math.sqrt(phi('Murder') * (hi0 - c))
expect(t, f'The range shown, {fmt(lo)} to {fmt(hi)}, spans all of it.', 'pace range with revisions and chance')
low = min(r['Murder'] for r in hist)
check(hi < low, f'record-low claim holds at the high end ({hi:.1f} < {low})')
print(f'murder pace high end {hi:.1f} vs. series low {low}: margin {low - hi:.1f}')
expect(t, 'would have the fewest murders since at least 1993, where this series begins', 'arc claim')
# fragile set, citywide YTD
frag = [n for n in tested if fragile('citywide', n, *row('citywide', n), phi(n))]
print('independent fragile set:', frag)
if not frag: absent(t, 'is fragile:', 'no fragile dek when nothing is fragile')
# concentration (shooting victims): 105th, 113th and 116th combined over the old 105th and 113th shapes
SPLIT = ['105th Precinct', '113th Precinct', '116th Precinct']
units = {k: [row(k, 'Shooting Vic.')[0], gp.get(k, 0), 1] for k in d if 'Precinct' in k and k not in SPLIT}
units['split'] = [sum(row(k, 'Shooting Vic.')[0] for k in SPLIT), gp['105th Precinct'] + gp['113th Precinct'], 3]
tot = sum(u[0] for u in units.values()); ptot = sum(u[1] for u in units.values())
cum = pop = kk = 0
for n, (cnt, pp, size) in sorted(units.items(), key=lambda kv: (-kv[1][0], -kv[1][1])):
    if cum >= tot / 2: break
    cum += cnt; pop += pp; kk += size
expect(t, f'were shot in {kk} of {sum(1 for k in d if "Precinct" in k)} precincts, home to {round(pop / ptot * 100)}% of New Yorkers', 'concentration')
# crime by crime: dispersion, fragility, then Benjamini-Hochberg per map
def pval(zz): return math.erfc(abs(zz) / math.sqrt(2))
drops = rises = 0
for n in ['Murder', 'Shooting Vic.', 'Robbery', 'Fel. Assault', 'Rape', 'Burglary', 'Gr. Larceny', 'G.L.A.']:
    res = []
    for k in d:
        if 'Precinct' not in k or not get(k, n): continue
        cc, pp = row(k, n)
        f = phi_sum([(n, cc + pp)], 'precinct')
        zz = z(cc, pp, f)
        if zz is None: continue
        res.append((pval(zz), zz, fragile(k, n, cc, pp, f)))
    res.sort(key=lambda r: r[0]); m = len(res); kmax = 0
    for i, (pv, _, _) in enumerate(res):
        if pv <= (i + 1) / m * 0.05: kmax = i + 1
    for pv, zz, fr in res[:kmax]:
        if abs(zz) >= 1.96 and not fr:
            if zz < 0: drops += 1
            else: rises += 1
print('crime by crime:', drops, 'drops,', rises, 'rises')
expect(t, f'{nw(drops)} {"drop" if drops == 1 else "drops"} and {nw(rises)} {"rise" if rises == 1 else "rises"} stand out from chance so far this year', 'crime-by-crime tally')
# then and now vs. 2010, redrawn precincts left out
redrawn = SPLIT + ['120th Precinct', '121st Precinct', '122nd Precinct']
vals = [d[k]['total_seven_major']['historical']['14_yr_pct'] for k in d if 'Precinct' in k and k not in redrawn and d[k]['total_seven_major']['historical']['14_yr_pct'] is not None]
expect(t, f'above their 2010 level in {sum(v > 0 for v in vals)} of {len(vals)} precincts', 'then and now')
# peers: rates, and "lower" only when the gap is beyond chance
rows = list(csv.DictReader(open(f'{SP}/rtci.csv')))
big = [('New York City','New York'),('Los Angeles','California'),('Chicago','Illinois'),('Houston','Texas'),('Phoenix','Arizona'),('Philadelphia','Pennsylvania'),('San Antonio','Texas'),('San Diego','California'),('Dallas','Texas')]
rate = {}; cnt = {}; popn = {}
for a, s_ in big:
    r = [x for x in rows if x['agency_name'] == a and x['state_name'] == s_ and x['crime_type'] == 'murder'][0]
    cnt[a] = int(r['previous_year_full']); popn[a] = int(r['population']); rate[a] = cnt[a] / popn[a] * 1e5
    expect(t, f'{rate[a]:.1f}', f'peer rate {a}')
se2 = {a: cnt[a] / (popn[a] / 1e5) ** 2 for a in rate}
higher = sum((rate[a] - rate['New York City']) / math.sqrt(se2[a] + se2['New York City']) >= 1.96 for a in rate if a != 'New York City')
expect(t, f'lower than in {nw(higher)} of the eight other largest U.S. cities', 'peer headline')
# notable trends: chance, the citywide trend and Benjamini-Hochberg across every precinct-and-crime pair
NOTABLE = ['Murder', 'Shooting Vic.', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'G.L.A.', 'Gr. Larceny']
pairs = []
for n in NOTABLE:
    C, P = row('citywide', n)
    pi = (C / P) / (1 + C / P)
    for k in d:
        if 'Precinct' not in k or not get(k, n): continue
        cc, pp = row(k, n)
        if cc + pp == 0: continue
        f = phi(n, 'precinct'); nn = cc + pp
        zr = math.copysign(max(0, abs(cc - nn * pi) - 0.5), cc - nn * pi) / math.sqrt(f * nn * pi * (1 - pi))
        za = z(cc, pp, f)
        pairs.append(dict(geo=k, n=n, cc=cc, pp=pp, za=za, zr=zr, p=math.erfc(abs(zr) / math.sqrt(2)), fr=fragile(k, n, cc, pp, f), cityPct=(C - P) / P * 100))
order = sorted(range(len(pairs)), key=lambda i: pairs[i]['p']); kmax = 0
for r_, i in enumerate(order):
    if pairs[i]['p'] <= (r_ + 1) / len(pairs) * 0.05: kmax = r_ + 1
kept = set(order[:kmax])
notable = [x for i, x in enumerate(pairs) if i in kept and not x['fr'] and ((x['za'] >= 1.96 and x['zr'] > 0) or (x['za'] <= -1.96 and x['zr'] < 0))]
ups = sorted([x for x in notable if x['zr'] > 0], key=lambda x: -abs(x['zr'])); downs = sorted([x for x in notable if x['zr'] < 0], key=lambda x: -abs(x['zr']))
print(f'notable: {len(ups)} rises, {len(downs)} drops of {len(pairs)} pairs')
LBL = {'Murder': 'Murder', 'Shooting Vic.': 'Shooting victims', 'Rape': 'Rape', 'Robbery': 'Robbery', 'Fel. Assault': 'Felony assault', 'Burglary': 'Burglary', 'G.L.A.': 'Vehicle theft', 'Gr. Larceny': 'Grand larceny'}
def prose(v): return 'unchanged' if round(abs(v)) == 0 else f'{"down" if v < 0 else "up"} {round(abs(v))}%'
for i, x in enumerate(ups[:1] + downs[:1]):
    lbl = LBL[x['n']]; ch = prose((x['cc'] - x['pp']) / x['pp'] * 100); cp = prose(x['cityPct'])
    sent = (f"From Jan. 1 to Sept. 20, {lbl[0].lower() + lbl[1:]} is {ch} in the {x['geo']} compared with the same dates in 2025; citywide, it's {cp}." if i == 0
            else f"{lbl} is {ch} in the {x['geo']}; citywide, it's {cp}.")
    expect(t, sent, f"trends title {x['geo']} {x['n']}")
expect(t.upper(), 'CITYWIDE · YEAR TO DATE, JAN. 1-SEPT. 20, 2026, VS. THE SAME DATES IN 2025', 'kicker names the comparison')
expect(t, f'{len(ups)} rises and {len(downs)} drops clear all three citywide so far this year', 'trends receipt counts')
# where robbery's citywide drop came from
C, P = row('citywide', 'Robbery'); net = C - P
moves = sorted([(k, row(k, 'Robbery')[0] - row(k, 'Robbery')[1]) for k in d if 'Precinct' in k and get(k, 'Robbery')], key=lambda m: m[1])[:5]
listed = '; '.join(k.replace(' Precinct', '') + ', -' + str(abs(v)) for k, v in moves)
share = round(sum(v for _, v in moves) / net * 100)
expect(t, f'Robbery fell by {fmt(abs(net))} citywide. The five biggest precinct drops ({listed}) add up to {share}% of that.', 'robbery contributions')
# murder's run of annual declines
mur = [(r['y'], r['Murder']) for r in hist]
yrs_down = 0
while yrs_down + 1 < len(mur) and mur[-1 - yrs_down][1] < mur[-2 - yrs_down][1]: yrs_down += 1
expect(t, f'Murder: down {nw(yrs_down)} years in a row through 2025, from {fmt(mur[-1 - yrs_down][1])} in {mur[-1 - yrs_down][0]} to {fmt(mur[-1][1])}', 'murder annual run')
print(f'{oks} checks passed, {len(fails)} failed')
print('\n'.join(fails[:40]))
sys.exit(1 if fails else 0)
