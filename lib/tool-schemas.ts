import { z } from "zod";
import { REGION_KEYS } from "./regions.ts";

// Shared Zod pieces for the agent tools. Kept outside agent/tools/ so eve never treats it as a tool.

export const airportCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter airport code")
  .describe("3-letter IATA/FAA airport code, e.g. SFO. Use find_airports first if you only have a name or city.");

const weight = z.number().min(0).max(1);
export const weights = z
  .object({
    demandPressure: weight.optional().describe("Default 0.35"),
    growth: weight.optional().describe("Default 0.25"),
    congestion: weight.optional().describe("Default 0.25"),
    scale: weight.optional().describe("Default 0.15"),
  })
  .optional()
  .describe(
    "Optional weights for the Expansion Opportunity Score components, each 0 to 1. Omitted components keep their defaults (demandPressure 0.35, growth 0.25, congestion 0.25, scale 0.15); the result is normalized to sum to 1. To ignore a component set it to 0. Pass them when the user asks to change the emphasis, and keep passing the same weights on later calls in that conversation until the user changes them.",
  );

export const regionKey = z.enum(REGION_KEYS);
export const stateCodes = z.array(z.string().length(2)).describe("2-letter US state codes, e.g. [\"MA\", \"CT\"]");
