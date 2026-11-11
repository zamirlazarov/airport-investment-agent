import type { T100Row } from "../t100-aggregate.ts";

// Hand-written rows. The expected aggregate lives in t100-aggregate.test.ts, also by hand.
// Short form: [year, month, class, origin, dest, distance, deps, seats, pax].
const row = (
  year: number,
  month: number,
  cls: string,
  origin: string,
  dest: string,
  distance: number,
  deps: number,
  seats: number,
  pax: number,
  extra: Partial<T100Row> = {},
): T100Row => ({
  year,
  month,
  class: cls,
  origin,
  originCity: origin === "SFO" ? "San Francisco, CA" : origin === "SNA" ? "Santa Ana, CA" : `${origin}, ZZ`,
  originState: origin === "SFO" || origin === "SNA" ? "CA" : "ZZ",
  originCountry: "US",
  dest,
  destCity: `${dest} City`,
  destCountry: "US",
  distance,
  deps,
  seats,
  pax,
  ...extra,
});

export const FIXTURE_MONTHS = ["2026-01", "2026-02"];
export const FIXTURE_YEARS = [2023, 2025];

export const FIXTURE_ROWS: T100Row[] = [
  // Two carriers on SFO-JFK in January: summed.
  row(2026, 1, "F", "SFO", "JFK", 2586, 31, 5000, 4000),
  row(2026, 1, "F", "SFO", "JFK", 2586, 30, 4000, 3500),
  row(2026, 2, "F", "SFO", "JFK", 2586, 28, 4500, 4200),
  row(2026, 1, "F", "SFO", "LAX", 337, 100, 10000, 9000),
  row(2026, 2, "F", "SFO", "LAX", 337, 90, 9000, 8100),
  // Class G: counts toward allDeps and otherDeps only. One G-only route.
  row(2026, 1, "G", "SFO", "JFK", 2586, 5, 0, 0),
  row(2026, 1, "G", "SFO", "ANC", 2018, 7, 0, 0),
  // Outside the month list and outside the year list: ignored completely.
  row(2026, 3, "F", "SFO", "LAX", 337, 99, 9900, 9000),
  // Inside a requested year, outside the month list: yearly only.
  row(2025, 6, "F", "SFO", "JFK", 2586, 40, 6000, 5000),
  row(2023, 6, "F", "SFO", "LAX", 337, 50, 5000, 4000),
  // International destination is kept.
  row(2026, 1, "F", "SFO", "ZRH", 5900, 30, 9000, 8000, { destCountry: "CH" }),
  // Foreign origin: dropped.
  row(2026, 1, "F", "YYZ", "SFO", 1000, 40, 6000, 5000, { originCountry: "CA" }),
  // Zero seats, and a route flown in one month only.
  row(2026, 2, "F", "SFO", "SJC", 30, 3, 0, 0),
  // Below 2,500 passengers in the window: the whole airport is omitted.
  row(2026, 1, "F", "XYZ", "SFO", 500, 10, 500, 400),
  row(2026, 1, "F", "SNA", "DEN", 846, 20, 3000, 2700),
  row(2026, 2, "F", "SNA", "DEN", 846, 18, 2700, 2500),
];
