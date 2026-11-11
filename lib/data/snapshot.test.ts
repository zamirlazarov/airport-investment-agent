import { describe, expect, it } from "vitest";
import { SPOT_CHECKS } from "./__fixtures__/spot-checks.ts";
import { getAirport, getSnapshot, listAirports } from "./snapshot.ts";

describe("snapshot", () => {
  it("covers 12 months ending at the latest month, with plenty of airports", () => {
    const { meta } = getSnapshot();
    expect(meta.months).toHaveLength(12);
    expect(meta.months[11]).toBe(meta.latestMonth);
    expect(listAirports().length).toBeGreaterThanOrEqual(300);
  });

  it("finds SFO with 12-element arrays and returns undefined for an unknown code", () => {
    const sfo = getAirport("SFO")!;
    expect(sfo).toBeDefined();
    for (const arr of [sfo.deps, sfo.seats, sfo.pax, sfo.allDeps]) expect(arr).toHaveLength(12);
    expect(getAirport("sfo")?.code).toBe("SFO");
    expect(getAirport("XXX")).toBeUndefined();
  });

  it.each(SPOT_CHECKS)("$origin→$dest $month matches the hand-verified raw rows", (check) => {
    // The fixture's own arithmetic first, so a typo in a literal is caught here.
    const sum = (i: 0 | 1 | 2) => check.rawRows.reduce((a, r) => a + r[i], 0);
    expect({ deps: sum(0), seats: sum(1), pax: sum(2) }).toEqual(check.expected);

    const i = getSnapshot().meta.months.indexOf(check.month);
    expect(i).toBeGreaterThanOrEqual(0);
    const route = getAirport(check.origin)!.routes.find((r) => r.dest === check.dest)!;
    expect(route.miles).toBe(check.miles);
    expect({ deps: route.deps[i], seats: route.seats[i], pax: route.pax[i] }).toEqual(check.expected);
  });

  it("has finite non-negative monthly values for every airport", () => {
    for (const a of listAirports()) {
      for (const arr of [a.deps, a.seats, a.pax, a.allDeps]) {
        expect(arr).toHaveLength(12);
        for (const v of arr) expect(Number.isFinite(v) && v >= 0).toBe(true);
      }
    }
  });
});
