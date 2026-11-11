import type { Confidence, Envelope, Source } from "./types.ts";

export const SOURCES = {
  t100: {
    name: "BTS T-100 Segment (All Carriers)",
    url: "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG",
  },
  faaFacilities: {
    name: "FAA / NTAD Aviation Facilities",
    url: "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Aviation_Facilities/FeatureServer",
  },
  faaRunways: {
    name: "FAA / NTAD Runways",
    url: "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/Runways_View/FeatureServer",
  },
  nasStatus: {
    name: "FAA NAS Status",
    url: "https://nasstatus.faa.gov/api/airport-status-information",
  },
} as const satisfies Record<string, Source>;

/** What the data cannot show. Results attach the ones that apply to them. */
export const LIMITS = {
  noGateData:
    "No public data on gates or terminal floor area, so terminal expansion is inferred from demand pressure and land constraint.",
  t100Coverage:
    "T-100 lags by about three to four months and covers air carriers only (no general aviation).",
  noDelayData: "No delay or taxi-time data in this version.",
  relativeScores:
    "Scores are relative to the peer set, not absolute returns; costs, financing and regulation are out of scope.",
} as const;

const CONFIDENCE_ORDER: readonly Confidence[] = ["low", "medium", "high"];

/** The weakest level in the list; "high" when the list is empty. */
export function lowestConfidence(levels: readonly Confidence[]): Confidence {
  return CONFIDENCE_ORDER.find((level) => levels.includes(level)) ?? "high";
}

/** Wraps a result with its context, dropping repeated assumptions and sources. */
export function envelope<T>(result: T, context: Omit<Envelope<T>, "result">): Envelope<T> {
  const sourcesByUrl = new Map(context.sources.map((source) => [source.url, source]));
  return {
    result,
    assumptions: [...new Set(context.assumptions)],
    dataWindow: context.dataWindow,
    // A Map keeps the first position of each URL, so the order callers chose survives.
    sources: [...sourcesByUrl.values()].map((source) => ({ name: source.name, url: source.url })),
    confidence: context.confidence,
    confidenceReasons: [...new Set(context.confidenceReasons)],
  };
}
