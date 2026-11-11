import { beforeEach, describe, expect, it, vi } from "vitest";
import { MINI_SNAPSHOT } from "./__fixtures__/mini-snapshot.ts";

// Expected values are worked out by hand from lib/__fixtures__/mini-snapshot.ts (constant months,
// 12 of them). None comes from running the code under test.

vi.mock("./data/snapshot.ts", () => ({
  getSnapshot: () => MINI_SNAPSHOT,
  getAirport: (code: string) => MINI_SNAPSHOT.airports[code.toUpperCase()],
  listAirports: () => Object.values(MINI_SNAPSHOT.airports),
}));
vi.mock("./data/faa.ts", () => ({ getInfra: async () => ({ infra: new Map(), error: null }) }));

const { airportMetrics, longHaul, rankAirports, unmet, resetAnalysisCache } = await import("./analysis.ts");
beforeEach(() => resetAnalysisCache());

describe("analysis on the hand-checked mini snapshot", () => {
  it("load factor and passenger growth", async () => {
    const aaa = (await airportMetrics("AAA")).result;
    // AAA: passengers 12 x 21,000 = 252,000; seats 12 x 25,000 = 300,000; 252,000 / 300,000 = 84.0%
    expect(aaa.passengers).toBe(252_000);
    expect(aaa.loadFactorPct).toBe(84);
    // pax 200,000 (2023) -> 242,000 (2025): 1.21 over 2 years = 10% a year; seats flat
    expect(aaa.paxCagrPct).toBe(10);
    expect(aaa.growthGapPct).toBe(10);
    // BBB: 9,500 / 10,000 = 95.0%; CCC: 24,000 / 30,000 = 80.0%
    expect((await airportMetrics("BBB")).result.loadFactorPct).toBe(95);
    expect((await airportMetrics("CCC")).result.loadFactorPct).toBe(80);
  });

  it("long-haul share in both views", async () => {
    const r = (await longHaul("AAA")).result;
    // XX2 is 3,000 miles (>= 2,500): 12 x 50 = 600 of 12 x 150 = 1,800 passenger departures = 33.3%
    expect(r.passengerFlights).toEqual({ departures: 1800, longHaulDepartures: 600, sharePct: 33.3 });
    // plus 600 other-class departures on XX2: (600 + 600) / (1,800 + 600) = 1,200 / 2,400 = 50.0%
    expect(r.allFlights).toEqual({ departures: 2400, longHaulDepartures: 1200, sharePct: 50 });
    // At a 500-mile threshold every AAA route counts, and BBB's 500-mile route counts exactly.
    expect((await longHaul("BBB", { thresholdMiles: 500 })).result.passengerFlights.sharePct).toBe(100);
  });

  it("the demand-pressure proxy", async () => {
    const b = (await unmet("BBB")).result;
    // BBB: LF 0.95 every month; 10,000 x (0.95 - 0.80) = 1,500 a month x 12 = 18,000
    expect(b.excessLoadPassengers).toBe(18_000);
    // 100 seats per departure (10,000 / 100): 18,000 / 100 = 180 departures
    expect(b.excessLoadEquivalentDepartures).toBe(180);
    // 18,000 / 114,000 passengers = 15.8%
    expect(b.excessLoadSharePct).toBe(15.8);
    expect(b.byMonth[0]).toEqual({ month: "2025-08", loadFactorPct: 95, excessLoadPassengers: 1500 });
    // CCC is at exactly 0.80 every month: nothing above the threshold
    const c = (await unmet("CCC")).result;
    expect(c.excessLoadPassengers).toBe(0);
    expect(c.topRoutes).toEqual([]);
    // AAA at 85%: only XX2 (LF 0.9) is above: 10,000 x 0.05 = 500 a month x 12 = 6,000
    expect((await unmet("AAA", { lfThreshold: 0.85 })).result.excessLoadPassengers).toBe(6000);
  });

  it("ranks the three peers", async () => {
    const env = await rankAirports({});
    // No FAA data, so congestion is the peak-month factor: 1.0 for all three, tied, percentile 50 each.
    // Demand pressure: BBB (83.33 + 83.33) / 2, AAA 50, CCC 16.67. Growth only exists for AAA: 50.
    // Scale: CCC 83.33, AAA 50, BBB 16.67.
    // AAA = 50. BBB = (0.35 x 83.33 + 0.25 x 50 + 0.15 x 16.67) / 0.75 = 58.89. CCC = (5.83 + 12.5 + 12.5) / 0.75 = 41.11.
    expect(env.result.ranking.map((r) => r.code)).toEqual(["BBB", "AAA", "CCC"]);
    expect(env.result.ranking.map((r) => r.score)).toEqual([58.89, 50, 41.11]);
    expect(env.result.ranking[1]!.components).toEqual({ demandPressure: 50, growth: 50, congestion: 50, scale: 50 });
  });
});
