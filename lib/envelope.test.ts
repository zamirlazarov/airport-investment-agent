import { describe, expect, it } from "vitest";
import { envelope, LIMITS, lowestConfidence, SOURCES } from "./envelope.ts";
import type { DataWindow } from "./types.ts";

const dataWindow: DataWindow = {
  t100From: "2025-08",
  t100To: "2026-07",
  growthYears: [2023, 2025],
  snapshotGeneratedAt: "2026-11-11T00:00:00.000Z",
  faaEffectiveDate: null,
};

describe("lowestConfidence", () => {
  it("returns the weakest level present", () => {
    expect(lowestConfidence(["high", "low", "medium"])).toBe("low");
    expect(lowestConfidence(["high", "medium"])).toBe("medium");
  });

  it("is high when there is nothing to weaken it", () => {
    expect(lowestConfidence([])).toBe("high");
  });
});

describe("LIMITS", () => {
  it("states that the unmet-demand figure is a proxy, not observed lost demand", () => {
    expect(LIMITS.unmetDemandProxy).toContain("demand-pressure proxy");
    expect(LIMITS.unmetDemandProxy).toContain("not observed lost demand");
  });

  it("keeps every limit as a non-empty sentence", () => {
    for (const sentence of Object.values(LIMITS)) {
      expect(sentence.length).toBeGreaterThan(20);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });
});

describe("envelope", () => {
  it("keeps the result and drops repeated assumptions and sources", () => {
    const wrapped = envelope(
      { value: 1 },
      {
        assumptions: ["Threshold is 2,500 miles.", "Threshold is 2,500 miles.", "Class F only."],
        dataWindow,
        sources: [SOURCES.t100, { ...SOURCES.t100 }, SOURCES.faaRunways],
        confidence: "medium",
        confidenceReasons: ["Only 9 months of service."],
      },
    );

    expect(wrapped.result).toEqual({ value: 1 });
    expect(wrapped.assumptions).toEqual(["Threshold is 2,500 miles.", "Class F only."]);
    expect(wrapped.sources.map((source) => source.url)).toEqual([
      SOURCES.t100.url,
      SOURCES.faaRunways.url,
    ]);
    expect(wrapped.confidence).toBe("medium");
    expect(wrapped.dataWindow).toEqual(dataWindow);
  });
});
