import { describe, expect, it } from "vitest";
import { suggestFollowUps } from "./follow-ups.ts";

describe("suggestFollowUps", () => {
  it("offers a different distance threshold after a long-haul answer", () => {
    const chips = suggestFollowUps([
      { name: "get_long_haul_share", input: { airport: "ANC", thresholdMiles: 2500 } },
    ]);
    expect(chips).toContain("Use a 3,000-mile threshold instead");
  });

  it("does not offer the threshold that was just used", () => {
    const chips = suggestFollowUps([
      { name: "get_long_haul_share", input: { airport: "ANC", thresholdMiles: 3000 } },
    ]);
    expect(chips).not.toContain("Use a 3,000-mile threshold instead");
    expect(chips).toContain("Use a 2,500-mile threshold instead");
  });

  it("offers to explain and re-weight a ranking", () => {
    const chips = suggestFollowUps([{ name: "rank_airports", input: { region: "new-england" } }]);
    expect(chips).toContain("Why is the top airport ranked first?");
    expect(chips).toContain("Weight growth more heavily");
  });

  it("offers an unmet-demand comparison after a comparison", () => {
    const chips = suggestFollowUps([
      { name: "compare_airports", input: { airports: ["LAX", "SNA"] } },
    ]);
    expect(chips).toContain("Which one has more unmet demand?");
  });

  it("offers a stricter load-factor threshold after an unmet-demand answer", () => {
    const chips = suggestFollowUps([{ name: "get_unmet_demand", input: { airport: "SFO" } }]);
    expect(chips).toContain("Use an 85% load-factor threshold");
  });

  it("follows the most recent analysis call, not the airport lookup before it", () => {
    const chips = suggestFollowUps([
      { name: "find_airports", input: { query: "anchorage" } },
      { name: "get_long_haul_share", input: { airport: "ANC" } },
    ]);
    expect(chips).toContain("Use a 3,000-mile threshold instead");
  });

  it("suggests nothing without tool calls or for an unknown tool", () => {
    expect(suggestFollowUps([])).toEqual([]);
    expect(suggestFollowUps([{ name: "bash", input: {} }])).toEqual([]);
  });

  it("never returns more than three suggestions", () => {
    for (const name of [
      "get_long_haul_share",
      "rank_airports",
      "compare_airports",
      "get_unmet_demand",
      "get_airport_metrics",
      "get_live_airport_status",
    ]) {
      expect(suggestFollowUps([{ name, input: { airport: "SFO" } }]).length).toBeLessThanOrEqual(3);
    }
  });
});
