import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchAirports } from "../../lib/analysis.ts";
import { regionKey, stateCodes } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Resolve free text to airport codes: a code, a city name, a US state, or a Census region such as new-england. Use it whenever you only have a name, city or region, and whenever a name could mean more than one airport. Returns candidates with their passenger volume; say which one you picked and name the alternatives.",
  inputSchema: z.object({
    query: z.string().optional().describe("Airport code or city text, e.g. \"Santa Ana\" or \"LAX\"."),
    states: stateCodes.optional(),
    region: regionKey.optional().describe("US Census division or region, e.g. new-england, pacific, northeast."),
    limit: z.number().int().min(1).max(25).optional().describe("Maximum matches, default 10."),
  }),
  label: { start: ({ query, region, states }) => `Find airports for ${query ?? region ?? states?.join(", ") ?? "your search"}` },
  async execute(input) {
    return searchAirports(input);
  },
});
