import { describe, expect, it } from "vitest";
import { FIXTURE_MONTHS, FIXTURE_ROWS, FIXTURE_YEARS } from "./__fixtures__/t100-rows.ts";
import { aggregateT100, trailingMonths } from "./t100-aggregate.ts";

// Every expected value below was worked out by hand from scripts/__fixtures__/t100-rows.ts.
// Months are [2026-01, 2026-02].

describe("aggregateT100 on the hand-written fixture", () => {
  const airports = aggregateT100(FIXTURE_ROWS, { months: FIXTURE_MONTHS, years: FIXTURE_YEARS });

  it("keeps only US origins with at least 2,500 passengers in the window", () => {
    // YYZ is a foreign origin; XYZ has 400 passengers.
    expect(Object.keys(airports).sort()).toEqual(["SFO", "SNA"]);
  });

  it("sums class F monthly totals across routes and carriers", () => {
    const sfo = airports["SFO"]!;
    expect(sfo.city).toBe("San Francisco");
    expect(sfo.state).toBe("CA");
    // Jan deps: 31 + 30 (JFK) + 100 (LAX) + 30 (ZRH) = 191. Feb: 28 + 90 + 3 (SJC) = 121.
    expect(sfo.deps).toEqual([191, 121]);
    // Jan seats: 5000 + 4000 + 10000 + 9000 = 28000. Feb: 4500 + 9000 + 0 = 13500.
    expect(sfo.seats).toEqual([28000, 13500]);
    // Jan pax: 4000 + 3500 + 9000 + 8000 = 24500. Feb: 4200 + 8100 + 0 = 12300.
    expect(sfo.pax).toEqual([24500, 12300]);
  });

  it("counts class G in allDeps and otherDeps but not in class F arrays", () => {
    const sfo = airports["SFO"]!;
    // Jan allDeps: 191 + 5 (G, JFK) + 7 (G, ANC) = 203. Feb: 121.
    expect(sfo.allDeps).toEqual([203, 121]);
    const jfk = sfo.routes.find((r) => r.dest === "JFK")!;
    expect(jfk.otherDeps).toBe(5);
    expect(jfk.deps).toEqual([61, 28]); // Jan 31 + 30
  });

  it("keeps a class-G-only route with zero class F arrays", () => {
    const anc = airports["SFO"]!.routes.find((r) => r.dest === "ANC")!;
    expect(anc).toMatchObject({ miles: 2018, deps: [0, 0], seats: [0, 0], pax: [0, 0], otherDeps: 7 });
  });

  it("puts rows outside the month list in yearly totals only", () => {
    const sfo = airports["SFO"]!;
    // 2023: the one June row. 2025: the one June row. 2026-03 appears nowhere.
    expect(sfo.yearly["2023"]).toEqual({ deps: 50, seats: 5000, pax: 4000 });
    expect(sfo.yearly["2025"]).toEqual({ deps: 40, seats: 6000, pax: 5000 });
    expect(sfo.yearly["2026"]).toBeUndefined();
    const lax = sfo.routes.find((r) => r.dest === "LAX")!;
    expect(lax.deps).toEqual([100, 90]); // the 99-departure March row is not here
  });

  it("gives every requested year an entry, zero when the airport had no rows", () => {
    expect(airports["SNA"]!.yearly).toEqual({
      "2023": { deps: 0, seats: 0, pax: 0 },
      "2025": { deps: 0, seats: 0, pax: 0 },
    });
  });

  it("keeps international destinations, one-month routes and zero-seat months", () => {
    const routes = airports["SFO"]!.routes;
    expect(routes.find((r) => r.dest === "ZRH")).toMatchObject({
      destCountry: "CH", miles: 5900, deps: [30, 0], seats: [9000, 0], pax: [8000, 0],
    });
    expect(routes.find((r) => r.dest === "SJC")).toMatchObject({
      deps: [0, 3], seats: [0, 0], pax: [0, 0],
    });
  });

  it("orders routes by destination code", () => {
    expect(airports["SFO"]!.routes.map((r) => r.dest)).toEqual(["ANC", "JFK", "LAX", "SJC", "ZRH"]);
  });

  it("aggregates a second airport independently", () => {
    expect(airports["SNA"]).toMatchObject({
      deps: [20, 18], seats: [3000, 2700], pax: [2700, 2500], allDeps: [20, 18],
    });
  });

  it("returns integers", () => {
    const rows = [{ ...FIXTURE_ROWS[0]!, deps: 30.4, seats: 4000.6, pax: 3999.5 }, FIXTURE_ROWS[3]!, FIXTURE_ROWS[4]!];
    const sfo = aggregateT100(rows, { months: FIXTURE_MONTHS, years: [] })["SFO"]!;
    for (const n of [...sfo.deps, ...sfo.seats, ...sfo.pax]) expect(Number.isInteger(n)).toBe(true);
  });
});

describe("trailingMonths", () => {
  it("counts back across a year boundary, oldest first", () => {
    expect(trailingMonths("2026-07")).toEqual([
      "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01",
      "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    ]);
  });
  it("handles a December end and a short window", () => {
    expect(trailingMonths("2025-12", 2)).toEqual(["2025-11", "2025-12"]);
  });
});
