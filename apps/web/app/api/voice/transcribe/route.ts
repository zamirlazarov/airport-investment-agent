import { transcribe } from "ai";
import { voiceConfig } from "@/lib/voice-config";

/**
 * Speech-to-text for the chat's microphone button.
 * Body: multipart form with the recording in field "audio". Returns `{ text }`.
 * A 502 with `fallback: "browser"` tells the client to use the browser's own recognizer.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: 'Send the recording as form field "audio".' }, { status: 400 });
  }
  if (audio.size > voiceConfig.maxAudioBytes) {
    return Response.json({ error: "The recording is too long." }, { status: 400 });
  }

  try {
    const result = await transcribe({
      model: voiceConfig.sttModel,
      audio: new Uint8Array(await audio.arrayBuffer()),
      abortSignal: request.signal,
    });
    return Response.json({ text: result.text.trim() });
  } catch (error) {
    // Missing key, no access to Gateway speech-to-text (it is in beta), or a provider error.
    console.error("[voice] transcription failed:", error);
    return Response.json(
      { error: "Speech-to-text is unavailable.", fallback: "browser" },
      { status: 502 },
    );
  }
}
