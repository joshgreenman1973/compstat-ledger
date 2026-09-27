/* Resident populations for per-resident rates.
 *
 * The latest count by precinct is the 2020 Census (April 1, 2020), via John Keefe's census-by-precincts
 * crosswalk (github.com/jkeefe/census-by-precincts), held in App.js as GEO_POPULATIONS. The Census
 * Bureau's newest estimates (Vintage 2025, for July 1, 2025) go down only to boroughs, and the city lost
 * 2.5% of its residents between the two, so rates on the 2020 counts would run 2 to 5% low. Each
 * precinct's 2020 count is therefore moved by its borough's change from the 2020 count to the July 2025
 * estimate. That assumes every precinct in a borough changed at the borough's pace; nothing more local
 * is published.
 *
 * Source: U.S. Census Bureau, Population Estimates Program (Vintage 2025), as tabulated in NYC City
 * Planning, "New York City Population Estimates and Trends," July 2026, Appendix A:
 * https://s-media.nyc.gov/agencies/dcp/assets/files/pdf/data-tools/population/population-estimates/new-york-city-population-estimates-and-trends-july-2026.pdf
 * Change is measured from the 2020 Census count, as City Planning does, not from the Bureau's
 * estimates base.
 */

export const ESTIMATE_DATE = 'July 1, 2025';
export const ESTIMATE_YEAR = 2025;

export const CENSUS_2020 = { Manhattan: 1694251, Bronx: 1472654, Brooklyn: 2736074, Queens: 2405464, 'Staten Island': 495747 };
export const ESTIMATE_2025 = { Manhattan: 1664862, Bronx: 1406332, Brooklyn: 2653963, Queens: 2358182, 'Staten Island': 501290 };
export const CITY_CENSUS_2020 = 8804190;
export const CITY_POPULATION = 8584629; // July 1, 2025 estimate; the five boroughs sum to it exactly

// The borough whose change a precinct takes: NYPD's own assignment (its patrol boroughs). A few
// places sit in one county but another borough's precinct (Roosevelt Island in the 114th, Marble Hill
// in the 50th, Rikers Island in the 114th); they take the precinct's borough, a difference of a few
// hundred residents at most.
export function boroughOfPrecinct(num) {
  const n = parseInt(num, 10);
  if (n >= 1 && n <= 34) return 'Manhattan';
  if (n >= 40 && n <= 52) return 'Bronx';
  if (n >= 60 && n <= 94) return 'Brooklyn';
  if (n >= 100 && n <= 116) return 'Queens';
  if (n >= 120 && n <= 123) return 'Staten Island';
  return null;
}

export const boroughChange = (borough) => (CENSUS_2020[borough] ? ESTIMATE_2025[borough] / CENSUS_2020[borough] : null);

// pop2020: { '1st Precinct': 84799, ... } (other keys, such as patrol boroughs, are dropped).
export function currentPopulations(pop2020) {
  const out = {};
  Object.entries(pop2020 || {}).forEach(([key, n]) => {
    if (!/Precinct/.test(key) || !(n > 0)) return;
    const f = boroughChange(boroughOfPrecinct(key));
    if (f) out[key] = Math.round(n * f);
  });
  return out;
}
