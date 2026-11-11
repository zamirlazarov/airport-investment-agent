import { defineEval } from "eve/evals";

export default defineEval({
  description: "New England expansion candidates, then a re-weighting and a 'why' follow-up.",
  async test(t) {
    const first = await t.send("Which airports in New England are strong candidates for terminal expansion?");
    first.calledTool("rank_airports", { input: { region: "new-england" } });

    const second = await first.session.send("Now weight growth more heavily.");
    second.calledTool("rank_airports", { input: { region: "new-england", weights: (w: unknown) => w !== undefined && w !== null } });

    const third = await second.session.send("Why is the top one ranked first?");
    third.succeeded();

    t.succeeded();
    t.noFailedCalls();
  },
});
