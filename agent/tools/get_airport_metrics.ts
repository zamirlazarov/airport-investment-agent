import { defineTool } from "eve/tools";
import { z } from "zod";
import { envelope, SOURCES } from "../../lib/envelope.ts";

// STUB for Phase 1: fixed figures so the chat UI can be built against the real result
// shape. Replaced by the analysis service in Task 11.
export default defineTool({
  description:
    "Get the investment metrics for one US airport: passengers, load factor, growth and score.",
  inputSchema: z.object({
    airport: z.string().describe("3-letter IATA/FAA airport code, e.g. SFO."),
  }),
  label: { start: ({ airport }) => `Get metrics for ${airport.toUpperCase()}` },
  async execute({ airport }) {
    return envelope(
      {
        code: airport.toUpperCase(),
        city: "San Francisco, CA",
        passengers: 26_000_000,
        loadFactorPct: 82.3,
        score: 71,
      },
      {
        assumptions: ["STUB DATA — replaced in Task 11", "Passenger figures use T-100 class F."],
        dataWindow: {
          t100From: "2025-08",
          t100To: "2026-07",
          growthYears: [2023, 2025],
          snapshotGeneratedAt: "2026-11-11T00:00:00.000Z",
          faaEffectiveDate: null,
        },
        sources: [SOURCES.t100],
        confidence: "low",
        confidenceReasons: ["These are placeholder figures."],
      },
    );
  },
});
