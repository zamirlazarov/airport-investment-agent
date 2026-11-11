/** A tool call as the chat sees it: the tool's name and the input the model sent. */
export type ToolCallLike = { readonly name: string; readonly input: unknown };

const MAX_SUGGESTIONS = 3;

function field(input: unknown, key: string): unknown {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)[key]
    : undefined;
}

function airportOf(input: unknown): string {
  const airport = field(input, "airport");
  return typeof airport === "string" && airport.length > 0 ? airport.toUpperCase() : "this airport";
}

/** Suggestions per tool. Each one changes an assumption or widens the question. */
const SUGGESTIONS: Record<string, (input: unknown) => string[]> = {
  get_long_haul_share(input) {
    const usedThreeThousand = field(input, "thresholdMiles") === 3000;
    return [
      usedThreeThousand
        ? "Use a 2,500-mile threshold instead"
        : "Use a 3,000-mile threshold instead",
      "How much of that is cargo?",
      `What is the unmet demand at ${airportOf(input)}?`,
    ];
  },
  get_unmet_demand(input) {
    const usedEightyFive = field(input, "lfThreshold") === 0.85;
    return [
      usedEightyFive ? "Use an 80% load-factor threshold" : "Use an 85% load-factor threshold",
      "Which routes drive it?",
      `How congested is ${airportOf(input)}?`,
    ];
  },
  rank_airports() {
    return [
      "Why is the top airport ranked first?",
      "Weight growth more heavily",
      "Show only medium hubs",
    ];
  },
  compare_airports() {
    return [
      "Which one has more unmet demand?",
      "Compare their long-haul share",
      "Which is the stronger expansion candidate?",
    ];
  },
  get_airport_metrics(input) {
    const airport = airportOf(input);
    return [
      `What is the unmet demand at ${airport}?`,
      `What share of flights out of ${airport} are long haul?`,
      `Any delays at ${airport} right now?`,
    ];
  },
  get_live_airport_status(input) {
    const airports = field(input, "airports");
    const airport = Array.isArray(airports) ? airportOf({ airport: airports[0] }) : "it";
    return [`How congested is ${airport} over the last 12 months?`];
  },
};

/**
 * Follow-up questions to offer after an answer, based on the last analysis tool it used.
 * Airport lookups are skipped: the question worth following up is the analysis after them.
 */
export function suggestFollowUps(calls: readonly ToolCallLike[]): string[] {
  const lastAnalysis = calls.findLast((call) => call.name in SUGGESTIONS);
  if (lastAnalysis === undefined) return [];
  return SUGGESTIONS[lastAnalysis.name]!(lastAnalysis.input).slice(0, MAX_SUGGESTIONS);
}
