/** US Census Bureau divisions and regions, by state postal code. Territories belong to none. */
const DIVISIONS = {
  "new-england": ["CT", "ME", "MA", "NH", "RI", "VT"],
  "mid-atlantic": ["NJ", "NY", "PA"],
  "south-atlantic": ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV"],
  "east-north-central": ["IL", "IN", "MI", "OH", "WI"],
  "east-south-central": ["AL", "KY", "MS", "TN"],
  "west-north-central": ["IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  "west-south-central": ["AR", "LA", "OK", "TX"],
  mountain: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"],
  pacific: ["AK", "CA", "HI", "OR", "WA"],
} as const;

const REGIONS = {
  northeast: ["new-england", "mid-atlantic"],
  midwest: ["east-north-central", "west-north-central"],
  south: ["south-atlantic", "east-south-central", "west-south-central"],
  west: ["mountain", "pacific"],
} as const;

export const REGION_KEYS = [
  "new-england", "mid-atlantic", "south-atlantic", "east-north-central", "east-south-central",
  "west-north-central", "west-south-central", "mountain", "pacific",
  "northeast", "midwest", "south", "west",
] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export function statesForRegion(region: RegionKey): string[] {
  if (region in DIVISIONS) return [...DIVISIONS[region as keyof typeof DIVISIONS]];
  return REGIONS[region as keyof typeof REGIONS].flatMap((d) => [...DIVISIONS[d]]);
}
