import { describe, expect, it } from "vitest";
import { LIMITS } from "../envelope.ts";
import type { RouteRecord } from "../types.ts";
import { UNMET_DEMAND_INTERPRETATION, unmetDemandProxy } from "./unmet-demand.ts";

const months = ["2026-01", "2026-02"];
const route = (dest: string, deps: number[], seats: number[], pax: number[], miles = 1000): RouteRecord => ({
  dest, destCity: `${dest} City`, destCountry: "US", miles, deps, seats, pax, otherDeps: 0,
});
const opts = { lfThreshold: 0.8, topRoutes: 5 };

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  return [];
}

describe("unmetDemandProxy", () => {
  it("counts passengers carried above the threshold load", () => {
    // 1,000 seats x (0.9 - 0.8) = 100 passengers; 10 departures of 100 seats each -> 100 / 100 = 1 departure
    const r = unmetDemandProxy([route("AAA", [10, 0], [1000, 0], [900, 0])], months, opts);
    expect(r.excessLoadPassengers).toBe(100);
    expect(r.excessLoadEquivalentDepartures).toBe(1);
    expect(r.excessLoadSharePct).toBe(11.1); // 100 / 900
    expect(r.lfThreshold).toBe(0.8);
  });

  it("gives nothing at exactly the threshold or with no seats", () => {
    expect(unmetDemandProxy([route("AAA", [10, 5], [1000, 0], [800, 0])], months, opts).excessLoadPassengers).toBe(0);
  });

  it("treats passengers above seats as a full flight", () => {
    // 1,000 seats, 1,200 passengers -> LF capped at 1.0 -> 1000 x (1.0 - 0.8) = 200
    expect(unmetDemandProxy([route("AAA", [10, 0], [1000, 0], [1200, 0])], months, opts).excessLoadPassengers).toBe(200);
  });

  it("scores each route-month separately, so a slack month does not cancel a full one", () => {
    // Jan: 1,000 seats, 1,000 pax -> 1000 x 0.2 = 200. Feb: 1,000 seats, 500 pax -> 0.
    const r = unmetDemandProxy([route("AAA", [10, 10], [1000, 1000], [1000, 500])], months, opts);
    expect(r.excessLoadPassengers).toBe(200);
    expect(r.byMonth).toEqual([
      { month: "2026-01", loadFactorPct: 100, excessLoadPassengers: 200 },
      { month: "2026-02", loadFactorPct: 50, excessLoadPassengers: 0 },
    ]);
  });

  it("ranks routes by excess load and caps the list", () => {
    const routes = [
      route("LOW", [10, 0], [1000, 0], [850, 0]), // 50
      route("TOP", [10, 0], [1000, 0], [1000, 0]), // 200
      route("MID", [10, 0], [1000, 0], [900, 0]), // 100
      route("NON", [10, 0], [1000, 0], [500, 0]), // 0, left out
    ];
    const r = unmetDemandProxy(routes, months, { lfThreshold: 0.8, topRoutes: 2 });
    expect(r.topRoutes.map((x) => x.dest)).toEqual(["TOP", "MID"]);
    expect(r.topRoutes[0]).toMatchObject({ excessLoadPassengers: 200, excessLoadEquivalentDepartures: 2, loadFactorPct: 100 });
    expect(r.excessLoadPassengers).toBe(350);
  });

  it("is labelled as a proxy, never as observed lost demand, even with no routes", () => {
    for (const r of [unmetDemandProxy([], months, opts), unmetDemandProxy([route("A", [1, 1], [100, 100], [95, 95])], months, opts)]) {
      expect(r.metric).toBe("demand-pressure-proxy");
      expect(r.isObservedLostDemand).toBe(false);
      expect(r.interpretation).toBe(UNMET_DEMAND_INTERPRETATION);
    }
    expect(UNMET_DEMAND_INTERPRETATION).toBe(LIMITS.unmetDemandProxy);
  });

  it("uses no 'spill' or 'lost' wording in field names, apart from the explicit isObservedLostDemand flag", () => {
    const keys = keysOf(unmetDemandProxy([route("A", [1, 1], [100, 100], [95, 95])], months, opts));
    expect(keys.filter((k) => k !== "isObservedLostDemand" && /spill|lost/i.test(k))).toEqual([]);
  });

  it("stays finite on all-zero routes and empty input", () => {
    const zero = route("Z", [0, 0], [0, 0], [0, 0], 0);
    for (const r of [unmetDemandProxy([zero], months, opts), unmetDemandProxy([], months, opts)]) {
      expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
      expect(r.excessLoadPassengers).toBe(0);
      expect(r.excessLoadSharePct).toBeNull();
    }
  });
});
