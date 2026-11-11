import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNasCache, getNasStatus, parseNasStatus } from "./nas-status.ts";

const xml = readFileSync(new URL("./__fixtures__/nas-status.xml", import.meta.url), "utf8");

describe("parseNasStatus on a real FAA response", () => {
  const { updatedAt, byAirport } = parseNasStatus(xml);

  it("reads the update time as ISO", () => {
    expect(updatedAt).toBe("2026-11-11T14:52:42.000Z");
  });

  it("marks airports in the closure list as closed, keeping the reason", () => {
    expect(byAirport.get("SNA")!.status).toBe("closed");
    expect(byAirport.get("SNA")!.events[0]!.type).toBe("Airport Closures");
    expect(byAirport.get("SNA")!.events[0]!.reason).toContain("SNA AD AP CLSD");
    expect(byAirport.get("LAX")!.status).toBe("closed");
  });

  it("marks a ground delay as delays", () => {
    const sfo = byAirport.get("SFO")!;
    expect(sfo.status).toBe("delays");
    expect(sfo.events[0]).toMatchObject({ type: "Ground Delay Programs", reason: "low ceilings" });
    expect(sfo.events[0]!.detail).toContain("Avg: 1 hour and 2 minutes");
  });

  it("leaves airports with no event out of the map", () => {
    expect(byAirport.has("ANC")).toBe(false);
  });
});

describe("parseNasStatus edge cases", () => {
  it("handles several event types for one airport, closure winning", () => {
    const doc = `<AIRPORT_STATUS_INFORMATION><Update_Time>Wed Nov 11 14:52:42 2026 GMT</Update_Time>
      <Delay_type><Name>Ground Stops</Name><Ground_Stop_List><Program><ARPT>BOS</ARPT><Reason>thunderstorms</Reason></Program></Ground_Stop_List></Delay_type>
      <Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>BOS</ARPT><Reason>runway</Reason></Airport></Airport_Closure_List></Delay_type>
    </AIRPORT_STATUS_INFORMATION>`;
    const bos = parseNasStatus(doc).byAirport.get("BOS")!;
    expect(bos.status).toBe("closed");
    expect(bos.events.map((e) => e.type)).toEqual(["Ground Stops", "Airport Closures"]);
  });

  it("returns an empty map for a document with no delays", () => {
    const doc = "<AIRPORT_STATUS_INFORMATION><Update_Time>Wed Nov 11 14:52:42 2026 GMT</Update_Time></AIRPORT_STATUS_INFORMATION>";
    expect(parseNasStatus(doc).byAirport.size).toBe(0);
  });
});

// The fixture was captured at 2026-11-11 14:52 GMT; tests run just after it unless they say otherwise.
const FIXTURE_NOW = new Date("2026-11-11T15:00:00Z");

describe("parseNasStatus rejects documents that are not a real feed", () => {
  it.each([
    ["an HTML error page", "<html><body>502 Bad Gateway</body></html>"],
    ["an empty body", ""],
    ["a JSON body", "{}"],
    ["XML with another root", "<ERROR>down</ERROR>"],
  ])("throws for %s", (_name, body) => {
    expect(() => parseNasStatus(body)).toThrow("not the expected AIRPORT_STATUS_INFORMATION document");
  });

  it("throws when the update time is missing or unreadable", () => {
    expect(() => parseNasStatus("<AIRPORT_STATUS_INFORMATION></AIRPORT_STATUS_INFORMATION>")).toThrow("no valid update time");
    expect(() => parseNasStatus("<AIRPORT_STATUS_INFORMATION><Update_Time>yesterday-ish</Update_Time></AIRPORT_STATUS_INFORMATION>")).toThrow("no valid update time");
  });

  it("accepts an authentic feed that simply has no events", () => {
    const doc = "<AIRPORT_STATUS_INFORMATION><Update_Time>Wed Nov 11 14:52:42 2026 GMT</Update_Time></AIRPORT_STATUS_INFORMATION>";
    expect(parseNasStatus(doc).byAirport.size).toBe(0);
  });
});

describe("getNasStatus", () => {
  beforeEach(() => {
    clearNasCache();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["an HTML error page", "<html>502 Bad Gateway</html>"],
    ["an empty body", ""],
    ["a JSON body", "{}"],
  ])("returns an error, not 'normal', for %s served with HTTP 200", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const res = await getNasStatus(["SFO"]);
    expect(res.error).toContain("did not respond");
    expect(res.airports).toEqual({});
    expect(res.updatedAt).toBeNull();
  });

  it("returns an error for a stale feed", async () => {
    vi.setSystemTime(new Date("2026-11-11T18:00:00Z")); // three hours after the document's update time
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml)));
    const res = await getNasStatus(["SFO"]);
    expect(res.error).toContain("stale");
    expect(res.airports).toEqual({});
  });

  it("does not cache an invalid document, and recovers with a valid one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>")));
    expect((await getNasStatus(["SFO"])).error).not.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml)));
    const ok = await getNasStatus(["SFO"]);
    expect(ok.error).toBeNull();
    expect(ok.airports["SFO"]!.status).toBe("delays");
  });

  it("reports an authentic empty feed as normal for every requested airport", async () => {
    const empty = "<AIRPORT_STATUS_INFORMATION><Update_Time>Wed Nov 11 14:52:42 2026 GMT</Update_Time></AIRPORT_STATUS_INFORMATION>";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(empty)));
    const res = await getNasStatus(["SFO", "ANC"]);
    expect(res.error).toBeNull();
    expect(res.airports["SFO"]).toEqual({ status: "normal", events: [] });
  });

  it("reports requested airports with no event as normal, and caches for a minute", async () => {
    const fetchMock = vi.fn(async () => new Response(xml));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getNasStatus(["sfo", "ANC"]);
    await getNasStatus(["SNA"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.error).toBeNull();
    expect(first.airports["SFO"]!.status).toBe("delays");
    expect(first.airports["ANC"]).toEqual({ status: "normal", events: [] });
  });

  it("returns an error instead of throwing when the service is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await getNasStatus(["SFO"]);
    expect(res).toMatchObject({ updatedAt: null, airports: {} });
    expect(res.error).toContain("offline");
  });
});
