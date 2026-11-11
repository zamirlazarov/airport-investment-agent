import { defineEval } from "eve/evals";
import { endsWithAssumptions, judgeAvailable } from "./_helpers.ts";

const isAirport = (code: string) => (v: unknown) => String(v).toUpperCase() === code;

export default defineEval({
  description: "SFO unmet demand, framed as a demand-pressure proxy, then a stricter threshold.",
  async test(t) {
    const first = await t.send("What is the unmet flight demand in SFO airport and why?");
    first.calledTool("get_unmet_demand", { input: { airport: isAirport("SFO") } });

    const second = await first.session.send("Use an 85% threshold.");
    second.calledTool("get_unmet_demand", { input: { lfThreshold: 0.85 } });

    t.succeeded();
    t.noFailedCalls();
    if (judgeAvailable) {
      t.judge(
        "The reply presents the figure as a demand-pressure proxy based on load factor above a threshold, says it is not observed lost demand, and does not describe it as lost, spilled or turned-away passengers.",
        { on: first.reply },
      ).atLeast(0.7);
      t.judge(endsWithAssumptions, { on: first.reply }).atLeast(0.7);
    }
  },
});
