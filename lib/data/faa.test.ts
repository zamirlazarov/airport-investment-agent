import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearInfraCache, getInfra, isPaved, parseInfra } from "./faa.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

describe("parseInfra on real FAA responses", () => {
  const infra = parseInfra(fixture("facilities.json"), fixture("runways.json"));

  it("counts usable runways per airport (paved and at least 5,000 ft)", () => {
    expect(infra.get("SFO")!.runways).toHaveLength(4);
    expect(infra.get("SFO")!.usableRunwayCount).toBe(4); // 7650, 8650, 11870, 11381 ft
    expect(infra.get("LAX")!.usableRunwayCount).toBe(4);
    expect(infra.get("ANC")!.usableRunwayCount).toBe(3);
  });

  it("marks a short runway as unusable", () => {
    const sna = infra.get("SNA")!;
    expect(sna.runways).toHaveLength(2);
    expect(sna.runways.find((r) => r.id === "02R/20L")).toMatchObject({ lengthFt: 2886, usable: false });
    expect(sna.usableRunwayCount).toBe(1); // 02L/20R is 5,700 ft
  });

  it("reads acreage and effective date", () => {
    expect(infra.get("SNA")!.acreage).toBe(510);
    expect(infra.get("LAX")!.acreage).toBe(3500);
    expect(infra.get("SFO")!.effectiveDate).toBe("2026/10/29");
  });
});

describe("parseInfra edge cases", () => {
  const fac = (id: string, acreage: number | null) => ({ features: [{ attributes: { ARPT_ID: id, ARPT_NAME: id, ACREAGE: acreage, EFF_DATE: null } }] });
  const rwy = (id: string, len: number | null, surface: string) => ({ features: [{ attributes: { ARPT_ID: id, RWY_ID: "09/27", RWY_LEN: len, RWY_WIDTH: 100, SURFACE_TYPE_CODE: surface } }] });

  it("treats non-paved surfaces and missing lengths as unusable", () => {
    expect(parseInfra(fac("AAA", 100), rwy("AAA", 6000, "TURF")).get("AAA")!.usableRunwayCount).toBe(0);
    expect(parseInfra(fac("AAA", 100), rwy("AAA", 4000, "ASPH")).get("AAA")!.usableRunwayCount).toBe(0);
    expect(parseInfra(fac("AAA", 100), rwy("AAA", null, "ASPH")).get("AAA")!.usableRunwayCount).toBe(0);
    expect(parseInfra(fac("AAA", 100), rwy("AAA", 5000, "PEM")).get("AAA")!.usableRunwayCount).toBe(1);
  });

  it("treats zero or missing acreage as unknown", () => {
    expect(parseInfra(fac("AAA", 0), { features: [] }).get("AAA")!.acreage).toBeNull();
    expect(parseInfra(fac("AAA", null), { features: [] }).get("AAA")!.acreage).toBeNull();
  });

  it("returns an empty map for an ArcGIS error body", () => {
    const err = { error: { code: 400, message: "Invalid query" } };
    expect(parseInfra(err, err).size).toBe(0);
  });

  it("ignores runways whose airport has no facility row", () => {
    expect(parseInfra({ features: [] }, rwy("ZZZ", 8000, "ASPH")).size).toBe(0);
  });

  it("recognises paved surface codes", () => {
    expect(["ASPH", "ASPH-CONC", "CONC", "PEM-ASPH"].every(isPaved)).toBe(true);
    expect(["TURF", "GRVL", "DIRT", ""].some(isPaved)).toBe(false);
  });
});

describe("getInfra", () => {
  beforeEach(() => clearInfraCache());
  afterEach(() => vi.unstubAllGlobals());

  const respond = () =>
    vi.fn(async (url: string | URL) => {
      const body = String(url).includes("Runways_View") ? fixture("runways.json") : fixture("facilities.json");
      return new Response(JSON.stringify(body), { status: 200 });
    });

  it("does not throw when the network fails, and says why", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ETIMEDOUT"); }));
    const { infra, error } = await getInfra(["SFO"]);
    expect(infra.size).toBe(0);
    expect(error).toContain("did not respond");
    expect(error).toContain("ETIMEDOUT");
  });

  it("reports an ArcGIS error body as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 500 } }), { status: 200 })));
    const { infra, error } = await getInfra(["SFO"]);
    expect(infra.size).toBe(0);
    expect(error).not.toBeNull();
  });

  it.each([
    ["an empty object", {}],
    ["a body with no features list", { objectIdFieldName: "OBJECTID" }],
    ["features that is not a list", { features: "none" }],
    ["a malformed feature", { features: [null] }],
    ["a feature without attributes", { features: [{}] }],
  ])("treats %s as a failed request, not as missing airports", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const { infra, error } = await getInfra(["SFO"]);
    expect(infra.size).toBe(0);
    expect(error).toContain("did not respond");
  });

  it("does not cache a malformed answer: a healthy answer afterwards is used", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await getInfra(["SFO"])).error).not.toBeNull();
    const fetchMock = respond();
    vi.stubGlobal("fetch", fetchMock);
    const second = await getInfra(["SFO"]);
    expect(second.error).toBeNull();
    expect(second.infra.has("SFO")).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("accepts an empty features list as 'the FAA has no such airport', and remembers it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getInfra(["QQQ"]);
    expect(first).toMatchObject({ error: null });
    expect(first.infra.size).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await getInfra(["QQQ"]);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("hits the network once for the same codes, including codes the FAA does not know", async () => {
    const fetchMock = respond();
    vi.stubGlobal("fetch", fetchMock);
    const first = await getInfra(["SFO", "SNA", "QQQ"]);
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBe(2); // one facilities query, one runways query
    const second = await getInfra(["sna", "SFO", "QQQ"]);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(first.error).toBeNull();
    expect([...second.infra.keys()].sort()).toEqual(["SFO", "SNA"]);
  });

  it("does not cache failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    await getInfra(["SFO"]);
    const fetchMock = respond();
    vi.stubGlobal("fetch", fetchMock);
    const { infra, error } = await getInfra(["SFO"]);
    expect(error).toBeNull();
    expect(infra.has("SFO")).toBe(true);
  });

  it("looks up airports whose FAA identifier differs from the BTS code, and returns them under the BTS code", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      urls.push(decodeURIComponent(String(url)));
      const body = String(url).includes("Runways_View")
        ? { features: [{ attributes: { ARPT_ID: "UNV", RWY_ID: "06/24", RWY_LEN: 6701, RWY_WIDTH: 150, SURFACE_TYPE_CODE: "ASPH" } }] }
        : { features: [{ attributes: { ARPT_ID: "UNV", ARPT_NAME: "STATE COLLEGE RGNL", ACREAGE: 1105, EFF_DATE: "2026/10/29" } }] };
      return new Response(JSON.stringify(body));
    }));
    const { infra } = await getInfra(["SCE"]);
    expect(urls.every((u) => u.includes("'UNV'") && !u.includes("'SCE'"))).toBe(true);
    expect(infra.get("SCE")).toMatchObject({ name: "STATE COLLEGE RGNL", acreage: 1105, usableRunwayCount: 1 });
    expect(infra.has("UNV")).toBe(false);
  });

  it("splits more than 150 codes into batches", async () => {
    const fetchMock = respond();
    vi.stubGlobal("fetch", fetchMock);
    const codes = Array.from({ length: 151 }, (_, i) => `A${String(i).padStart(2, "0")}`);
    await getInfra(codes);
    expect(fetchMock.mock.calls.length).toBe(4); // two batches x two layers
  });

  it("pages while the service reports exceededTransferLimit", async () => {
    const page = (n: number) => ({
      features: [{ attributes: { ARPT_ID: `P${n}`, ARPT_NAME: "x", ACREAGE: 10, EFF_DATE: null } }],
      exceededTransferLimit: n === 0,
    });
    let facilityCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("Runways_View")) return new Response(JSON.stringify({ features: [] }));
      return new Response(JSON.stringify(page(facilityCalls++)));
    }));
    const { infra } = await getInfra(["P0", "P1"]);
    expect(facilityCalls).toBe(2);
    expect([...infra.keys()].sort()).toEqual(["P0", "P1"]);
  });
});
