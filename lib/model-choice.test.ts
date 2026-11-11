import { describe, expect, it } from "vitest";
import { chooseModel, DEFAULT_MODEL } from "./model-choice.ts";

describe("chooseModel with no AGENT_MODEL", () => {
  it("defaults to Haiku 5.5 through the AI Gateway", () => {
    expect(DEFAULT_MODEL).toBe("anthropic/claude-haiku-5.5");
    expect(chooseModel({ AI_GATEWAY_API_KEY: "gw" })).toEqual({
      provider: "gateway",
      model: "anthropic/claude-haiku-5.5",
    });
  });

  it("uses the Gateway when no key is set, so eve's own login or Vercel OIDC can supply access", () => {
    expect(chooseModel({})).toEqual({ provider: "gateway", model: DEFAULT_MODEL });
  });

  it("prefers the Gateway when several keys are set, because voice needs it", () => {
    const env = { AI_GATEWAY_API_KEY: "gw", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" };
    expect(chooseModel(env).provider).toBe("gateway");
  });

  it("calls Anthropic directly, with Anthropic's own id spelling, when only that key is set", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a" })).toEqual({
      provider: "anthropic",
      model: "claude-haiku-5-5",
    });
  });

  it("calls OpenAI directly, on eve's default OpenAI model, when only that key is set", () => {
    expect(chooseModel({ OPENAI_API_KEY: "o" })).toEqual({
      provider: "openai",
      model: "gpt-6-luna-fast",
    });
  });

  it("prefers Anthropic over OpenAI when both direct keys are set", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }).provider).toBe("anthropic");
  });

  it("treats a blank value as unset, as in a copied .env.example", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "", ANTHROPIC_API_KEY: "a", AGENT_MODEL: "" }).provider).toBe(
      "anthropic",
    );
    expect(chooseModel({ AI_GATEWAY_API_KEY: "  ", OPENAI_API_KEY: "o" }).provider).toBe("openai");
  });
});

describe("chooseModel with AGENT_MODEL", () => {
  it("sends any provider/model id through the Gateway", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "gw", AGENT_MODEL: "openai/gpt-5.4" })).toEqual({
      provider: "gateway",
      model: "openai/gpt-5.4",
    });
  });

  it("converts the Gateway's dotted Anthropic ids for a direct Anthropic call", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a", AGENT_MODEL: "anthropic/claude-sonnet-5.5" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
  });

  it("keeps an OpenAI id as written for a direct OpenAI call", () => {
    expect(chooseModel({ OPENAI_API_KEY: "o", AGENT_MODEL: "openai/gpt-5.4" })).toEqual({
      provider: "openai",
      model: "gpt-5.4",
    });
  });

  it("trims whitespace around the value", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "gw", AGENT_MODEL: "  openai/gpt-5.4 " }).model).toBe("openai/gpt-5.4");
  });

  it("refuses a model whose provider does not match the only key available", () => {
    expect(() => chooseModel({ ANTHROPIC_API_KEY: "a", AGENT_MODEL: "openai/gpt-5.4" })).toThrow(
      /AGENT_MODEL is "openai\/gpt-5\.4".*ANTHROPIC_API_KEY.*AI_GATEWAY_API_KEY/s,
    );
  });

  it("falls through to the matching direct key when two are set", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", AGENT_MODEL: "openai/gpt-5.4" })).toEqual({
      provider: "openai",
      model: "gpt-5.4",
    });
  });

  it.each(["claude-haiku-5.5", "anthropic/", "/gpt-5.4", "a/b/c"])("rejects a malformed value %j", (value) => {
    expect(() => chooseModel({ AI_GATEWAY_API_KEY: "gw", AGENT_MODEL: value })).toThrow(/provider\/model/);
  });
});

describe("chooseModel with a ChatGPT subscription", () => {
  it("uses chatgpt() with eve's default model for AGENT_MODEL=chatgpt, even when a Gateway key is set", () => {
    expect(chooseModel({ AGENT_MODEL: "chatgpt", AI_GATEWAY_API_KEY: "gw" })).toEqual({ provider: "chatgpt", model: undefined });
    expect(chooseModel({ AGENT_MODEL: "chatgpt" })).toEqual({ provider: "chatgpt", model: undefined });
  });

  it("passes a named model through", () => {
    expect(chooseModel({ AGENT_MODEL: "chatgpt/gpt-5.4" })).toEqual({ provider: "chatgpt", model: "gpt-5.4" });
  });

  it("does not treat a bare 'chatgpt/' as valid", () => {
    expect(() => chooseModel({ AGENT_MODEL: "chatgpt/" })).toThrow("must look like provider/model");
  });
});
