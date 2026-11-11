import type { AirportRecord, RouteRecord, Snapshot } from "../types.ts";

// Three tiny airports with constant monthly values, small enough to check by hand.
// The expected results are written out as literals in lib/analysis.reference.test.ts.

const MONTHS = ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
const flat = (v: number) => MONTHS.map(() => v);

const route = (dest: string, miles: number, deps: number, seats: number, pax: number, otherDeps = 0): RouteRecord => ({
  dest, destCity: `${dest} City`, destCountry: "US", miles, deps: flat(deps), seats: flat(seats), pax: flat(pax), otherDeps,
});

const AAA: AirportRecord = {
  code: "AAA", city: "Alphaville", state: "AA",
  deps: flat(150), seats: flat(25_000), pax: flat(21_000), allDeps: flat(200),
  yearly: { "2023": { deps: 1000, seats: 300_000, pax: 200_000 }, "2025": { deps: 1000, seats: 300_000, pax: 242_000 } },
  routes: [route("XX1", 800, 100, 15_000, 12_000), route("XX2", 3000, 50, 10_000, 9_000, 600)],
};
const BBB: AirportRecord = {
  code: "BBB", city: "Betatown", state: "BB",
  deps: flat(100), seats: flat(10_000), pax: flat(9_500), allDeps: flat(100), yearly: {},
  routes: [route("XX3", 500, 100, 10_000, 9_500)],
};
const CCC: AirportRecord = {
  code: "CCC", city: "Gammaburg", state: "CC",
  deps: flat(200), seats: flat(30_000), pax: flat(24_000), allDeps: flat(200), yearly: {},
  routes: [route("XX4", 1000, 200, 30_000, 24_000)],
};

export const MINI_SNAPSHOT: Snapshot = {
  meta: { generatedAt: "2026-11-11T00:00:00.000Z", months: MONTHS, years: [2019, 2023, 2024, 2025], latestMonth: "2026-07", rowCounts: {} },
  airports: { AAA, BBB, CCC },
};
