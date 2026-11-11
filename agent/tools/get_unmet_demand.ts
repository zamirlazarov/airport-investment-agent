import { defineTool } from "eve/tools";
import { z } from "zod";
import { unmet } from "../../lib/analysis.ts";
import { airportCode } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Unmet demand at an airport, measured as a DEMAND-PRESSURE PROXY: passengers carried above a load-factor threshold (default 80%), with the routes and months that drive it. It is not observed lost demand; no public data shows who was turned away. Present it as a proxy, name the threshold, and explain the drivers from topRoutes and byMonth. To change the threshold, call it again with `lfThreshold`.",
  inputSchema: z.object({
    airport: airportCode,
    lfThreshold: z.number().min(0.5).max(0.95).optional().describe("Load-factor threshold as a fraction, default 0.80."),
    topRoutes: z.number().int().min(1).max(15).optional().describe("Routes to list, default 5."),
  }),
  label: { start: ({ airport }) => `Unmet-demand proxy at ${airport.toUpperCase()}` },
  async execute({ airport, lfThreshold, topRoutes }) {
    return unmet(airport, { lfThreshold, topRoutes });
  },
});
