import { LIMITS } from "../envelope.ts";
import type { RouteRecord } from "../types.ts";
import { sum } from "./stats.ts";

/** One sentence, defined with the other limits in lib/envelope.ts. */
export const UNMET_DEMAND_INTERPRETATION = LIMITS.unmetDemandProxy;

/**
 * "Unmet demand" as a demand-pressure proxy: passengers carried above a load-factor threshold.
 * It is not observed lost demand (spec 4.2).
 */
export type UnmetDemandProxyResult = {
  metric: "demand-pressure-proxy";
  isObservedLostDemand: false;
  interpretation: string;
  lfThreshold: number;
  excessLoadPassengers: number;
  excessLoadEquivalentDepartures: number;
  /** Excess-load passengers as a share of all passengers carried. */
  excessLoadSharePct: number | null;
  topRoutes: {
    dest: string;
    destCity: string;
    miles: number;
    loadFactorPct: number;
    excessLoadPassengers: number;
    excessLoadEquivalentDepartures: number;
  }[];
  byMonth: { month: string; loadFactorPct: number | null; excessLoadPassengers: number }[];
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/** seats x (min(LF, 1) - threshold) when the month is above the threshold, else 0. */
function excessLoad(seats: number, pax: number, threshold: number): number {
  if (seats <= 0) return 0;
  const lf = Math.min(pax / seats, 1);
  return lf > threshold ? seats * (lf - threshold) : 0;
}

export function unmetDemandProxy(
  routes: RouteRecord[],
  months: string[],
  opts: { lfThreshold: number; topRoutes: number },
): UnmetDemandProxyResult {
  const monthExcess = months.map(() => 0);
  const monthSeats = months.map(() => 0);
  const monthPax = months.map(() => 0);
  let totalExcess = 0;
  let totalEquivalent = 0;
  let totalPax = 0;

  const perRoute = routes.map((r) => {
    let excess = 0;
    months.forEach((_, i) => {
      const seats = r.seats[i] ?? 0;
      const pax = r.pax[i] ?? 0;
      const e = excessLoad(seats, pax, opts.lfThreshold);
      excess += e;
      monthExcess[i]! += e;
      monthSeats[i]! += seats;
      monthPax[i]! += pax;
    });
    const seats = sum(r.seats);
    const deps = sum(r.deps);
    const pax = sum(r.pax);
    const seatsPerDeparture = deps > 0 ? seats / deps : 0;
    const equivalent = seatsPerDeparture > 0 ? excess / seatsPerDeparture : 0;
    totalExcess += excess;
    totalEquivalent += equivalent;
    totalPax += pax;
    return { r, excess, equivalent, lfPct: seats > 0 ? (pax / seats) * 100 : 0 };
  });

  const topRoutes = perRoute
    .filter((x) => x.excess > 0)
    .sort((a, b) => b.excess - a.excess || a.r.dest.localeCompare(b.r.dest))
    .slice(0, opts.topRoutes)
    .map((x) => ({
      dest: x.r.dest,
      destCity: x.r.destCity,
      miles: x.r.miles,
      loadFactorPct: round1(x.lfPct),
      excessLoadPassengers: Math.round(x.excess),
      excessLoadEquivalentDepartures: Math.round(x.equivalent),
    }));

  return {
    metric: "demand-pressure-proxy",
    isObservedLostDemand: false,
    interpretation: UNMET_DEMAND_INTERPRETATION,
    lfThreshold: opts.lfThreshold,
    excessLoadPassengers: Math.round(totalExcess),
    excessLoadEquivalentDepartures: Math.round(totalEquivalent),
    excessLoadSharePct: totalPax > 0 ? round1((totalExcess / totalPax) * 100) : null,
    topRoutes,
    byMonth: months.map((month, i) => ({
      month,
      loadFactorPct: monthSeats[i]! > 0 ? round1((monthPax[i]! / monthSeats[i]!) * 100) : null,
      excessLoadPassengers: Math.round(monthExcess[i]!),
    })),
  };
}
