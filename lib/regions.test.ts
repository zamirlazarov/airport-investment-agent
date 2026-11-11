import { describe, expect, it } from "vitest";
import { REGION_KEYS, statesForRegion } from "./regions.ts";

describe("statesForRegion", () => {
  it("maps New England to its six states", () => {
    expect(statesForRegion("new-england").sort()).toEqual(["CT", "MA", "ME", "NH", "RI", "VT"]);
  });

  it("builds the four Census regions from their divisions", () => {
    expect(statesForRegion("northeast").sort()).toEqual(
      ["CT", "MA", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
    );
    expect(statesForRegion("west")).toHaveLength(8 + 5); // Mountain + Pacific
  });

  it("assigns every state to exactly one division, and 50 states plus DC in total", () => {
    const divisions = REGION_KEYS.filter((k) => !["northeast", "midwest", "south", "west"].includes(k));
    const all = divisions.flatMap((d) => statesForRegion(d));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(51);
  });

  it("makes the four regions partition the same 51", () => {
    const all = (["northeast", "midwest", "south", "west"] as const).flatMap((r) => statesForRegion(r));
    expect(new Set(all).size).toBe(51);
    expect(all).toHaveLength(51);
  });
});
