import { defineTool } from "eve/tools";
import { z } from "zod";
import { compareAirports } from "../../lib/analysis.ts";
import { airportCode, weights } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Side-by-side KPIs for 2 to 5 airports, with congestion inputs, score components and confidence. Use it for 'compare X and Y' and for congestion comparisons. `focus` says which dimension the user cares about; every KPI is returned either way. Read `congestionDetail` and the assumptions to see which congestion indicators were used, and say so. Call it again to change assumptions.",
  inputSchema: z.object({
    airports: z.array(airportCode).min(2).max(5).describe("2 to 5 airport codes."),
    focus: z.enum(["all", "congestion", "demand", "growth"]).optional().describe("What the user wants compared; default all."),
    weights,
  }),
  label: { start: ({ airports }) => `Compare ${airports.map((a) => a.toUpperCase()).join(" and ")}` },
  async execute({ airports, focus, weights }) {
    return compareAirports(airports, { focus, weights });
  },
});
