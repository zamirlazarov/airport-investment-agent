import { describe, expect, it } from "vitest";
import type { RouteRecord } from "../types.ts";
import { longHaulShare } from "./long-haul.ts";

const route = (dest: string, miles: number, deps: number, otherDeps = 0): RouteRecord => ({
  dest, destCity: `${dest} City`, destCountry: "US", miles,
  deps: [deps], seats: [deps * 100], pax: [deps * 80], otherDeps,
});

describe("longHaulShare", () => {
  const routes = [route("AAA", 2000, 60), route("BBB", 3000, 40)];

  it("shares passenger departures at or above the threshold", () => {
    const r = longHaulShare(routes, 2500);
    expect(r.passengerFlights).toEqual({ departures: 100, longHaulDepartures: 40, sharePct: 40 });
    expect(r.thresholdMiles).toBe(2500);
  });

  it("counts a route of exactly the threshold as long haul", () => {
    expect(longHaulShare([route("AAA", 2500, 10), route("BBB", 2499, 10)], 2500).passengerFlights.sharePct).toBe(50);
  });

  it("adds other-class departures in the all-flights view only", () => {
    const r = longHaulShare([route("AAA", 2000, 60), route("BBB", 3000, 40, 100)], 2500);
    // all flights: 60 + 40 + 100 = 200 total, long haul 40 + 100 = 140 -> 70%
    expect(r.allFlights).toEqual({ departures: 200, longHaulDepartures: 140, sharePct: 70 });
    expect(r.passengerFlights.sharePct).toBe(40);
  });

  it("changes with the threshold", () => {
    expect(longHaulShare(routes, 3500).passengerFlights.sharePct).toBe(0);
    expect(longHaulShare(routes, 1000).passengerFlights.sharePct).toBe(100);
  });

  it("rounds the share to one decimal", () => {
    expect(longHaulShare([route("AAA", 3000, 1), route("BBB", 100, 2)], 2500).passengerFlights.sharePct).toBe(33.3);
  });

  it("buckets departures by distance, upper edge exclusive", () => {
    const r = longHaulShare(
      [route("A", 499, 1), route("B", 500, 2), route("C", 1499, 4), route("D", 2500, 8), route("E", 3999, 16), route("F", 4000, 32, 3)],
      2500,
    );
    expect(r.buckets.map((b) => [b.minMiles, b.maxMiles])).toEqual([[0, 500], [500, 1000], [1000, 1500], [1500, 2500], [2500, 4000], [4000, null]]);
    expect(r.buckets.map((b) => b.passengerDepartures)).toEqual([1, 2, 4, 0, 24, 32]);
    expect(r.buckets.map((b) => b.allDepartures)).toEqual([1, 2, 4, 0, 24, 35]);
  });

  it("lists the biggest long-haul routes by all-flight departures", () => {
    const r = longHaulShare([route("A", 3000, 5), route("B", 4000, 2, 50), route("C", 1000, 99)], 2500);
    expect(r.topLongHaulRoutes.map((x) => x.dest)).toEqual(["B", "A"]);
    expect(r.topLongHaulRoutes[0]).toMatchObject({ miles: 4000, departures: 52, passengerDepartures: 2 });
  });

  it("returns nulls and zeros for no routes", () => {
    const r = longHaulShare([], 2500);
    expect(r.passengerFlights).toEqual({ departures: 0, longHaulDepartures: 0, sharePct: null });
    expect(r.allFlights.sharePct).toBeNull();
    expect(r.topLongHaulRoutes).toEqual([]);
  });

  it("stays finite on all-zero routes (dirty data)", () => {
    const zero: RouteRecord = { dest: "ZZZ", destCity: "Z", destCountry: "US", miles: 0, deps: [0, 0], seats: [0, 0], pax: [0, 0], otherDeps: 0 };
    const text = JSON.stringify(longHaulShare([zero], 2500));
    expect(text).not.toMatch(/NaN|Infinity/);
  });
});
