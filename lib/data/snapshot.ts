import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AirportRecord, Snapshot } from "../types.ts";

const FILE = join("data", "t100-snapshot.json");
let cached: Snapshot | undefined;

/** The snapshot lives in `data/` at the project root. Look under the working directory, then upward from this module. */
function snapshotPath(): string {
  const candidates = [resolve(process.cwd(), FILE)];
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    candidates.push(join(dir, FILE));
    dir = dirname(dir);
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`T-100 snapshot not found (looked for ${FILE} from ${process.cwd()}). Run npm run data:refresh.`);
  return found;
}

/** The committed T-100 snapshot, read once with fs so bundlers never inline 7 MB. */
export function getSnapshot(): Snapshot {
  cached ??= JSON.parse(readFileSync(snapshotPath(), "utf8")) as Snapshot;
  return cached;
}

export function getAirport(code: string): AirportRecord | undefined {
  return getSnapshot().airports[code.toUpperCase()];
}

export function listAirports(): AirportRecord[] {
  return Object.values(getSnapshot().airports);
}
