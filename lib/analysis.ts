import { envelope, LIMITS, lowestConfidence, SOURCES } from "./envelope.ts";
import { getInfra } from "./data/faa.ts";
import { type AirportStatus, getNasStatus } from "./data/nas-status.ts";
import { getAirport, getSnapshot, listAirports } from "./data/snapshot.ts";
import { type RegionKey, statesForRegion } from "./regions.ts";
import { type LongHaulResult, longHaulShare } from "./scoring/long-haul.ts";
import { type HubClass, GROWTH_YEARS, normalizeWeights, PEER_FLOOR_PASSENGERS, type RawMetrics, rawMetrics, type ScoredAirport, scoreAirports, type Weights } from "./scoring/expansion.ts";
import { sum } from "./scoring/stats.ts";
import { UNMET_DEMAND_INTERPRETATION, type UnmetDemandProxyResult, unmetDemandProxy } from "./scoring/unmet-demand.ts";
import type { AirportRecord, Confidence, DataWindow, Envelope, Infra, Source } from "./types.ts";

export class UnknownAirportError extends Error {
  constructor(code: string) {
    super(`Unknown airport code "${code}". Call find_airports to look it up.`);
    this.name = "UnknownAirportError";
  }
}

const DEFAULT_THRESHOLD_MILES = 2500;
const DEFAULT_LF_THRESHOLD = 0.8;
const DEFAULT_TOP_ROUTES = 5;
const FAA_DOWN_REASON = "FAA runway service did not respond; congestion computed from peak-month factor only.";

function requireAirport(code: string): AirportRecord {
  const airport = getAirport(code);
  if (!airport) throw new UnknownAirportError(code.toUpperCase());
  return airport;
}

function dataWindow(infra?: Iterable<Infra>): DataWindow {
  const { meta } = getSnapshot();
  const first = infra ? [...infra].find((i) => i.effectiveDate) : undefined;
  return {
    t100From: meta.months[0]!,
    t100To: meta.latestMonth,
    growthYears: GROWTH_YEARS,
    snapshotGeneratedAt: meta.generatedAt,
    faaEffectiveDate: first?.effectiveDate ?? null,
  };
}

// --- national scoring -------------------------------------------------------------------------

type Base = { raw: RawMetrics[]; infra: Map<string, Infra>; infraError: string | null };
let baseMemo: Base | undefined;

/** Raw metrics for every airport, with FAA data fetched in bulk for the peer set. Failures are not memoized. */
async function loadBase(): Promise<Base> {
  if (baseMemo) return baseMemo;
  const airports = listAirports();
  const usTotal = sum(airports.map((a) => sum(a.pax)));
  const peerCodes = airports.filter((a) => sum(a.pax) >= PEER_FLOOR_PASSENGERS).map((a) => a.code);
  const { infra, error } = await getInfra(peerCodes);
  const base: Base = {
    raw: airports.map((a) => rawMetrics(a, infra.get(a.code), usTotal)),
    infra,
    infraError: error,
  };
  if (!error) baseMemo = base;
  return base;
}

/** Clears the memoized national base. For tests. */
export function resetAnalysisCache(): void {
  baseMemo = undefined;
}

type National = { scored: ScoredAirport[]; weights: Weights; peerCount: number; infra: Map<string, Infra>; infraError: string | null };

async function national(weightsInput?: Partial<Weights>): Promise<National> {
  const weights = normalizeWeights(weightsInput);
  const base = await loadBase();
  const scored = scoreAirports(base.raw, weights);
  return { scored, weights, peerCount: scored.filter((s) => s.inPeerSet).length, infra: base.infra, infraError: base.infraError };
}

// --- envelope helpers -------------------------------------------------------------------------

const pctText = (x: number) => `${Math.round(x * 1000) / 10}%`;
const weightsSentence = (w: Weights) =>
  `Expansion Opportunity Score weights: demand pressure ${pctText(w.demandPressure)}, growth ${pctText(w.growth)}, congestion ${pctText(w.congestion)}, scale ${pctText(w.scale)}.`;
const peerSentence = (n: number) =>
  `Scores are percentiles within the peer set: ${n} US airports with at least ${PEER_FLOOR_PASSENGERS.toLocaleString("en-US")} scheduled passengers in the last 12 months.`;
const INDICATOR_NAMES = { departuresPerRunway: "departures per runway", peakMonthFactor: "peak-month factor", boardingsPerAcre: "boardings per acre" } as const;

function congestionSentence(scored: ScoredAirport[]): string {
  const set = scored.find((s) => s.inPeerSet)?.congestionDetail.indicatorSet ?? [];
  return set.length
    ? `Congestion index uses: ${set.map((k) => INDICATOR_NAMES[k]).join(", ")} (same indicators for every airport in this run).`
    : "Congestion index could not be computed for any airport in this run.";
}

function scoredEnvelope<T>(result: T, scored: ScoredAirport[], nat: National, extra: string[] = []): Envelope<T> {
  const sources: Source[] = [SOURCES.t100];
  if (nat.infra.size > 0) sources.push(SOURCES.faaFacilities, SOURCES.faaRunways);
  const reasons = scored.flatMap((s) => s.confidenceReasons);
  const levels: Confidence[] = scored.map((s) => s.confidence);
  if (nat.infraError) {
    reasons.unshift(FAA_DOWN_REASON);
    levels.push("medium");
  }
  return envelope(result, {
    assumptions: [
      weightsSentence(nat.weights),
      peerSentence(nat.peerCount),
      congestionSentence(nat.scored),
      ...extra,
      LIMITS.noGateData, LIMITS.t100Coverage, LIMITS.noDelayData, LIMITS.relativeScores,
    ],
    dataWindow: dataWindow(nat.infra.values()),
    sources,
    confidence: lowestConfidence(levels),
    confidenceReasons: reasons,
  });
}

function scoredOne(nat: National, code: string): ScoredAirport {
  requireAirport(code);
  return nat.scored.find((s) => s.code === code.toUpperCase())!;
}

// --- public functions -------------------------------------------------------------------------

export async function airportMetrics(code: string, opts: { weights?: Partial<Weights> } = {}): Promise<Envelope<ScoredAirport & { peerCount: number }>> {
  const nat = await national(opts.weights);
  const s = scoredOne(nat, code);
  return scoredEnvelope({ ...s, peerCount: nat.peerCount }, [s], nat);
}

export async function compareAirports(
  codes: string[],
  opts: { focus?: "all" | "congestion" | "demand" | "growth"; weights?: Partial<Weights> } = {},
): Promise<Envelope<{ focus: string; airports: ScoredAirport[]; peerCount: number }>> {
  const nat = await national(opts.weights);
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  const airports = unique.map((c) => scoredOne(nat, c));
  const focus = opts.focus ?? "all";
  return scoredEnvelope({ focus, airports, peerCount: nat.peerCount }, airports, nat, [
    `Comparison focus: ${focus}. Percentile components are relative to the whole national peer set, not just these airports.`,
  ]);
}

export async function rankAirports(q: { region?: RegionKey; states?: string[]; hubClass?: HubClass; weights?: Partial<Weights>; limit?: number } = {}): Promise<
  Envelope<{ scope: string; weights: Weights; peerCount: number; scopedCount: number; ranking: (ScoredAirport & { scopeRank: number })[] }>
> {
  const nat = await national(q.weights);
  let allowed: Set<string> | null = null;
  if (q.states?.length) allowed = new Set(q.states.map((s) => s.toUpperCase()));
  if (q.region) {
    const regionStates = new Set(statesForRegion(q.region));
    allowed = allowed ? new Set([...allowed].filter((s) => regionStates.has(s))) : regionStates;
  }
  const inScope = nat.scored
    .filter((s) => s.score !== null && (!allowed || allowed.has(s.state)) && (!q.hubClass || s.hubClass === q.hubClass))
    .sort((a, b) => b.score! - a.score! || a.code.localeCompare(b.code));
  const ranking = inScope.slice(0, q.limit ?? 10).map((s, i) => ({ ...s, scopeRank: i + 1 }));

  const parts = [q.region, q.states?.length ? `states ${q.states.map((s) => s.toUpperCase()).join(", ")}` : null, q.hubClass ? `${q.hubClass} hubs` : null].filter(Boolean);
  const scope = parts.length ? parts.join(", ") : "all US peer airports";
  const extra = [`Ranking scope: ${scope}; ${inScope.length} airports in scope.`];
  if (inScope.length === 0) {
    extra.push(`No airport in this scope is in the peer set. Only airports with at least ${PEER_FLOOR_PASSENGERS.toLocaleString("en-US")} scheduled passengers in the last 12 months are ranked.`);
  }
  return scoredEnvelope({ scope, weights: nat.weights, peerCount: nat.peerCount, scopedCount: inScope.length, ranking }, ranking, nat, extra);
}

function simpleConfidence(a: AirportRecord): { confidence: Confidence; reasons: string[] } {
  const months = a.deps.filter((d) => d > 0).length;
  if (sum(a.deps) === 0) return { confidence: "low", reasons: [`${a.code} had no scheduled passenger service in the last 12 months.`] };
  if (months < 12) return { confidence: "medium", reasons: [`${a.code} had scheduled service in only ${months} of the last 12 months.`] };
  return { confidence: "high", reasons: [] };
}

export async function longHaul(code: string, opts: { thresholdMiles?: number } = {}): Promise<Envelope<LongHaulResult & { code: string; city: string }>> {
  const a = requireAirport(code);
  const threshold = opts.thresholdMiles ?? DEFAULT_THRESHOLD_MILES;
  const { confidence, reasons } = simpleConfidence(a);
  return envelope({ ...longHaulShare(a.routes, threshold), code: a.code, city: a.city }, {
    assumptions: [
      `Long haul means routes of at least ${threshold.toLocaleString("en-US")} statute miles.`,
      "Passenger flights are scheduled passenger service (BTS class F); all flights add cargo and other classes. Both views are shown.",
      "Shares are of departures performed, not of passengers.",
      LIMITS.t100Coverage,
    ],
    dataWindow: dataWindow(),
    sources: [SOURCES.t100],
    confidence,
    confidenceReasons: reasons,
  });
}

export async function unmet(code: string, opts: { lfThreshold?: number; topRoutes?: number } = {}): Promise<Envelope<UnmetDemandProxyResult & { code: string; city: string }>> {
  const a = requireAirport(code);
  const lfThreshold = opts.lfThreshold ?? DEFAULT_LF_THRESHOLD;
  const result = unmetDemandProxy(a.routes, getSnapshot().meta.months, { lfThreshold, topRoutes: opts.topRoutes ?? DEFAULT_TOP_ROUTES });
  const { confidence, reasons } = simpleConfidence(a);
  return envelope({ ...result, code: a.code, city: a.city }, {
    assumptions: [
      UNMET_DEMAND_INTERPRETATION,
      `Load-factor threshold: ${Math.round(lfThreshold * 100)}% (an assumption; it can be changed). Each route-month is measured separately.`,
      "Load factor is passengers divided by seats, from T-100 scheduled passenger service.",
      LIMITS.t100Coverage,
    ],
    dataWindow: dataWindow(),
    sources: [SOURCES.t100],
    confidence,
    confidenceReasons: reasons,
  });
}

export async function liveStatus(codes: string[]): Promise<Envelope<{ updatedAt: string | null; airports: Record<string, AirportStatus> }>> {
  const res = await getNasStatus(codes);
  if (res.error) throw new Error(res.error);
  return envelope({ updatedAt: res.updatedAt, airports: res.airports }, {
    assumptions: [
      "Live snapshot of this minute; not used in any score.",
      "The FAA files NOTAM-style restrictions (for example closures to general aviation) under Airport Closures, so 'closed' can mean a partial or time-limited closure; read the reason.",
    ],
    dataWindow: dataWindow(),
    sources: [SOURCES.nasStatus],
    confidence: "high",
    confidenceReasons: [],
  });
}

export type AirportDetail = {
  metrics: ScoredAirport;
  longHaul: LongHaulResult;
  unmet: UnmetDemandProxyResult;
  monthly: { month: string; loadFactorPct: number | null; passengers: number; departures: number }[];
};

export async function airportDetail(code: string): Promise<Envelope<AirportDetail>> {
  const a = requireAirport(code);
  const nat = await national();
  const metrics = scoredOne(nat, code);
  const { months } = getSnapshot().meta;
  const monthly = months.map((month, i) => ({
    month,
    loadFactorPct: a.seats[i]! > 0 ? Math.round((a.pax[i]! / a.seats[i]!) * 1000) / 10 : null,
    passengers: a.pax[i]!,
    departures: a.deps[i]!,
  }));
  return scoredEnvelope(
    {
      metrics,
      longHaul: longHaulShare(a.routes, DEFAULT_THRESHOLD_MILES),
      unmet: unmetDemandProxy(a.routes, months, { lfThreshold: DEFAULT_LF_THRESHOLD, topRoutes: 5 }),
      monthly,
    },
    [metrics],
    nat,
    [UNMET_DEMAND_INTERPRETATION, `Long haul threshold ${DEFAULT_THRESHOLD_MILES} miles; unmet-demand load-factor threshold ${DEFAULT_LF_THRESHOLD * 100}%.`],
  );
}

/** Scores of every peer-set airport, for the dashboard. */
export async function allScores(weights?: Partial<Weights>): Promise<Envelope<ScoredAirport[]>> {
  const nat = await national(weights);
  const peers = nat.scored.filter((s) => s.inPeerSet);
  return scoredEnvelope(peers, peers, nat);
}
