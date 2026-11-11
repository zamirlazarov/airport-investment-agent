import { describe, expect, it } from "vitest";
import type { AirportRecord, Infra } from "../types.ts";
import { DEFAULT_WEIGHTS, normalizeWeights, rawMetrics, type RawMetrics, scoreAirports, weightedScore } from "./expansion.ts";

describe("normalizeWeights", () => {
  it("returns the defaults when given nothing", () => {
    expect(normalizeWeights()).toEqual(DEFAULT_WEIGHTS);
  });

  it("scales to a sum of 1 and keeps the emphasised weight largest", () => {
    // growth 0.5, others default 0.35 / 0.25 / 0.15 -> total 1.25 -> growth 0.4
    const w = normalizeWeights({ growth: 0.5 });
    expect(w.demandPressure + w.growth + w.congestion + w.scale).toBeCloseTo(1, 9);
    expect(w.growth).toBeCloseTo(0.4, 9);
    expect(w.growth).toBeGreaterThan(w.demandPressure);
  });

  it("allows a zero weight", () => {
    expect(normalizeWeights({ scale: 0 }).scale).toBe(0);
  });

  it("supports 'only growth matters'", () => {
    expect(normalizeWeights({ demandPressure: 0, growth: 1, congestion: 0, scale: 0 })).toEqual({ demandPressure: 0, growth: 1, congestion: 0, scale: 0 });
  });

  it("rejects all-zero, negative and non-finite weights with clear messages", () => {
    expect(() => normalizeWeights({ demandPressure: 0, growth: 0, congestion: 0, scale: 0 })).toThrow("At least one weight must be greater than zero.");
    expect(() => normalizeWeights({ growth: -1 })).toThrow("Weights cannot be negative.");
    expect(() => normalizeWeights({ growth: Number.NaN })).toThrow("Weights must be finite numbers.");
  });
});

describe("weightedScore", () => {
  it("is the weighted sum of the components", () => {
    // 0.35*80 + 0.25*60 + 0.25*40 + 0.15*20 = 28 + 15 + 10 + 3 = 56
    expect(weightedScore({ demandPressure: 80, growth: 60, congestion: 40, scale: 20 }, DEFAULT_WEIGHTS)).toBe(56);
  });

  it("re-normalises over the components present", () => {
    // (28 + 15 + 3) / 0.75 = 61.33
    expect(weightedScore({ demandPressure: 80, growth: 60, congestion: null, scale: 20 }, DEFAULT_WEIGHTS)).toBeCloseTo(61.33, 2);
  });

  it("is null without demand pressure, or when the present weights are all zero", () => {
    expect(weightedScore({ demandPressure: null, growth: 60, congestion: 40, scale: 20 }, DEFAULT_WEIGHTS)).toBeNull();
    expect(weightedScore({ demandPressure: 50, growth: null, congestion: null, scale: null }, { demandPressure: 0, growth: 1, congestion: 0, scale: 0 })).toBeNull();
  });
});

// A 12-month airport worked out by hand (see the comments on each expectation).
function sampleAirport(): AirportRecord {
  const route = (dest: string, seats: number[], pax: number[], deps: number[]) => ({
    dest, destCity: dest, destCountry: "US", miles: 1000, deps, seats, pax, otherDeps: 0,
  });
  const six = (a: number, b: number) => [...new Array<number>(6).fill(a), ...new Array<number>(6).fill(b)];
  return {
    code: "TST", city: "Testville", state: "ZZ",
    deps: new Array<number>(12).fill(100),
    seats: new Array<number>(12).fill(12_000),
    pax: six(10_800, 8_800),
    allDeps: [...new Array<number>(11).fill(100), 120],
    yearly: {
      "2023": { deps: 1000, seats: 150_000, pax: 100_000 },
      "2025": { deps: 1000, seats: 150_000, pax: 121_000 },
    },
    routes: [
      route("AAA", new Array<number>(12).fill(7000), new Array<number>(12).fill(6300), new Array<number>(12).fill(50)),
      route("BBB", new Array<number>(12).fill(5000), six(4500, 2500), new Array<number>(12).fill(50)),
    ],
  };
}
const infra4: Infra = { name: "Testville", runways: [], usableRunwayCount: 4, acreage: 400, effectiveDate: null };

describe("rawMetrics", () => {
  const m = rawMetrics(sampleAirport(), infra4, 10_000_000);

  it("computes the KPIs", () => {
    expect(m.passengers).toBe(117_600); // 6 x 10,800 + 6 x 8,800
    expect(m.seats).toBe(144_000); // 12 x 12,000
    expect(m.loadFactorPct).toBe(81.7); // 117,600 / 144,000 = 0.81667
    // seats in route-months with LF >= 0.85: AAA 12 x 7,000 = 84,000 (LF 0.9); BBB 6 x 5,000 = 30,000 (0.9, the rest 0.5)
    expect(m.highLfSeatSharePct).toBe(79.2); // 114,000 / 144,000 = 0.79167
    expect(m.departures).toBe(1200);
    expect(m.allDepartures).toBe(1220);
    expect(m.monthsWithService).toBe(12);
    expect(m.inPeerSet).toBe(true);
  });

  it("computes growth between 2023 and 2025", () => {
    // pax 100,000 -> 121,000 over 2 years = 10% a year; seats flat = 0%
    expect(m.paxCagrPct).toBe(10);
    expect(m.seatCagrPct).toBe(0);
    expect(m.growthGapPct).toBe(10);
  });

  it("computes congestion inputs", () => {
    expect(m.congestion.departuresPerRunway).toBe(300); // 1,200 / 4
    expect(m.congestion.boardingsPerAcre).toBe(294); // 117,600 / 400
    expect(m.congestion.peakMonthFactor).toBe(1.18); // 120 / (1,220 / 12) = 1.1803
  });

  it("assigns hub classes from the share of US passengers", () => {
    const withShare = (share: number) => {
      const a = sampleAirport();
      return rawMetrics(a, undefined, 117_600 / share).hubClass;
    };
    expect([0.012, 0.003, 0.001, 0.0001].map(withShare)).toEqual(["large", "medium", "small", "nonhub"]);
  });

  it("keeps the shares null instead of NaN when there are no seats or no baseline", () => {
    const a = sampleAirport();
    a.seats = a.seats.map(() => 0);
    a.yearly = {};
    const r = rawMetrics(a, undefined, 1e7);
    expect(r.loadFactorPct).toBeNull();
    expect(r.highLfSeatSharePct).toBeNull();
    expect(r.paxCagrPct).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});

// Synthetic peers whose every metric ranks the same way, so every component equals the airport's percentile.
function raw(code: string, k: number, over: Partial<RawMetrics> = {}): RawMetrics {
  return {
    code, city: code, state: "ZZ", hubClass: "small", inPeerSet: true,
    passengers: 1_000_000 * k, seats: 1_250_000 * k, departures: 10_000, allDepartures: 10_000, monthsWithService: 12,
    loadFactorPct: 60 + 5 * k, highLfSeatSharePct: 20 + 10 * k, paxCagrPct: k, seatCagrPct: 0, growthGapPct: k,
    congestion: { departuresPerRunway: 1000 * k, peakMonthFactor: 1 + 0.1 * k, boardingsPerAcre: 100 * k },
    infra: null,
    ...over,
  };
}

describe("scoreAirports", () => {
  it("ranks the airport that leads on every metric first, and leaves a sub-floor airport unscored", () => {
    const small = raw("SML", 1, { inPeerSet: false, passengers: 50_000 });
    const scored = scoreAirports([raw("P1", 1), raw("P2", 2), raw("P3", 3), raw("P4", 4), raw("P5", 5), small], DEFAULT_WEIGHTS);
    // Percentiles among five peers: (rank below + 0.5) / 5 = 10, 30, 50, 70, 90; every component equals it.
    expect(scored.slice(0, 5).map((s) => s.score)).toEqual([10, 30, 50, 70, 90]);
    expect(scored.slice(0, 5).map((s) => s.nationalRank)).toEqual([5, 4, 3, 2, 1]);
    expect(scored[4]!.components).toEqual({ demandPressure: 90, growth: 90, congestion: 90, scale: 90 });
    const s = scored[5]!;
    expect(s).toMatchObject({ inPeerSet: false, score: null, nationalRank: null, confidence: "low" });
    expect(s.components).toEqual({ demandPressure: null, growth: null, congestion: null, scale: null });
    expect(s.confidenceReasons.join(" ")).toContain("100,000");
  });

  it("gives equal scores a shared rank", () => {
    const scored = scoreAirports([raw("A", 1), raw("B", 1), raw("C", 2)], DEFAULT_WEIGHTS);
    expect(scored.map((s) => s.nationalRank)).toEqual([2, 2, 1]);
  });

  it("is high confidence when nothing is missing, medium or low as issues accumulate", () => {
    const peers = [1, 2, 3, 4, 5].map((k) => raw(`P${k}`, k));
    expect(scoreAirports(peers, DEFAULT_WEIGHTS)[4]!.confidence).toBe("high");
    peers[4] = raw("P5", 5, { passengers: 200_000 });
    expect(scoreAirports(peers, DEFAULT_WEIGHTS)[4]!.confidence).toBe("medium");
    peers[4] = raw("P5", 5, { passengers: 200_000, monthsWithService: 9 });
    const low = scoreAirports(peers, DEFAULT_WEIGHTS)[4]!;
    expect(low.confidence).toBe("low");
    expect(low.confidenceReasons).toHaveLength(2);
  });

  describe("congestion common indicator set (Review Focus 4)", () => {
    const noFaa = (k: number, peak: number) => raw(`P${k}`, k, { congestion: { departuresPerRunway: null, peakMonthFactor: peak, boardingsPerAcre: null } });

    it("scores every airport on the peak-month factor alone when no peer has FAA data", () => {
      // factors 1.1, 1.2, 1.3, 1.4, 1.5 -> percentiles 10, 30, 50, 70, 90
      const scored = scoreAirports([1.1, 1.2, 1.3, 1.4, 1.5].map((p, i) => noFaa(i + 1, p)), DEFAULT_WEIGHTS);
      expect(scored.map((s) => s.components.congestion)).toEqual([10, 30, 50, 70, 90]);
      for (const s of scored) {
        expect(s.congestionDetail.indicatorSet).toEqual(["peakMonthFactor"]);
        expect(s.congestionDetail.indicatorsUsed).toEqual(["peakMonthFactor"]);
        expect(s.confidence).not.toBe("high");
        expect(s.confidenceReasons.join(" ")).toContain("peak-month factor only");
      }
    });

    it("averages exactly the percentiles of a two-indicator set", () => {
      const peers = [1, 2, 3, 4, 5].map((k) =>
        raw(`P${k}`, k, { congestion: { departuresPerRunway: 1000 * k, peakMonthFactor: [1.1, 1.3, 1.2, 1.5, 1.4][k - 1]!, boardingsPerAcre: null } }),
      );
      // runway percentiles 10, 30, 50, 70, 90; peak percentiles 10, 50, 30, 90, 70 -> means 10, 40, 40, 80, 80
      const scored = scoreAirports(peers, DEFAULT_WEIGHTS);
      expect(scored.map((s) => s.components.congestion)).toEqual([10, 40, 40, 80, 80]);
      expect(scored[0]!.congestionDetail.indicatorSet).toEqual(["departuresPerRunway", "peakMonthFactor"]);
    });

    it("leaves an airport out of congestion when it lacks a member of the common set, without mixing sets", () => {
      // Ten peers; P1 has no acreage, so boardingsPerAcre has 90% coverage and stays in the set.
      const peers = Array.from({ length: 10 }, (_, i) => raw(`P${i + 1}`, i + 1));
      peers[0] = raw("P1", 1, { congestion: { departuresPerRunway: 1000, peakMonthFactor: 1.1, boardingsPerAcre: null } });
      const scored = scoreAirports(peers, DEFAULT_WEIGHTS);
      const p1 = scored[0]!;
      expect(p1.components.congestion).toBeNull();
      expect(p1.congestionDetail).toMatchObject({ indicatorsUsed: [], indicatorsMissing: ["boardingsPerAcre"] });
      expect(p1.score).not.toBeNull();
      expect(p1.confidence).not.toBe("high");
      expect(p1.confidenceReasons.join(" ")).toContain("FAA acreage data");
      // The other nine are scored on all three indicators.
      expect(scored[9]!.congestionDetail.indicatorsUsed).toHaveLength(3);
      // Top airport: runway and peak percentiles are (9 + 0.5) / 10 = 95; boardings per acre is ranked among the 9 airports that have it, (8 + 0.5) / 9 = 94.44; mean 94.81.
      expect(scored[9]!.components.congestion).toBe(94.81);
      expect(scored[9]!.confidence).toBe("high");
      // Lowest of ten on load factor and on high-load share: (0 + 0.5) / 10 = 5% each.
      expect(p1.components.demandPressure).toBe(5);
    });

    it("drops an indicator for everyone at 80% coverage, so no two airports are scored on different sets", () => {
      const peers = Array.from({ length: 10 }, (_, i) => raw(`P${i + 1}`, i + 1));
      for (const i of [0, 1]) peers[i] = noFaa(i + 1, 1 + 0.1 * (i + 1));
      const scored = scoreAirports(peers, DEFAULT_WEIGHTS);
      const sets = new Set(scored.map((s) => s.congestionDetail.indicatorSet.join(",")));
      expect(sets).toEqual(new Set(["peakMonthFactor"]));
      expect(scored.every((s) => s.components.congestion !== null)).toBe(true);
    });

    it("has no congestion for anyone when no indicator has enough coverage, but still scores", () => {
      const none = (k: number) => raw(`P${k}`, k, { congestion: { departuresPerRunway: null, peakMonthFactor: null, boardingsPerAcre: null } });
      const scored = scoreAirports([1, 2, 3, 4, 5].map(none), DEFAULT_WEIGHTS);
      for (const s of scored) {
        expect(s.components.congestion).toBeNull();
        expect(s.congestionDetail.indicatorSet).toEqual([]);
        expect(s.score).not.toBeNull();
        expect(s.confidenceReasons.join(" ")).toContain("Congestion could not be scored");
      }
    });
  });
});
