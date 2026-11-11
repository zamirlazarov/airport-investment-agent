import { defineEval } from "eve/evals";
import { endsWithAssumptions, judgeAvailable } from "./_helpers.ts";

export default defineEval({
  description: "An ambiguous name: the agent looks it up and names the candidates instead of guessing.",
  async test(t) {
    const turn = await t.send("How congested is Portland airport?");
    turn.calledTool("find_airports");
    turn.messageIncludes("PDX");
    turn.messageIncludes("PWM");

    t.succeeded();
    t.noFailedCalls();
    if (judgeAvailable) t.judge(endsWithAssumptions, { on: turn.reply }).atLeast(0.7);
  },
});
