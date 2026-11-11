import { defineEval } from "eve/evals";

export default defineEval({
  description: "The agent starts, answers, and reaches for a tool instead of answering from memory.",
  async test(t) {
    await t.send("What are the metrics for SFO?");
    t.succeeded();
    t.calledTool("get_airport_metrics");
  },
});
