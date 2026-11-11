/** Used when AGENT_MODEL is not set and a Gateway key (or no key) is present. */
export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

/** eve's own default OpenAI model; used when only an OpenAI key is set and AGENT_MODEL is not. */
const DEFAULT_OPENAI_MODEL = "openai/gpt-6-luna-fast";

export type ModelChoice =
  /** `model` is a Gateway id, "provider/name". */
  | { provider: "gateway"; model: string }
  /** `model` is Anthropic's own id, e.g. "claude-haiku-5-5". */
  | { provider: "anthropic"; model: string }
  /** `model` is OpenAI's own id, e.g. "gpt-5.4". */
  | { provider: "openai"; model: string }
  /** The local ChatGPT subscription, signed in with `/login` in `eve dev`. `model` is undefined for eve's default. */
  | { provider: "chatgpt"; model: string | undefined };

type Env = Readonly<Record<string, string | undefined>>;

function value(env: Env, name: string): string | undefined {
  const trimmed = env[name]?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Chooses where the agent's model calls go, from the environment:
 *
 * - `AGENT_MODEL` names the model as a Gateway id, "provider/model". Optional.
 * - The API keys decide the route. `AI_GATEWAY_API_KEY` wins, because the Gateway reaches
 *   every provider and is the only route that also powers voice. Otherwise the provider
 *   named in `AGENT_MODEL` is called directly with its own key.
 * - With `AGENT_MODEL` unset, the default follows the key: Haiku 5.5 for the Gateway or
 *   Anthropic, eve's default model for OpenAI.
 * - With no key at all it stays on the Gateway: in local development eve can reach it
 *   through its own login, and on Vercel through the project's OIDC token.
 *
 * - `AGENT_MODEL=chatgpt` (or `chatgpt/<model>`) uses a local ChatGPT subscription instead, whatever
 *   keys are set. It works only in local development, after `/login`.
 *
 * Throws when `AGENT_MODEL` is malformed or names a provider that no available key can
 * reach, rather than silently running a different model than the one asked for.
 */
export function chooseModel(env: Env): ModelChoice {
  const requested = value(env, "AGENT_MODEL");
  const gatewayKey = value(env, "AI_GATEWAY_API_KEY");
  const anthropicKey = value(env, "ANTHROPIC_API_KEY");
  const openaiKey = value(env, "OPENAI_API_KEY");

  if (requested === "chatgpt") return { provider: "chatgpt", model: undefined };
  if (requested?.startsWith("chatgpt/") && requested.length > "chatgpt/".length) {
    return { provider: "chatgpt", model: requested.slice("chatgpt/".length) };
  }

  if (requested !== undefined && !/^[^/\s]+\/[^/\s]+$/.test(requested)) {
    throw new Error(
      `AGENT_MODEL is "${requested}", but it must look like provider/model, for example "${DEFAULT_MODEL}".`,
    );
  }

  const model =
    requested ??
    (gatewayKey === undefined && anthropicKey === undefined && openaiKey !== undefined
      ? DEFAULT_OPENAI_MODEL
      : DEFAULT_MODEL);

  if (gatewayKey !== undefined) return { provider: "gateway", model };

  const [provider, name] = model.split("/") as [string, string];
  if (provider === "anthropic" && anthropicKey !== undefined) {
    // The Gateway writes versions with dots (claude-haiku-5.5); Anthropic's API uses dashes.
    return { provider: "anthropic", model: name.replaceAll(".", "-") };
  }
  if (provider === "openai" && openaiKey !== undefined) return { provider: "openai", model: name };

  const directKeys = [
    anthropicKey === undefined ? undefined : "ANTHROPIC_API_KEY",
    openaiKey === undefined ? undefined : "OPENAI_API_KEY",
  ].filter((key) => key !== undefined);
  if (directKeys.length > 0) {
    throw new Error(
      `AGENT_MODEL is "${model}", but only ${directKeys.join(" and ")} ${directKeys.length > 1 ? "are" : "is"} set, ` +
        `which cannot call a ${provider} model. Set AGENT_MODEL to a model from that provider, ` +
        `or set AI_GATEWAY_API_KEY, which can route to any provider.`,
    );
  }
  return { provider: "gateway", model };
}
