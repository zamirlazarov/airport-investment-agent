import { generateSpeech } from "ai";
import { spokenSummary } from "@/lib/spoken-summary";
import { voiceConfig } from "@/lib/voice-config";

/**
 * Text-to-speech for assistant replies.
 * Body: `{ text }` with the reply's Markdown. Only its spoken summary is synthesized, and
 * the cut happens here so a client cannot make the server read out more than the cap.
 * A 502 with `fallback: "browser"` tells the client to use the browser's own voice.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const markdown =
    typeof body === "object" && body !== null && "text" in body && typeof body.text === "string"
      ? body.text
      : "";
  const text = spokenSummary(markdown, voiceConfig.maxSpokenChars);

  if (text.length === 0) {
    return Response.json({ error: "Nothing to read aloud." }, { status: 400 });
  }

  for (const model of [voiceConfig.ttsModel, voiceConfig.ttsFallbackModel]) {
    try {
      const { audio } = await generateSpeech({
        model,
        text,
        voice: voiceConfig.voiceId,
        outputFormat: "mp3",
        abortSignal: request.signal,
      });
      // Copied into a plain ArrayBuffer-backed array, which is what a Response body accepts.
      return new Response(Uint8Array.from(audio.uint8Array), {
        headers: { "cache-control": "no-store", "content-type": "audio/mpeg" },
      });
    } catch (error) {
      console.error(`[voice] speech with ${model} failed:`, error);
    }
  }

  return Response.json(
    { error: "Text-to-speech is unavailable.", fallback: "browser" },
    { status: 502 },
  );
}
