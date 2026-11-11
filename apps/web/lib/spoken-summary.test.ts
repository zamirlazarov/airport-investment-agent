import { describe, expect, it } from "vitest";
import { answerMarkdown, spokenSummary } from "./spoken-summary.ts";

describe("spokenSummary", () => {
  it("speaks the opening paragraph and leaves the table on screen", () => {
    const reply = "SFO has **82%** load factor.\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    expect(spokenSummary(reply)).toBe("SFO has 82% load factor.");
  });

  it("skips a leading table and heading to reach the first prose paragraph", () => {
    const reply = "| a | b |\n|---|---|\n| 1 | 2 |\n\n## Evidence\n\nBoston ranks first.";
    expect(spokenSummary(reply)).toBe("Boston ranks first.");
  });

  it("returns nothing when the reply has no prose", () => {
    expect(spokenSummary("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("");
    expect(spokenSummary("")).toBe("");
  });

  it("reads link text, not the URL, and drops Markdown markers", () => {
    const reply = "See [BTS T-100](https://example.test/t100) for `SFO` and *LAX*.";
    expect(spokenSummary(reply)).toBe("See BTS T-100 for SFO and LAX.");
  });

  it("reads a list item without its marker", () => {
    expect(spokenSummary("- Boston leads the region.")).toBe("Boston leads the region.");
    expect(spokenSummary("1. Boston leads the region.")).toBe("Boston leads the region.");
  });

  it("joins a paragraph wrapped over several lines", () => {
    expect(spokenSummary("Boston leads\nthe region.")).toBe("Boston leads the region.");
  });

  it("cuts a long paragraph at the last full sentence within the limit", () => {
    const sentence = "This sentence is exactly fifty characters long, ok. "; // 52 characters with the space
    const reply = sentence.repeat(18).trim(); // 935 characters; 11 sentences fit in 600
    const spoken = spokenSummary(reply);

    expect(reply.length).toBeGreaterThan(850);
    expect(spoken.length).toBeLessThanOrEqual(600);
    expect(spoken.endsWith("ok.")).toBe(true);
    expect(spoken).toBe(sentence.repeat(11).trim());
  });

  it("cuts at a word boundary when one sentence exceeds the limit", () => {
    const spoken = spokenSummary("word ".repeat(200).trim(), 50);
    expect(spoken.length).toBeLessThanOrEqual(50);
    expect(spoken.endsWith("word")).toBe(true);
  });

  it("does not treat a decimal point as the end of a sentence", () => {
    const reply = `${"x".repeat(40)} is 82.3 percent of the total and still going. Next sentence here.`;
    expect(spokenSummary(reply, 50)).not.toMatch(/82\.$/);
  });
});

describe("answerMarkdown", () => {
  it("takes the text written after the last tool call", () => {
    const parts = [
      { type: "text", text: "Let me look that up." },
      { type: "tool" },
      { type: "text", text: "Anchorage is 13% long haul." },
      { type: "text", text: "| a |\n|---|" },
    ];
    expect(answerMarkdown(parts)).toBe("Anchorage is 13% long haul.\n\n| a |\n|---|");
  });

  it("takes all the text when the reply used no tools", () => {
    expect(answerMarkdown([{ type: "text", text: "Hello." }, { type: "reasoning", text: "hm" }])).toBe(
      "Hello.",
    );
  });

  it("falls back to earlier text when nothing follows the last tool call", () => {
    expect(answerMarkdown([{ type: "text", text: "Checking." }, { type: "tool" }])).toBe("Checking.");
  });

  it("is empty for a reply with no text", () => {
    expect(answerMarkdown([{ type: "tool" }])).toBe("");
  });
});
