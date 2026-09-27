"""Measure how much each CompStat line varies from week to week, compared with a plain random count.

The page's chance test compares this year's count with last year's. A plain random (Poisson) count
has variance equal to its mean; crime counts vary more (one shooting can wound several people, and
violence clusters). This script measures the excess, the "dispersion" (variance / mean; 1 = Poisson),
from NYPD's own weekly numbers, and the page widens the chance test by its square root.

Method: for each place and each line, take the weekly counts from consecutive archived CompStat
reports (this year's first counts and last year's settled counts for the same weeks). Differencing
neighboring weeks removes slow trends and seasons: if counts were Poisson around a slowly moving mean,
E[(x[t+1] - x[t])^2] = x[t] + x[t+1] on average. Dispersion = sum of squared differences / sum of
(x[t] + x[t+1]), pooled over the places at each level (citywide, patrol borough, precinct).
Clustering that spans several weeks isn't caught, so these values are, if anything, too low.

Run from the repo root:
  python3 tools/dispersion/build_dispersion.py path/to/nypd-compstat-scraper/data/archive
Writes src/bold/dispersion.json.
"""
import glob, json, os, sys
from datetime import date

def week_end(d):
    m, dd, y = (int(x) for x in d['citywide']['report_period']['week_end'].split('/'))
    return date(y, m, dd)

def lines(geo):
    out = {}
    for grp in ('seven_major_felonies', 'additional_stats'):
        for name, s in (geo.get(grp) or {}).items():
            w = (s or {}).get('week_to_date') or {}
            out[name] = (w.get('current_year'), w.get('prior_year'))
    return out

def level_of(key):
    if key == 'citywide': return 'city'
    return 'precinct' if 'Precinct' in key else 'borough'

def main():
    arch = sys.argv[1]
    snaps = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(arch, '*.json')))]
    snaps = sorted((s for s in snaps if s.get('citywide')), key=week_end)
    num, den, pairs = {}, {}, 0
    majors = ['Murder', 'Rape', 'Robbery', 'Fel. Assault', 'Burglary', 'Gr. Larceny', 'G.L.A.']
    for a, b in zip(snaps, snaps[1:]):
        if (week_end(b) - week_end(a)).days != 7:
            continue
        pairs += 1
        for key in b:
            if key not in a:
                continue
            la, lb = lines(a[key]), lines(b[key])
            # the seven-major total, measured directly, to check whether lines move together
            la['_majors'] = tuple(sum(la.get(n, (0, 0))[i] or 0 for n in majors) for i in (0, 1))
            lb['_majors'] = tuple(sum(lb.get(n, (0, 0))[i] or 0 for n in majors) for i in (0, 1))
            lvl = level_of(key)
            for name, (ca, pa) in la.items():
                cb, pb = lb.get(name, (None, None))
                for x0, x1 in ((ca, cb), (pa, pb)):
                    if not (isinstance(x0, (int, float)) and isinstance(x1, (int, float))):
                        continue
                    k = (lvl, name)
                    num[k] = num.get(k, 0) + (x1 - x0) ** 2
                    den[k] = den.get(k, 0) + x0 + x1
    out = {}
    for (lvl, name), n in sorted(num.items()):
        d = den[(lvl, name)]
        if d > 0:
            out.setdefault(name, {})[lvl] = round(n / d, 2)
    result = {
        '_source': 'tools/dispersion/build_dispersion.py over NYPD weekly CompStat reports archived by nypd-compstat-scraper',
        '_weeks': f'{week_end(snaps[0]).isoformat()} to {week_end(snaps[-1]).isoformat()}',
        '_pairs': pairs,
        '_note': 'variance / mean of weekly counts (1 = a plain random count), pooled by level; the page never uses less than 1',
        'lines': out,
    }
    json.dump(result, open('src/bold/dispersion.json', 'w'), indent=1)
    for name, v in sorted(out.items()):
        print(f"{name:20} city {v.get('city', '-'):>5}  borough {v.get('borough', '-'):>5}  precinct {v.get('precinct', '-'):>5}")
    print(pairs, 'consecutive pairs')

if __name__ == '__main__':
    main()
