import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseInfra } from "./data/faa.ts";
import type { Infra } from "./types.ts";

type InfraResult = { infra: Map<string, Infra>; error: string | null };
const mode = vi.hoisted(() => ({ current: "fixture" as "fixture" | "error" | "full" | "full-minus-one", skip: "" }));

vi.mock("./data/faa.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./data/faa.ts")>();
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./data/__fixtures__/${name}`, import.meta.url), "utf8"));
  const real = original.parseInfra(fixture("facilities.json"), fixture("runways.json"));
  return {
    ...original,
    getInfra: vi.fn(async (codes: string[]): Promise<InfraResult> => {
      if (mode.current === "error") return { infra: new Map(), error: "FAA runway service did not respond: connect ETIMEDOUT" };
      if (mode.current === "fixture") return { infra: new Map(codes.filter((c) => real.has(c)).map((c) => [c, real.get(c)!])), error: null };
      const infra = new Map<string, Infra>();
      codes.forEach((c, i) => {
        if (mode.current === "full-minus-one" && c === mode.skip) return;
        infra.set(c, { name: c, runways: [], usableRunwayCount: 1 + (i % 4), acreage: 300 + 37 * i, effectiveDate: "2026/10/29" });
      });
      return { infra, error: null };
    }),
  };
});

const { airportMetrics, allScores, compareAirports, longHaul, rankAirports, resetAnalysisCache, unmet, UnknownAirportError, airportDetail } = await import("./analysis.ts");
const { listAirports } = await import("./data/snapshot.ts");
void parseInfra;

beforeEach(() => {
  mode.current = "fixture";
  resetAnalysisCache();
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("rankAirports", () => {
  it("ranks New England airports, best first, naming the weights", async () => {
    const env = await rankAirports({ region: "new-england" });
    const rows = env.result.ranking;
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => ["CT", "ME", "MA", "NH", "RI", "VT"].includes(r.state))).toBe(true);
    expect(rows.map((r) => r.scopeRank)).toEqual(rows.map((_, i) => i + 1));
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.score!).toBeGreaterThanOrEqual(rows[i]!.score!);
    expect(env.assumptions.join(" ")).toContain("weights");
    expect(env.result.scope).toBe("new-england");
    expect(env.result.peerCount).toBeGreaterThan(200);
  });

  it("returns an empty ranking with the peer-floor explanation for a scope with no peers", async () => {
    const env = await rankAirports({ states: ["ZZ"] });
    expect(env.result.ranking).toEqual([]);
    expect(env.assumptions.join(" ")).toContain("100,000");
  });

  it("honours weights that emphasise growth", async () => {
    const base = await rankAirports({ region: "new-england", limit: 25 });
    const growth = await rankAirports({ region: "new-england", limit: 25, weights: { demandPressure: 0, growth: 1, congestion: 0, scale: 0 } });
    expect(growth.result.weights.growth).toBe(1);
    const byGrowth = [...growth.result.ranking].sort((a, b) => b.components.growth! - a.components.growth!);
    expect(growth.result.ranking[0]!.components.growth).toBe(byGrowth[0]!.components.growth);
    expect(base.result.weights.growth).toBeCloseTo(0.25, 9);
  });

  it("filters by hub class", async () => {
    const env = await rankAirports({ hubClass: "large", limit: 25 });
    expect(env.result.ranking.every((r) => r.hubClass === "large")).toBe(true);
  });
});

describe("compareAirports", () => {
  it("compares LAX and Santa Ana on congestion, with real FAA acreage", async () => {
    const env = await compareAirports(["LAX", "SNA"], { focus: "congestion" });
    const [lax, sna] = env.result.airports;
    expect(env.result.airports.map((a) => a.code)).toEqual(["LAX", "SNA"]);
    expect(sna!.congestion.boardingsPerAcre!).toBeGreaterThan(lax!.congestion.boardingsPerAcre!);
    expect(env.result.focus).toBe("congestion");
  });

  it("scores both airports on the same indicators when FAA data covers only two airports", async () => {
    const env = await compareAirports(["LAX", "SNA"], { focus: "congestion" });
    const sets = env.result.airports.map((a) => a.congestionDetail.indicatorSet.join(","));
    expect(sets[0]).toBe(sets[1]);
    expect(sets[0]).toBe("peakMonthFactor"); // two airports out of ~233 is far below 90% coverage
    expect(env.result.airports.every((a) => a.components.congestion !== null)).toBe(true);
    expect(env.confidence).not.toBe("high");
    expect(env.assumptions.join(" ")).toContain("peak-month factor");
    // Raw values of the dropped indicators are still reported where known.
    expect(env.result.airports[0]!.congestion.departuresPerRunway).not.toBeNull();
  });

  it("uses all three indicators when FAA data is complete", async () => {
    mode.current = "full";
    const env = await compareAirports(["LAX", "SNA"], { focus: "congestion" });
    for (const a of env.result.airports) expect(a.congestionDetail.indicatorSet).toEqual(["departuresPerRunway", "peakMonthFactor", "boardingsPerAcre"]);
  });

  it("de-duplicates repeated codes and rejects an unknown one", async () => {
    expect((await compareAirports(["lax", "LAX", "SNA"])).result.airports).toHaveLength(2);
    await expect(compareAirports(["LAX", "XXX"])).rejects.toThrow(UnknownAirportError);
  });
});

describe("longHaul", () => {
  it("shows both views for Anchorage and names the threshold", async () => {
    const env = await longHaul("ANC");
    expect(env.result.allFlights.sharePct!).toBeGreaterThan(env.result.passengerFlights.sharePct!);
    expect(env.assumptions.join(" ")).toContain("2,500");
    expect(env.result.city).toBe("Anchorage");
  });

  it("re-runs with another threshold", async () => {
    const env = await longHaul("ANC", { thresholdMiles: 3000 });
    expect(env.result.thresholdMiles).toBe(3000);
    expect(env.assumptions.join(" ")).toContain("3,000");
  });
});

describe("unmet", () => {
  it("returns a labelled demand-pressure proxy for SFO", async () => {
    const env = await unmet("SFO");
    expect(env.result.excessLoadPassengers).toBeGreaterThan(0);
    expect(env.result.topRoutes).toHaveLength(5);
    expect(env.result.byMonth).toHaveLength(12);
    expect(env.result.isObservedLostDemand).toBe(false);
    expect(env.assumptions.join(" ")).toContain("not observed lost demand");
    expect(env.assumptions.join(" ")).toContain("80%");
  });

  it("follows a changed threshold", async () => {
    const lo = await unmet("SFO", { lfThreshold: 0.8 });
    const hi = await unmet("SFO", { lfThreshold: 0.85 });
    expect(hi.result.excessLoadPassengers).toBeLessThan(lo.result.excessLoadPassengers);
    expect(hi.assumptions.join(" ")).toContain("85%");
  });
});

describe("airportMetrics and airportDetail", () => {
  it("rejects an unknown airport with a helpful message", async () => {
    await expect(airportMetrics("XXX")).rejects.toThrow(UnknownAirportError);
    await expect(airportMetrics("XXX")).rejects.toThrow('Unknown airport code "XXX". Call find_airports to look it up.');
  });

  it("gives the smallest airport its raw metrics but no score, and says why", async () => {
    const smallest = listAirports().filter((a) => sum(a.pax) > 0).sort((a, b) => sum(a.pax) - sum(b.pax))[0]!;
    const env = await airportMetrics(smallest.code);
    expect(env.result.score).toBeNull();
    expect(env.result.nationalRank).toBeNull();
    expect(env.result.passengers).toBe(sum(smallest.pax));
    expect(env.confidenceReasons.join(" ")).toContain("100,000");
  });

  it("builds a detail view for the dashboard", async () => {
    const env = await airportDetail("SNA");
    expect(env.result.monthly).toHaveLength(12);
    expect(env.result.metrics.code).toBe("SNA");
    expect(env.result.unmet.metric).toBe("demand-pressure-proxy");
  });

  it("lists the peer set", async () => {
    const env = await allScores();
    expect(env.result.every((s) => s.inPeerSet)).toBe(true);
    expect(env.result.length).toBeGreaterThan(200);
  });
});

describe("FAA failures (Review Focus 4)", () => {
  it("still ranks, on the peak-month factor alone, with lower confidence and the reason stated", async () => {
    mode.current = "error";
    const env = await rankAirports({ region: "new-england" });
    expect(env.result.ranking.length).toBeGreaterThan(0);
    for (const row of env.result.ranking) {
      expect(row.components.congestion).not.toBeNull();
      expect(row.congestionDetail.indicatorSet).toEqual(["peakMonthFactor"]);
      expect(row.congestion.departuresPerRunway).toBeNull();
      expect(row.congestion.boardingsPerAcre).toBeNull();
    }
    expect(env.confidence).not.toBe("high");
    expect(env.confidenceReasons.join(" ")).toContain("FAA runway service did not respond");
  });

  it("does not memoize a failed fetch", async () => {
    mode.current = "error";
    await rankAirports({ region: "new-england" });
    mode.current = "full";
    const env = await rankAirports({ region: "new-england" });
    expect(env.result.ranking[0]!.congestionDetail.indicatorSet).toHaveLength(3);
    expect(env.confidenceReasons.join(" ")).not.toContain("did not respond");
  });

  it("leaves a single peer without FAA data out of congestion while the rest use all three", async () => {
    mode.current = "full-minus-one";
    mode.skip = "BOS";
    const env = await compareAirports(["BOS", "SFO"]);
    const [bos, sfo] = env.result.airports;
    expect(bos!.components.congestion).toBeNull();
    expect(bos!.congestionDetail.indicatorsMissing.length).toBeGreaterThan(0);
    expect(bos!.score).not.toBeNull();
    expect(sfo!.congestionDetail.indicatorsUsed).toHaveLength(3);
    expect(sfo!.components.congestion).not.toBeNull();
  });
});

describe("invariants on the real snapshot", () => {
  it.each(["SFO", "LAX", "SNA", "ANC", "BOS"])("%s has finite, plausible values", async (code) => {
    const [m, l, u] = [await airportMetrics(code), await longHaul(code), await unmet(code)];
    expect(JSON.stringify([m, l, u])).not.toMatch(/NaN|Infinity/);
    expect(m.result.loadFactorPct!).toBeGreaterThan(0);
    expect(m.result.loadFactorPct!).toBeLessThan(100);
  });

  it("lists JFK among SFO's most pressured routes", async () => {
    expect((await unmet("SFO", { topRoutes: 15 })).result.topRoutes.map((r) => r.dest)).toContain("JFK");
  });
});

describe("liveStatus", () => {
  it("rejects an unknown airport instead of calling it normal", async () => {
    const { liveStatus } = await import("./analysis.ts");
    await expect(liveStatus(["SFO", "XXX"])).rejects.toThrow('Unknown airport code "XXX"');
  });
});

describe("searchAirports", () => {
  it("wraps matches in an envelope and flags an ambiguous name", async () => {
    const { searchAirports } = await import("./analysis.ts");
    const env = await searchAirports({ query: "portland" });
    expect(env.result.matches.map((m) => m.code)).toEqual(expect.arrayContaining(["PDX", "PWM"]));
    expect(env.result.count).toBe(env.result.matches.length);
    expect(env.assumptions.join(" ")).toContain("More than one airport matched");
    expect((await searchAirports({ query: "zzzz" })).assumptions.join(" ")).toContain("No airport matched");
  });
});
