import type { AirportRecord, Confidence, Infra } from "../types.ts";
import {
  CONGESTION_INDICATORS,
  type CongestionDetail,
  type CongestionIndicator,
  type CongestionInputs,
  commonCongestionIndicators,
  congestionInputs,
} from "./congestion.ts";
import { cagr, percentileRank, ratio, sum } from "./stats.ts";

export const PEER_FLOOR_PASSENGERS = 100_000;
export const HIGH_LF_CUTOFF = 0.85;
export const GROWTH_YEARS: [number, number] = [2023, 2025];

export type HubClass = "large" | "medium" | "small" | "nonhub";
export type Weights = { demandPressure: number; growth: number; congestion: number; scale: number };
export const DEFAULT_WEIGHTS: Weights = { demandPressure: 0.35, growth: 0.25, congestion: 0.25, scale: 0.15 };

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[];
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/** Fills missing weights with the defaults and scales the result to sum to 1. */
export function normalizeWeights(w: Partial<Weights> = {}): Weights {
  const merged = { ...DEFAULT_WEIGHTS };
  for (const key of WEIGHT_KEYS) {
    const v = w[key];
    if (v === undefined) continue;
    if (!Number.isFinite(v)) throw new Error("Weights must be finite numbers.");
    if (v < 0) throw new Error("Weights cannot be negative.");
    merged[key] = v;
  }
  const total = sum(WEIGHT_KEYS.map((k) => merged[k]));
  if (total <= 0) throw new Error("At least one weight must be greater than zero.");
  return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, merged[k] / total])) as Weights;
}

export type RawMetrics = {
  code: string;
  city: string;
  state: string;
  hubClass: HubClass;
  inPeerSet: boolean;
  passengers: number;
  seats: number;
  departures: number;
  allDepartures: number;
  monthsWithService: number;
  loadFactorPct: number | null;
  highLfSeatSharePct: number | null;
  paxCagrPct: number | null;
  seatCagrPct: number | null;
  growthGapPct: number | null;
  congestion: CongestionInputs;
  infra: Infra | null;
};

function hubClassOf(share: number): HubClass {
  if (share >= 0.01) return "large";
  if (share >= 0.0025) return "medium";
  if (share >= 0.0005) return "small";
  return "nonhub";
}

const pct = (x: number | null, places = 1) => (x === null ? null : round(x * 100, places));

export function rawMetrics(a: AirportRecord, infra: Infra | undefined | null, usTotalPassengers: number): RawMetrics {
  const passengers = sum(a.pax);
  const seats = sum(a.seats);

  let highSeats = 0;
  for (const r of a.routes) {
    r.seats.forEach((s, i) => {
      if (s > 0 && (r.pax[i] ?? 0) / s >= HIGH_LF_CUTOFF) highSeats += s;
    });
  }

  const [from, to] = GROWTH_YEARS;
  const start = a.yearly[String(from)];
  const end = a.yearly[String(to)];
  const years = to - from;
  const paxCagr = start && end ? cagr(start.pax, end.pax, years) : null;
  const seatCagr = start && end ? cagr(start.seats, end.seats, years) : null;

  return {
    code: a.code,
    city: a.city,
    state: a.state,
    hubClass: hubClassOf(usTotalPassengers > 0 ? passengers / usTotalPassengers : 0),
    inPeerSet: passengers >= PEER_FLOOR_PASSENGERS,
    passengers,
    seats,
    departures: sum(a.deps),
    allDepartures: sum(a.allDeps),
    monthsWithService: a.deps.filter((d) => d > 0).length,
    loadFactorPct: pct(ratio(passengers, seats)),
    highLfSeatSharePct: pct(ratio(highSeats, seats)),
    paxCagrPct: pct(paxCagr),
    seatCagrPct: pct(seatCagr),
    growthGapPct: paxCagr !== null && seatCagr !== null ? round((paxCagr - seatCagr) * 100, 1) : null,
    congestion: congestionInputs(a, infra),
    infra: infra ?? null,
  };
}

export type Components = {
  demandPressure: number | null;
  growth: number | null;
  congestion: number | null;
  scale: number | null;
};

/** Weighted mean over the non-null components, re-normalising the weights present. Null without demand pressure. */
export function weightedScore(c: Components, w: Weights): number | null {
  if (c.demandPressure === null) return null;
  let weighted = 0;
  let weightSum = 0;
  for (const key of WEIGHT_KEYS) {
    const value = c[key];
    if (value === null) continue;
    weighted += w[key] * value;
    weightSum += w[key];
  }
  return weightSum > 0 ? round(weighted / weightSum, 2) : null;
}

/**
 * The weights a score actually used: each present component's weight divided by the total of the
 * present weights, and 0 for a missing component. Equal to the requested weights when nothing is missing.
 */
export function effectiveWeights(c: Components, w: Weights): Weights {
  const present = WEIGHT_KEYS.filter((k) => c[k] !== null);
  const total = sum(present.map((k) => w[k]));
  return Object.fromEntries(
    WEIGHT_KEYS.map((k) => [k, c[k] !== null && total > 0 ? w[k] / total : 0]),
  ) as Weights;
}

export type ScoredAirport = RawMetrics & {
  components: Components;
  /** Components with no value (for example congestion without FAA data), which change the score's basis. */
  missingComponents: (keyof Components)[];
  /** The weights the score used after dropping missing components; zeros when there is no score. */
  effectiveWeights: Weights;
  congestionDetail: CongestionDetail;
  score: number | null;
  nationalRank: number | null;
  confidence: Confidence;
  confidenceReasons: string[];
};

const COMPONENT_LABEL: Record<keyof Components, string> = {
  demandPressure: "demand pressure",
  growth: "growth",
  congestion: "congestion",
  scale: "scale",
};

const NO_COMPONENTS: Components = { demandPressure: null, growth: null, congestion: null, scale: null };

/** Mean of the percentiles of the given values, each ranked among the peers' non-null values. */
function meanPercentile(peerValues: (number | null)[][], own: (number | null)[]): number | null {
  const parts: number[] = [];
  own.forEach((value, i) => {
    if (value === null) return;
    parts.push(percentileRank(peerValues[i]!.filter((v): v is number => v !== null), value));
  });
  return parts.length ? round(sum(parts) / parts.length, 2) : null;
}

const INDICATOR_NEEDS: Record<CongestionIndicator, string> = {
  departuresPerRunway: "FAA runway data",
  peakMonthFactor: "monthly departure data",
  boardingsPerAcre: "FAA acreage data",
};
const INDICATOR_LABEL: Record<CongestionIndicator, string> = {
  departuresPerRunway: "departures per runway",
  peakMonthFactor: "peak-month factor",
  boardingsPerAcre: "boardings per acre",
};
const list = (keys: CongestionIndicator[]) => keys.map((k) => INDICATOR_LABEL[k]).join(" and ");

/**
 * Scores every airport against the peer set (airports with at least 100,000 passengers).
 * Congestion uses one common indicator set for the whole run (spec 4.3), so scores stay comparable.
 */
export function scoreAirports(all: RawMetrics[], weights: Weights): ScoredAirport[] {
  const peers = all.filter((a) => a.inPeerSet);
  const indicatorSet = commonCongestionIndicators(peers);
  const dropped = CONGESTION_INDICATORS.filter((k) => !indicatorSet.includes(k));

  const lf = peers.map((p) => p.loadFactorPct);
  const high = peers.map((p) => p.highLfSeatSharePct);
  const cagrs = peers.map((p) => p.paxCagrPct);
  const gaps = peers.map((p) => p.growthGapPct);
  const pax = peers.map((p) => p.passengers);
  const cong = Object.fromEntries(CONGESTION_INDICATORS.map((k) => [k, peers.map((p) => p.congestion[k])])) as Record<CongestionIndicator, (number | null)[]>;

  const scored = all.map((a): ScoredAirport => {
    const reasons: string[] = [];
    if (!a.inPeerSet) {
      return {
        ...a,
        components: { ...NO_COMPONENTS },
        missingComponents: [],
        effectiveWeights: { demandPressure: 0, growth: 0, congestion: 0, scale: 0 },
        congestionDetail: { indicatorSet, indicatorsUsed: [], indicatorsMissing: [] },
        score: null,
        nationalRank: null,
        confidence: "low",
        confidenceReasons: [`${a.code} has under ${PEER_FLOOR_PASSENGERS.toLocaleString("en-US")} scheduled passengers in the window, so it is outside the peer set and has no score.`],
      };
    }

    const missing = indicatorSet.filter((k) => a.congestion[k] === null);
    const complete = indicatorSet.length > 0 && missing.length === 0;
    const congestion = complete
      ? meanPercentile(indicatorSet.map((k) => cong[k]), indicatorSet.map((k) => a.congestion[k]))
      : null;

    const components: Components = {
      demandPressure: meanPercentile([lf, high], [a.loadFactorPct, a.highLfSeatSharePct]),
      growth: meanPercentile([cagrs, gaps], [a.paxCagrPct, a.growthGapPct]),
      congestion,
      scale: round(percentileRank(pax, a.passengers), 2),
    };

    const congestionReasons: string[] = [];
    if (indicatorSet.length === 0) {
      congestionReasons.push("Congestion could not be scored: no indicator is available for enough airports.");
    } else if (dropped.length > 0) {
      congestionReasons.push(
        `Congestion computed on ${list(indicatorSet)} only: ${dropped.map((k) => INDICATOR_NEEDS[k]).join(" and ")} unavailable for too many airports.`,
      );
    }
    if (missing.length > 0) {
      congestionReasons.push(`Congestion not scored for ${a.code}: no ${missing.map((k) => INDICATOR_NEEDS[k]).join(" or ")}.`);
    }

    let issues = 0;
    if (a.monthsWithService < 12) {
      issues += 1;
      reasons.push(`${a.code} had scheduled service in only ${a.monthsWithService} of the last 12 months.`);
    }
    if (congestionReasons.length > 0) {
      issues += 1;
      reasons.push(...congestionReasons);
    }
    if (a.paxCagrPct === null) {
      issues += 1;
      reasons.push(`Passenger growth could not be computed for ${a.code} (no ${GROWTH_YEARS[0]} baseline).`);
    }
    if (a.passengers < 250_000) {
      issues += 1;
      reasons.push(`${a.code} has under 250,000 passengers, a small sample.`);
    }

    const score = weightedScore(components, weights);
    const missingComponents = WEIGHT_KEYS.filter((k) => components[k] === null);
    const effective = score === null ? { demandPressure: 0, growth: 0, congestion: 0, scale: 0 } : effectiveWeights(components, weights);
    if (score !== null && missingComponents.length > 0) {
      const used = WEIGHT_KEYS.filter((k) => components[k] !== null).map((k) => `${COMPONENT_LABEL[k]} ${round(effective[k] * 100, 1)}%`);
      reasons.push(
        `The score for ${a.code} is computed without ${missingComponents.map((k) => COMPONENT_LABEL[k]).join(" and ")}; the remaining weights are rescaled to ${used.join(", ")}, so it is not on the same basis as scores with all four components.`,
      );
    }

    return {
      ...a,
      components,
      missingComponents,
      effectiveWeights: effective,
      congestionDetail: { indicatorSet, indicatorsUsed: complete ? indicatorSet : [], indicatorsMissing: missing },
      score,
      nationalRank: null,
      confidence: issues === 0 ? "high" : issues === 1 ? "medium" : "low",
      confidenceReasons: reasons,
    };
  });

  // Competition ranking: equal scores share a rank.
  const ranked = scored.filter((s) => s.score !== null).sort((x, y) => y.score! - x.score!);
  ranked.forEach((s, i) => {
    const prev = ranked[i - 1];
    s.nationalRank = prev && prev.score === s.score ? prev.nationalRank : i + 1;
  });
  return scored;
}
