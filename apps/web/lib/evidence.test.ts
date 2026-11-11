import { describe, expect, it } from "vitest";
import { collectEvidence, type ToolPartLike } from "./evidence.ts";

const dataWindow = {
  t100From: "2025-08",
  t100To: "2026-07",
  growthYears: [2023, 2025] as [number, number],
  snapshotGeneratedAt: "2026-11-11T00:00:00.000Z",
  faaEffectiveDate: null,
};

function toolPart(output: unknown, state = "completed"): ToolPartLike {
  return { type: "tool", name: "get_airport_metrics", state, input: { airport: "SFO" }, output };
}

const t100 = { name: "BTS T-100", url: "https://example.test/t100" };
const faa = { name: "FAA Runways", url: "https://example.test/faa" };

describe("collectEvidence", () => {
  it("merges tool outputs, listing a shared assumption and source once", () => {
    const evidence = collectEvidence([
      { type: "text" },
      toolPart({
        result: {},
        assumptions: ["Class F only.", "Threshold 2,500 miles."],
        dataWindow,
        sources: [t100],
        confidence: "high",
        confidenceReasons: [],
      }),
      toolPart({
        result: {},
        assumptions: ["Class F only."],
        dataWindow,
        sources: [t100, faa],
        confidence: "low",
        confidenceReasons: ["No runway data."],
      }),
    ]);

    expect(evidence.assumptions).toEqual(["Class F only.", "Threshold 2,500 miles."]);
    expect(evidence.sources).toEqual([t100, faa]);
    expect(evidence.confidence).toBe("low");
    expect(evidence.confidenceReasons).toEqual(["No runway data."]);
    expect(evidence.dataWindow).toEqual(dataWindow);
  });

  it("ignores failed calls and outputs that are not envelopes", () => {
    const envelope = {
      result: {},
      assumptions: ["Should not appear."],
      dataWindow,
      sources: [t100],
      confidence: "low",
      confidenceReasons: [],
    };
    const evidence = collectEvidence([
      toolPart(envelope, "failed"),
      toolPart({ stdout: "hello" }),
      toolPart("plain text"),
      toolPart(undefined, "running"),
    ]);

    expect(evidence).toEqual({
      assumptions: [],
      sources: [],
      confidence: null,
      confidenceReasons: [],
      dataWindow: null,
    });
  });

  it("reports no confidence when the message used no tools", () => {
    expect(collectEvidence([{ type: "text" }]).confidence).toBeNull();
  });
});
