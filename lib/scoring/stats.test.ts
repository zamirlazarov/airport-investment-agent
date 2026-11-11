import { describe, expect, it } from "vitest";
import { cagr, percentileRank, ratio, sum } from "./stats.ts";

describe("stats", () => {
  it("sums, treating an empty list as 0", () => {
    expect(sum([1, 2, 3.5])).toBe(6.5);
    expect(sum([])).toBe(0);
  });

  it("ratio is null when the denominator is not positive", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, -2)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });

  it("percentileRank counts values below plus half of the ties", () => {
    // [10,20,30,40], 30: below = 2, equal = 1 -> (2 + 0.5) / 4 = 62.5%
    expect(percentileRank([10, 20, 30, 40], 30)).toBe(62.5);
    expect(percentileRank([5, 5, 5], 5)).toBe(50);
    expect(percentileRank([1, 2, 3, 4, 5], 5)).toBe(90); // (4 + 0.5) / 5
    expect(percentileRank([1, 2, 3, 4, 5], 1)).toBe(10); // (0 + 0.5) / 5
  });

  it("percentileRank is a neutral 50 for an empty peer list", () => {
    expect(percentileRank([], 3)).toBe(50);
  });

  it("cagr compounds over the given years", () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 9);
    expect(cagr(100, 100, 3)).toBe(0);
    expect(cagr(100, 50, 1)).toBeCloseTo(-0.5, 9);
  });

  it("cagr is null without a positive start or a positive span", () => {
    expect(cagr(0, 50, 2)).toBeNull();
    expect(cagr(-5, 50, 2)).toBeNull();
    expect(cagr(100, 121, 0)).toBeNull();
  });
});
