import { getAirport, listAirports } from "./data/snapshot.ts";
import { type RegionKey, statesForRegion } from "./regions.ts";

export type AirportSummary = {
  code: string;
  city: string;
  state: string;
  ttmPassengers: number;
  matchedOn: "code" | "city" | "state" | "region";
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Finds airports by code or city text, optionally limited to states or a Census region.
 * Filters combine with AND. An exact code match ranks first, then the rest by passengers.
 */
export function findAirports(q: { query?: string; states?: string[]; region?: RegionKey; limit?: number }): AirportSummary[] {
  const query = q.query?.trim().toLowerCase() ?? "";
  if (!query && !q.states?.length && !q.region) throw new Error("Provide query, states or region.");

  let allowed: Set<string> | null = null;
  if (q.states?.length) allowed = new Set(q.states.map((s) => s.toUpperCase()));
  if (q.region) {
    const regionStates = new Set(statesForRegion(q.region));
    allowed = allowed ? new Set([...allowed].filter((s) => regionStates.has(s))) : regionStates;
  }

  const out: (AirportSummary & { exact: boolean })[] = [];
  for (const a of listAirports()) {
    if (allowed && !allowed.has(a.state)) continue;
    let matchedOn: AirportSummary["matchedOn"];
    let exact = false;
    if (query) {
      if (a.code.toLowerCase() === query) {
        matchedOn = "code";
        exact = true;
      } else if (a.city.toLowerCase().includes(query)) {
        matchedOn = "city";
      } else {
        continue;
      }
    } else {
      matchedOn = q.region && !q.states?.length ? "region" : "state";
    }
    out.push({ code: a.code, city: a.city, state: a.state, ttmPassengers: sum(a.pax), matchedOn, exact });
  }
  out.sort((x, y) => Number(y.exact) - Number(x.exact) || y.ttmPassengers - x.ttmPassengers);
  return out.slice(0, q.limit ?? 10).map(({ exact: _exact, ...summary }) => summary);
}

export { getAirport };
