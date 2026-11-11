/** How much weight a result can bear, from the completeness of the data behind it. */
export type Confidence = "high" | "medium" | "low";

export type Source = { name: string; url: string };

/** The periods the numbers in a result cover. */
export type DataWindow = {
  /** First and last month of the trailing 12 months of BTS T-100 data, as "YYYY-MM". */
  t100From: string;
  t100To: string;
  /** Calendar years the growth rates run between. */
  growthYears: [number, number];
  /** When the T-100 snapshot was built, ISO 8601. */
  snapshotGeneratedAt: string;
  /** FAA effective date of the airport and runway records, when they were used. */
  faaEffectiveDate: string | null;
};

/**
 * What every agent tool and data route returns: the figures, plus everything a reader
 * needs to judge them. The chat UI renders the non-result fields directly, so they never
 * depend on the model remembering to mention them.
 */
export type Envelope<T> = {
  result: T;
  assumptions: string[];
  dataWindow: DataWindow;
  sources: Source[];
  confidence: Confidence;
  confidenceReasons: string[];
};
