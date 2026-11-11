import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5.5",
  reasoning: "low",
  // No shell, file or web tools: every figure the agent states can only come from the
  // analysis tools in agent/tools/.
  defaultTools: false,
});
