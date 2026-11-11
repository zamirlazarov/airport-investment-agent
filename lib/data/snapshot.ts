import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AirportRecord, Snapshot } from "../types.ts";

let cached: Snapshot | undefined;

/**
 * The committed T-100 snapshot, read once from `data/` under the project root.
 * Read with fs rather than a JSON import so Next and eve bundlers never inline 7 MB.
 */
export function getSnapshot(): Snapshot {
  cached ??= JSON.parse(readFileSync(join(process.cwd(), "data", "t100-snapshot.json"), "utf8")) as Snapshot;
  return cached;
}

export function getAirport(code: string): AirportRecord | undefined {
  return getSnapshot().airports[code.toUpperCase()];
}

export function listAirports(): AirportRecord[] {
  return Object.values(getSnapshot().airports);
}
