"""Build the headline gazetteer the press layer uses to place stories in precincts.

A story is pinned to a precinct only when its headline names a neighborhood that lies almost
entirely inside that one precinct. "Almost entirely" is measured, not guessed: each name is traced
to the city's 2020 Neighborhood Tabulation Areas (NYC Open Data 9nt8-h7nd), and the share of that
area falling in each precinct (src/data/nyc_precincts.json, the same shapes the maps draw) is
computed. Names below THRESHOLD in any one precinct are kept as "New York City places" (they tell
us a story is local) but are never used to place a pin.

Run from the repo root:  python3 tools/places/build_places.py [path/to/nta2020.geojson]
Writes src/bold/press-places.json. Needs shapely and pyproj.
"""
import json, re, sys, urllib.request
from collections import defaultdict
from shapely.geometry import shape
from shapely.ops import transform, unary_union
from pyproj import Transformer

THRESHOLD = 0.85
NTA_URL = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=500'
KEEP_TYPES = {'0', '9'}  # residential areas and parks; skip cemeteries, airports, Rikers
# Names that routinely mean something else in a headline: a street or venue, another town or
# country, or an ordinary word. They are never used, either to place a story or to call it local.
SKIP = {
    'Madison', 'Belmont', 'Corona', 'Jamaica', 'Chelsea', 'Concourse', 'Kensington', 'Woodlawn',
    'Country Club', 'City Line', 'Highland Park', 'Fort Totten', 'Spring Creek', 'Floral Park',
    'New Hyde Park', 'Inwood', 'Eastchester', 'Longwood', 'Claremont', 'Norwood', 'Sunnyside',
    'Glendale', 'Woodside', 'Auburndale', 'Hollis', 'Melrose', 'Wakefield', 'Bellerose', 'Rosedale',
    'Allerton', 'Mount Hope', 'Parkville', 'Wingate', 'Farragut', 'Rugby', 'Erasmus', 'Remsen Village',
    'Arlington', 'Clifton', 'Travis', 'Silver Lake', 'Woodrow', 'Charleston', 'Oakwood', 'Willowbrook',
    'Utopia', 'Hillcrest', 'Clearview', 'Park Hill', 'Shore Acres', 'South Beach', 'Brookville',
    'Steinway', 'Bayswater', 'Schuylerville', 'Bruckner', 'Bronx River', 'Manhattan Beach', 'United Nations',
    'Brooklyn Navy Yard', 'Madison Square', 'Jamaica Bay',
}
# Names whose everyday sense is bigger than the city's official area, so a headline using them can
# point outside the precinct the official area sits in. They mark a story as local but never place it.
LOOSE = {
    'Flatbush',          # used for East Flatbush and Prospect Lefferts Gardens too
    'Long Island City',  # often stretches to Queensbridge and Dutch Kills, in the 114th
    'LIC',
    'Fordham',           # Fordham Road and the Fordham section run through the 46th, 48th and 52nd
}
ALIASES = {'Bedford-Stuyvesant': ['Bed-Stuy'], 'Long Island City': ['LIC'], 'Stuyvesant Town': ['Stuy Town'],
           "Hell's Kitchen": ['Hells Kitchen'], "Mariner's Harbor": ['Mariners Harbor'], "Prince's Bay": ['Princes Bay']}
KEEP_HYPHEN = ['Bedford-Stuyvesant', 'Co-op City', 'Stuyvesant Town-Peter Cooper Village']

def components(ntaname):
    """'Downtown Brooklyn-DUMBO-Boerum Hill' -> ['Downtown Brooklyn', 'DUMBO', 'Boerum Hill'];
    'Crown Heights (North)' -> ['Crown Heights']."""
    s = ntaname
    for k in KEEP_HYPHEN:
        s = s.replace(k, k.replace('-', '‑'))
    parts = [p.replace('‑', '-') for p in s.split('-')]
    out = []
    for p in parts:
        p = re.sub(r'\s*\([^)]*\)', '', p).strip()
        if p == 'Stuyvesant Town-Peter Cooper Village':
            out += ['Stuyvesant Town', 'Peter Cooper Village']
        elif p:
            out.append(p)
    return out

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    nta = json.load(open(src)) if src else json.load(urllib.request.urlopen(NTA_URL, timeout=120))
    pcts = json.load(open('src/data/nyc_precincts.json'))
    to_ft = Transformer.from_crs('EPSG:4326', 'EPSG:2263', always_xy=True).transform
    pshapes = [(int(f['properties']['precinct']), transform(to_ft, shape(f['geometry']).buffer(0))) for f in pcts['features']]

    areas = defaultdict(list)   # name -> [shapely geoms]
    boros = defaultdict(set)
    for f in nta['features']:
        p = f['properties']
        if p.get('ntatype') not in KEEP_TYPES:
            continue
        g = transform(to_ft, shape(f['geometry']).buffer(0))
        for name in components(p['ntaname']):
            areas[name].append(g)
            boros[name].add(p['boroname'])

    places, local_only = {}, {}
    for name, geoms in sorted(areas.items()):
        if name in SKIP or len(name) < 4:
            continue
        g = unary_union(geoms)
        total = g.area
        shares = sorted(((pg.intersection(g).area / total, n) for n, pg in pshapes if pg.intersects(g)), reverse=True)
        top_share, top = shares[0] if shares else (0, None)
        row = {'boro': sorted(boros[name])[0] if len(boros[name]) == 1 else None,
               'share': round(top_share, 3), 'precinct': top,
               'split': [[n, round(s, 2)] for s, n in shares[:3] if s >= 0.05]}
        if len(boros[name]) == 1 and top_share >= THRESHOLD and name not in LOOSE:
            places[name] = row
        else:
            local_only[name] = row
    for name, al in ALIASES.items():
        for a in al:
            if name in places and a not in LOOSE: places[a] = dict(places[name], alias_of=name)
            elif name in places or name in local_only: local_only[a] = dict(places.get(name) or local_only[name], alias_of=name)

    out = {
        '_source': 'NYC 2020 Neighborhood Tabulation Areas (NYC Open Data 9nt8-h7nd) intersected with the precinct shapes in src/data/nyc_precincts.json by tools/places/build_places.py',
        '_rule': f'A name places a story only if at least {int(THRESHOLD*100)}% of its area lies in one precinct.',
        'threshold': THRESHOLD,
        'places': places,
        'localOnly': local_only,
    }
    json.dump(out, open('src/bold/press-places.json', 'w'), indent=1, ensure_ascii=False)
    print(len(places), 'placeable names;', len(local_only), 'local-only names')

if __name__ == '__main__':
    main()
