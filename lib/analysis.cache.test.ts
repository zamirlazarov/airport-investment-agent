import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MINI_SNAPSHOT } from "./__fixtures__/mini-snapshot.ts";

// Real FAA client (with its 24-hour cache) over a stubbed network and the three-airport mini snapshot.
vi.mock("./data/snapshot.ts", () => ({
  getSnapshot: () => MINI_SNAPSHOT,
  getAirport: (code: string) => MINI_SNAPSHOT.airports[code.toUpperCase()],
  listAirports: () => Object.values(MINI_SNAPSHOT.airports),
}));

const { rankAirports, resetAnalysisCache } = await import("./analysis.ts");
const { clearInfraCache } = await import("./data/faa.ts");

let revision = "2026/10/29";
let fetchCalls = 0;
let mode: "ok" | "bad" = "ok";

function stubFaa() {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    fetchCalls += 1;
    if (mode === "bad") return new Response("{}", { status: 200 });
    const where = decodeURIComponent(String(url));
    const codes = ["AAA", "BBB", "CCC"].filter((c) => where.includes(`'${c}'`));
    const body = String(url).includes("Runways_View")
      ? { features: codes.map((c) => ({ attributes: { ARPT_ID: c, RWY_ID: "09/27", RWY_LEN: 8000, RWY_WIDTH: 150, SURFACE_TYPE_CODE: "ASPH" } })) }
      : { features: codes.map((c) => ({ attributes: { ARPT_ID: c, ARPT_NAME: c, ACREAGE: 500, EFF_DATE: revision } })) };
    return new Response(JSON.stringify(body));
  }));
}

beforeEach(() => {
  revision = "2026/10/29";
  fetchCalls = 0;
  mode = "ok";
  clearInfraCache();
  resetAnalysisCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  stubFaa();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FAA data through the analysis layer", () => {
  it("fetches once, reuses the answer within 24 hours, and fetches again after it expires", async () => {
    const first = await rankAirports({});
    expect(fetchCalls).toBe(2); // one facilities query and one runways query
    expect(first.dataWindow.faaEffectiveDate).toBe("2026/10/29");

    vi.setSystemTime(new Date("2026-11-12T11:00:00Z")); // 23 hours later
    await rankAirports({});
    expect(fetchCalls).toBe(2);

    revision = "2026/11/26";
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z")); // 48 hours after the first load
    const later = await rankAirports({});
    expect(fetchCalls).toBe(4);
    expect(later.dataWindow.faaEffectiveDate).toBe("2026/11/26");
  });

  it("shares one load between concurrent requests", async () => {
    await Promise.all([rankAirports({}), rankAirports({}), rankAirports({})]);
    expect(fetchCalls).toBe(2);
  });

  it("recovers after a malformed answer: the bad one is neither used as 'no data' nor kept", async () => {
    mode = "bad";
    const degraded = await rankAirports({});
    expect(degraded.confidenceReasons.join(" ")).toContain("FAA runway service did not respond");
    expect(degraded.result.ranking.every((r) => r.congestionDetail.indicatorSet.join() === "peakMonthFactor")).toBe(true);

    mode = "ok";
    const healthy = await rankAirports({});
    expect(healthy.confidenceReasons.join(" ")).not.toContain("did not respond");
    expect(healthy.result.ranking[0]!.congestionDetail.indicatorSet).toHaveLength(3);
  });
});
