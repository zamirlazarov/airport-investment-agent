import { defineTool } from "eve/tools";
import { z } from "zod";
import { rankAirports } from "../../lib/analysis.ts";
import { regionKey, stateCodes, weights } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Rank US airports by Expansion Opportunity Score for a region (for example new-england), a list of states, or a hub class. Answers 'which airports are strong candidates for terminal expansion'. Only airports with at least 100,000 passengers are ranked. Keep the previous scope on follow-ups; to change emphasis ('weight growth more') call it again with `weights`.",
  inputSchema: z.object({
    region: regionKey.optional().describe("US Census division or region, e.g. new-england."),
    states: stateCodes.optional(),
    hubClass: z.enum(["large", "medium", "small", "nonhub"]).optional().describe("FAA hub class by share of US boardings."),
    weights,
    limit: z.number().int().min(1).max(25).optional().describe("Rows to return, default 10."),
  }),
  label: { start: ({ region, states, hubClass }) => `Rank airports in ${region ?? states?.join(", ") ?? (hubClass ? `${hubClass} hubs` : "the US")}` },
  async execute(input) {
    return rankAirports(input);
  },
});
