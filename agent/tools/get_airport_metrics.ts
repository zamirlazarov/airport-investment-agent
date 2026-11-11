import { defineTool } from "eve/tools";
import { z } from "zod";
import { airportMetrics } from "../../lib/analysis.ts";
import { airportCode, weights } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Full KPI profile for one US airport: passengers, load factor, growth, congestion inputs, the four score components, the Expansion Opportunity Score and national rank (score is null for airports under 100,000 passengers). Use it for questions about a single airport. To change an assumption such as the weights, call it again.",
  inputSchema: z.object({ airport: airportCode, weights }),
  label: { start: ({ airport }) => `Get metrics for ${airport.toUpperCase()}` },
  async execute({ airport, weights }) {
    return airportMetrics(airport, { weights });
  },
});
