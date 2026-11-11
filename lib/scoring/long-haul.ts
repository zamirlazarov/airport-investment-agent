import type { RouteRecord } from "../types.ts";
import { sum } from "./stats.ts";

export type ShareView = { departures: number; longHaulDepartures: number; sharePct: number | null };
export type LongHaulResult = {
  thresholdMiles: number;
  /** Scheduled passenger flights (T-100 class F). */
  passengerFlights: ShareView;
  /** Every class, including cargo and charter. */
  allFlights: ShareView;
  buckets: { label: string; minMiles: number; maxMiles: number | null; passengerDepartures: number; allDepartures: number }[];
  /** Long-haul routes by all-flight departures; `passengerDepartures` is the class F part. */
  topLongHaulRoutes: { dest: string; destCity: string; miles: number; departures: number; passengerDepartures: number }[];
};

const EDGES = [0, 500, 1000, 1500, 2500, 4000];

const round1 = (x: number) => Math.round(x * 10) / 10;
const view = (departures: number, longHaul: number): ShareView => ({
  departures,
  longHaulDepartures: longHaul,
  sharePct: departures > 0 ? round1((longHaul / departures) * 100) : null,
});

/** Share of departures on routes of at least `thresholdMiles`, in both the passenger-only and all-flights views. */
export function longHaulShare(routes: RouteRecord[], thresholdMiles: number): LongHaulResult {
  let passTotal = 0;
  let passLong = 0;
  let allTotal = 0;
  let allLong = 0;
  const buckets = EDGES.map((min, i) => {
    const max = EDGES[i + 1] ?? null;
    return {
      label: max === null ? `${min.toLocaleString("en-US")}+ mi` : `${min.toLocaleString("en-US")}–${(max - 1).toLocaleString("en-US")} mi`,
      minMiles: min,
      maxMiles: max,
      passengerDepartures: 0,
      allDepartures: 0,
    };
  });
  const top: LongHaulResult["topLongHaulRoutes"] = [];

  for (const r of routes) {
    const pass = sum(r.deps);
    const all = pass + r.otherDeps;
    passTotal += pass;
    allTotal += all;
    const long = r.miles >= thresholdMiles;
    if (long) {
      passLong += pass;
      allLong += all;
      if (all > 0) top.push({ dest: r.dest, destCity: r.destCity, miles: r.miles, departures: all, passengerDepartures: pass });
    }
    const bucket = [...buckets].reverse().find((b) => r.miles >= b.minMiles) ?? buckets[0]!;
    bucket.passengerDepartures += pass;
    bucket.allDepartures += all;
  }

  top.sort((a, b) => b.departures - a.departures || a.dest.localeCompare(b.dest));
  return {
    thresholdMiles,
    passengerFlights: view(passTotal, passLong),
    allFlights: view(allTotal, allLong),
    buckets,
    topLongHaulRoutes: top.slice(0, 5),
  };
}
