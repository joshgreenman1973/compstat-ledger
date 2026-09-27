import * as P from './population';

test('borough figures add up to the city', () => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  expect(sum(P.CENSUS_2020)).toBe(P.CITY_CENSUS_2020);
  expect(sum(P.ESTIMATE_2025)).toBe(P.CITY_POPULATION);
});

test('precincts map to their NYPD borough', () => {
  expect(P.boroughOfPrecinct('1st Precinct')).toBe('Manhattan');
  expect(P.boroughOfPrecinct('34th Precinct')).toBe('Manhattan');
  expect(P.boroughOfPrecinct('50th Precinct')).toBe('Bronx');
  expect(P.boroughOfPrecinct('94th Precinct')).toBe('Brooklyn');
  expect(P.boroughOfPrecinct('116th Precinct')).toBe('Queens');
  expect(P.boroughOfPrecinct('123rd Precinct')).toBe('Staten Island');
  expect(P.boroughOfPrecinct('Bronx')).toBe(null);
});

test('each precinct moves by its borough change and patrol-borough keys are dropped', () => {
  const cur = P.currentPopulations({ '40th Precinct': 100929, '120th Precinct': 122308, Bronx: 1477472 });
  expect(cur['40th Precinct']).toBe(Math.round(100929 * 1406332 / 1472654));
  expect(cur['120th Precinct']).toBe(Math.round(122308 * 501290 / 495747));
  expect(cur['120th Precinct']).toBeGreaterThan(122308); // Staten Island grew; the rest shrank
  expect(cur.Bronx).toBeUndefined();
});

test('every borough is covered and the city total is preserved', () => {
  // One stand-in precinct per borough, sized at its borough's 2020 count: the moved figures must add
  // up to the city's July 2025 estimate, give or take rounding.
  const fixture = { '13th Precinct': 1694251, '44th Precinct': 1472654, '75th Precinct': 2736074, '109th Precinct': 2405464, '122nd Precinct': 495747 };
  const cur = P.currentPopulations(fixture);
  expect(Object.keys(cur)).toHaveLength(5);
  expect(Object.values(cur).reduce((a, b) => a + b, 0)).toBe(P.CITY_POPULATION);
});
