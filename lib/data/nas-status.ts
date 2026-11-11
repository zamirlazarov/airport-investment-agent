import { XMLParser } from "fast-xml-parser";

export type AirportStatus = {
  status: "normal" | "delays" | "closed";
  events: { type: string; reason: string; detail: string }[];
};

const NAS_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const TIMEOUT_MS = 8000;
const CACHE_MS = 60 * 1000;

type Node = Record<string, unknown> | unknown[] | string | number | undefined;

function collectEvents(node: Node, type: string, out: { code: string; event: AirportStatus["events"][number] }[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectEvents(child as Node, type, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (typeof rec["ARPT"] === "string") {
    const detail = Object.entries(rec)
      .filter(([k, v]) => k !== "ARPT" && k !== "Reason" && (typeof v === "string" || typeof v === "number"))
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    out.push({ code: rec["ARPT"], event: { type, reason: String(rec["Reason"] ?? ""), detail } });
    return;
  }
  for (const [k, v] of Object.entries(rec)) if (k !== "Name") collectEvents(v as Node, type, out);
}

/**
 * Parses the FAA NAS status XML. Airports with no event are absent; callers treat absence as normal.
 * Note the FAA files NOTAM-style restrictions (for example a GA-only closure) under "Airport Closures",
 * so "closed" can mean a partial or time-limited closure; the event reason says which.
 */
export function parseNasStatus(xml: string): { updatedAt: string; byAirport: Map<string, AirportStatus> } {
  const parsed = new XMLParser({ parseTagValue: false }).parse(xml) as Record<string, Record<string, unknown>>;
  const root = parsed["AIRPORT_STATUS_INFORMATION"] ?? {};
  const rawTime = typeof root["Update_Time"] === "string" ? root["Update_Time"] : "";
  const time = rawTime ? new Date(rawTime) : null;
  const updatedAt = time && !Number.isNaN(time.getTime()) ? time.toISOString() : rawTime;

  const byAirport = new Map<string, AirportStatus>();
  const groups = ([] as Record<string, unknown>[]).concat((root["Delay_type"] as Record<string, unknown>[]) ?? []);
  for (const group of groups) {
    const type = String(group["Name"] ?? "Unknown");
    const found: { code: string; event: AirportStatus["events"][number] }[] = [];
    collectEvents(group as Node, type, found);
    for (const { code, event } of found) {
      const entry = byAirport.get(code) ?? { status: "delays" as const, events: [] };
      entry.events.push(event);
      if (/closure/i.test(type)) entry.status = "closed";
      byAirport.set(code, entry);
    }
  }
  return { updatedAt, byAirport };
}

let cached: { at: number; value: ReturnType<typeof parseNasStatus> } | undefined;

export function clearNasCache(): void {
  cached = undefined;
}

export async function getNasStatus(
  codes: string[],
): Promise<{ updatedAt: string | null; airports: Record<string, AirportStatus>; error: string | null }> {
  try {
    if (!cached || Date.now() - cached.at > CACHE_MS) {
      const res = await fetch(NAS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cached = { at: Date.now(), value: parseNasStatus(await res.text()) };
    }
    const { updatedAt, byAirport } = cached.value;
    const airports: Record<string, AirportStatus> = {};
    for (const raw of codes) {
      const code = raw.toUpperCase();
      airports[code] = byAirport.get(code) ?? { status: "normal", events: [] };
    }
    return { updatedAt, airports, error: null };
  } catch (err) {
    return {
      updatedAt: null,
      airports: {},
      error: `FAA NAS status did not respond: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
