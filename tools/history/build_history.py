"""Build the annual citywide history the "read closely" view charts (src/bold/annual-history.json).

2000-2025, seven major felonies: NYPD's own table, "Seven Major Felony Offenses 2000-2025"
  https://www.nyc.gov/assets/nypd/downloads/excel/analysis_and_planning/historical-crime-data/seven-major-felony-offenses-2000-2025.xls
1993-1999, and shooting incidents in every year: carried over from src/data/crime_history.json, the
  classic view's compilation. An outside check (Sept. 26, 2026) found its 1993 and 1998 figures match
  NYPD CompStat's historical columns and its shootings from 2006 on match NYC Open Data within one;
  1994-1997 and 1999 couldn't be matched to a published NYPD table.

The classic view keeps reading crime_history.json unchanged.

Run from the repo root (needs xlrd):
  python3 tools/history/build_history.py [path/to/seven-major-felony-offenses-2000-2025.xls]
"""
import json, sys, urllib.request, tempfile
import xlrd

URL = 'https://www.nyc.gov/assets/nypd/downloads/excel/analysis_and_planning/historical-crime-data/seven-major-felony-offenses-2000-2025.xls'
ROWS = {
    'MURDER & NON-NEGL. MANSLAUGHTER': 'Murder', 'RAPE': 'Rape', 'ROBBERY': 'Robbery', 'FELONY ASSAULT': 'Fel. Assault',
    'BURGLARY': 'Burglary', 'GRAND LARCENY': 'Gr. Larceny', 'GRAND LARCENY OF MOTOR VEHICLE': 'G.L.A.',
}

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
        path = tempfile.mktemp(suffix='.xls')
        open(path, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    header = next(r for r in range(sh.nrows) if str(sh.cell_value(r, 0)).strip().upper() == 'OFFENSE')
    years = [int(v) for v in sh.row_values(header)[1:] if str(v).strip()]
    nypd = {}
    for r in range(header + 1, sh.nrows):
        name = str(sh.cell_value(r, 0)).strip().upper()
        if name in ROWS:
            for y, v in zip(years, sh.row_values(r)[1:]):
                nypd.setdefault(y, {})[ROWS[name]] = int(v)
    missing = set(ROWS.values()) - set(nypd.get(2025, {}))
    if missing:
        sys.exit(f'NYPD table is missing {missing}; stopping')
    old = {d['y']: d for d in json.load(open('src/data/crime_history.json'))['citywide']}
    out = []
    for y in sorted(set(old) | set(nypd)):
        row = {'y': y}
        if y in nypd:
            row.update(nypd[y])
        else:
            row.update({k: v for k, v in old[y].items() if k in ROWS.values()})
        if 'Shooting Inc.' in old.get(y, {}):
            row['Shooting Inc.'] = old[y]['Shooting Inc.']
        out.append(row)
    json.dump({
        '_sources': {
            '2000-2025 majors': URL,
            '1993-1999 majors and all shooting incidents': 'src/data/crime_history.json (classic view compilation)',
        },
        'citywide': out,
    }, open('src/bold/annual-history.json', 'w'), indent=1)
    changed = sum(1 for d in out if d['y'] in old and any(old[d['y']].get(k) != d.get(k) for k in ROWS.values()))
    print(f'wrote {len(out)} years; {changed} years differ from crime_history.json')

if __name__ == '__main__':
    main()
