import { defineEval } from "eve/evals";
import { endsWithAssumptions, judgeAvailable } from "./_helpers.ts";

const includesAll = (codes: string[]) => (airports: unknown) =>
  Array.isArray(airports) && codes.every((c) => airports.map((a) => String(a).toUpperCase()).includes(c));

export default defineEval({
  description: "LA vs Santa Ana congestion, then a follow-up about unmet demand.",
  async test(t) {
    const first = await t.send("Compare LA and Santa Ana airport congestion levels.");
    first.calledTool("compare_airports", { input: { airports: includesAll(["LAX", "SNA"]) } });

    const second = await first.session.send("Which one has more unmet demand?");
    second.calledTool("get_unmet_demand");

    t.succeeded();
    t.noFailedCalls();
    if (judgeAvailable) t.judge(endsWithAssumptions, { on: first.reply }).atLeast(0.7);
  },
});
