export function sum(xs: number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

/** n / d, or null when the denominator is not positive. */
export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** Percentile of `value` within `values`, 0-100: (below + half of the ties) / n. An empty list gives a neutral 50. */
export function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return ((below + 0.5 * equal) / values.length) * 100;
}

/** Compound annual growth rate as a fraction (0.1 = 10%), or null when it is undefined. */
export function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || years <= 0 || end < 0) return null;
  return (end / start) ** (1 / years) - 1;
}
