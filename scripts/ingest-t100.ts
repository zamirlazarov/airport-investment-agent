// Downloads BTS T-100 segment files, aggregates them and writes data/t100-snapshot.json.
// Usage: node scripts/ingest-t100.ts [--force]   (--force re-downloads cached years)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { unzipSync } from "fflate";
import type { Snapshot } from "../lib/types.ts";
import { aggregateT100, trailingMonths, type T100Row } from "./t100-aggregate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "t100");
const OUT = join(ROOT, "data", "t100-snapshot.json");
const FORM_URL = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Nv4%20Pn44vr45";
const YEARS = [2019, 2023, 2024, 2025, 2026];
const GROWTH_YEARS = [2019, 2023, 2024, 2025];
const FIELDS = [
  "DEPARTURES_PERFORMED", "SEATS", "PASSENGERS", "DISTANCE", "ORIGIN", "ORIGIN_CITY_NAME",
  "ORIGIN_STATE_ABR", "ORIGIN_COUNTRY", "DEST", "DEST_CITY_NAME", "DEST_COUNTRY", "YEAR", "MONTH", "CLASS",
];
const force = process.argv.includes("--force");

function hiddenInput(html: string, name: string): string {
  const tag = html.match(new RegExp(`<input[^>]*id="${name}"[^>]*>`))?.[0] ?? "";
  const value = tag.match(/value="([^"]*)"/)?.[1];
  if (value === undefined) throw new Error(`BTS form field ${name} not found; the page layout may have changed.`);
  return value;
}

async function downloadYear(year: number): Promise<Uint8Array> {
  const page = await fetch(FORM_URL);
  const html = await page.text();
  const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const body = new URLSearchParams({
    __VIEWSTATE: hiddenInput(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hiddenInput(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hiddenInput(html, "__EVENTVALIDATION"),
    cboGeography: "All",
    cboYear: String(year),
    cboPeriod: "All",
    chkDownloadZip: "on",
    btnDownload: "Download",
  });
  for (const f of FIELDS) body.set(f, "on");
  const res = await fetch(FORM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body,
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!res.ok || !isZip) {
    throw new Error(`BTS did not return a zip for ${year}: ${new TextDecoder().decode(bytes.slice(0, 300))}`);
  }
  return bytes;
}

async function loadYear(year: number): Promise<T100Row[]> {
  const file = join(CACHE, `${year}.zip`);
  if (force || !existsSync(file)) {
    console.log(`Downloading ${year}...`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, await downloadYear(year));
  }
  const files = unzipSync(new Uint8Array(readFileSync(file)));
  const name = Object.keys(files).find((n) => n.startsWith("T_"));
  if (!name) throw new Error(`No T_ data file in ${file}; found ${Object.keys(files).join(", ")}`);
  const records = parse(new TextDecoder().decode(files[name]), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return records.map((r) => ({
    year: Number(r["YEAR"]),
    month: Number(r["MONTH"]),
    class: r["CLASS"]!,
    origin: r["ORIGIN"]!,
    originCity: r["ORIGIN_CITY_NAME"]!,
    originState: r["ORIGIN_STATE_ABR"]!,
    originCountry: r["ORIGIN_COUNTRY"]!,
    dest: r["DEST"]!,
    destCity: r["DEST_CITY_NAME"]!,
    destCountry: r["DEST_COUNTRY"]!,
    distance: Number(r["DISTANCE"]),
    deps: Number(r["DEPARTURES_PERFORMED"]),
    seats: Number(r["SEATS"]),
    pax: Number(r["PASSENGERS"]),
  }));
}

const rowsByYear: Record<number, T100Row[]> = {};
for (const y of YEARS) rowsByYear[y] = await loadYear(y);
const rows = YEARS.flatMap((y) => rowsByYear[y]!);

// Latest month with scheduled passenger departures in the newest file.
const newest = rowsByYear[YEARS[YEARS.length - 1]!]!;
const latest = newest
  .filter((r) => r.deps > 0)
  .reduce((best, r) => Math.max(best, r.year * 12 + r.month - 1), 0);
const latestMonth = `${Math.floor(latest / 12)}-${String((latest % 12) + 1).padStart(2, "0")}`;
const months = trailingMonths(latestMonth, 12);

const airports = aggregateT100(rows, { months, years: GROWTH_YEARS });
const snapshot: Snapshot = {
  meta: {
    generatedAt: new Date().toISOString(),
    months,
    years: GROWTH_YEARS,
    latestMonth,
    rowCounts: { ...Object.fromEntries(YEARS.map((y) => [String(y), rowsByYear[y]!.length])), airports: Object.keys(airports).length },
  },
  airports,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot));
console.log(`Wrote ${OUT}: ${Object.keys(airports).length} airports, months ${months[0]}..${latestMonth}.`);
