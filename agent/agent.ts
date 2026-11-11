import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";
import { openai } from "eve/models/openai";
import { chooseModel } from "../lib/model-choice.ts";

// The model and provider come from the environment (AGENT_MODEL and the API keys);
// see lib/model-choice.ts and .env.example.
const choice = chooseModel(process.env);
const model =
  choice.provider === "anthropic"
    ? anthropic(choice.model)
    : choice.provider === "openai"
      ? openai(choice.model)
      : choice.model;

export default defineAgent({
  model,
  // No `reasoning`: the model's own default applies, so any model can be chosen in .env.
  // No shell, file or web tools: every figure the agent states can only come from the
  // analysis tools in agent/tools/.
  defaultTools: false,
});
