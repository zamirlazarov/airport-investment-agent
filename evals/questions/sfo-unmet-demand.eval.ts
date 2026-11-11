import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

// A forbidden phrase is fine when the reply negates it ("not lost demand", "rather than turned-away").
const FORBIDDEN = /\b(spilled|turned[- ]away|lost (passengers|demand|traffic))\b/gi;
const NEGATION = /\b(not|no|isn't|is not|never|neither|nor|rather than|instead of|without|cannot|can't)\b[^.]{0,60}$/i;

function forbiddenFramings(reply: string): string[] {
  return [...reply.matchAll(FORBIDDEN)]
    .filter((m) => !NEGATION.test(reply.slice(Math.max(0, m.index - 80), m.index)))
    .map((m) => m[0]);
}

const isAirport = (code: string) => (v: unknown) => String(v).toUpperCase() === code;

export default defineEval({
  description: "SFO unmet demand, framed as a demand-pressure proxy, then a stricter threshold.",
  async test(t) {
    const first = await t.send("What is the unmet flight demand in SFO airport and why?");
    first.calledTool("get_unmet_demand", { input: { airport: isAirport("SFO") } });

    // Deterministic wording checks, so the proxy rule is graded.
    first.messageIncludes(/proxy/i);
    t.check(
      first.reply ?? "",
      satisfies((reply: string) => !/\b(spilled|turned[- ]away|lost (passengers|demand))\b/i.test(reply) || /not (observed |measured )?lost/i.test(reply), "does not present the figure as lost or spilled demand"),
    );

    const second = await first.session.send("Use an 85% threshold.");
    second.calledTool("get_unmet_demand", { input: { lfThreshold: 0.85 } });

    t.succeeded();
    t.noFailedCalls();
  },
});
