import { defineTool } from "eve/tools";
import { z } from "zod";
import { liveStatus } from "../../lib/analysis.ts";
import { airportCode } from "../../lib/tool-schemas.ts";

export default defineTool({
  description:
    "Current FAA delays, ground stops and closures for 1 to 5 airports, this minute only. Context for the user; never use it to justify a score. A 'closed' entry can be a partial or time-limited restriction, so read its reason.",
  inputSchema: z.object({ airports: z.array(airportCode).min(1).max(5).describe("1 to 5 airport codes.") }),
  label: { start: ({ airports }) => `Check live status for ${airports.map((a) => a.toUpperCase()).join(", ")}` },
  async execute({ airports }) {
    return liveStatus(airports);
  },
});
