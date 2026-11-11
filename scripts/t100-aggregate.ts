import type { AirportRecord, RouteRecord, Snapshot } from "../lib/types.ts";

/** One BTS T-100 segment row, already parsed to numbers. */
export type T100Row = {
  year: number;
  month: number;
  /** BTS service class: "F" is scheduled passenger service. */
  class: string;
  origin: string;
  originCity: string; // "San Francisco, CA"
  originState: string;
  originCountry: string;
  dest: string;
  destCity: string;
  destCountry: string;
  distance: number;
  deps: number;
  seats: number;
  pax: number;
};

/** Airports with fewer scheduled passengers than this in the window are left out. */
export const MIN_WINDOW_PASSENGERS = 2500;

type Totals = { deps: number; seats: number; pax: number };

type RouteBuilder = {
  dest: string;
  destCity: string;
  destCountry: string;
  miles: number;
  deps: number[];
  seats: number[];
  pax: number[];
  otherDeps: number;
};

type AirportBuilder = {
  code: string;
  city: string;
  state: string;
  deps: number[];
  seats: number[];
  pax: number[];
  allDeps: number[];
  yearly: Record<string, Totals>;
  routes: Map<string, RouteBuilder>;
};

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const zeros = (n: number) => new Array<number>(n).fill(0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** "San Francisco, CA" -> "San Francisco". */
const cityName = (full: string) => full.split(",")[0]!.trim();

export function aggregateT100(
  rows: T100Row[],
  opts: { months: string[]; years: number[] },
): Snapshot["airports"] {
  const monthIndex = new Map(opts.months.map((m, i) => [m, i]));
  const years = new Set(opts.years);
  const n = opts.months.length;
  const builders = new Map<string, AirportBuilder>();

  for (const r of rows) {
    if (r.originCountry !== "US") continue;
    const idx = monthIndex.get(monthKey(r.year, r.month));
    const inYears = years.has(r.year);
    if (idx === undefined && !inYears) continue;

    let a = builders.get(r.origin);
    if (!a) {
      a = {
        code: r.origin,
        city: cityName(r.originCity),
        state: r.originState,
        deps: zeros(n),
        seats: zeros(n),
        pax: zeros(n),
        allDeps: zeros(n),
        yearly: Object.fromEntries(opts.years.map((y) => [String(y), { deps: 0, seats: 0, pax: 0 }])),
        routes: new Map(),
      };
      builders.set(r.origin, a);
    }

    const isPassenger = r.class === "F";
    if (isPassenger && inYears) {
      const y = a.yearly[String(r.year)]!;
      y.deps += r.deps;
      y.seats += r.seats;
      y.pax += r.pax;
    }
    if (idx === undefined) continue;

    a.allDeps[idx]! += r.deps;
    let route = a.routes.get(r.dest);
    if (!route) {
      route = {
        dest: r.dest,
        destCity: r.destCity,
        destCountry: r.destCountry,
        miles: r.distance,
        deps: zeros(n),
        seats: zeros(n),
        pax: zeros(n),
        otherDeps: 0,
      };
      a.routes.set(r.dest, route);
    }
    if (isPassenger) {
      a.deps[idx]! += r.deps;
      a.seats[idx]! += r.seats;
      a.pax[idx]! += r.pax;
      route.deps[idx]! += r.deps;
      route.seats[idx]! += r.seats;
      route.pax[idx]! += r.pax;
    } else {
      route.otherDeps += r.deps;
    }
  }

  const round = (xs: number[]) => xs.map(Math.round);
  const out: Snapshot["airports"] = {};
  for (const a of builders.values()) {
    if (sum(a.pax) < MIN_WINDOW_PASSENGERS) continue;
    const routes: RouteRecord[] = [...a.routes.values()]
      .sort((x, y) => (x.dest < y.dest ? -1 : x.dest > y.dest ? 1 : 0))
      .map((r) => ({
        dest: r.dest,
        destCity: r.destCity,
        destCountry: r.destCountry,
        miles: Math.round(r.miles),
        deps: round(r.deps),
        seats: round(r.seats),
        pax: round(r.pax),
        otherDeps: Math.round(r.otherDeps),
      }));
    const record: AirportRecord = {
      code: a.code,
      city: a.city,
      state: a.state,
      deps: round(a.deps),
      seats: round(a.seats),
      pax: round(a.pax),
      allDeps: round(a.allDeps),
      yearly: Object.fromEntries(
        Object.entries(a.yearly).map(([y, t]) => [
          y,
          { deps: Math.round(t.deps), seats: Math.round(t.seats), pax: Math.round(t.pax) },
        ]),
      ),
      routes,
    };
    out[a.code] = record;
  }
  return out;
}

/** The `count` months ending at `latest` ("YYYY-MM"), oldest first. */
export function trailingMonths(latest: string, count = 12): string[] {
  const [y, m] = latest.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}
