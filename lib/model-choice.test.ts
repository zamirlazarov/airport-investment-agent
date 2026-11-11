import { describe, expect, it } from "vitest";
import { chooseModel } from "./model-choice.ts";

describe("chooseModel", () => {
  it("uses the AI Gateway when its key is set", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "gw" })).toEqual({
      provider: "gateway",
      model: "anthropic/claude-sonnet-5.5",
    });
  });

  it("prefers the Gateway when several keys are set, because voice needs it", () => {
    const choice = chooseModel({ AI_GATEWAY_API_KEY: "gw", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" });
    expect(choice.provider).toBe("gateway");
  });

  it("calls Anthropic directly when only an Anthropic key is set", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
  });

  it("prefers Anthropic over OpenAI, to stay on the model the agent was tuned with", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }).provider).toBe("anthropic");
  });

  it("calls OpenAI directly, on eve's default OpenAI model, when only an OpenAI key is set", () => {
    expect(chooseModel({ OPENAI_API_KEY: "o" })).toEqual({ provider: "openai", model: null });
  });

  it("treats a blank value as unset, as in a copied .env.example", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "", ANTHROPIC_API_KEY: "a" }).provider).toBe("anthropic");
    expect(chooseModel({ AI_GATEWAY_API_KEY: "  ", OPENAI_API_KEY: "o" }).provider).toBe("openai");
  });

  it("falls back to the Gateway with no key, so eve's own login or Vercel OIDC can supply access", () => {
    expect(chooseModel({}).provider).toBe("gateway");
  });
});
