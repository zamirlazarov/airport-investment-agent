import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";
import { openai } from "eve/models/openai";
import { chooseModel } from "../lib/model-choice.ts";

// The provider follows whichever API key is in the environment; see lib/model-choice.ts.
const choice = chooseModel(process.env);
const model =
  choice.provider === "anthropic"
    ? anthropic(choice.model)
    : choice.provider === "openai"
      ? openai()
      : choice.model;

export default defineAgent({
  model,
  reasoning: "low",
  // No shell, file or web tools: every figure the agent states can only come from the
  // analysis tools in agent/tools/.
  defaultTools: false,
});
