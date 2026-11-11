/** Which provider the agent's model calls go to, and the model id in that provider's naming. */
export type ModelChoice =
  | { provider: "gateway"; model: "anthropic/claude-sonnet-5.5" }
  | { provider: "anthropic"; model: "claude-sonnet-5-5" }
  /** `null` means eve's default OpenAI model. */
  | { provider: "openai"; model: null };

type Env = Readonly<Record<string, string | undefined>>;

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Picks the model provider from the API keys present, so the project runs with whichever
 * key the person running it has:
 *
 * 1. `AI_GATEWAY_API_KEY` — Vercel AI Gateway. The only option that also powers voice.
 * 2. `ANTHROPIC_API_KEY`  — Anthropic directly, same model as through the Gateway.
 * 3. `OPENAI_API_KEY`     — OpenAI directly.
 *
 * With no key it stays on the Gateway: in local development eve can still reach it through
 * its own login, and on Vercel through the project's OIDC token.
 */
export function chooseModel(env: Env): ModelChoice {
  if (isSet(env.AI_GATEWAY_API_KEY)) {
    return { provider: "gateway", model: "anthropic/claude-sonnet-5.5" };
  }
  if (isSet(env.ANTHROPIC_API_KEY)) return { provider: "anthropic", model: "claude-sonnet-5-5" };
  if (isSet(env.OPENAI_API_KEY)) return { provider: "openai", model: null };
  return { provider: "gateway", model: "anthropic/claude-sonnet-5.5" };
}
