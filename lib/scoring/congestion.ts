import type { AirportRecord, Infra } from "../types.ts";
import { ratio, sum } from "./stats.ts";

export type CongestionInputs = {
  /** Class F departures per usable runway (paved, at least 5,000 ft). Needs FAA runway data. */
  departuresPerRunway: number | null;
  /** Peak month departures divided by the average month, every class. From T-100 only. */
  peakMonthFactor: number | null;
  /** Class F passengers per acre of airport land. Needs FAA acreage. */
  boardingsPerAcre: number | null;
};
export type CongestionIndicator = keyof CongestionInputs;

export const CONGESTION_INDICATORS: readonly CongestionIndicator[] = ["departuresPerRunway", "peakMonthFactor", "boardingsPerAcre"];

/** An indicator joins a run's common set when at least this share of peer airports have it. */
export const CONGESTION_MIN_COVERAGE = 0.9;

export type CongestionDetail = {
  /** The run's common indicator set; the same on every airport. */
  indicatorSet: CongestionIndicator[];
  /** The whole set, or empty when this airport lacks a member of it. */
  indicatorsUsed: CongestionIndicator[];
  /** Members of the set this airport lacks. */
  indicatorsMissing: CongestionIndicator[];
};

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

export function congestionInputs(a: AirportRecord, infra: Infra | undefined | null): CongestionInputs {
  const mean = sum(a.allDeps) / (a.allDeps.length || 1);
  const peak = a.allDeps.length ? Math.max(...a.allDeps) : 0;
  const perRunway = infra && infra.usableRunwayCount > 0 ? sum(a.deps) / infra.usableRunwayCount : null;
  const perAcre = infra?.acreage ? ratio(sum(a.pax), infra.acreage) : null;
  const peakFactor = ratio(peak, mean);
  return {
    departuresPerRunway: perRunway === null ? null : round(perRunway, 0),
    peakMonthFactor: peakFactor === null ? null : round(peakFactor, 2),
    boardingsPerAcre: perAcre === null ? null : round(perAcre, 1),
  };
}

/** Indicators valid for at least CONGESTION_MIN_COVERAGE of the peer airports, in canonical order. */
export function commonCongestionIndicators(peers: { congestion: CongestionInputs }[]): CongestionIndicator[] {
  if (peers.length === 0) return [];
  return CONGESTION_INDICATORS.filter((key) => {
    const valid = peers.filter((p) => p.congestion[key] !== null).length;
    return valid / peers.length >= CONGESTION_MIN_COVERAGE;
  });
}
