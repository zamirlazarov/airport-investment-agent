import { defineTool } from "eve/tools";
import { z } from "zod";
import { longHaul } from "../../lib/analysis.ts";
import { airportCode } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Share of an airport's departures on long-haul routes (default: at least 2,500 statute miles), with the distance distribution. Always returns both views, passenger flights only and all flights including cargo, so there is no cargo toggle; say which one you quote (Anchorage is a big cargo hub, so they differ a lot). To change the definition of long haul, call it again with `thresholdMiles`.",
  inputSchema: z.object({
    airport: airportCode,
    thresholdMiles: z.number().min(500).max(8000).optional().describe("Long-haul distance in statute miles, default 2500."),
  }),
  label: { start: ({ airport, thresholdMiles }) => `Long-haul share at ${airport.toUpperCase()} (${thresholdMiles ?? 2500} mi)` },
  async execute({ airport, thresholdMiles }) {
    return longHaul(airport, { thresholdMiles });
  },
});
