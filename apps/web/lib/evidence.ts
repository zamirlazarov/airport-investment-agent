import { lowestConfidence } from "@core/envelope";
import type { Confidence, DataWindow, Envelope, Source } from "@core/types";

/** The fields of a chat message part this module reads; eve's tool part satisfies it. */
export type ToolPartLike = {
  readonly type: string;
  readonly name?: string;
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
};

/** What the tools behind one answer said about their own figures. */
export type Evidence = {
  assumptions: string[];
  sources: Source[];
  /** The weakest confidence among the tools used; null when no tool reported one. */
  confidence: Confidence | null;
  confidenceReasons: string[];
  dataWindow: DataWindow | null;
};

const CONFIDENCE_LEVELS: readonly string[] = ["high", "medium", "low"];

function isEnvelope(value: unknown): value is Envelope<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Envelope<unknown>>;
  return (
    Array.isArray(candidate.assumptions) &&
    Array.isArray(candidate.sources) &&
    Array.isArray(candidate.confidenceReasons) &&
    typeof candidate.confidence === "string" &&
    CONFIDENCE_LEVELS.includes(candidate.confidence) &&
    typeof candidate.dataWindow === "object" &&
    candidate.dataWindow !== null
  );
}

/**
 * Gathers the assumptions, sources and confidence from the completed tool calls of one
 * message. The chat renders this next to the answer, so the disclosure comes from the
 * tools themselves and does not depend on what the model chose to write.
 */
export function collectEvidence(parts: readonly ToolPartLike[]): Evidence {
  const envelopes = parts
    .filter((part) => part.type === "tool" && part.state === "completed")
    .map((part) => part.output)
    .filter(isEnvelope);

  const sourcesByUrl = new Map<string, Source>();
  for (const source of envelopes.flatMap((item) => item.sources)) {
    if (!sourcesByUrl.has(source.url)) sourcesByUrl.set(source.url, source);
  }

  return {
    assumptions: [...new Set(envelopes.flatMap((item) => item.assumptions))],
    sources: [...sourcesByUrl.values()],
    confidence:
      envelopes.length === 0 ? null : lowestConfidence(envelopes.map((item) => item.confidence)),
    confidenceReasons: [...new Set(envelopes.flatMap((item) => item.confidenceReasons))],
    dataWindow: envelopes.at(-1)?.dataWindow ?? null,
  };
}
