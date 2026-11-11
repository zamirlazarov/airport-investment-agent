import { defineEval } from "eve/evals";

const isAirport = (code: string) => (v: unknown) => String(v).toUpperCase() === code;

export default defineEval({
  description: "Anchorage long-haul share, then a changed threshold and a different airport.",
  async test(t) {
    const first = await t.send("What is the percentage of long haul flights out of Anchorage airport?");
    first.calledTool("get_long_haul_share", { input: { airport: isAirport("ANC") } });

    const second = await first.session.send("What if long haul means 3,000 miles?");
    second.calledTool("get_long_haul_share", { input: { thresholdMiles: 3000 } });

    const third = await second.session.send("And for Seattle?");
    third.calledTool("get_long_haul_share", { input: { airport: isAirport("SEA"), thresholdMiles: 3000 } });

    t.succeeded();
    t.noFailedCalls();
  },
});
