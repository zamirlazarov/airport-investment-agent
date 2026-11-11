import type { Infra, Runway } from "../types.ts";

const ARCGIS = "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services";
const FACILITIES_URL = `${ARCGIS}/NTAD_Aviation_Facilities/FeatureServer/0/query`;
const RUNWAYS_URL = `${ARCGIS}/Runways_View/FeatureServer/0/query`;

const BATCH_SIZE = 150;
const TIMEOUT_MS = 8000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 20;
export const MIN_USABLE_RUNWAY_FT = 5000;

/**
 * BTS uses IATA codes and the FAA tables use FAA location identifiers. They match for almost every
 * airport; these peer airports differ. Each pair was checked against the airport name in the FAA table
 * (2026-11-11). Anything not listed here is looked up by its own code.
 */
export const FAA_ID_BY_BTS_CODE: Record<string, string> = {
  AZA: "IWA", // Phoenix-Mesa Gateway
  FCA: "GPI", // Glacier Park Intl
  HHH: "HXD", // Hilton Head
  SCE: "UNV", // State College Rgnl
  SPN: "GSN", // Saipan Intl
  USA: "JQF", // Concord-Padgett Rgnl
};
const faaId = (btsCode: string) => FAA_ID_BY_BTS_CODE[btsCode] ?? btsCode;

type Feature = { attributes?: Record<string, unknown> };
type LayerBody = { features?: Feature[]; exceededTransferLimit?: boolean; error?: unknown };

function features(body: unknown): Feature[] {
  const b = body as LayerBody | null;
  return b && !b.error && Array.isArray(b.features) ? b.features : [];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A surface is paved when its code starts with ASPH, CONC or PEM (asphalt, concrete, partially paved). */
export function isPaved(surface: string): boolean {
  return /^(ASPH|CONC|PEM)/i.test(surface);
}

/** Joins FAA facility and runway rows into one record per airport. Error bodies give an empty map. */
export function parseInfra(facilities: unknown, runways: unknown): Map<string, Infra> {
  const out = new Map<string, Infra>();
  for (const f of features(facilities)) {
    const a = f.attributes ?? {};
    const id = str(a["ARPT_ID"]);
    if (!id) continue;
    const acreage = num(a["ACREAGE"]);
    out.set(id, {
      name: str(a["ARPT_NAME"]) ?? id,
      runways: [],
      usableRunwayCount: 0,
      // Zero acres is a missing value in the FAA table, not a real airport size.
      acreage: acreage !== null && acreage > 0 ? acreage : null,
      effectiveDate: str(a["EFF_DATE"]),
    });
  }
  for (const f of features(runways)) {
    const a = f.attributes ?? {};
    const infra = out.get(str(a["ARPT_ID"]) ?? "");
    if (!infra) continue;
    const lengthFt = num(a["RWY_LEN"]) ?? 0;
    const surface = str(a["SURFACE_TYPE_CODE"]) ?? "";
    const runway: Runway = {
      id: str(a["RWY_ID"]) ?? "",
      lengthFt,
      widthFt: num(a["RWY_WIDTH"]) ?? 0,
      surface,
      usable: isPaved(surface) && lengthFt >= MIN_USABLE_RUNWAY_FT,
    };
    infra.runways.push(runway);
    if (runway.usable) infra.usableRunwayCount += 1;
  }
  return out;
}

type CacheEntry = { infra: Infra | null; at: number };
const cache = new Map<string, CacheEntry>();

export function clearInfraCache(): void {
  cache.clear();
}

async function queryLayer(url: string, codes: string[], fields: string, signal?: AbortSignal): Promise<Feature[]> {
  const all: Feature[] = [];
  const where = `ARPT_ID IN (${codes.map((c) => `'${c}'`).join(",")})`;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where, outFields: fields, returnGeometry: "false", f: "json", resultOffset: String(all.length),
    });
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(`${url}?${params}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!res.ok) throw new Error(`FAA service answered HTTP ${res.status}`);
    const body = (await res.json()) as LayerBody;
    if (body.error) throw new Error(`FAA service returned an error: ${JSON.stringify(body.error).slice(0, 200)}`);
    const rows = features(body);
    all.push(...rows);
    if (!body.exceededTransferLimit || rows.length === 0) break;
  }
  return all;
}

/**
 * Facilities and runways for the given airport codes. Cached for 24 hours per code, including
 * codes the FAA does not know. Failures never throw: they come back in `error`, together with
 * whatever was fetched, and are not cached.
 */
export async function getInfra(
  codes: string[],
  opts: { signal?: AbortSignal } = {},
): Promise<{ infra: Map<string, Infra>; error: string | null }> {
  const now = Date.now();
  const wanted = [...new Set(codes.map((c) => c.toUpperCase()))];
  const infra = new Map<string, Infra>();
  const missing: string[] = [];
  for (const code of wanted) {
    const hit = cache.get(code);
    if (hit && now - hit.at < CACHE_MS) {
      if (hit.infra) infra.set(code, hit.infra);
    } else {
      missing.push(code);
    }
  }

  const errors: string[] = [];
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const faaIds = batch.map(faaId);
    try {
      const [fac, rwy] = await Promise.all([
        queryLayer(FACILITIES_URL, faaIds, "ARPT_ID,ARPT_NAME,ACREAGE,EFF_DATE", opts.signal),
        queryLayer(RUNWAYS_URL, faaIds, "ARPT_ID,RWY_ID,RWY_LEN,RWY_WIDTH,SURFACE_TYPE_CODE", opts.signal),
      ]);
      const parsed = parseInfra({ features: fac }, { features: rwy });
      for (const code of batch) {
        const found = parsed.get(faaId(code)) ?? null;
        cache.set(code, { infra: found, at: now });
        if (found) infra.set(code, found);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { infra, error: errors.length ? `FAA runway service did not respond: ${errors[0]}` : null };
}
