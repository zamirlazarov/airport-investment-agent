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

describe("getNasStatus", () => {
  beforeEach(() => clearNasCache());
  afterEach(() => vi.unstubAllGlobals());

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
