import { describe, expect, it } from "vitest";
import { findAirports } from "./airports.ts";

describe("findAirports (real snapshot)", () => {
  it("resolves city names", () => {
    expect(findAirports({ query: "santa ana" })[0]!.code).toBe("SNA");
    expect(findAirports({ query: "anchorage" })[0]!.code).toBe("ANC");
  });

  it("puts an exact code match first and says so", () => {
    expect(findAirports({ query: "LAX" })[0]).toMatchObject({ code: "LAX", matchedOn: "code" });
    expect(findAirports({ query: "lax" })[0]!.code).toBe("LAX");
  });

  it("returns every candidate for an ambiguous name, largest first", () => {
    const codes = findAirports({ query: "portland" }).map((a) => a.code);
    expect(codes).toContain("PDX");
    expect(codes).toContain("PWM");
    expect(codes.indexOf("PDX")).toBeLessThan(codes.indexOf("PWM"));
  });

  it("filters by region and ranks by passengers", () => {
    const list = findAirports({ region: "new-england" });
    expect(list[0]!.code).toBe("BOS");
    expect(list.every((a) => ["CT", "ME", "MA", "NH", "RI", "VT"].includes(a.state))).toBe(true);
    expect(list[0]!.matchedOn).toBe("region");
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.ttmPassengers).toBeGreaterThanOrEqual(list[i]!.ttmPassengers);
  });

  it("combines filters with AND and normalises state case", () => {
    const list = findAirports({ states: ["ma", "ct"], region: "new-england", limit: 50 });
    expect(list.every((a) => a.state === "MA" || a.state === "CT")).toBe(true);
    expect(findAirports({ states: ["CA"], region: "new-england" })).toEqual([]);
    expect(findAirports({ query: "portland", states: ["OR"] }).map((a) => a.code)).toContain("PDX");
    expect(findAirports({ query: "portland", states: ["OR"] }).map((a) => a.code)).not.toContain("PWM");
  });

  it("respects the limit, defaulting to 10", () => {
    expect(findAirports({ region: "south" })).toHaveLength(10);
    expect(findAirports({ region: "south", limit: 3 })).toHaveLength(3);
  });

  it("returns an empty list for text that matches nothing, and throws without any filter", () => {
    expect(findAirports({ query: "zzzz" })).toEqual([]);
    expect(() => findAirports({})).toThrow("Provide query, states or region.");
    expect(() => findAirports({ query: "  " })).toThrow("Provide query, states or region.");
  });
});
