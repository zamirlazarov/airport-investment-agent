import { describe, expect, it } from "vitest";
import type { AirportRecord, Infra } from "../types.ts";
import { commonCongestionIndicators, congestionInputs, type CongestionInputs } from "./congestion.ts";

const airport = (deps: number[], allDeps: number[], pax: number[]): AirportRecord => ({
  code: "TST", city: "Test", state: "ZZ", deps, seats: deps.map(() => 0), pax, allDeps, yearly: {}, routes: [],
});
const infra = (usableRunwayCount: number, acreage: number | null): Infra => ({
  name: "Test", runways: [], usableRunwayCount, acreage, effectiveDate: null,
});
const inputs = (d: number | null, p: number | null, a: number | null): { congestion: CongestionInputs } => ({
  congestion: { departuresPerRunway: d, peakMonthFactor: p, boardingsPerAcre: a },
});

describe("congestionInputs", () => {
  // Class F departures: 40,000 in month one, then 360,000 spread over 11 months.
  const deps = [40_000, ...new Array<number>(11).fill(360_000 / 11)];
  const a = airport(deps, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 200], new Array<number>(12).fill(50_000));

  it("divides class F departures by usable runways", () => {
    // deps total = 40,000 + 360,000 = 400,000; 4 runways -> 100,000 each
    expect(congestionInputs(a, infra(4, 1000)).departuresPerRunway).toBe(100_000);
  });

  it("divides passengers by acres", () => {
    // pax total 600,000 over 500 acres = 1,200 per acre
    expect(congestionInputs(a, infra(4, 500)).boardingsPerAcre).toBe(1200);
  });

  it("computes the peak-month factor from all-class departures", () => {
    // total 1,300 over 12 months, mean 108.33; peak 200 -> 1.846 -> 1.85
    expect(congestionInputs(a, undefined).peakMonthFactor).toBe(1.85);
  });

  it("keeps the peak-month factor but nulls the FAA-based inputs when infra is missing", () => {
    expect(congestionInputs(a, undefined)).toEqual({ departuresPerRunway: null, peakMonthFactor: 1.85, boardingsPerAcre: null });
    expect(congestionInputs(a, null).departuresPerRunway).toBeNull();
  });

  it("nulls per-runway and per-acre values when there are no usable runways or no acreage", () => {
    expect(congestionInputs(a, infra(0, null))).toMatchObject({ departuresPerRunway: null, boardingsPerAcre: null });
  });

  it("is all null for an airport with no departures at all, without NaN", () => {
    const empty = congestionInputs(airport([0, 0], [0, 0], [0, 0]), infra(2, 100));
    expect(empty.peakMonthFactor).toBeNull();
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/);
  });
});

describe("commonCongestionIndicators", () => {
  const full = () => inputs(1, 1.2, 1);
  const noFaa = () => inputs(null, 1.2, null);
  const times = <T,>(n: number, f: () => T) => Array.from({ length: n }, f);

  it("uses all three when every peer has them", () => {
    expect(commonCongestionIndicators(times(10, full))).toEqual(["departuresPerRunway", "peakMonthFactor", "boardingsPerAcre"]);
  });

  it("drops FAA indicators for everyone when none of the peers has FAA data", () => {
    expect(commonCongestionIndicators(times(10, noFaa))).toEqual(["peakMonthFactor"]);
  });

  it("keeps an indicator at exactly 90% coverage and drops it at 80%", () => {
    expect(commonCongestionIndicators([...times(9, full), noFaa()])).toHaveLength(3);
    expect(commonCongestionIndicators([...times(8, full), ...times(2, noFaa)])).toEqual(["peakMonthFactor"]);
  });

  it("is empty when no indicator has enough coverage, or there are no peers", () => {
    expect(commonCongestionIndicators(times(5, () => inputs(null, null, null)))).toEqual([]);
    expect(commonCongestionIndicators([])).toEqual([]);
  });

  it("can keep two indicators", () => {
    expect(commonCongestionIndicators(times(5, () => inputs(2, 1.1, null)))).toEqual(["departuresPerRunway", "peakMonthFactor"]);
  });
});
